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

export async function publishToAllPlatforms(
  request: MultiPublishRequest,
  connectedAccounts: Record<SocialPlatform, SocialAccount | undefined>
): Promise<MultiPublishResponse> {
  const { platforms, title, description, hashtags, visibility, videoUrl } = request;
  const publicationId = "pub_" + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

  const results: Record<SocialPlatform, PlatformPublishStatus> = {
    youtube: { platform: "youtube", status: "idle", progress: 0 },
    tiktok: { platform: "tiktok", status: "idle", progress: 0 },
    instagram: { platform: "instagram", status: "idle", progress: 0 },
  };

  const tasks: Promise<{ platform: SocialPlatform; result: PlatformPublishStatus }>[] = [];

  for (const platform of platforms) {
    const account = connectedAccounts[platform];
    const accessToken = account?.accessToken || "mock-token";

    if (platform === "youtube") {
      tasks.push(
        publishToYouTubeShorts({
          accessToken,
          refreshToken: account?.refreshToken,
          title,
          description,
          hashtags,
          visibility,
          videoUrl,
        }).then((res) => ({ platform: "youtube", result: res }))
      );
    } else if (platform === "tiktok") {
      tasks.push(
        publishToTikTok({
          accessToken,
          title,
          hashtags,
          visibility,
          videoUrl,
        }).then((res) => ({ platform: "tiktok", result: res }))
      );
    } else if (platform === "instagram") {
      tasks.push(
        publishToInstagramReels({
          accessToken,
          instagramUserId: account?.platformUserId,
          title,
          hashtags,
          videoUrl,
        }).then((res) => ({ platform: "instagram", result: res }))
      );
    }
  }

  const settled = await Promise.allSettled(tasks);

  for (const item of settled) {
    if (item.status === "fulfilled") {
      results[item.value.platform] = item.value.result;
    } else {
      // Find which failed if unhandled exception
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
