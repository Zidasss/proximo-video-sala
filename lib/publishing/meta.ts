/**
 * Helpers da Meta Graph API usados pelo fluxo do Instagram Reels.
 *
 * A publicação no Instagram exige três coisas que o token de usuário sozinho
 * não entrega: (1) uma conta Instagram Business/Creator, (2) vinculada a uma
 * Página do Facebook, e (3) o *Page access token* dessa Página — é ele que
 * autoriza `POST /{ig-user-id}/media`.
 */

import { GRAPH_BASE } from "./oauth";
import { GraphErrorBody, readJson } from "./http";

export interface InstagramTarget {
  /** ID da conta Instagram Business (usado nas chamadas de publicação). */
  igUserId: string;
  username: string;
  profilePictureUrl?: string;
  pageId: string;
  pageName: string;
  /** Token da Página — é este que deve ser guardado para publicar. */
  pageAccessToken: string;
}

interface GraphPage {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: {
    id: string;
    username?: string;
    profile_picture_url?: string;
  };
}

interface PagesResponse extends GraphErrorBody {
  data?: GraphPage[];
  paging?: { next?: string };
}

interface PublishingLimitResponse extends GraphErrorBody {
  data?: { quota_usage?: number; config?: { quota_total?: number } }[];
}

export function graphUrl(path: string, params: Record<string, string>): string {
  const clean = path.startsWith("/") ? path.slice(1) : path;
  return `${GRAPH_BASE}/${clean}?${new URLSearchParams(params)}`;
}

/** Lança um erro legível a partir do corpo de erro padrão do Graph. */
export function assertNoGraphError(data: GraphErrorBody, context: string): void {
  if (data?.error) {
    const e = data.error;
    const detail = [e.message, e.error_user_msg].filter(Boolean).join(" — ");
    throw new Error(`${context}: ${detail || JSON.stringify(e)} (code ${e.code ?? "?"})`);
  }
}

/**
 * Percorre todas as Páginas do usuário e devolve a primeira que tem uma conta
 * Instagram Business vinculada. A implementação anterior olhava apenas
 * `accounts.data[0]`, o que falhava para quem administra várias Páginas e a
 * primeira delas não tem Instagram conectado.
 */
export async function discoverInstagramTargets(
  userAccessToken: string
): Promise<InstagramTarget[]> {
  const targets: InstagramTarget[] = [];

  let next: string | null = graphUrl("me/accounts", {
    fields:
      "id,name,access_token,instagram_business_account{id,username,profile_picture_url}",
    limit: "100",
    access_token: userAccessToken,
  });

  // Segue a paginação do Graph (no máximo 5 páginas, o suficiente na prática).
  for (let page = 0; next && page < 5; page++) {
    const res: Response = await fetch(next);
    const data = await readJson<PagesResponse>(res);
    assertNoGraphError(data, "Erro ao listar Páginas do Facebook");

    for (const p of data.data || []) {
      const ig = p.instagram_business_account;
      if (!ig?.id) continue;
      targets.push({
        igUserId: ig.id,
        username: ig.username || "instagram",
        profilePictureUrl: ig.profile_picture_url,
        pageId: p.id,
        pageName: p.name || "Página do Facebook",
        pageAccessToken: p.access_token || userAccessToken,
      });
    }

    next = data.paging?.next || null;
  }

  return targets;
}

/** Atalho: primeira conta Instagram Business disponível, ou `null`. */
export async function discoverPrimaryInstagramTarget(
  userAccessToken: string
): Promise<InstagramTarget | null> {
  const targets = await discoverInstagramTargets(userAccessToken);
  return targets[0] || null;
}

/** Verifica quanto ainda resta da cota de 50 posts/24h da conta. */
export async function getInstagramPublishingLimit(
  igUserId: string,
  accessToken: string
): Promise<{ quotaUsage: number; quotaTotal: number } | null> {
  try {
    const res = await fetch(
      graphUrl(`${igUserId}/content_publishing_limit`, {
        fields: "quota_usage,config",
        access_token: accessToken,
      })
    );
    const data = await readJson<PublishingLimitResponse>(res);
    if (data?.error) return null;
    const entry = data.data?.[0];
    if (!entry) return null;
    return {
      quotaUsage: Number(entry.quota_usage ?? 0),
      quotaTotal: Number(entry.config?.quota_total ?? 50),
    };
  } catch {
    return null;
  }
}
