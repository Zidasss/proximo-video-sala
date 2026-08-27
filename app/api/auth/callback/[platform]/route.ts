import { NextRequest, NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "../../../../../lib/supabase/server";
import { getDynamicBaseUrl, safeReturnPath } from "../../../../../lib/http/base-url";
import {
  GRAPH_BASE,
  exchangeMetaLongLivedToken,
  expiresInToTimestamp,
  googleCredentials,
  metaCredentials,
  tiktokCredentials,
} from "../../../../../lib/publishing/oauth";
import { discoverInstagramTargets } from "../../../../../lib/publishing/meta";
import {
  STATE_COOKIE,
  nonceMatches,
  parseState,
} from "../../../../../lib/publishing/oauth-state";
import { errorMessage, readJson } from "../../../../../lib/publishing/http";

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface YouTubeChannelListResponse {
  items?: {
    id: string;
    snippet?: {
      title?: string;
      customUrl?: string;
      thumbnails?: { default?: { url?: string } };
    };
  }[];
}

interface TikTokTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  open_id?: string;
  error?: string;
  error_description?: string;
  data?: TikTokTokenResponse;
}

interface TikTokUserResponse {
  data?: {
    user?: { open_id?: string; display_name?: string; avatar_url?: string };
  };
}

interface MetaTokenResponse {
  access_token?: string;
  error?: { message?: string };
}

interface ConnectedAccount {
  platformUserId: string;
  accountName: string;
  accountHandle: string;
  avatarUrl: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
}

/** Troca o `code` do Google por tokens e lê o canal do YouTube. */
async function connectYouTube(code: string, redirectUri: string): Promise<ConnectedAccount> {
  const { clientId, clientSecret } = googleCredentials();

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = await readJson<GoogleTokenResponse>(tokenRes);
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(
      `Falha na troca de token do Google: ${tokenData.error_description || tokenData.error || tokenRes.statusText}`
    );
  }

  const accessToken: string = tokenData.access_token;

  const channelRes = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const channelData = await readJson<YouTubeChannelListResponse>(channelRes);
  const channel = channelData.items?.[0];

  if (!channel) {
    throw new Error(
      "Nenhum canal do YouTube encontrado nesta conta Google. Crie um canal em youtube.com antes de conectar."
    );
  }

  return {
    platformUserId: channel.id,
    accountName: channel.snippet?.title || "Canal YouTube",
    accountHandle: channel.snippet?.customUrl || `@channel_${String(channel.id).slice(0, 6)}`,
    avatarUrl: channel.snippet?.thumbnails?.default?.url || "",
    accessToken,
    // O refresh token só vem no primeiro consentimento de cada conta.
    refreshToken: tokenData.refresh_token || null,
    expiresAt: expiresInToTimestamp(tokenData.expires_in) ?? null,
  };
}

/** Troca o `code` do TikTok por tokens e lê o perfil do criador. */
async function connectTikTok(code: string, redirectUri: string): Promise<ConnectedAccount> {
  const { clientKey, clientSecret } = tiktokCredentials();

  const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey!,
      client_secret: clientSecret!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const raw = await readJson<TikTokTokenResponse>(tokenRes);
  const tokenData: TikTokTokenResponse = raw.data || raw;

  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(
      `Falha na troca de token do TikTok: ${raw.error_description || raw.error || tokenRes.statusText}`
    );
  }

  const accessToken: string = tokenData.access_token;

  const userRes = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const userData = await readJson<TikTokUserResponse>(userRes);
  const user = userData.data?.user || {};
  const displayName = user.display_name || "Criador TikTok";

  return {
    platformUserId: user.open_id || tokenData.open_id || `tiktok_${Date.now().toString(36)}`,
    accountName: displayName,
    accountHandle: `@${displayName.toLowerCase().replace(/\s+/g, "_")}`,
    avatarUrl: user.avatar_url || "",
    accessToken,
    refreshToken: tokenData.refresh_token || null,
    expiresAt: expiresInToTimestamp(tokenData.expires_in) ?? null,
  };
}

/**
 * Troca o `code` do Meta por um token longo e localiza a conta Instagram
 * Business. Guardamos o *Page access token*, que é o token exigido pela
 * Content Publishing API.
 */
