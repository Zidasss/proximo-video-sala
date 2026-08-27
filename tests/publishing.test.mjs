import assert from "node:assert/strict";
import test from "node:test";
import { publishToYouTubeShorts } from "../lib/publishing/youtube.ts";
import { publishToTikTok } from "../lib/publishing/tiktok.ts";
import { publishToInstagramReels } from "../lib/publishing/instagram.ts";
import { publishToAllPlatforms } from "../lib/publishing/publisher.ts";

test("YouTube publisher formats title with #Shorts and simulates upload in mock mode", async () => {
  const result = await publishToYouTubeShorts({
    accessToken: "mock-token",
    title: "Meu Vídeo Viral",
    hashtags: ["Shorts", "Trending"],
    visibility: "public",
    videoUrl: "https://example.com/video.mp4",
  });

  assert.equal(result.platform, "youtube");
  assert.equal(result.status, "published");
  assert.equal(result.progress, 100);
  assert.ok(result.postId);
  assert.match(result.postUrl, /youtube\.com\/shorts\//);
});

test("TikTok publisher handles caption and privacy settings in mock mode", async () => {
  const result = await publishToTikTok({
    accessToken: "mock-token",
    title: "Dança e Gameplay",
    hashtags: ["fyp", "tiktok"],
    visibility: "public",
    videoUrl: "https://example.com/video.mp4",
  });

  assert.equal(result.platform, "tiktok");
  assert.equal(result.status, "published");
  assert.equal(result.progress, 100);
  assert.ok(result.postId);
});

test("Instagram Reels publisher simulates media container and publishing", async () => {
  const result = await publishToInstagramReels({
    accessToken: "mock-token",
    title: "Novidades do KLIPAPP",
    hashtags: ["reels", "novidade"],
    videoUrl: "https://example.com/video.mp4",
  });

  assert.equal(result.platform, "instagram");
  assert.equal(result.status, "published");
  assert.equal(result.progress, 100);
  assert.ok(result.postId);
  assert.match(result.postUrl, /instagram\.com\/reels\//);
});

test("Unified publisher orchestrates all 3 platforms concurrently", async () => {
  const mockAccounts = {
    youtube: {
      id: "yt-1",
      userId: "u-1",
      platform: "youtube",
      accountName: "Canal Teste",
      status: "connected",
      accessToken: "mock-token",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    tiktok: {
      id: "tt-1",
      userId: "u-1",
      platform: "tiktok",
      accountName: "TikTok Creator",
      status: "connected",
      accessToken: "mock-token",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    instagram: {
      id: "ig-1",
      userId: "u-1",
      platform: "instagram",
      accountName: "Instagram Creator",
      status: "connected",
      accessToken: "mock-token",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };

  const response = await publishToAllPlatforms(
    {
      title: "Super Vídeo",
      description: "Vídeo lançado em todas as redes com 1 clique",
      hashtags: ["Shorts", "Reels", "TikTok"],
      platforms: ["youtube", "tiktok", "instagram"],
      visibility: "public",
      videoUrl: "https://example.com/video.mp4",
    },
    mockAccounts
  );

  assert.equal(response.success, true);
  assert.ok(response.publicationId);
  assert.equal(response.results.youtube.status, "published");
  assert.equal(response.results.tiktok.status, "published");
  assert.equal(response.results.instagram.status, "published");
});
