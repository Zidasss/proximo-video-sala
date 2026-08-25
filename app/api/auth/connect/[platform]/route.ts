import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ platform: string }> }
) {
  const { platform } = await context.params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${baseUrl}/api/auth/callback/${platform}`;

  const isMock = process.env.ENABLE_PUBLISH_MOCK === "true" || (!process.env.GOOGLE_CLIENT_ID && !process.env.TIKTOK_CLIENT_KEY && !process.env.META_APP_ID);

  if (isMock) {
    // In local simulation mode, simulate full OAuth redirect roundtrip
    return NextResponse.redirect(`${redirectUri}?code=mock_oauth_code_${platform}`);
  }

  if (platform === "youtube") {
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const scopes = [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/userinfo.profile",
    ].join(" ");

    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=${encodeURIComponent(
      scopes
    )}&access_type=offline&prompt=consent`;

    return NextResponse.redirect(url);
  }

  if (platform === "tiktok") {
    const clientKey = process.env.TIKTOK_CLIENT_KEY || "";
    const scopes = "user.info.basic,video.upload,video.publish";
    const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&scope=${scopes}&response_type=code&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&state=tiktok_auth`;

    return NextResponse.redirect(url);
  }

  if (platform === "instagram") {
    const fbAppId = process.env.META_APP_ID || "";
    const scopes = "instagram_basic,instagram_content_publish,pages_show_list";
    const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${fbAppId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=${scopes}&response_type=code`;

    return NextResponse.redirect(url);
  }

  return NextResponse.json({ error: "Plataforma desconhecida." }, { status: 400 });
}
