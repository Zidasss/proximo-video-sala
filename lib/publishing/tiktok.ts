import { PlatformPublishStatus } from "../types/publishing";

interface PublishTikTokOptions {
  accessToken: string;
  title: string;
  hashtags?: string[];
  visibility?: "public" | "unlisted" | "private";
  videoUrl?: string;
  videoBuffer?: Buffer;
}

export async function publishToTikTok(
  options: PublishTikTokOptions
): Promise<PlatformPublishStatus> {
  try {
    const { accessToken, title, hashtags = [], visibility = "public", videoUrl } = options;

    const fullCaption = `${title} ${hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`.trim();

    // In mock or development mode
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

    if (!videoUrl) {
      throw new Error("TikTok requer uma URL pública do vídeo (Supabase Storage/R2).");
    }

    const privacyLevel =
      visibility === "public"
        ? "PUBLIC_TO_EVERYONE"
        : visibility === "unlisted"
        ? "MUTUAL_FOLLOW_FRIENDS"
        : "SELF_ONLY";

    const payload = {
      post_info: {
        title: fullCaption.slice(0, 2200),
        privacy_level: privacyLevel,
        disable_duet: false,
        disable_stitch: false,
        disable_comment: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: videoUrl,
      },
    };

    const res = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (data.error && data.error.code !== "ok") {
      throw new Error(`Erro na API do TikTok: ${data.error.message || JSON.stringify(data.error)}`);
    }

    const publishId = data.data?.publish_id || "pending";

    return {
      platform: "tiktok",
      status: "published",
      progress: 100,
      postId: publishId,
      postUrl: `https://www.tiktok.com`,
    };
  } catch (error: any) {
    return {
      platform: "tiktok",
      status: "failed",
      progress: 0,
      errorMessage: error.message || "Erro desconhecido ao publicar no TikTok.",
    };
  }
}
