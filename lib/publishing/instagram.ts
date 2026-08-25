import { PlatformPublishStatus } from "../types/publishing";

interface PublishInstagramOptions {
  accessToken: string;
  instagramUserId?: string;
  title: string;
  hashtags?: string[];
  videoUrl?: string;
  coverUrl?: string;
}

export async function publishToInstagramReels(
  options: PublishInstagramOptions
): Promise<PlatformPublishStatus> {
  try {
    const { accessToken, instagramUserId = "me", title, hashtags = [], videoUrl } = options;

    const fullCaption = `${title}\n\n${hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`.trim();

    // Mock/development mode
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

    if (!videoUrl) {
      throw new Error("Instagram Reels exige uma URL pública acessível do vídeo.");
    }

    // 1. Criar container do Reels
    const containerParams = new URLSearchParams({
      media_type: "REELS",
      video_url: videoUrl,
      caption: fullCaption.slice(0, 2200),
      share_to_feed: "true",
      access_token: accessToken,
    });

    const createContainerRes = await fetch(
      `https://graph.facebook.com/v19.0/${instagramUserId}/media?${containerParams.toString()}`,
      { method: "POST" }
    );

    const containerData = await createContainerRes.json();
    if (containerData.error) {
      throw new Error(`Erro ao criar container no Instagram: ${containerData.error.message}`);
    }

    const containerId = containerData.id;

    // 2. Aguardar processamento do vídeo pela Meta (Polling curto)
    let isReady = false;
    let attempts = 0;
    while (!isReady && attempts < 10) {
      attempts++;
      await new Promise((r) => setTimeout(r, 2000));

      const statusRes = await fetch(
        `https://graph.facebook.com/v19.0/${containerId}?fields=status_code,status&access_token=${accessToken}`
      );
      const statusData = await statusRes.json();

      if (statusData.status_code === "FINISHED") {
        isReady = true;
      } else if (statusData.status_code === "ERROR") {
        throw new Error("Falha no processamento do vídeo pela Meta.");
      }
    }

    // 3. Publicar container
    const publishParams = new URLSearchParams({
      creation_id: containerId,
      access_token: accessToken,
    });

    const publishRes = await fetch(
      `https://graph.facebook.com/v19.0/${instagramUserId}/media_publish?${publishParams.toString()}`,
      { method: "POST" }
    );

    const publishData = await publishRes.json();
    if (publishData.error) {
      throw new Error(`Erro ao publicar Reels no Instagram: ${publishData.error.message}`);
    }

    const mediaId = publishData.id;

    return {
      platform: "instagram",
      status: "published",
      progress: 100,
      postId: mediaId,
      postUrl: `https://www.instagram.com/reels/${mediaId}`,
    };
  } catch (error: any) {
    return {
      platform: "instagram",
      status: "failed",
      progress: 0,
      errorMessage: error.message || "Erro desconhecido ao publicar no Instagram.",
    };
  }
}
