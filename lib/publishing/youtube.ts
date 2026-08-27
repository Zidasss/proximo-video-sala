import { PlatformPublishStatus } from "../types/publishing";
import { isExpired, refreshGoogleAccessToken } from "./oauth";
import { errorMessage } from "./http";

interface GoogleErrorBody {
  error?: {
    message?: string;
    errors?: { reason?: string }[];
  };
}

interface VideoResource {
  id?: string;
}

const UPLOAD_ENDPOINT =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

/** O upload resumível do YouTube exige blocos múltiplos de 256 KB. */
const CHUNK_SIZE = 8 * 1024 * 1024;

/** Limites da API do YouTube Data v3. */
const MAX_TITLE = 100;
const MAX_DESCRIPTION = 5000;
const MAX_TAGS_CHARS = 500;

interface PublishYouTubeOptions {
  accessToken: string;
  refreshToken?: string;
  /** Epoch (ms ou s) em que o access token expira; dispara renovação automática. */
  expiresAt?: number;
  title: string;
  description?: string;
  hashtags?: string[];
  visibility?: "public" | "unlisted" | "private";
  videoUrl?: string;
  videoBuffer?: Buffer;
  categoryId?: string;
  madeForKids?: boolean;
  notifySubscribers?: boolean;
  /** Chamado quando o token é renovado, para persistir o novo valor. */
  onTokenRefreshed?: (token: { accessToken: string; expiresAt?: number }) => void;
}

function normalizeHashtags(hashtags: string[]): string[] {
  return hashtags
    .map((h) => h.trim().replace(/^#+/, ""))
    .filter(Boolean);
}

/** As tags do YouTube somam no máximo 500 caracteres no total. */
function fitTags(tags: string[]): string[] {
  const out: string[] = [];
  let total = 0;
  for (const tag of tags) {
    const cost = tag.length + 1;
    if (total + cost > MAX_TAGS_CHARS) break;
    out.push(tag);
    total += cost;
  }
  return out;
}

/** Extrai a mensagem útil do corpo de erro do Google. */
function describeGoogleError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as GoogleErrorBody;
    const err = parsed.error;
    const reason = err?.errors?.[0]?.reason;
    const message = err?.message || body;

    if (reason === "quotaExceeded") {
      return "Cota diária da YouTube Data API esgotada. Tente novamente amanhã ou solicite aumento de cota no Google Cloud Console.";
    }
    if (reason === "uploadLimitExceeded") {
      return "Limite de uploads do canal atingido pelo YouTube. Aguarde 24h e tente novamente.";
    }
    if (reason === "youtubeSignupRequired") {
      return "A conta Google conectada não possui um canal do YouTube. Crie um canal antes de publicar.";
    }
    if (reason === "forbidden" || status === 403) {
      return `Permissão negada pelo YouTube: ${message}`;
    }
    return message;
  } catch {
    return body || `HTTP ${status}`;
  }
}

async function loadVideoBytes(
  videoUrl?: string,
  videoBuffer?: Buffer
): Promise<Uint8Array> {
  if (videoBuffer) {
    return new Uint8Array(
      videoBuffer.buffer.slice(
        videoBuffer.byteOffset,
        videoBuffer.byteOffset + videoBuffer.byteLength
      )
    );
  }

  if (!videoUrl) {
    throw new Error("Nenhum vídeo fornecido para o YouTube.");
  }

  const res = await fetch(videoUrl);
  if (!res.ok) {
    throw new Error(`Falha ao baixar o vídeo para envio: ${res.status} ${res.statusText}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Envia o arquivo em blocos usando `Content-Range`, tratando os `308 Resume
 * Incomplete` do protocolo resumível. Um envio único falharia em vídeos
 * grandes ou em conexões instáveis.
 */
async function uploadInChunks(
  uploadUrl: string,
  bytes: Uint8Array
): Promise<VideoResource> {
  const total = bytes.byteLength;
  let offset = 0;

  while (offset < total) {
    const end = Math.min(offset + CHUNK_SIZE, total);
    const chunk = bytes.subarray(offset, end);

    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${offset}-${end - 1}/${total}`,
      },
      body: chunk as unknown as BodyInit,
    });

    // 308 = bloco aceito, continue de onde o YouTube parou.
    if (res.status === 308) {
      const range = res.headers.get("Range");
      const lastByte = range ? Number(range.split("-")[1]) : end - 1;
      offset = Number.isFinite(lastByte) ? lastByte + 1 : end;
      continue;
    }

    if (res.ok) {
      return (await res.json()) as VideoResource;
    }

    const errText = await res.text();
    throw new Error(
      `Erro ao transferir o vídeo para o YouTube: ${describeGoogleError(res.status, errText)}`
    );
  }

  throw new Error("O YouTube encerrou o upload sem confirmar a criação do vídeo.");
}

