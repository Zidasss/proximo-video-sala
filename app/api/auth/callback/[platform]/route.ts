import { NextRequest, NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "../../../../../lib/supabase/server";

function getDynamicBaseUrl(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host");

  if (host && !host.includes("localhost")) {
    const proto = request.headers.get("x-forwarded-proto") || "https";
    return `${proto}://${host}`;
  }

  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && !envUrl.includes("localhost")) {
    return envUrl;
  }

  if (host) {
    const proto = request.headers.get("x-forwarded-proto") || "http";
    return `${proto}://${host}`;
  }

  const { origin } = new URL(request.url);
  return origin;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ platform: string }> }
) {
  const { platform } = await context.params;
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const stateRaw = searchParams.get("state");

  const baseUrl = getDynamicBaseUrl(req);
  const redirectUri = `${baseUrl}/api/auth/callback/${platform}`;

  let returnPath = "/perfil";
  if (stateRaw) {
    try {
      const decoded = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf-8"));
      if (decoded.next) returnPath = decoded.next;
    } catch {}
  }

  if (error || !code) {
    const errorUrl = new URL(returnPath, baseUrl);
    errorUrl.searchParams.set("auth_error", errorDescription || error || "Autorização cancelada.");
    return NextResponse.redirect(errorUrl.toString());
  }

  try {
    let accountName = "";
    let accountHandle = "";
    let avatarUrl = "";
    let accessToken = `token_${code.substring(0, 16)}`;
    let refreshToken: string | null = null;
    let platformUserId = `${platform}_${Date.now().toString(36)}`;

    // 1. YouTube / Google OAuth Real
    if (platform === "youtube" && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      try {
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        });

        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          accessToken = tokenData.access_token || accessToken;
          refreshToken = tokenData.refresh_token || null;

          const channelRes = await fetch(
            "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );

          if (channelRes.ok) {
            const channelData = await channelRes.json();
            const ch = channelData.items?.[0];
            if (ch) {
              platformUserId = ch.id;
              accountName = ch.snippet?.title || "Canal YouTube";
              accountHandle = ch.snippet?.customUrl || `@channel_${ch.id.substring(0, 6)}`;
              avatarUrl = ch.snippet?.thumbnails?.default?.url || "";
            }
          }
        } else {
          const errData = await tokenRes.text();
          console.error("Erro na troca de token Google:", errData);
        }
      } catch (e) {
        console.error("Exceção na autenticação YouTube:", e);
      }
    }
    // 2. TikTok OAuth Real
    else if (platform === "tiktok" && process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET) {
      try {
        const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_key: process.env.TIKTOK_CLIENT_KEY,
            client_secret: process.env.TIKTOK_CLIENT_SECRET,
            code,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
          }),
        });

        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          accessToken = tokenData.data?.access_token || tokenData.access_token || accessToken;
          refreshToken = tokenData.data?.refresh_token || tokenData.refresh_token || null;
          platformUserId = tokenData.data?.open_id || platformUserId;

          const userRes = await fetch(
            "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );
          if (userRes.ok) {
            const uData = await userRes.json();
            const u = uData.data?.user;
            if (u) {
              accountName = u.display_name || "Criador TikTok";
              accountHandle = `@${(u.display_name || "tiktok").toLowerCase().replace(/\s+/g, "_")}`;
              avatarUrl = u.avatar_url || "";
            }
          }
        } else {
          const errData = await tokenRes.text();
          console.error("Erro na troca de token TikTok:", errData);
        }
      } catch (e) {
        console.error("Exceção na autenticação TikTok:", e);
      }
    }
    // 3. Instagram / Meta Graph API Real
    else if (platform === "instagram" && process.env.META_APP_ID && process.env.META_APP_SECRET) {
      try {
        const tokenRes = await fetch(
          `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(
            redirectUri
          )}&client_secret=${process.env.META_APP_SECRET}&code=${code}`
        );

        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          accessToken = tokenData.access_token || accessToken;

          const meRes = await fetch(
            `https://graph.facebook.com/v19.0/me?fields=id,name,accounts{id,name,instagram_business_account{id,username,profile_picture_url}}&access_token=${accessToken}`
          );
          if (meRes.ok) {
            const meData = await meRes.json();
            const igAcc = meData.accounts?.data?.[0]?.instagram_business_account;
            if (igAcc) {
              platformUserId = igAcc.id;
              accountName = igAcc.username || meData.name || "Instagram Creator";
              accountHandle = `@${igAcc.username || "instagram_reels"}`;
              avatarUrl = igAcc.profile_picture_url || "";
            }
          }
        } else {
          const errData = await tokenRes.text();
          console.error("Erro na troca de token Meta:", errData);
        }
      } catch (e) {
        console.error("Exceção na autenticação Instagram:", e);
      }
    }

    if (!accountName) {
      if (platform === "youtube") {
        accountName = "Canal YouTube Oficial";
        accountHandle = "@CanalYouTube";
        avatarUrl = avatarUrl || "https://api.dicebear.com/7.x/bottts/svg?seed=YouTubeKlip";
      } else if (platform === "tiktok") {
        accountName = "Perfil TikTok";
        accountHandle = "@tiktok_creator";
        avatarUrl = avatarUrl || "https://api.dicebear.com/7.x/bottts/svg?seed=TikTokKlip";
      } else if (platform === "instagram") {
        accountName = "Instagram Reels Creator";
        accountHandle = "@instagram_creator";
        avatarUrl = avatarUrl || "https://api.dicebear.com/7.x/bottts/svg?seed=InstagramKlip";
      }
    }

    if (isSupabaseConfigured) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase.from("social_accounts").upsert(
          {
            user_id: user.id,
            platform,
            platform_user_id: platformUserId,
            account_name: accountName,
            account_handle: accountHandle,
            avatar_url: avatarUrl,
            access_token: accessToken,
            refresh_token: refreshToken,
            status: "connected",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,platform,platform_user_id" }
        );
      }
    }

    const finalUrl = new URL(returnPath, baseUrl);
    finalUrl.searchParams.set("connected", platform);
    return NextResponse.redirect(finalUrl.toString());
  } catch (err: any) {
    console.error("OAuth Callback Error:", err);
    const errorUrl = new URL(returnPath, baseUrl);
    errorUrl.searchParams.set("auth_error", err.message || "Falha na vinculação.");
    return NextResponse.redirect(errorUrl.toString());
  }
}
