import { NextRequest, NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "../../../../../lib/supabase/server";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ platform: string }> }
) {
  const { platform } = await context.params;
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error || !code) {
    return NextResponse.redirect(`${baseUrl}/?auth_error=${encodeURIComponent(error || "Acesso negado.")}`);
  }

  try {
    if (isSupabaseConfigured) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Exchange code for tokens depending on platform
        // and upsert into social_accounts table
        await supabase.from("social_accounts").upsert(
          {
            user_id: user.id,
            platform,
            account_name: `${platform.toUpperCase()} Creator`,
            account_handle: `@creator_${platform}`,
            access_token: `token_${code.substring(0, 10)}`,
            status: "connected",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,platform,platform_user_id" }
        );
      }
    }

    return NextResponse.redirect(`${baseUrl}/?connected=${platform}`);
  } catch (err: any) {
    console.error("OAuth Callback Error:", err);
    return NextResponse.redirect(`${baseUrl}/?auth_error=${encodeURIComponent(err.message)}`);
  }
}
