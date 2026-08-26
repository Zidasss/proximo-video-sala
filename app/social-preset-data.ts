export type SocialPresetId =
  | "tiktok"
  | "instagram-reels"
  | "youtube-shorts"
  | "stories"
  | "feed-portrait"
  | "feed-square"
  | "youtube-landscape"
  | "custom";

export type SafeAreaInset = {
  /** Percentage of the canvas reserved from this edge. */
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type SafeAreaProfile = {
  id: string;
  label: string;
  description: string;
  insetPercent: SafeAreaInset;
};

export type SocialPreset = {
  id: SocialPresetId;
  platform: string;
  title: string;
  eyebrow: string;
  description: string;
  aspectRatio: { width: number; height: number; label: string };
  resolution: { width: number; height: number };
  fps: number;
  recommendedDuration: {
    minSeconds: number;
    idealSeconds: number;
    maxSeconds: number;
    label: string;
  };
  safeArea: SafeAreaProfile;
  accent: string;
  customizable?: boolean;
};

export const SAFE_AREA_PROFILES = {
  tiktok: {
    id: "tiktok-ui",
    label: "Área segura TikTok",
    description: "Protege texto da legenda, avatar e ações laterais.",
    insetPercent: { top: 8, right: 16, bottom: 20, left: 6 },
  },
  reels: {
    id: "reels-ui",
    label: "Área segura Reels",
    description: "Protege título, legenda e ações do Instagram.",
    insetPercent: { top: 8, right: 15, bottom: 22, left: 6 },
  },
  shorts: {
    id: "shorts-ui",
    label: "Área segura Shorts",
    description: "Protege título, canal e ações do YouTube.",
    insetPercent: { top: 7, right: 17, bottom: 18, left: 6 },
  },
  stories: {
    id: "stories-ui",
    label: "Área segura Stories",
    description: "Protege os controles no topo e a resposta no rodapé.",
    insetPercent: { top: 12, right: 6, bottom: 16, left: 6 },
  },
  feed: {
    id: "feed-ui",
    label: "Área segura do feed",
    description: "Mantém texto importante longe das bordas e do corte.",
    insetPercent: { top: 6, right: 6, bottom: 8, left: 6 },
  },
  youtube: {
    id: "youtube-ui",
    label: "Área segura YouTube",
    description: "Mantém títulos e elementos dentro da área de ação segura.",
    insetPercent: { top: 7, right: 7, bottom: 10, left: 7 },
  },
  custom: {
    id: "custom-ui",
    label: "Área segura padrão",
    description: "Margem neutra que pode ser ajustada no editor.",
    insetPercent: { top: 5, right: 5, bottom: 5, left: 5 },
  },
} as const satisfies Record<string, SafeAreaProfile>;

export const SOCIAL_PRESETS: readonly SocialPreset[] = [
  {
    id: "tiktok",
    platform: "TikTok",
    title: "TikTok",
    eyebrow: "Vídeo vertical",
    description: "Tela cheia com guias para legenda e botões.",
    aspectRatio: { width: 9, height: 16, label: "9:16" },
    resolution: { width: 1080, height: 1920 },
    fps: 30,
    recommendedDuration: { minSeconds: 15, idealSeconds: 30, maxSeconds: 60, label: "15–60 s" },
    safeArea: SAFE_AREA_PROFILES.tiktok,
    accent: "#ff375f",
  },
  {
    id: "instagram-reels",
    platform: "Instagram",
    title: "Instagram Reels",
    eyebrow: "Vídeo vertical",
    description: "Pronto para Reels, com margem para legenda e ações.",
    aspectRatio: { width: 9, height: 16, label: "9:16" },
    resolution: { width: 1080, height: 1920 },
    fps: 30,
    recommendedDuration: { minSeconds: 15, idealSeconds: 30, maxSeconds: 90, label: "15–90 s" },
    safeArea: SAFE_AREA_PROFILES.reels,
    accent: "#e947b9",
  },
  {
    id: "youtube-shorts",
    platform: "YouTube",
    title: "YouTube Shorts",
    eyebrow: "Vídeo vertical",
    description: "Rápido, vertical e com espaço para os controles.",
    aspectRatio: { width: 9, height: 16, label: "9:16" },
    resolution: { width: 1080, height: 1920 },
    fps: 30,
    recommendedDuration: { minSeconds: 15, idealSeconds: 30, maxSeconds: 60, label: "15–60 s" },
    safeArea: SAFE_AREA_PROFILES.shorts,
    accent: "#ff3b30",
  },
  {
    id: "stories",
    platform: "Instagram",
    title: "Stories",
    eyebrow: "Story vertical",
    description: "Conteúdo rápido sem encostar nos controles do app.",
    aspectRatio: { width: 9, height: 16, label: "9:16" },
    resolution: { width: 1080, height: 1920 },
    fps: 30,
    recommendedDuration: { minSeconds: 5, idealSeconds: 15, maxSeconds: 60, label: "5–60 s" },
    safeArea: SAFE_AREA_PROFILES.stories,
    accent: "#ff8a3d",
  },
  {
    id: "feed-portrait",
    platform: "Instagram",
    title: "Feed 4:5",
    eyebrow: "Post retrato",
    description: "Ocupa mais espaço no feed sem cortar o conteúdo.",
    aspectRatio: { width: 4, height: 5, label: "4:5" },
    resolution: { width: 1080, height: 1350 },
    fps: 30,
    recommendedDuration: { minSeconds: 5, idealSeconds: 30, maxSeconds: 60, label: "5–60 s" },
    safeArea: SAFE_AREA_PROFILES.feed,
    accent: "#9c6cff",
  },
  {
    id: "feed-square",
    platform: "Instagram",
    title: "Feed 1:1",
    eyebrow: "Post quadrado",
    description: "Formato clássico para vídeos e posts quadrados.",
    aspectRatio: { width: 1, height: 1, label: "1:1" },
    resolution: { width: 1080, height: 1080 },
    fps: 30,
    recommendedDuration: { minSeconds: 5, idealSeconds: 30, maxSeconds: 60, label: "5–60 s" },
    safeArea: SAFE_AREA_PROFILES.feed,
    accent: "#6d78ff",
  },
  {
    id: "youtube-landscape",
    platform: "YouTube",
    title: "YouTube 16:9",
    eyebrow: "Vídeo horizontal",
    description: "Tela ampla para vídeos, aulas e vlogs completos.",
    aspectRatio: { width: 16, height: 9, label: "16:9" },
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    recommendedDuration: { minSeconds: 60, idealSeconds: 480, maxSeconds: 3600, label: "1–60 min" },
    safeArea: SAFE_AREA_PROFILES.youtube,
    accent: "#ff453a",
  },
  {
    id: "custom",
    platform: "Personalizado",
    title: "Personalizado",
    eyebrow: "Você decide",
    description: "Comece neutro e ajuste tamanho, FPS e duração.",
    aspectRatio: { width: 1, height: 1, label: "Livre" },
    resolution: { width: 1080, height: 1080 },
    fps: 30,
    recommendedDuration: { minSeconds: 1, idealSeconds: 30, maxSeconds: 3600, label: "Livre" },
    safeArea: SAFE_AREA_PROFILES.custom,
    accent: "#24c8a5",
    customizable: true,
  },
] as const;

export function getSocialPreset(id: SocialPresetId): SocialPreset {
  const preset = SOCIAL_PRESETS.find((item) => item.id === id);
  if (!preset) throw new Error(`Preset social desconhecido: ${id}`);
  return preset;
}
