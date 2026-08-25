import { NextRequest, NextResponse } from "next/server";
import { MultiPublishRequest, SocialAccount, SocialPlatform } from "../../../lib/types/publishing";
import { publishToAllPlatforms } from "../../../lib/publishing/publisher";
import { createClient, isSupabaseConfigured } from "../../../lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body: MultiPublishRequest = await req.json();

    if (!body.title || !body.platforms || body.platforms.length === 0) {
      return NextResponse.json(
        { error: "Título e ao menos uma plataforma são obrigatórios." },
        { status: 400 }
      );
    }

    const connectedAccounts: Record<SocialPlatform, SocialAccount | undefined> = {
      youtube: undefined,
      tiktok: undefined,
      instagram: undefined,
    };

    let userId = "anon-user";

    if (isSupabaseConfigured) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        userId = user.id;
        const { data: accounts } = await supabase
          .from("social_accounts")
          .select("*")
          .eq("user_id", user.id);

        if (accounts) {
          for (const acc of accounts) {
            if (acc.platform === "youtube" || acc.platform === "tiktok" || acc.platform === "instagram") {
              connectedAccounts[acc.platform as SocialPlatform] = {
                id: acc.id,
                userId: acc.user_id,
                platform: acc.platform as SocialPlatform,
                platformUserId: acc.platform_user_id,
                accountName: acc.account_name,
                accountHandle: acc.account_handle,
                avatarUrl: acc.avatar_url,
                status: acc.status,
                accessToken: acc.access_token,
                refreshToken: acc.refresh_token,
                expiresAt: acc.expires_at,
                createdAt: acc.created_at,
                updatedAt: acc.updated_at,
              };
            }
          }
        }
      }
    }

    // Execute concurrent multi-platform publishing
    const response = await publishToAllPlatforms(body, connectedAccounts);

    // Save publication history in Supabase if configured
    if (isSupabaseConfigured) {
      const supabase = await createClient();
      await supabase.from("publications").insert({
        user_id: userId,
        title: body.title,
        description: body.description || "",
        hashtags: body.hashtags,
        video_url: body.videoUrl || "",
        status: response.success ? "published" : "failed",
        results: response.results,
      });
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Publish API Error:", error);
    return NextResponse.json(
      { error: error.message || "Erro durante a publicação multi-plataforma." },
      { status: 500 }
    );
  }
}
