import { PlatformPublishStatus } from "../types/publishing";
import { errorMessage, readJson } from "./http";

const API_BASE = "https://open.tiktokapis.com/v2/post/publish";

/** O TikTok exige blocos entre 5 MB e 64 MB; o último pode passar disso. */
const CHUNK_SIZE = 10 * 1024 * 1024;
const SINGLE_CHUNK_LIMIT = 64 * 1024 * 1024;

/** A publicação continua em background depois do upload terminar. */
const POLL_MAX_ATTEMPTS = 40;
const POLL_INITIAL_DELAY_MS = 3000;
const POLL_MAX_DELAY_MS = 15000;

const MAX_TITLE = 2200;

type PrivacyLevel =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "FOLLOWER_OF_CREATOR"
  | "SELF_ONLY";

interface TikTokError {
  error?: { code?: string; message?: string; log_id?: string };
}

interface CreatorInfo extends TikTokError {
  data?: {
    creator_username?: string;
    creator_nickname?: string;
    privacy_level_options?: PrivacyLevel[];
    comment_disabled?: boolean;
    duet_disabled?: boolean;
    stitch_disabled?: boolean;
    max_video_post_duration_sec?: number;
  };
}

interface InitResponse extends TikTokError {
  data?: { publish_id?: string; upload_url?: string };
}

interface StatusResponse extends TikTokError {
  data?: {
    status?: "PROCESSING_UPLOAD" | "PROCESSING_DOWNLOAD" | "PUBLISH_COMPLETE" | "FAILED";
    fail_reason?: string;
    publicaly_available_post_id?: (string | number)[];
    uploaded_bytes?: number;
  };
}

interface PublishTikTokOptions {
  accessToken: string;
  title: string;
  hashtags?: string[];
  visibility?: "public" | "unlisted" | "private";
  videoUrl?: string;
  videoBuffer?: Buffer;
  /** Manda para os rascunhos do app em vez de publicar direto. */
  postAsDraft?: boolean;
  coverTimestampMs?: number;
}

function buildCaption(title: string, hashtags: string[]): string {
  const tags = hashtags
    .map((h) => h.trim().replace(/^#+/, ""))
    .filter(Boolean)
    .map((h) => `#${h}`)
    .join(" ");
  return `${title} ${tags}`.trim().slice(0, MAX_TITLE);
}

/** Traduz os códigos de erro mais comuns do TikTok em instruções acionáveis. */
function describeTikTokError(err: TikTokError["error"]): string {
  const code = err?.code || "";
  const message = err?.message || "";

  const known: Record<string, string> = {
    url_ownership_unverified:
      "O TikTok exige que o domínio do vídeo seja verificado antes de aceitar PULL_FROM_URL. " +
      "Como o arquivo fica no Supabase Storage (domínio de terceiros), use o envio direto por arquivo.",
    privacy_level_option_mismatch:
      "A visibilidade escolhida não é permitida para esta conta. Contas privadas não podem publicar como público.",
    spam_risk_too_many_posts:
      "Limite de publicações do TikTok atingido nas últimas 24h. Aguarde antes de tentar de novo.",
    spam_risk_user_banned_from_posting:
      "Esta conta está impedida de publicar pelo TikTok.",
    reached_active_user_cap:
      "O app atingiu o limite de usuários ativos permitido para clientes não auditados pelo TikTok.",
    unaudited_client_can_only_post_to_private_accounts:
      "Enquanto o app não passar pela auditoria do TikTok, só é possível publicar como privado (SELF_ONLY).",
    access_token_invalid: "Token do TikTok inválido ou expirado. Reconecte a conta.",
    scope_not_authorized:
      "O escopo video.publish não foi autorizado. Reconecte a conta aceitando todas as permissões.",
    file_format_check_failed:
      "Formato de vídeo recusado pelo TikTok. Use MP4 ou MOV com codec H.264.",
    video_pull_failed:
      "O TikTok não conseguiu baixar o vídeo da URL informada. Confirme que ela é pública e HTTPS.",
  };

  if (known[code]) return known[code];
  return message || code || "erro não identificado";
}

async function tiktokPost<T>(
  path: string,
  accessToken: string,
  body: unknown
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
  });
  return (await readJson<T>(res)) as T;
}

