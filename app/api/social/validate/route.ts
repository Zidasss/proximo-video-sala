import { NextRequest, NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "../../../../lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { platform, accessToken } = await req.json();

    if (!platform) {
      return NextResponse.json({ error: "Plataforma não informada." }, { status: 400 });
    }

    let token = accessToken;

    // Se o token não foi enviado diretamente, busca na tabela social_accounts do usuário
    if (!token && isSupabaseConfigured) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: account } = await supabase
          .from("social_accounts")
          .select("access_token")
          .eq("user_id", user.id)
          .eq("platform", platform)
          .maybeSingle();

        token = account?.access_token;
      }
    }

    if (!token) {
      return NextResponse.json(
        { valid: false, error: `Nenhum token encontrado para a conta ${platform}.` },
        { status: 400 }
      );
    }

    // 1. Validar com YouTube Data API
    if (platform === "youtube") {
      try {
        const res = await fetch(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (res.ok) {
          const data = await res.json();
          const channel = data.items?.[0];
          return NextResponse.json({
            valid: true,
            channelName: channel?.snippet?.title || "Canal YouTube",
            handle: channel?.snippet?.customUrl || `@${channel?.id}`,
            subscriberCount: channel?.statistics?.subscriberCount,
            avatarUrl: channel?.snippet?.thumbnails?.default?.url,
            message: "Conexão com a API do YouTube está ativa e válida.",
          });
        } else {
          const errText = await res.text();
          return NextResponse.json({
            valid: false,
            error: "Token expirado ou inválido na API do Google YouTube.",
            details: errText,
          });
        }
      } catch (err: any) {
        return NextResponse.json({ valid: false, error: err.message });
      }
    }

    // 2. Validar com TikTok API
    if (platform === "tiktok") {
      try {
        const res = await fetch(
          "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (res.ok) {
          const data = await res.json();
          const u = data.data?.user;
          return NextResponse.json({
            valid: true,
            channelName: u?.display_name || "Criador TikTok",
            handle: `@${(u?.display_name || "tiktok").toLowerCase().replace(/\s+/g, "_")}`,
            avatarUrl: u?.avatar_url,
            message: "Conexão com a API do TikTok está ativa e válida.",
          });
        } else {
          return NextResponse.json({
            valid: false,
            error: "Token expirado ou inválido na API do TikTok.",
          });
        }
      } catch (err: any) {
        return NextResponse.json({ valid: false, error: err.message });
      }
    }

    // 3. Validar com Meta / Instagram Graph API
    if (platform === "instagram") {
      try {
        const res = await fetch(
          `https://graph.facebook.com/v19.0/me?fields=id,name,accounts{id,name,instagram_business_account{id,username,profile_picture_url}}&access_token=${token}`
        );

        if (res.ok) {
          const data = await res.json();
          const ig = data.accounts?.data?.[0]?.instagram_business_account;
          return NextResponse.json({
            valid: true,
            channelName: ig?.username || data.name || "Instagram Creator",
            handle: `@${ig?.username || "instagram"}`,
            avatarUrl: ig?.profile_picture_url,
            message: "Conexão com a Meta Graph API está ativa e válida.",
          });
        } else {
          return NextResponse.json({
            valid: false,
            error: "Token expirado ou inválido na API do Instagram.",
          });
        }
      } catch (err: any) {
        return NextResponse.json({ valid: false, error: err.message });
      }
    }

    return NextResponse.json({ error: "Plataforma desconhecida." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
