import { NextRequest, NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "../../../../lib/supabase/server";

export async function GET() {
  if (!isSupabaseConfigured) {
    // Retorna contas de demonstração no ambiente local
    return NextResponse.json({
      accounts: [
        {
          id: "yt-1",
          platform: "youtube",
          accountName: "Meu Canal Klip",
          accountHandle: "@KlipShortsOfficial",
          status: "connected",
          avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=YouTube",
        },
        {
          id: "tt-1",
          platform: "tiktok",
          accountName: "Klip Creators",
          accountHandle: "@klip_creators",
          status: "connected",
          avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=TikTok",
        },
        {
          id: "ig-1",
          platform: "instagram",
          accountName: "Klip Studio Brasil",
          accountHandle: "@klip.studio",
          status: "connected",
          avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=Instagram",
        },
      ],
    });
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

  // Format response keys to match frontend camelCase where needed
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
    const { platform, accountName, accountHandle, avatarUrl } = body;

    if (!platform || !accountName) {
      return NextResponse.json({ error: "Parâmetros incompletos." }, { status: 400 });
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
            platform_user_id: `${platform}_manual_${Date.now()}`,
            account_name: accountName,
            account_handle: accountHandle || `@${accountName.toLowerCase().replace(/\s+/g, "_")}`,
            avatar_url: avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${platform}`,
            status: "connected",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,platform,platform_user_id" }
        );
      }
    }

    return NextResponse.json({ success: true });
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
      await supabase
        .from("social_accounts")
        .delete()
        .eq("user_id", user.id)
        .eq("platform", platform);
    }
  }

  return NextResponse.json({
    success: true,
    message: `Conta ${platform} desconectada com sucesso.`,
  });
}
