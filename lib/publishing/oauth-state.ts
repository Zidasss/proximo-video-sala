/**
 * `state` do OAuth com proteção CSRF.
 *
 * O valor enviado ao provedor carrega um nonce que também é gravado num cookie
 * HttpOnly. No callback, os dois precisam bater — sem isso, qualquer pessoa
 * poderia forjar um callback e vincular a própria conta social à sessão da vítima.
 */

export const STATE_COOKIE = "klip_oauth_state";
export const STATE_COOKIE_MAX_AGE = 10 * 60; // 10 minutos

export interface OAuthState {
  platform: string;
  next: string;
  nonce: string;
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function createState(platform: string, next: string): { state: string; nonce: string } {
  const nonce =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);

  return { state: toBase64Url(JSON.stringify({ platform, next, nonce })), nonce };
}

export function parseState(raw: string | null): OAuthState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(raw));
    if (typeof parsed?.platform !== "string" || typeof parsed?.nonce !== "string") {
      return null;
    }
    return { platform: parsed.platform, next: parsed.next || "/perfil", nonce: parsed.nonce };
  } catch {
    return null;
  }
}

/** Comparação em tempo constante, para não vazar o nonce por timing. */
export function nonceMatches(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