function assertNoTikTokError(data: TikTokError, context: string): void {
  // Em caso de sucesso o TikTok devolve error.code === "ok".
  if (data.error && data.error.code && data.error.code !== "ok") {
    throw new Error(`${context}: ${describeTikTokError(data.error)}`);
  }
}

/**
 * Consulta os dados do criador. O TikTok exige esta chamada antes de publicar:
 * é ela que informa quais níveis de privacidade a conta aceita e se comentário,
 * duet e stitch estão desabilitados no perfil.
 */
export async function queryCreatorInfo(accessToken: string) {
  const data = await tiktokPost<CreatorInfo>("/creator_info/query/", accessToken, {});
  assertNoTikTokError(data, "Erro ao consultar os dados do criador no TikTok");
  return data.data || {};
}

/**
 * Escolhe um nível de privacidade que a conta realmente aceite.
 * Publicar com uma opção fora de `privacy_level_options` é recusado pela API.
 */
function resolvePrivacyLevel(
  visibility: "public" | "unlisted" | "private",
  allowed?: PrivacyLevel[]
): PrivacyLevel {
  const desired: PrivacyLevel =
    visibility === "public"
      ? "PUBLIC_TO_EVERYONE"
      : visibility === "unlisted"
      ? "MUTUAL_FOLLOW_FRIENDS"
      : "SELF_ONLY";

  if (!allowed || allowed.length === 0) return desired;
  if (allowed.includes(desired)) return desired;

  // Conta privada ou app não auditado: cai para a opção mais restritiva.
  if (allowed.includes("SELF_ONLY")) return "SELF_ONLY";
  return allowed[0];
}

async function loadVideoBytes(videoUrl?: string, videoBuffer?: Buffer): Promise<Uint8Array> {
  if (videoBuffer) {
    return new Uint8Array(
      videoBuffer.buffer.slice(
        videoBuffer.byteOffset,
        videoBuffer.byteOffset + videoBuffer.byteLength
      )
    );
  }
  if (!videoUrl) throw new Error("Nenhum vídeo fornecido para o TikTok.");

  const res = await fetch(videoUrl);
  if (!res.ok) {
    throw new Error(`Falha ao baixar o vídeo para envio: ${res.status} ${res.statusText}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** Envia o arquivo para a `upload_url` devolvida pelo init, em blocos. */
async function uploadVideo(
  uploadUrl: string,
  bytes: Uint8Array,
  chunkSize: number,
  totalChunks: number
): Promise<void> {
  const total = bytes.byteLength;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    // O último bloco absorve o resto da divisão.
    const end = i === totalChunks - 1 ? total : start + chunkSize;
    const chunk = bytes.subarray(start, end);

    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${start}-${end - 1}/${total}`,
      },
      body: chunk as unknown as BodyInit,
    });

    if (!res.ok && res.status !== 201 && res.status !== 206) {
      throw new Error(
        `Erro ao transferir o vídeo para o TikTok (bloco ${i + 1}/${totalChunks}): ${res.status} ${res.statusText}`
      );
    }
  }
}

/**
 * Acompanha a publicação até o fim. O `init` só devolve um `publish_id`:
 * sem esse polling o app declarava "publicado" antes de o TikTok sequer ter
 * processado o vídeo — e um post que falhasse aparecia como sucesso.
 */
async function waitForPublish(
  publishId: string,
  accessToken: string
): Promise<string | undefined> {
  let delay = POLL_INITIAL_DELAY_MS;

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(Math.round(delay * 1.25), POLL_MAX_DELAY_MS);

    const data = await tiktokPost<StatusResponse>("/status/fetch/", accessToken, {
      publish_id: publishId,
    });
    assertNoTikTokError(data, "Erro ao consultar o status da publicação no TikTok");

    const status = data.data?.status;

    if (status === "PUBLISH_COMPLETE") {
      const postId = data.data?.publicaly_available_post_id?.[0];
      return postId != null ? String(postId) : undefined;
    }

    if (status === "FAILED") {
      throw new Error(
        `O TikTok recusou a publicação: ${data.data?.fail_reason || "motivo não informado"}`
      );
    }
  }

  throw new Error(
    "Tempo esgotado aguardando o TikTok concluir a publicação. Verifique o app do TikTok em alguns minutos."
  );
}

