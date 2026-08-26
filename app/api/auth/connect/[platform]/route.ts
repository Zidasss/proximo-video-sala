import { NextRequest, NextResponse } from "next/server";

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
  const next = searchParams.get("next") || "/perfil";
  const baseUrl = getDynamicBaseUrl(req);
  const redirectUri = `${baseUrl}/api/auth/callback/${platform}`;

  const statePayload = Buffer.from(JSON.stringify({ platform, next })).toString("base64url");

  // YouTube / Google OAuth
  if (platform === "youtube") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId || clientId.includes("your-google")) {
      const setupUrl = new URL(next, baseUrl);
      setupUrl.searchParams.set(
        "auth_error",
        "GOOGLE_CLIENT_ID não configurado. Adicione suas credenciais do Google Cloud Console para conectar ao vivo."
      );
      return NextResponse.redirect(setupUrl.toString());
    }

    const scopes = [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" ");

    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=${encodeURIComponent(
      scopes
    )}&access_type=offline&prompt=consent&include_granted_scopes=true&state=${statePayload}`;

    return NextResponse.redirect(url);
  }

  // TikTok OAuth
  if (platform === "tiktok") {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    if (!clientKey || clientKey.includes("your-tiktok")) {
      const setupUrl = new URL(next, baseUrl);
      setupUrl.searchParams.set(
        "auth_error",
        "TIKTOK_CLIENT_KEY não configurado. Adicione suas credenciais do TikTok for Developers para conectar ao vivo."
      );
      return NextResponse.redirect(setupUrl.toString());
    }

    const scopes = "user.info.basic,video.upload,video.publish";
    const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&scope=${scopes}&response_type=code&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&state=${statePayload}`;

    return NextResponse.redirect(url);
  }

  // Instagram / Meta Graph API OAuth
  if (platform === "instagram") {
    const fbAppId = process.env.META_APP_ID;
    if (!fbAppId || fbAppId.includes("your-meta")) {
      const setupUrl = new URL(next, baseUrl);
      setupUrl.searchParams.set(
        "auth_error",
        "META_APP_ID não configurado. Adicione o App ID do Meta for Developers para conectar ao vivo."
      );
      return NextResponse.redirect(setupUrl.toString());
    }

    const scopes = "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management";
    const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${fbAppId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=${scopes}&response_type=code&state=${statePayload}`;

    return NextResponse.redirect(url);
  }

  return NextResponse.json({ error: "Plataforma desconhecida." }, { status: 400 });
}