export async function publishToYouTubeShorts(
  options: PublishYouTubeOptions
): Promise<PlatformPublishStatus> {
  try {
    const {
      title,
      description = "",
      hashtags = [],
      visibility = "public",
      videoUrl,
      videoBuffer,
      categoryId = process.env.YOUTUBE_CATEGORY_ID || "22", // People & Blogs
      madeForKids = false,
      notifySubscribers = true,
      refreshToken,
      expiresAt,
      onTokenRefreshed,
    } = options;

    let accessToken = options.accessToken;

    // Garante o marcador #Shorts, que é o que faz o YouTube tratar como Short.
    const hasShortsTag =
      title.toLowerCase().includes("#shorts") ||
      description.toLowerCase().includes("#shorts");
    const finalTitle = hasShortsTag ? title : `${title} #Shorts`;
    const tags = normalizeHashtags(hashtags);
    const finalDescription = `${description}\n\n${tags
      .map((t) => `#${t}`)
      .join(" ")}`.trim();

    // Modo simulado: sem credenciais reais ou com ENABLE_PUBLISH_MOCK ligado.
    if (!accessToken || accessToken === "mock-token" || process.env.ENABLE_PUBLISH_MOCK === "true") {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const mockVideoId = "sh_" + Math.random().toString(36).substring(2, 9);
      return {
        platform: "youtube",
        status: "published",
        progress: 100,
        postId: mockVideoId,
        postUrl: `https://youtube.com/shorts/${mockVideoId}`,
      };
    }

    // Renova o token antes de começar: o do Google vale apenas 1 hora e o
    // upload de um vídeo pode levar minutos.
    if (refreshToken && isExpired(expiresAt)) {
      const fresh = await refreshGoogleAccessToken(refreshToken);
      accessToken = fresh.accessToken;
      onTokenRefreshed?.({ accessToken: fresh.accessToken, expiresAt: fresh.expiresAt });
    }

    const bytes = await loadVideoBytes(videoUrl, videoBuffer);

    const metadata = {
      snippet: {
        title: finalTitle.slice(0, MAX_TITLE),
        description: finalDescription.slice(0, MAX_DESCRIPTION),
        tags: fitTags([...tags, "Shorts", "Klip"]),
        categoryId,
      },
      status: {
        privacyStatus: visibility,
        selfDeclaredMadeForKids: madeForKids,
      },
    };

    const initUpload = (token: string) =>
      fetch(`${UPLOAD_ENDPOINT}&notifySubscribers=${notifySubscribers}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": "video/mp4",
          "X-Upload-Content-Length": String(bytes.byteLength),
        },
        body: JSON.stringify(metadata),
      });

    let initRes = await initUpload(accessToken);

    // Um 401 aqui quase sempre significa token vencido: renova e tenta de novo.
    if (initRes.status === 401 && refreshToken) {
      const fresh = await refreshGoogleAccessToken(refreshToken);
      accessToken = fresh.accessToken;
      onTokenRefreshed?.({ accessToken: fresh.accessToken, expiresAt: fresh.expiresAt });
      initRes = await initUpload(accessToken);
    }

    if (!initRes.ok) {
      const errText = await initRes.text();
      throw new Error(
        `Erro ao iniciar o upload no YouTube: ${describeGoogleError(initRes.status, errText)}`
      );
    }

    const uploadUrl = initRes.headers.get("Location");
    if (!uploadUrl) {
      throw new Error("O YouTube não retornou a URL de upload resumível.");
    }

    const result = await uploadInChunks(uploadUrl, bytes);
    const videoId = result?.id;

    if (!videoId) {
      throw new Error("O YouTube aceitou o envio mas não retornou o ID do vídeo.");
    }

    return {
      platform: "youtube",
      status: "published",
      progress: 100,
      postId: videoId,
      postUrl: `https://youtube.com/shorts/${videoId}`,
    };
  } catch (error: unknown) {
    return {
      platform: "youtube",
      status: "failed",
      progress: 0,
      errorMessage: errorMessage(error, "Erro desconhecido ao publicar no YouTube."),
    };
  }
}
