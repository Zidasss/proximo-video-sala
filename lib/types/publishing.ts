export type SocialPlatform = "youtube" | "tiktok" | "instagram";

export type SocialAccountStatus = "connected" | "disconnected" | "expired";

export interface SocialAccount {
  id: string;
  userId: string;
  platform: SocialPlatform;
  platformUserId?: string;
  accountName: string;
  accountHandle?: string;
  avatarUrl?: string;
  status: SocialAccountStatus;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  createdAt: string;
  updatedAt: string;
}

export type PublicationStatus = "idle" | "uploading" | "processing" | "published" | "failed";

export interface PlatformPublishStatus {
  platform: SocialPlatform;
  status: PublicationStatus;
  progress: number;
  postId?: string;
  postUrl?: string;
  errorMessage?: string;
}

export interface MultiPublishRequest {
  videoUrl?: string;
  videoBase64?: string;
  videoBlobName?: string;
  title: string;
  description?: string;
  hashtags: string[];
  platforms: SocialPlatform[];
  visibility: "public" | "unlisted" | "private";
  coverTimeSeconds?: number;
}

export interface MultiPublishResponse {
  success: boolean;
  publicationId: string;
  results: Record<SocialPlatform, PlatformPublishStatus>;
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  createdAt?: string;
}
