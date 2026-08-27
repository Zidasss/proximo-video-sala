/**
 * Renovação e persistência dos tokens das contas sociais.
 *
 * Todo caminho que vai falar com uma API externa (publicar, validar, listar)
 * passa por `ensureFreshAccount` primeiro, para nunca usar um access token
 * vencido — o do YouTube dura só 1 hora.
 */

import { SocialAccount, SocialPlatform } from "../types/publishing";
import { errorMessage } from "./http";
import {
  RefreshedToken,
  exchangeMetaLongLivedToken,
  isExpired,
  refreshGoogleAccessToken,
  refreshTikTokAccessToken,
} from "./oauth";

/** Linha crua da tabela `social_accounts`. */
export interface SocialAccountRow {
  id: string;
  user_id: string;
  platform: string;
  platform_user_id?: string | null;
  account_name: string;
  account_handle?: string | null;
  avatar_url?: string | null;
  status?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  expires_at?: number | null;
  created_at?: string;
  updated_at?: string;
}

export function rowToAccount(row: SocialAccountRow): SocialAccount {
  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform as SocialPlatform,
    platformUserId: row.platform_user_id || undefined,
    accountName: row.account_name,
    accountHandle: row.account_handle || undefined,
    avatarUrl: row.avatar_url || undefined,
    status: (row.status as SocialAccount["status"]) || "connected",
    accessToken: row.access_token || undefined,
    refreshToken: row.refresh_token || undefined,
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

/** Cliente mínimo do Supabase de que precisamos aqui (facilita os testes). */
interface TokenPersistence {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: unknown): PromiseLike<{ error: unknown }>;
    };
  };
}

export interface EnsureFreshResult {
  account: SocialAccount;
  refreshed: boolean;
  /** Preenchido quando a renovação falhou e a conta precisa ser reconectada. */
  error?: string;
}

async function refreshFor(account: SocialAccount): Promise<RefreshedToken> {
  switch (account.platform) {
    case "youtube":
      if (!account.refreshToken) {
        throw new Error(
          "Conta do YouTube sem refresh token. Reconecte o canal para conceder acesso offline."
        );
      }
      return refreshGoogleAccessToken(account.refreshToken);

    case "instagram":
      if (!account.accessToken) {
        throw new Error("Conta do Instagram sem token salvo. Reconecte a conta.");
      }
      // O Meta não usa refresh token: renova-se estendendo o próprio token longo.
      return exchangeMetaLongLivedToken(account.accessToken);

    case "tiktok":
      if (!account.refreshToken) {
        throw new Error("Conta do TikTok sem refresh token. Reconecte a conta.");
      }
      return refreshTikTokAccessToken(account.refreshToken);

    default:
      throw new Error(`Plataforma desconhecida: ${account.platform}`);
  }
}

/**
 * Devolve a conta com um access token válido, renovando e gravando no banco
 * quando necessário. Nunca lança: em caso de falha marca a conta como
 * `expired` e devolve a mensagem para a UI pedir reconexão.
 */
export async function ensureFreshAccount(
  account: SocialAccount,
  supabase?: TokenPersistence | null
): Promise<EnsureFreshResult> {
  if (!account.accessToken) {
    return { account, refreshed: false, error: "Conta sem token de acesso." };
  }

  if (!isExpired(account.expiresAt)) {
    return { account, refreshed: false };
  }

  try {
    const fresh = await refreshFor(account);

    const updated: SocialAccount = {
      ...account,
      accessToken: fresh.accessToken,
      refreshToken: fresh.refreshToken ?? account.refreshToken,
      expiresAt: fresh.expiresAt,
      status: "connected",
      updatedAt: new Date().toISOString(),
    };

    if (supabase && account.id) {
      await supabase
        .from("social_accounts")
        .update({
          access_token: updated.accessToken,
          refresh_token: updated.refreshToken ?? null,
          expires_at: updated.expiresAt ?? null,
          status: "connected",
          updated_at: updated.updatedAt,
        })
        .eq("id", account.id);
    }

    return { account: updated, refreshed: true };
  } catch (err: unknown) {
    const message = errorMessage(err, "Falha ao renovar o token de acesso.");

    if (supabase && account.id) {
      await supabase
        .from("social_accounts")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", account.id);
    }

    return {
      account: { ...account, status: "expired" },
      refreshed: false,
      error: message,
    };
  }
}
