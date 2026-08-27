import { NextRequest, NextResponse } from "next/server";
import { getDynamicBaseUrl, safeReturnPath } from "../../../../../lib/http/base-url";
import {
  GRAPH_API_VERSION,
  googleCredentials,
  metaCredentials,
  tiktokCredentials,
} from "../../../../../lib/publishing/oauth";
import {
  STATE_COOKIE,
  STATE_COOKIE_MAX_AGE,
  createState,
} from "../../../../../lib/publishing/oauth-state";

/** Escopos mínimos para subir Shorts e ler os dados do canal. */
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

/**
 * Escopos da Content Publishing API. `instagram_content_publish` é o que
 * autoriza o POST do Reel; os de `pages_*` são necessários porque o Reel é
 * publicado através da Página do Facebook vinculada à conta Business.
 */
const META_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
].join(",");

const TIKTOK_SCOPES = "user.info.basic,video.upload,video.publish";

function setupError(baseUrl: string, next: string, message: string) {
  const setupUrl = new URL(next, baseUrl);
  setupUrl.searchParams.set("auth_error", message);
  return NextResponse.redirect(setupUrl.toString());
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ platform: string }> }
) {
  const { platform } = await context.params;
  const { searchParams } = new URL(req.url);
  const next = safeReturnPath(searchParams.get("next"));
  const baseUrl = getDynamicBaseUrl(req);
  const redirectUri = `${baseUrl}/api/auth/callback/${platform}`;

  const { state, nonce } = createState(platform, next);

  let authorizeUrl: string;

  if (platform === "youtube") {
    const { clientId, configured } = googleCredentials();
    if (!configured) {
      return setupError(
        baseUrl,
        next,
        "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET não configurados. Adicione as credenciais do Google Cloud Console para conectar ao vivo."
      );
    }

    // `access_type=offline` + `prompt=consent` são obrigatórios para receber o
    // refresh token — sem ele o canal desconecta sozinho em 1 hora.
    authorizeUrl =
      "https://accounts.google.com/o/oauth2/v2/auth?" +
      new URLSearchParams({
        client_id: clientId!,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: GOOGLE_SCOPES,
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state,
      });
  } else if (platform === "tiktok") {
    const { clientKey, configured } = tiktokCredentials();
    if (!configured) {
      return setupError(
        baseUrl,
        next,
        "TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET não configurados. Adicione as credenciais do TikTok for Developers para conectar ao vivo."
      );
    }

    authorizeUrl =
      "https://www.tiktok.com/v2/auth/authorize/?" +
      new URLSearchParams({
        client_key: clientKey!,
        scope: TIKTOK_SCOPES,
        response_type: "code",
        redirect_uri: redirectUri,
        state,
      });
  } else if (platform === "instagram") {
    const { appId, configured } = metaCredentials();
    if (!configured) {
      return setupError(
        baseUrl,
        next,
        "META_APP_ID/META_APP_SECRET não configurados. Adicione as credenciais do Meta for Developers para conectar ao vivo."
      );
    }

    authorizeUrl =
      `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?` +
      new URLSearchParams({
        client_id: appId!,
        redirect_uri: redirectUri,
        scope: META_SCOPES,
        response_type: "code",
        state,
      });
  } else {
    return NextResponse.json({ error: "Plataforma desconhecida." }, { status: 400 });
  }

  const response = NextResponse.redirect(authorizeUrl);

  // O nonce fica só no servidor; o callback compara com o que voltar no `state`.
  response.cookies.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: baseUrl.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: STATE_COOKIE_MAX_AGE,
  });

  return response;
}