export async function publishToTikTok(
  options: PublishTikTokOptions
): Promise<PlatformPublishStatus> {
  try {
    const {
      accessToken,
      title,
      hashtags = [],
      visibility = "public",
      videoUrl,
      videoBuffer,
      postAsDraft = false,
      coverTimestampMs = 1000,
    } = options;

    const caption = buildCaption(title, hashtags);

    // Modo simulado: sem credenciais reais ou com ENABLE_PUBLISH_MOCK ligado.
    if (!accessToken || accessToken === "mock-token" || process.env.ENABLE_PUBLISH_MOCK === "true") {
      await new Promise((resolve) => setTimeout(resolve, 1800));
      const mockPostId = "tt_" + Math.random().toString(36).substring(2, 9);
      return {
        platform: "tiktok",
        status: "published",
        progress: 100,
        postId: mockPostId,
        postUrl: `https://www.tiktok.com/@creator/video/${mockPostId}`,
      };
    }

    // 1. Dados do criador: define privacidade permitida e limites do perfil.
    const creator = await queryCreatorInfo(accessToken);
    const privacyLevel = resolvePrivacyLevel(visibility, creator.privacy_level_options);

    const bytes = await loadVideoBytes(videoUrl, videoBuffer);
    const size = bytes.byteLength;

    // Vídeo pequeno vai em bloco único; acima disso, dividido.
    const chunkSize = size <= SINGLE_CHUNK_LIMIT ? size : CHUNK_SIZE;
    const totalChunks = size <= SINGLE_CHUNK_LIMIT ? 1 : Math.floor(size / CHUNK_SIZE);

    const sourceInfo = {
      source: "FILE_UPLOAD",
      video_size: size,
      chunk_size: chunkSize,
      total_chunk_count: totalChunks,
    };

    // 2. Inicia o envio. `/inbox/` manda para rascunhos, `/video/` publica direto.
    const initPath = postAsDraft ? "/inbox/video/init/" : "/video/init/";
    const initBody = postAsDraft
      ? { source_info: sourceInfo }
      : {
          post_info: {
            title: caption,
            privacy_level: privacyLevel,
            // Respeita o que o criador desabilitou no próprio perfil.
            disable_comment: Boolean(creator.comment_disabled),
            disable_duet: Boolean(creator.duet_disabled),
            disable_stitch: Boolean(creator.stitch_disabled),
            video_cover_timestamp_ms: coverTimestampMs,
          },
          source_info: sourceInfo,
        };

    const init = await tiktokPost<InitResponse>(initPath, accessToken, initBody);
    assertNoTikTokError(init, "Erro ao iniciar a publicação no TikTok");

    const publishId = init.data?.publish_id;
    const uploadUrl = init.data?.upload_url;

    if (!publishId || !uploadUrl) {
      throw new Error("O TikTok não retornou a URL de upload da publicação.");
    }

    // 3. Transfere o arquivo.
    await uploadVideo(uploadUrl, bytes, chunkSize, totalChunks);

    // 4. Rascunho fica aguardando o usuário finalizar dentro do app.
    if (postAsDraft) {
      return {
        platform: "tiktok",
        status: "processing",
        progress: 100,
        postId: publishId,
        postUrl: "https://www.tiktok.com",
        errorMessage:
          "Vídeo enviado para os rascunhos do TikTok. Abra o app para revisar e publicar.",
      };
    }

    // 5. Aguarda o TikTok concluir de fato.
    const postId = await waitForPublish(publishId, accessToken);

    const username = creator.creator_username;
    const postUrl =
      postId && username
        ? `https://www.tiktok.com/@${username}/video/${postId}`
        : username
        ? `https://www.tiktok.com/@${username}`
        : "https://www.tiktok.com";

    return {
      platform: "tiktok",
      status: "published",
      progress: 100,
      postId: postId || publishId,
      postUrl,
    };
  } catch (error: unknown) {
    return {
      platform: "tiktok",
      status: "failed",
      progress: 0,
      errorMessage: errorMessage(error, "Erro desconhecido ao publicar no TikTok."),
    };
  }
}