async function connectInstagram(code: string, redirectUri: string): Promise<ConnectedAccount> {
  const { appId, appSecret } = metaCredentials();

  const tokenRes = await fetch(
    `${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
      client_id: appId!,
      redirect_uri: redirectUri,
      client_secret: appSecret!,
      code,
    })}`
  );

  const tokenData = await readJson<MetaTokenResponse>(tokenRes);
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(
      `Falha na troca de token do Meta: ${tokenData.error?.message || tokenRes.statusText}`
    );
  }

  // O token inicial dura ~1h; o de longa duração dura ~60 dias.
  const longLived = await exchangeMetaLongLivedToken(tokenData.access_token);

  const targets = await discoverInstagramTargets(longLived.accessToken);
  const target = targets[0];

  if (!target) {
    throw new Error(
      "Nenhuma conta Instagram Business/Creator vinculada às suas Páginas do Facebook. " +
        "Converta o perfil para Business no app do Instagram e vincule-o a uma Página antes de conectar."
    );
  }

  return {
    platformUserId: target.igUserId,
    accountName: target.username,
    accountHandle: `@${target.username}`,
    avatarUrl: target.profilePictureUrl || "",
    // Page access token derivado de um token longo: também é de longa duração.
    accessToken: target.pageAccessToken,
    refreshToken: null,
    expiresAt: longLived.expiresAt ?? null,
  };
}

/** Conta de demonstração usada quando o app roda sem credenciais reais. */
function demoAccount(platform: string): ConnectedAccount {
  const presets: Record<string, { name: string; handle: string; seed: string }> = {
    youtube: { name: "Canal YouTube Oficial", handle: "@CanalYouTube", seed: "YouTubeKlip" },
    tiktok: { name: "Perfil TikTok", handle: "@tiktok_creator", seed: "TikTokKlip" },
    instagram: {
      name: "Instagram Reels Creator",
      handle: "@instagram_creator",
      seed: "InstagramKlip",
    },
  };
  const preset = presets[platform];

  return {
    platformUserId: `${platform}_${Date.now().toString(36)}`,
    accountName: preset.name,
    accountHandle: preset.handle,
    avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${preset.seed}`,
    accessToken: "mock-token",
    refreshToken: null,
    expiresAt: null,
  };
}

function isPlatformConfigured(platform: string): boolean {
  if (platform === "youtube") return googleCredentials().configured;
  if (platform === "tiktok") return tiktokCredentials().configured;
  if (platform === "instagram") return metaCredentials().configured;
  return false;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ platform: string }> }
) {
  const { platform } = await context.params;
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const baseUrl = getDynamicBaseUrl(req);
  const redirectUri = `${baseUrl}/api/auth/callback/${platform}`;

  const state = parseState(searchParams.get("state"));
  const returnPath = safeReturnPath(state?.next);

  const fail = (message: string) => {
    const errorUrl = new URL(returnPath, baseUrl);
    errorUrl.searchParams.set("auth_error", message);
    const res = NextResponse.redirect(errorUrl.toString());
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  if (oauthError || !code) {
    return fail(errorDescription || oauthError || "Autorização cancelada.");
  }

  // Verificação CSRF: o nonce do `state` precisa bater com o cookie da sessão.
  const cookieNonce = req.cookies.get(STATE_COOKIE)?.value;
  if (!state || !nonceMatches(state.nonce, cookieNonce) || state.platform !== platform) {
    return fail(
      "Falha na verificação de segurança do login (state inválido ou expirado). Tente conectar novamente."
    );
  }

  try {
    let account: ConnectedAccount;

    if (!isPlatformConfigured(platform)) {
      // Sem credenciais reais o app segue funcionando em modo demonstração.
      account = demoAccount(platform);
    } else if (platform === "youtube") {
      account = await connectYouTube(code, redirectUri);
    } else if (platform === "tiktok") {
      account = await connectTikTok(code, redirectUri);
    } else if (platform === "instagram") {
      account = await connectInstagram(code, redirectUri);
    } else {
      return fail("Plataforma desconhecida.");
    }

    if (isSupabaseConfigured) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return fail("Faça login na KLIPAPP antes de vincular uma conta social.");
      }

      const payload: Record<string, unknown> = {
        user_id: user.id,
        platform,
        platform_user_id: account.platformUserId,
        account_name: account.accountName,
        account_handle: account.accountHandle,
        avatar_url: account.avatarUrl,
        access_token: account.accessToken,
        expires_at: account.expiresAt,
        status: "connected",
        updated_at: new Date().toISOString(),
      };

      // O Google só devolve o refresh token no primeiro consentimento; não
      // sobrescreva um token válido já salvo com `null`.
      if (account.refreshToken) {
        payload.refresh_token = account.refreshToken;
      }

      const { error } = await supabase
        .from("social_accounts")
        .upsert(payload, { onConflict: "user_id,platform,platform_user_id" });

      if (error) {
        throw new Error(`Falha ao salvar a conta conectada: ${error.message}`);
      }
    }

    const finalUrl = new URL(returnPath, baseUrl);
    finalUrl.searchParams.set("connected", platform);
    const res = NextResponse.redirect(finalUrl.toString());
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (err: unknown) {
    console.error("OAuth Callback Error:", err);
    return fail(errorMessage(err, "Falha na vinculação da conta."));
  }
}
