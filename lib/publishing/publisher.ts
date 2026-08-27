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

  for (const platform of platforms) {
    const account = connectedAccounts[platform];
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
