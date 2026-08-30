import {
  MultiPublishRequest,
  MultiPublishResponse,
  PlatformPublishStatus,
  SocialAccount,
  SocialPlatform,
} from "../types/publishing";
import { publishToYouTubeShorts } from "./youtube";
import { publishToTikTok } from "./tiktok";
import { publishToInstagramReels } from "./instagram";
import { MAX_PUBLISH_VIDEO_BYTES, normalizeVideoContentType } from "./upload-policy";

export interface TokenRefreshEvent {
  platform: SocialPlatform;
  accountId?: string;
  accessToken: string;
  expiresAt?: number;
}

export interface PublishOptions {
  /** Notificado quando uma plataforma renova o token no meio do envio. */
  onTokenRefreshed?: (event: TokenRefreshEvent) => void;
}

async function loadSharedVideoBuffer(videoUrl: string) {
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(
      `Falha ao baixar o vídeo para publicação: ${response.status} ${response.statusText}`,
    );
  }
  const announcedSize = Number(response.headers.get("content-length") || 0);
  if (announcedSize > MAX_PUBLISH_VIDEO_BYTES) {
    throw new Error("O vídeo ultrapassa o limite de 500 MB para publicação.");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.byteLength) throw new Error("O arquivo de vídeo está vazio.");
  if (buffer.byteLength > MAX_PUBLISH_VIDEO_BYTES) {
    throw new Error("O vídeo ultrapassa o limite de 500 MB para publicação.");
  }
  return buffer;
}

export async function publishToAllPlatforms(
  request: MultiPublishRequest,
  connectedAccounts: Record<SocialPlatform, SocialAccount | undefined>,
  options: PublishOptions = {}
): Promise<MultiPublishResponse> {
  const {
    platforms,
    title,
    description,
    hashtags,
    visibility,
    videoUrl,
    videoContentType,
    coverTimeSeconds,
  } = request;

  const publicationId =
    "pub_" + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

  const results: Record<SocialPlatform, PlatformPublishStatus> = {
    youtube: { platform: "youtube", status: "idle", progress: 0 },
    tiktok: { platform: "tiktok", status: "idle", progress: 0 },
    instagram: { platform: "instagram", status: "idle", progress: 0 },
  };

  const tasks: Promise<{ platform: SocialPlatform; result: PlatformPublishStatus }>[] = [];
  const mockMode = process.env.ENABLE_PUBLISH_MOCK === "true";
  const byteUploadRequested = !mockMode && platforms.some((platform) => {
    const account = connectedAccounts[platform];
    return (
      (platform === "youtube" || platform === "tiktok") &&
      Boolean(account?.accessToken) &&
      account?.accessToken !== "mock-token"
    );
  });
  let sharedVideoBuffer: Buffer | undefined;
  let sharedVideoError = "";
  if (byteUploadRequested && videoUrl) {
    try {
      sharedVideoBuffer = await loadSharedVideoBuffer(videoUrl);
    } catch (error) {
      sharedVideoError =
        error instanceof Error ? error.message : "Não foi possível ler o vídeo.";
    }
  }
  const normalizedContentType =
    normalizeVideoContentType(videoContentType) || "video/mp4";

  for (const platform of platforms) {
    const account = connectedAccounts[platform];
    if ((!account || !account.accessToken) && !mockMode) {
      results[platform] = {
        platform,
        status: "failed",
        progress: 0,
        errorMessage: `Conecte sua conta do ${platform === "youtube" ? "YouTube" : platform === "tiktok" ? "TikTok" : "Instagram"} antes de publicar.`,
      };
      continue;
    }
    if (
      sharedVideoError &&
      (platform === "youtube" || platform === "tiktok") &&
      account?.accessToken !== "mock-token"
    ) {
      results[platform] = {
        platform,
        status: "failed",
        progress: 0,
        errorMessage: sharedVideoError,
      };
      continue;
    }
    const accessToken = account?.accessToken || "mock-token";

    // Conta marcada como expirada e sem renovação possível: falha explícita,
    // em vez de gastar o upload e receber 401 da plataforma.
    if (account && account.status === "expired") {
      results[platform] = {
        platform,
        status: "failed",
        progress: 0,
        errorMessage: `A conexão com ${platform} expirou. Reconecte a conta em Perfil › Contas conectadas.`,
      };
      continue;
    }

    if (platform === "youtube") {
      tasks.push(
        publishToYouTubeShorts({
          accessToken,
          refreshToken: account?.refreshToken,
          expiresAt: account?.expiresAt,
          title,
          description,
          hashtags,
          visibility,
          videoUrl,
          videoBuffer: sharedVideoBuffer,
          videoContentType: normalizedContentType,
          onTokenRefreshed: (token) =>
            options.onTokenRefreshed?.({
              platform: "youtube",
              accountId: account?.id,
              ...token,
            }),
        }).then((res) => ({ platform: "youtube" as const, result: res }))
      );
    } else if (platform === "tiktok") {
      tasks.push(
        publishToTikTok({
          accessToken,
          title,
          hashtags,
          visibility,
          videoUrl,
          videoBuffer: sharedVideoBuffer,
          videoContentType: normalizedContentType,
          coverTimestampMs:
            typeof coverTimeSeconds === "number"
              ? Math.round(coverTimeSeconds * 1000)
              : undefined,
          // Enquanto o app não passa pela auditoria do TikTok, enviar para
          // rascunhos evita a recusa de publicar direto no feed.
          postAsDraft: process.env.TIKTOK_POST_AS_DRAFT === "true",
        }).then((res) => ({ platform: "tiktok" as const, result: res }))
      );
    } else if (platform === "instagram") {
      tasks.push(
        publishToInstagramReels({
          accessToken,
          instagramUserId: account?.platformUserId,
          title,
          hashtags,
          videoUrl,
          thumbOffsetMs:
            typeof coverTimeSeconds === "number"
              ? Math.round(coverTimeSeconds * 1000)
              : undefined,
        }).then((res) => ({ platform: "instagram" as const, result: res }))
      );
    }
  }

  const settled = await Promise.allSettled(tasks);

  for (const item of settled) {
    if (item.status === "fulfilled") {
      results[item.value.platform] = item.value.result;
    } else {
      console.error("Unhandled publishing task failure:", item.reason);
    }
  }

  const anySuccess = Object.values(results).some((r) => r.status === "published");

  return {
    success: anySuccess,
    publicationId,
    results,
  };
}
