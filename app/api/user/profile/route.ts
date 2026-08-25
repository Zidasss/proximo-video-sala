import { NextRequest, NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "../../../../lib/supabase/server";

export async function GET() {
  if (!isSupabaseConfigured) {
    return NextResponse.json({
      user: {
        id: "creator-demo-id",
        email: "criador@klip.app",
        name: "Criador de Conteúdo",
        avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=KlipCreator",
        createdAt: new Date().toISOString(),
      },
      socialAccounts: [
        {
          id: "yt-1",
          platform: "youtube",
          accountName: "Meu Canal Klip",
          accountHandle: "@KlipShortsOfficial",
          avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=YouTube",
          status: "connected",
        },
        {
          id: "tt-1",
          platform: "tiktok",
          accountName: "Klip Creators",
          accountHandle: "@klip_creators",
          avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=TikTok",
          status: "connected",
        },
        {
          id: "ig-1",
          platform: "instagram",
          accountName: "Klip Studio Brasil",
          accountHandle: "@klip.studio",
          avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=Instagram",
          status: "connected",
        },
      ],
      stats: {
        publicationsCount: 12,
        connectedPlatformsCount: 3,
      },
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ user: null, socialAccounts: [] }, { status: 401 });
  }

  // 1. Obter dados do perfil
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, name, avatar_url, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  // 2. Obter contas sociais vinculadas
  const { data: socialAccounts } = await supabase
    .from("social_accounts")
    .select("id, platform, platform_user_id, account_name, account_handle, avatar_url, status, created_at")
    .eq("user_id", user.id);

  // 3. Obter contagem de publicações
  const { count: publicationsCount } = await supabase
    .from("publications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const displayName = profile?.name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Criador";
  const avatarUrl = profile?.avatar_url || user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(displayName)}`;

  const formattedAccounts = (socialAccounts || []).map((a: any) => ({
    id: a.id,
    platform: a.platform,
    platformUserId: a.platform_user_id,
    accountName: a.account_name,
    accountHandle: a.account_handle,
    avatarUrl: a.avatar_url,
    status: a.status,
    createdAt: a.created_at,
  }));

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email || profile?.email || "",
      name: displayName,
      avatarUrl,
      createdAt: profile?.created_at || user.created_at,
      lastSignInAt: user.last_sign_in_at,
    },
    socialAccounts: formattedAccounts,
    stats: {
      publicationsCount: publicationsCount || 0,
      connectedPlatformsCount: formattedAccounts.length,
    },
  });
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, avatarUrl } = body;

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        user: {
          id: "creator-demo-id",
          email: "criador@klip.app",
          name: name || "Criador de Conteúdo",
          avatarUrl: avatarUrl || "https://api.dicebear.com/7.x/bottts/svg?seed=KlipCreator",
        },
      });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    // 1. Atualizar metadata do usuário
    await supabase.auth.updateUser({
      data: {
        full_name: name,
        avatar_url: avatarUrl,
      },
    });

    // 2. Upsert na tabela profiles
    const { data: updatedProfile, error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email: user.email || "",
          name,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: updatedProfile?.name || name,
        avatarUrl: updatedProfile?.avatar_url || avatarUrl,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
