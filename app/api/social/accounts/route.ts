import { NextRequest, NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "../../../../lib/supabase/server";

export async function GET() {
  if (!isSupabaseConfigured) {
    // Return mock accounts for demo/preview
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
    .select("id, platform, account_name, account_handle, avatar_url, status, created_at")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ accounts: accounts || [] });
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

  return NextResponse.json({ success: true, message: `Conta ${platform} desconectada com sucesso.` });
}
