import { PlatformPublishStatus } from "../types/publishing";
import {
  assertNoGraphError,
  getInstagramPublishingLimit,
  graphUrl,
} from "./meta";
import { GraphErrorBody, errorMessage, readJson } from "./http";

interface ContainerStatusResponse extends GraphErrorBody {
  status_code?: "IN_PROGRESS" | "FINISHED" | "PUBLISHED" | "ERROR" | "EXPIRED";
  status?: string;
}

interface MediaIdResponse extends GraphErrorBody {
  id?: string;
}

interface PermalinkResponse extends GraphErrorBody {
  permalink?: string;
}

/** Limites da Content Publishing API do Instagram. */
const MAX_CAPTION = 2200;
const MAX_HASHTAGS = 30;

/** O processamento de um Reel pela Meta costuma levar de 5s a alguns minutos. */
const POLL_MAX_ATTEMPTS = 40;
const POLL_INITIAL_DELAY_MS = 3000;
const POLL_MAX_DELAY_MS = 15000;

interface PublishInstagramOptions {
  /** Preferencialmente o *Page access token* da Página vinculada à conta. */
  accessToken: string;
  /** ID da conta Instagram Business (`instagram_business_account.id`). */
  instagramUserId?: string;
  title: string;
  hashtags?: string[];
  videoUrl?: string;
  coverUrl?: string;
  /** Instante (ms) do vídeo usado como capa, quando não há `coverUrl`. */
  thumbOffsetMs?: number;
  shareToFeed?: boolean;
  locationId?: string;
}

function buildCaption(title: string, hashtags: string[]): string {
  const tags = hashtags
    .map((h) => h.trim().replace(/^#+/, ""))
    .filter(Boolean)
    .slice(0, MAX_HASHTAGS)
    .map((h) => `#${h}`)
    .join(" ");

  return `${title}\n\n${tags}`.trim().slice(0, MAX_CAPTION);
}

function assertPublicVideoUrl(videoUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(videoUrl);
  } catch {
    throw new Error("A URL do vídeo enviada ao Instagram é inválida.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error(
      "O Instagram só aceita vídeos servidos por HTTPS. Publique o arquivo no Supabase Storage antes de postar."
    );
  }

  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(parsed.hostname)) {
    throw new Error(
      "A Meta precisa baixar o vídeo pela internet: uma URL de localhost nunca será acessível."
    );
  }
}

/**
 * Aguarda a Meta terminar de processar o container do Reel.
 * O `media_publish` só funciona depois que o status vira `FINISHED`.
 */
async function waitForContainer(
  containerId: string,
  accessToken: string
): Promise<void> {
  let delay = POLL_INITIAL_DELAY_MS;

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(Math.round(delay * 1.25), POLL_MAX_DELAY_MS);

    const res = await fetch(
      graphUrl(containerId, {
        fields: "status_code,status",
        access_token: accessToken,
      })
    );
    const data = await readJson<ContainerStatusResponse>(res);
    assertNoGraphError(data, "Erro ao consultar o processamento do Reel");

    switch (data.status_code) {
      case "FINISHED":
        return;
      case "PUBLISHED":
        return;
      case "ERROR":
        throw new Error(
          `A Meta rejeitou o vídeo: ${data.status || "verifique formato (MP4/MOV), duração (3s–15min) e proporção 9:16."}`
        );
      case "EXPIRED":
        throw new Error(
          "O container do Reel expirou antes da publicação (validade de 24h). Tente publicar novamente."
        );
      default:
        // IN_PROGRESS — continua aguardando.
        break;
    }
  }

  throw new Error(
    "Tempo esgotado aguardando o Instagram processar o vídeo. O Reel pode ainda aparecer no perfil em alguns minutos."
  );
}

