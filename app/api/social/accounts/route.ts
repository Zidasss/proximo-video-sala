import { NextRequest, NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "../../../../lib/supabase/server";
import { discoverPrimaryInstagramTarget } from "../../../../lib/publishing/meta";
import {
  exchangeMetaLongLivedToken,
  metaCredentials,
  revokeGoogleToken,
} from "../../../../lib/publishing/oauth";
import { errorMessage, readJson } from "../../../../lib/publishing/http";

/** Colunas públicas devolvidas pelo GET (sem tokens). */
type PublicAccountRow = Pick<
  import("../../../../lib/publishing/token-store").SocialAccountRow,
  | "id"
  | "platform"
  | "platform_user_id"
  | "account_name"
  | "account_handle"
  | "avatar_url"
  | "status"
  | "created_at"
  | "updated_at"
>;

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

interface TikTokUserResponse {
  data?: {
    user?: { open_id?: string; display_name?: string; avatar_url?: string };
  };
}

export async function GET() {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ accounts: [] });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ accounts: [] });
  }

  const { data: accounts, error } = await supabase
    .from("social_accounts")
    .select("id, platform, platform_user_id, account_name, account_handle, avatar_url, status, created_at, updated_at")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const formatted = (accounts || []).map((a: PublicAccountRow) => ({
    id: a.id,
    platform: a.platform,
    platformUserId: a.platform_user_id,
    accountName: a.account_name,
    accountHandle: a.account_handle,
    avatarUrl: a.avatar_url,
    status: a.status,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  }));

  return NextResponse.json({ accounts: formatted });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { platform, accountName, accountHandle, avatarUrl, accessToken, refreshToken } = body;

    if (!platform || (!accountName && !accessToken)) {
      return NextResponse.json(
        { error: "Parâmetros incompletos. Informe a plataforma e o nome ou token da conta." },
        { status: 400 }
      );
    }

    let finalName = accountName || "";
    let finalHandle = accountHandle || "";
    let finalAvatar = avatarUrl || "";
    let platformUserId = `${platform}_${Date.now().toString(36)}`;
    let finalToken: string = accessToken || "";
    let expiresAt: number | null = null;

    // Se um accessToken foi fornecido, tenta validar e buscar dados oficiais diretamente da API
    if (accessToken) {
      if (platform === "youtube") {
        try {
          const res = await fetch(
            "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );
          if (res.ok) {
            const data = await readJson<YouTubeChannelListResponse>(res);
            const ch = data.items?.[0];
            if (ch) {
              platformUserId = ch.id;
              finalName = ch.snippet?.title || finalName || "Canal YouTube";
              finalHandle = ch.snippet?.customUrl || `@channel_${ch.id.substring(0, 6)}`;
              finalAvatar = ch.snippet?.thumbnails?.default?.url || finalAvatar;
            }
          }
        } catch (e) {
          console.warn("Aviso na validação de token YouTube:", e);
        }
      } else if (platform === "tiktok") {
        try {
          const res = await fetch(
            "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );
          if (res.ok) {
            const data = await readJson<TikTokUserResponse>(res);
            const u = data.data?.user;
            if (u) {
              platformUserId = u.open_id || platformUserId;
              finalName = u.display_name || finalName || "Criador TikTok";
              finalHandle = `@${(u.display_name || "tiktok").toLowerCase().replace(/\s+/g, "_")}`;
              finalAvatar = u.avatar_url || finalAvatar;
            }
          }
        } catch (e) {
          console.warn("Aviso na validação de token TikTok:", e);
        }
      } else if (platform === "instagram") {
        try {
          // Estende o token para 60 dias quando o app tem credenciais Meta,
          // senão um token de 1h seria salvo e morreria antes do primeiro post.
          if (metaCredentials().configured) {
            const longLived = await exchangeMetaLongLivedToken(finalToken).catch(() => null);
            if (longLived) {
              finalToken = longLived.accessToken;
              expiresAt = longLived.expiresAt ?? null;
            }
          }

          const target = await discoverPrimaryInstagramTarget(finalToken);
          if (target) {
            platformUserId = target.igUserId;
            finalName = target.username || finalName || "Instagram Creator";
            finalHandle = `@${target.username || "instagram"}`;
            finalAvatar = target.profilePictureUrl || finalAvatar;
            // O Page access token é o que a Content Publishing API aceita.
            finalToken = target.pageAccessToken;
          }
        } catch (e) {
          console.warn("Aviso na validação de token Instagram:", e);
        }
      }
    }

    if (!finalName) {
      finalName = `${platform.toUpperCase()} Creator`;
    }
    if (!finalHandle) {
      finalHandle = `@${finalName.toLowerCase().replace(/\s+/g, "_")}`;
    }
    if (!finalAvatar) {
      finalAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(finalName)}`;
    }

    if (isSupabaseConfigured) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { error } = await supabase.from("social_accounts").upsert(
          {
            user_id: user.id,
            platform,
            platform_user_id: platformUserId,
            account_name: finalName,
            account_handle: finalHandle,
            avatar_url: finalAvatar,
            access_token: finalToken || `token_${Date.now()}`,
            refresh_token: refreshToken || null,
            expires_at: expiresAt,
            status: "connected",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,platform,platform_user_id" }
        );

        if (error) {
          throw error;
        }
      }
    }

    return NextResponse.json({
      success: true,
      account: {
        platform,
        accountName: finalName,
        accountHandle: finalHandle,
        avatarUrl: finalAvatar,
        status: "connected",
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: errorMessage(err, "Falha ao salvar a conta social.") },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const platform = searchParams.get("platform");

  if (!platform) {
    return NextResponse.json({ error: "Plataforma não informada." }, { status: 400 });
  }

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // Revoga o acesso no Google antes de apagar, senão o app continuaria
      // listado nas permissões da conta do usuário.
      if (platform === "youtube") {
        const { data: row } = await supabase
          .from("social_accounts")
          .select("refresh_token, access_token")
          .eq("user_id", user.id)
          .eq("platform", platform)
          .maybeSingle();

        const token = row?.refresh_token || row?.access_token;
        if (token && token !== "mock-token") {
          await revokeGoogleToken(token);
        }
      }

      const { error } = await supabase
        .from("social_accounts")
        .delete()
        .eq("user_id", user.id)
        .eq("platform", platform);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: `Conta ${platform} desconectada com sucesso do Supabase.`,
  });
}
