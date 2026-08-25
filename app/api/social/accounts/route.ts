import { NextRequest, NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "../../../../lib/supabase/server";

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

  const formatted = (accounts || []).map((a: any) => ({
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
            const data = await res.json();
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
            const data = await res.json();
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
          const res = await fetch(
            `https://graph.facebook.com/v19.0/me?fields=id,name,accounts{id,name,instagram_business_account{id,username,profile_picture_url}}&access_token=${accessToken}`
          );
          if (res.ok) {
            const data = await res.json();
            const igAcc = data.accounts?.data?.[0]?.instagram_business_account;
            if (igAcc) {
              platformUserId = igAcc.id;
              finalName = igAcc.username || data.name || finalName || "Instagram Creator";
              finalHandle = `@${igAcc.username || "instagram"}`;
              finalAvatar = igAcc.profile_picture_url || finalAvatar;
            }
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
            access_token: accessToken || `token_${Date.now()}`,
            refresh_token: refreshToken || null,
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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
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