export async function publishToInstagramReels(
  options: PublishInstagramOptions
): Promise<PlatformPublishStatus> {
  try {
    const {
      accessToken,
      instagramUserId,
      title,
      hashtags = [],
      videoUrl,
      coverUrl,
      thumbOffsetMs,
      shareToFeed = true,
      locationId,
    } = options;

    const caption = buildCaption(title, hashtags);

    // Modo simulado: sem credenciais reais ou com ENABLE_PUBLISH_MOCK ligado.
    if (!accessToken || accessToken === "mock-token" || process.env.ENABLE_PUBLISH_MOCK === "true") {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const mockMediaId = "ig_" + Math.random().toString(36).substring(2, 9);
      return {
        platform: "instagram",
        status: "published",
        progress: 100,
        postId: mockMediaId,
        postUrl: `https://www.instagram.com/reels/${mockMediaId}`,
      };
    }

    if (!instagramUserId || instagramUserId === "me") {
      throw new Error(
        "ID da conta Instagram Business não encontrado. Reconecte o Instagram para vincular a Página do Facebook."
      );
    }

    if (!videoUrl) {
      throw new Error("O Instagram Reels exige uma URL pública e acessível do vídeo.");
    }
    assertPublicVideoUrl(videoUrl);

    // A conta pode postar no máximo 50 vezes em 24h — avisa antes de gastar o upload.
    const limit = await getInstagramPublishingLimit(instagramUserId, accessToken);
    if (limit && limit.quotaUsage >= limit.quotaTotal) {
      throw new Error(
        `Limite de publicações do Instagram atingido (${limit.quotaUsage}/${limit.quotaTotal} nas últimas 24h).`
      );
    }

    // 1. Criar o container do Reel.
    const containerParams: Record<string, string> = {
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      share_to_feed: String(shareToFeed),
      access_token: accessToken,
    };
    if (coverUrl) containerParams.cover_url = coverUrl;
    else if (typeof thumbOffsetMs === "number") {
      containerParams.thumb_offset = String(Math.max(0, Math.round(thumbOffsetMs)));
    }
    if (locationId) containerParams.location_id = locationId;

    const createRes = await fetch(graphUrl(`${instagramUserId}/media`, containerParams), {
      method: "POST",
    });
    const containerData = await readJson<MediaIdResponse>(createRes);
    assertNoGraphError(containerData, "Erro ao criar o container do Reel no Instagram");

    const containerId = containerData.id;
    if (!containerId) {
      throw new Error("O Instagram não retornou o ID do container do Reel.");
    }

    // 2. Aguardar a Meta baixar e transcodificar o vídeo.
    await waitForContainer(containerId, accessToken);

    // 3. Publicar o container.
    const publishRes = await fetch(
      graphUrl(`${instagramUserId}/media_publish`, {
        creation_id: containerId,
        access_token: accessToken,
      }),
      { method: "POST" }
    );
    const publishData = await readJson<MediaIdResponse>(publishRes);
    assertNoGraphError(publishData, "Erro ao publicar o Reel no Instagram");

    const mediaId = publishData.id;
    if (!mediaId) {
      throw new Error("O Instagram não retornou o ID da mídia publicada.");
    }

    // 4. Buscar o permalink real (o ID da mídia não forma uma URL válida).
    let postUrl = `https://www.instagram.com/reels/${mediaId}`;
    try {
      const permalinkRes = await fetch(
        graphUrl(mediaId, { fields: "permalink", access_token: accessToken })
      );
      const permalinkData = await readJson<PermalinkResponse>(permalinkRes);
      if (permalinkData?.permalink) postUrl = permalinkData.permalink;
    } catch {
      // O permalink é opcional: a publicação já foi concluída.
    }

    return {
      platform: "instagram",
      status: "published",
      progress: 100,
      postId: mediaId,
      postUrl,
    };
  } catch (error: unknown) {
    return {
      platform: "instagram",
      status: "failed",
      progress: 0,
      errorMessage: errorMessage(error, "Erro desconhecido ao publicar no Instagram."),
    };
  }
}
