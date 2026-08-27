/**
 * Descobre a origem pública da requisição.
 * Usada para montar os `redirect_uri` de OAuth, que precisam bater exatamente
 * com o que está cadastrado no Google Cloud Console e no Meta for Developers.
 */
export function getDynamicBaseUrl(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host");

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

/** Impede open redirect: só aceita caminhos relativos ao próprio app. */
export function safeReturnPath(next: string | null | undefined, fallback = "/perfil"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}
