import { NextRequest, NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "../../../../lib/supabase/server";
import { ensureFreshAccount, rowToAccount } from "../../../../lib/publishing/token-store";
import {
  discoverPrimaryInstagramTarget,
  getInstagramPublishingLimit,
  graphUrl,
} from "../../../../lib/publishing/meta";
import { SocialAccount } from "../../../../lib/types/publishing";
import { GraphErrorBody, errorMessage, readJson } from "../../../../lib/publishing/http";

interface YouTubeChannelListResponse {
  items?: {
    id: string;
    snippet?: {
      title?: string;
      customUrl?: string;
      thumbnails?: { default?: { url?: string } };
    };
    statistics?: { subscriberCount?: string; videoCount?: string };
  }[];
}

interface TikTokUserResponse {
  data?: {
    user?: { display_name?: string; avatar_url?: string };
  };
}

interface InstagramProfileResponse extends GraphErrorBody {
  username?: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
}

/**
 * Confere se a conexão com a plataforma continua válida, renovando o token
 * automaticamente quando ele já venceu.
 */
export async function POST(req: NextRequest) {
  try {
    const { platform, accessToken } = await req.json();

    if (!platform) {
      return NextResponse.json({ error: "Plataforma não informada." }, { status: 400 });
    }

    let token: string | undefined = accessToken;
    let account: SocialAccount | undefined;
    let refreshed = false;

    if (!token && isSupabaseConfigured) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: row } = await supabase
          .from("social_accounts")
          .select("*")
          .eq("user_id", user.id)
          .eq("platform", platform)
          .maybeSingle();

        if (row) {
          const result = await ensureFreshAccount(rowToAccount(row), supabase);
          if (result.error) {
            return NextResponse.json({
              valid: false,
              error: result.error,
              needsReconnect: true,
            });
          }
          account = result.account;
          refreshed = result.refreshed;
          token = result.account.accessToken;
        }
      }
    }

    if (!token) {
      return NextResponse.json(
        { valid: false, error: `Nenhum token encontrado para a conta ${platform}.` },
        { status: 400 }
      );
    }

    if (platform === "youtube") {
      const res = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) {
        return NextResponse.json({
          valid: false,
          error: "Token expirado ou inválido na API do YouTube. Reconecte o canal.",
          needsReconnect: true,
          details: await res.text(),
        });
      }

      const data = await readJson<YouTubeChannelListResponse>(res);
      const channel = data.items?.[0];

      if (!channel) {
        return NextResponse.json({
          valid: false,
          error: "A conta Google conectada não possui um canal do YouTube.",
          needsReconnect: true,
        });
      }

      return NextResponse.json({
        valid: true,
        refreshed,
        channelName: channel.snippet?.title || "Canal YouTube",
        handle: channel.snippet?.customUrl || `@${channel.id}`,
        subscriberCount: channel.statistics?.subscriberCount,
        videoCount: channel.statistics?.videoCount,
        avatarUrl: channel.snippet?.thumbnails?.default?.url,
        message: "Conexão com a API do YouTube ativa e válida.",
      });
    }

    if (platform === "tiktok") {
      const res = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) {
        return NextResponse.json({
          valid: false,
          error: "Token expirado ou inválido na API do TikTok. Reconecte a conta.",
          needsReconnect: true,
        });
      }

      const data = await readJson<TikTokUserResponse>(res);
      const user = data.data?.user;

      return NextResponse.json({
        valid: true,
        refreshed,
        channelName: user?.display_name || "Criador TikTok",
        handle: `@${(user?.display_name || "tiktok").toLowerCase().replace(/\s+/g, "_")}`,
        avatarUrl: user?.avatar_url,
        message: "Conexão com a API do TikTok ativa e válida.",
      });
    }

    if (platform === "instagram") {
      // Um Page access token responde direto no nó da conta Business.
      const igUserId = account?.platformUserId;

      if (igUserId) {
        const res = await fetch(
          graphUrl(igUserId, {
            fields: "id,username,name,profile_picture_url,followers_count,media_count",
            access_token: token,
          })
        );
        const data = await readJson<InstagramProfileResponse>(res);

        if (!res.ok || data.error) {
          return NextResponse.json({
            valid: false,
            error:
              data.error?.message ||
              "Token expirado ou inválido na Meta Graph API. Reconecte o Instagram.",
            needsReconnect: true,
          });
        }

        const limit = await getInstagramPublishingLimit(igUserId, token);

        return NextResponse.json({
          valid: true,
          refreshed,
          channelName: data.username || data.name || "Instagram Creator",
          handle: `@${data.username || "instagram"}`,
          avatarUrl: data.profile_picture_url,
          followersCount: data.followers_count,
          mediaCount: data.media_count,
          publishingQuota: limit,
          message: "Conexão com a Meta Graph API ativa e válida.",
        });
      }

      // Token de usuário avulso: descobre a conta Business pelas Páginas.
      const target = await discoverPrimaryInstagramTarget(token).catch(() => null);
      if (!target) {
        return NextResponse.json({
          valid: false,
          error:
            "Nenhuma conta Instagram Business vinculada às Páginas desta conta do Facebook.",
          needsReconnect: true,
        });
      }

      return NextResponse.json({
        valid: true,
        refreshed,
        channelName: target.username,
        handle: `@${target.username}`,
        avatarUrl: target.profilePictureUrl,
        message: "Conexão com a Meta Graph API ativa e válida.",
      });
    }

    return NextResponse.json({ error: "Plataforma desconhecida." }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { valid: false, error: errorMessage(err, "Falha ao validar a conexão.") },
      { status: 500 }
    );
  }
}
