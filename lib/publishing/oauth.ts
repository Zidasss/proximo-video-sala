/**
 * Configuração central de OAuth e renovação de tokens para YouTube (Google),
 * Instagram (Meta Graph API) e TikTok.
 */

import { readJson } from "./http";

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  open_id?: string;
  error?: string | { message?: string };
  error_description?: string;
  data?: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
}

export const GRAPH_API_VERSION = process.env.META_GRAPH_VERSION || "v23.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/** Margem de segurança: renova o token 5 minutos antes de expirar de fato. */
const EXPIRY_SKEW_MS = 5 * 60 * 1000;

export interface RefreshedToken {
  accessToken: string;
  /** Epoch em milissegundos. `undefined` quando a plataforma não informa validade. */
  expiresAt?: number;
  refreshToken?: string;
}

export const googleCredentials = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const configured = Boolean(
    clientId && clientSecret && !clientId.includes("your-google")
  );
  return { clientId, clientSecret, configured };
};

export const metaCredentials = () => {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const configured = Boolean(appId && appSecret && !appId.includes("your-meta"));
  return { appId, appSecret, configured };
};

export const tiktokCredentials = () => {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const configured = Boolean(
    clientKey && clientSecret && !clientKey.includes("your-tiktok")
  );
  return { clientKey, clientSecret, configured };
};

/** Normaliza os vários formatos de erro que os provedores devolvem. */
function describeTokenError(data: TokenResponse, res: Response): string {
  if (data.error_description) return data.error_description;
  if (typeof data.error === "string") return data.error;
  if (data.error?.message) return data.error.message;
  return res.statusText || `HTTP ${res.status}`;
}

export function isExpired(expiresAt?: number | null): boolean {
  if (!expiresAt) return false;
  const ms = expiresAt < 1e12 ? expiresAt * 1000 : expiresAt; // aceita segundos ou ms
  return Date.now() >= ms - EXPIRY_SKEW_MS;
}

export function expiresInToTimestamp(expiresIn?: number): number | undefined {
  if (!expiresIn || Number.isNaN(expiresIn)) return undefined;
  return Date.now() + expiresIn * 1000;
}

/**
 * Troca o refresh token do Google por um novo access token.
 * O refresh token do Google só é emitido com `access_type=offline&prompt=consent`.
 */
export async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<RefreshedToken> {
  const { clientId, clientSecret, configured } = googleCredentials();
  if (!configured) {
    throw new Error(
      "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET não configurados: impossível renovar o token do YouTube."
    );
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await readJson<TokenResponse>(res);

  if (!res.ok || !data.access_token) {
    throw new Error(`Falha ao renovar o token do Google: ${describeTokenError(data, res)}`);
  }

  return {
    accessToken: data.access_token,
    expiresAt: expiresInToTimestamp(data.expires_in),
    // O Google normalmente não devolve um novo refresh token nessa troca.
    refreshToken: data.refresh_token || refreshToken,
  };
}

/** Revoga o acesso concedido ao app no Google (usado ao desconectar a conta). */
export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}

/**
 * Troca o token curto do Meta (≈1h) por um token longo (≈60 dias).
 * Obrigatório para publicação no Instagram, senão a conta cai em ~1 hora.
 */
export async function exchangeMetaLongLivedToken(
  shortLivedToken: string
): Promise<RefreshedToken> {
  const { appId, appSecret, configured } = metaCredentials();
  if (!configured) {
    throw new Error(
      "META_APP_ID/META_APP_SECRET não configurados: impossível gerar token de longa duração."
    );
  }

  const url = `${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId!,
    client_secret: appSecret!,
    fb_exchange_token: shortLivedToken,
  })}`;

  const res = await fetch(url);
  const data = await readJson<TokenResponse>(res);

  if (!res.ok || !data.access_token) {
    throw new Error(
      `Falha ao gerar token de longa duração do Meta: ${describeTokenError(data, res)}`
    );
  }

  return {
    accessToken: data.access_token,
    // O Meta devolve `expires_in` em segundos (≈5.184.000 = 60 dias).
    expiresAt: expiresInToTimestamp(data.expires_in) ?? Date.now() + 60 * 24 * 3600 * 1000,
  };
}

/**
 * Renova o token do TikTok. Diferente do Google, o TikTok devolve
 * um novo refresh token a cada renovação e o antigo é invalidado.
 */
export async function refreshTikTokAccessToken(
  refreshToken: string
): Promise<RefreshedToken> {
  const { clientKey, clientSecret, configured } = tiktokCredentials();
  if (!configured) {
    throw new Error(
      "TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET não configurados: impossível renovar o token do TikTok."
    );
  }

  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey!,
      client_secret: clientSecret!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await readJson<TokenResponse>(res);
  const accessToken = data.access_token || data.data?.access_token;

  if (!res.ok || !accessToken) {
    throw new Error(`Falha ao renovar o token do TikTok: ${describeTokenError(data, res)}`);
  }

  return {
    accessToken,
    expiresAt: expiresInToTimestamp(data.expires_in || data.data?.expires_in),
    refreshToken: data.refresh_token || data.data?.refresh_token || refreshToken,
  };
}
