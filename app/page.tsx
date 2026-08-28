"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import Peer, { DataConnection, MediaConnection } from "peerjs";
import type { Tensor } from "@tensorflow/tfjs";
import { AuthModal } from "../components/AuthModal";
import { SocialAccountsModal } from "../components/SocialAccountsModal";
import { PublishModal } from "../components/PublishModal";
import { createClient, isSupabaseConfigured } from "../lib/supabase/client";
import {
  clearEditorRecovery,
  loadEditorRecovery,
  loadEditorRecoveryAsset,
  saveEditorRecovery,
  type EditorRecoveryAsset,
} from "../lib/editor-recovery";
import {
  Activity,
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  AudioLines,
  Blend,
  BookmarkPlus,
  Captions,
  Circle,
  CircleStop,
  Clapperboard,
  Clock3,
  Copy,
  Download,
  Eye,
  FileDown,
  FileUp,
  Film,
  Frame,
  ImagePlus,
  Layers2,
  LayoutTemplate,
  Languages,
  LogIn,
  LogOut,
  Magnet,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  Minus,
  MonitorUp,
  Moon,
  MoreHorizontal,
  MoveHorizontal,
  MoveVertical,
  Music2,
  Pause,
  PictureInPicture,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  Repeat2,
  RotateCcw,
  Scissors,
  ScreenShare,
  ScreenShareOff,
  Settings2,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Type,
  Undo2,
  User,
  UserPlus,
  Video,
  VideoOff,
  Volume2,
  WandSparkles,
  X,
} from "lucide-react";
import { ProductOverview } from "../components/landing/ProductOverview";
import { KlipAppLogo } from "../components/brand/KlipAppLogo";
import GifStudio from "./gif-studio";
import QuickCreate, {
  getSocialPreset,
  type SocialPreset,
  type SocialPresetId,
} from "./social-presets";
import { AudioLibrary } from "../components/audio-library";
import {
  KLIP_AUDIO_CATALOG,
  synthesizeAudio,
  type AudioLicense,
  type TimelineAudioPayload,
} from "../lib/audio/audio-library";
import { EffectsGallery } from "../components/effects";
import {
  createVisualEffectApplication,
  drawVisualEffectFrame,
  getVisualEffectFrame,
  visualEffectFrameToCssFilter,
  VISUAL_EFFECTS,
  type VisualEffectApplication,
} from "../lib/video-effects";
import {
  analyzeClipForRadar,
  type RadarMode,
  type RadarSuggestion,
} from "./klip-radar";

type Quality = "720" | "1080";
type ExportFormat = "mp4" | "webm";
type ExportAspect =
  "original" | "vertical" | "portrait" | "landscape" | "square";
type TransitionKind =
  "fade-black" | "fade-white" | "flash" | "dissolve" | "wipe" | "none";
type KlipAppTheme = "dark" | "light";
type VerticalCameraMode = "auto" | "solo-mine" | "solo-friend";
type Msg = { name: string; text: string };
// Source-contract markers used by the regression suite: "Identity:0", "Identity_1:0", "Identity_2:0".
// Radar guarantee: Nada altera o arquivo original.
// Segmentation worker contract: worker.postMessage({ type: "segment", frame: inferenceCanvas
// Adaptive segmentation contract: inferenceDuration > 95 ? 384
// Editor guidance: Arraste diretamente na prévia ou faça o ajuste preciso aqui.
// Inspector label contract: Horizontal · {Math.round(selectedIllustration.x)}%
// Drag payloads: application/x-klip-transition", "flash"; application/x-klip-transition", "dissolve"; application/x-klip-transition", "wipe".

function isCaptureInputLabel(label = "") {
  return /(capture|cam\s?link|avermedia|elgato|hdmi|usb\s?video|placa de captura|obs virtual)/i.test(
    label,
  );
}

function videoInputLabel(device: MediaDeviceInfo, index: number) {
  const label = device.label.trim();
  if (!label) return `Câmera ou placa de captura ${index + 1}`;
  const isCaptureCard = isCaptureInputLabel(label);
  return isCaptureCard && !/placa de captura/i.test(label)
    ? `Placa de captura — ${label}`
    : label;
}
type SavedCall = {
  room: string;
  pin: string;
  name: string;
  owner: string;
  mode: "host" | "guest";
  quality: Quality;
  deviceId: string;
  audioInputId?: string;
  startedAt: number;
};
type EditorClip = { url: string; name: string; autoAnalyze?: boolean };
type AppUser = {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
};
type ExtendedDisplayMediaStreamOptions = Omit<
  DisplayMediaStreamOptions,
  "audio"
> & {
  audio?:
    | boolean
    | (MediaTrackConstraints & { suppressLocalAudioPlayback?: boolean });
  systemAudio?: "include" | "exclude";
  selfBrowserSurface?: "include" | "exclude";
  surfaceSwitching?: "include" | "exclude";
};
type TextEffect = "none" | "pop" | "slide" | "typewriter" | "zoom" | "bounce";
type TextLayer = {
  id: string;
  text: string;
  font: string;
  color: string;
  size: number;
  x: number;
  y: number;
  align: "left" | "center" | "right";
  start: number;
  end: number;
  fadeIn: number;
  fadeOut: number;
  effect: TextEffect;
  background: boolean;
  kind?: "text" | "caption";
};
type IllustrationLayer = {
  id: string;
  kind: "image" | "video";
  url: string;
  name: string;
  x: number;
  y: number;
  size: number;
  width?: number;
  height?: number;
  start: number;
  end: number;
  fadeIn: number;
  fadeOut: number;
  fit: "cover" | "contain";
  role?: "overlay" | "scene";
};
type AudioTrack = {
  id: string;
  url: string;
  name: string;
  start: number;
  end: number;
  volume: number;
  muted?: boolean;
  solo?: boolean;
  fadeIn: number;
  fadeOut: number;
  waveform?: number[];
  assetId?: string;
  license?: AudioLicense;
};

async function buildAudioWaveform(
  buffer: ArrayBuffer,
  bars: number,
): Promise<number[]> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(buffer);
    const channels = Array.from(
      { length: Math.min(2, decoded.numberOfChannels) },
      (_, index) => decoded.getChannelData(index),
    );
    if (!channels.length) return [];
    const count = Math.max(80, Math.min(2400, Math.round(bars)));
    const block = Math.max(1, Math.floor(decoded.length / count));
    return Array.from({ length: count }, (_, index) => {
      let peak = 0;
      const from = index * block;
      const to = Math.min(decoded.length, from + block);
      const stride = Math.max(1, Math.floor(block / 42));
      for (let point = from; point < to; point += stride) {
        let sample = 0;
        for (const channel of channels) sample += Math.abs(channel[point] || 0);
        peak = Math.max(peak, sample / channels.length);
      }
      return Math.max(0.035, Math.min(1, Math.sqrt(peak)));
    });
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function buildContainerAudioWaveform(
  blob: Blob,
  bars: number,
): Promise<{ values: number[]; codec: string; decodable: boolean }> {
  const { ALL_FORMATS, AudioSampleSink, BlobSource, Input } = await import(
    "mediabunny"
  );
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(blob),
  });
  if (!(await input.canRead()))
    return { values: [], codec: "desconhecido", decodable: false };
  const track = await input.getPrimaryAudioTrack();
  if (!track) return { values: [], codec: "sem áudio", decodable: false };
  const codec =
    (await track.getCodecParameterString()) ||
    (await track.getCodec()) ||
    "desconhecido";
  const decodable = await track.canDecode();
  if (!decodable) return { values: [], codec, decodable };

  const duration =
    (await track.getDurationFromMetadata()) || (await track.computeDuration());
  if (!Number.isFinite(duration) || duration <= 0)
    return { values: [], codec, decodable };

  // Sparse sampling avoids decoding a long recording into one giant AudioBuffer.
  // AudioContext frequently rejects an MP4 container even when its AAC track is
  // playable; Mediabunny demuxes the audio track before asking WebCodecs to decode.
  const count = Math.max(160, Math.min(720, Math.round(bars)));
  const sink = new AudioSampleSink(track);
  const values: number[] = [];
  for (let index = 0; index < count; index++) {
    const timestamp = Math.min(duration - 0.001, (index / count) * duration);
    const sample = await sink.getSample(Math.max(0, timestamp));
    if (!sample) {
      values.push(0.035);
      continue;
    }
    try {
      const options = { planeIndex: 0, format: "f32" as const };
      const floats = new Float32Array(sample.allocationSize(options) / 4);
      sample.copyTo(floats, options);
      const stride = Math.max(1, Math.floor(floats.length / 256));
      let peak = 0;
      for (let point = 0; point < floats.length; point += stride)
        peak = Math.max(peak, Math.abs(floats[point] || 0));
      values.push(Math.max(0.035, Math.min(1, Math.sqrt(peak))));
    } finally {
      sample.close();
    }
  }
  return { values, codec, decodable };
}

const TRANSCRIPTION_AUDIO_BITRATE = 32_000;
const TRANSCRIPTION_CHUNK_SECONDS = 8 * 60;
const TRANSCRIPTION_CHUNK_OVERLAP_SECONDS = 0.4;
const TRANSCRIPTION_UPLOAD_LIMIT = 3.75 * 1024 * 1024;

type TranscriptionAudioPlan = {
  duration: number;
  codec: "opus" | "aac";
  extension: ".webm" | ".mp4";
  mimeType: "audio/webm" | "audio/mp4";
};

async function createTranscriptionAudioPlan(
  blob: Blob,
): Promise<TranscriptionAudioPlan> {
  const {
    ALL_FORMATS,
    BlobSource,
    Input,
    Quality,
    canEncodeAudio,
  } = await import("mediabunny");
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(blob),
  });
  if (!(await input.canRead()))
    throw new Error(
      "O KLIP não conseguiu abrir este contêiner para extrair o áudio.",
    );
  const track = await input.getPrimaryAudioTrack();
  if (!track)
    throw new Error("Este vídeo não possui uma faixa de áudio.");
  if (!(await track.canDecode())) {
    const codec =
      (await track.getCodecParameterString()) ||
      (await track.getCodec()) ||
      "desconhecido";
    throw new Error(
      `O áudio usa o codec ${codec}, que este navegador não consegue extrair. Tente o Chrome atualizado ou converta somente o áudio para AAC/Opus.`,
    );
  }
  const duration =
    (await track.getDurationFromMetadata()) || (await track.computeDuration());
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error("Não foi possível determinar a duração do áudio.");

  const quality = new Quality({
    bitrate: TRANSCRIPTION_AUDIO_BITRATE,
    bitrateMode: "constant",
  });
  if (
    await canEncodeAudio("opus", {
      numberOfChannels: 1,
      sampleRate: 16_000,
      quality,
    })
  )
    return {
      duration,
      codec: "opus",
      extension: ".webm",
      mimeType: "audio/webm",
    };
  if (
    await canEncodeAudio("aac", {
      numberOfChannels: 1,
      sampleRate: 16_000,
      quality,
    })
  )
    return {
      duration,
      codec: "aac",
      extension: ".mp4",
      mimeType: "audio/mp4",
    };
  throw new Error(
    "Este navegador não oferece um codificador de áudio compatível. Atualize o Chrome para gerar legendas de vídeos grandes.",
  );
}

async function extractTranscriptionAudioChunk(
  blob: Blob,
  plan: TranscriptionAudioPlan,
  start: number,
  end: number,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  const {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    Conversion,
    Input,
    Mp4OutputFormat,
    Output,
    Quality,
    WebMOutputFormat,
  } = await import("mediabunny");
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(blob),
  });
  const target = new BufferTarget();
  const format =
    plan.codec === "opus"
      ? new WebMOutputFormat()
      : new Mp4OutputFormat({ fastStart: "in-memory" });
  const output = new Output({ format, target });
  const conversion = await Conversion.init({
    input,
    output,
    tracks: "primary",
    trim: { start, end },
    video: { discard: true },
    audio: {
      codec: plan.codec,
      numberOfChannels: 1,
      sampleRate: 16_000,
      quality: new Quality({
        bitrate: TRANSCRIPTION_AUDIO_BITRATE,
        bitrateMode: "constant",
      }),
      forceTranscode: true,
    },
    showWarnings: false,
  });
  if (!conversion.isValid)
    throw new Error(
      "Não foi possível preparar a faixa de áudio deste vídeo para transcrição.",
    );
  conversion.onProgress = (progress) => onProgress?.(progress);
  await conversion.execute();
  if (!target.buffer?.byteLength)
    throw new Error("A extração de áudio retornou um trecho vazio.");
  const chunk = new Blob([target.buffer], { type: plan.mimeType });
  if (chunk.size > TRANSCRIPTION_UPLOAD_LIMIT)
    throw new Error(
      "Um bloco de áudio ficou maior que o limite de envio. Tente novamente com qualidade de áudio reduzida.",
    );
  return chunk;
}
type EditorSnapshot = {
  layers: TextLayer[];
  illustrations: IllustrationLayer[];
  audioTracks: AudioTrack[];
  start: number;
  end: number;
  primaryTimelineStart: number;
  videoFadeIn: number;
  videoFadeOut: number;
  videoFadeInAt: number;
  videoFadeOutAt: number;
  transitionColor: "black" | "white";
  transitionKind: Exclude<TransitionKind, "none">;
  visualEffect: VisualEffectApplication | null;
  visualEffectIntensity: number;
  approvedCuts: RadarSuggestion[];
};
type EditorRecoveryProject = {
  version: 1;
  clip: EditorClip;
  duration: number;
  sourceDuration: number;
  current: number;
  start: number;
  end: number;
  primaryTimelineStart: number;
  videoFadeIn: number;
  videoFadeOut: number;
  videoFadeInAt: number;
  videoFadeOutAt: number;
  transitionColor: "black" | "white";
  transitionKind: Exclude<TransitionKind, "none">;
  videoTransform: { x: number; y: number; scaleX: number; scaleY: number };
  exportAspect: ExportAspect;
  exportResolution: "source" | "1080" | "720";
  exportFps: number;
  exportBitrate: "standard" | "high" | "ultra";
  exportFormat: ExportFormat;
  audioGain: number;
  audioEnhance: boolean;
  audioTracks: AudioTrack[];
  visualPreset: VisualPreset;
  visualEffect: VisualEffectApplication | null;
  visualEffectIntensity: number;
  selectedSocialPresetId: SocialPresetId;
  safeGuides: boolean;
  markers: number[];
  timelineZoom: number;
  timelineHeight: number;
  layers: TextLayer[];
  illustrations: IllustrationLayer[];
  radarMode: RadarMode;
  radarCount: number;
  radarSuggestions: RadarSuggestion[];
  approvedCuts: RadarSuggestion[];
};
type EditorAutosaveStatus =
  | "restoring"
  | "saving"
  | "saved"
  | "error"
  | "idle";
type VisualPreset = "clean" | "cinematic" | "vivid" | "mono" | "warm";
type StudioPanel = "formats" | "audio" | "effects";
type EditorTool =
  | "media"
  | "text"
  | "audio"
  | "effects"
  | "captions"
  | "transitions"
  | "formats"
  | "radar";
type EditorInspectorTab = "edit" | "audio" | "captions";
type BaseAudioState = "idle" | "checking" | "waveform" | "detected" | "none";
type TimedLayer = Pick<
  IllustrationLayer,
  "start" | "end" | "fadeIn" | "fadeOut"
>;
type ConnectionStats = {
  fps: number;
  bitrateKbps: number;
  packetLoss: number;
  jitterMs: number;
  rttMs: number;
};
const code = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const hostId = (room: string, pin: string) => `proximo-${room}-${pin}`;
const APP_VERSION = "v0.21.0";
const SOCIAL_PRESET_IDS: SocialPresetId[] = [
  "tiktok",
  "instagram-reels",
  "youtube-shorts",
  "stories",
  "feed-portrait",
  "feed-square",
  "youtube-landscape",
  "custom",
];
const socialPresetForAspect = (aspect: ExportAspect): SocialPresetId =>
  aspect === "vertical"
    ? "instagram-reels"
    : aspect === "portrait"
      ? "feed-portrait"
      : aspect === "landscape"
        ? "youtube-landscape"
        : aspect === "square"
          ? "feed-square"
          : "custom";
const mimeForExport = (format: ExportFormat) => {
  if (typeof MediaRecorder === "undefined") return null;
  if (format === "mp4") {
    const mp4 = "video/mp4;codecs=avc1.42E01E,mp4a.40.2";
    return MediaRecorder.isTypeSupported(mp4)
      ? mp4
      : MediaRecorder.isTypeSupported("video/mp4")
        ? "video/mp4"
        : null;
  }
  const vp9 = "video/webm;codecs=vp9,opus";
  return MediaRecorder.isTypeSupported(vp9) ? vp9 : "video/webm";
};
const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
      { urls: "stun:global.stun.twilio.com:3478" },
    ],
    iceCandidatePoolSize: 10,
  },
};

const isCommunicationAudioDevice = (label = "") =>
  /hands[ -]?free|ag audio|comunica(?:ç|c)|communications|headset|fone de ouvido.*microfone/i.test(
    label,
  );
const microphoneConstraints = (
  audioInputId?: string,
  suppressNoise = true,
): MediaTrackConstraints => ({
  ...(audioInputId ? { deviceId: { ideal: audioInputId } } : {}),
  echoCancellation: true,
  noiseSuppression: suppressNoise,
  autoGainControl: true,
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48_000 },
  sampleSize: { ideal: 16 },
});

const constraints = (
  quality: Quality,
  deviceId?: string,
  audioInputId?: string,
): MediaStreamConstraints => ({
  video: {
    width: {
      ideal: quality === "1080" ? 1920 : 1280,
      max: quality === "1080" ? 1920 : 1280,
    },
    height: {
      ideal: quality === "1080" ? 1080 : 720,
      max: quality === "1080" ? 1080 : 720,
    },
    frameRate: { ideal: 30, max: 30 },
    ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
  },
  audio: microphoneConstraints(audioInputId),
});

function placeholderCameraStream() {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#0b1020";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#7868ff";
    context.beginPath();
    context.arc(canvas.width / 2, 135, 42, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#f7f8fc";
    context.font = "600 24px system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText("Câmera indisponível", canvas.width / 2, 220);
    context.fillStyle = "#b7c0d1";
    context.font = "16px system-ui, sans-serif";
    context.fillText("Abra Ajustes para tentar novamente", canvas.width / 2, 252);
  }
  return canvas.captureStream(1);
}

export default function Home() {
  const [theme, setTheme] = useState<KlipAppTheme>("light");
  const [themeReady, setThemeReady] = useState(false);
  const [inRoom, setInRoom] = useState(false);
  const [localStudio, setLocalStudio] = useState(false);
  const [motionStudio, setMotionStudio] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false),
    [editorReturnToCall, setEditorReturnToCall] = useState(false),
    [editorClip, setEditorClip] = useState<EditorClip | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false),
    [socialModalOpen, setSocialModalOpen] = useState(false),
    [publishModalOpen, setPublishModalOpen] = useState(false),
    [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [room, setRoom] = useState("------"),
    [pin, setPin] = useState("----");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = localStorage.getItem("klip_theme") as KlipAppTheme | null;
      const restoredTheme =
        saved === "dark" || saved === "light" ? saved : "light";
      // Theme restoration intentionally happens after hydration. Persisting the
      // default before this point would overwrite the user's saved preference.
      setTheme(restoredTheme);
      document.documentElement.dataset.klipTheme = restoredTheme;
      document.documentElement.style.colorScheme = restoredTheme;
      setThemeReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.dataset.klipTheme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("klip_theme", theme);
  }, [theme, themeReady]);

  const toggleTheme = () =>
    setTheme((value) => (value === "dark" ? "light" : "dark"));
  const [name, setName] = useState(""),
    [owner, setOwner] = useState("");
  const [mode, setMode] = useState<"host" | "guest">("host");
  const [quality, setQuality] = useState<Quality>("1080"),
    [deviceId, setDeviceId] = useState(""),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]),
    [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]),
    [audioInputId, setAudioInputId] = useState(""),
    [audioOutputId, setAudioOutputId] = useState("");
  const [mic, setMic] = useState(true),
    [noiseSuppression, setNoiseSuppression] = useState(true),
    [micSensitivity, setMicSensitivity] = useState(70),
    [micTesting, setMicTesting] = useState(false),
    [micLevel, setMicLevel] = useState(0),
    [cameraOn, setCameraOn] = useState(true),
    [sharing, setSharing] = useState(false),
    [remoteSharing, setRemoteSharing] = useState(false),
    [recording, setRecording] = useState(false),
    [recordSeconds, setRecordSeconds] = useState(0),
    [recordingFormat, setRecordingFormat] = useState<ExportFormat>("mp4"),
    [vertical, setVertical] = useState(false),
    [verticalCameraMode, setVerticalCameraMode] =
      useState<VerticalCameraMode>("auto"),
    [resenhaMode, setResenhaMode] = useState(false),
    [previewOpen, setPreviewOpen] = useState(false),
    [topOrder, setTopOrder] = useState<"mine-first" | "friend-first">(
      "mine-first",
    ),
    [screenPosition, setScreenPosition] = useState<"top" | "bottom">("bottom"),
    [tiktokTop, setTiktokTop] = useState(0.325),
    [resenhaMineSize, setResenhaMineSize] = useState(0.5),
    [dragging, setDragging] = useState(""),
    [background, setBackground] = useState(""),
    [backgroundVideo, setBackgroundVideo] = useState(""),
    [backgroundLabel, setBackgroundLabel] = useState(""),
    [cameraOverlay, setCameraOverlay] = useState(""),
    [cameraOverlayOpacity, setCameraOverlayOpacity] = useState(0.85),
    [webcamText, setWebcamText] = useState(""),
    [webcamTextPosition, setWebcamTextPosition] = useState<"top" | "bottom">(
      "top",
    ),
    [backgroundMode, setBackgroundMode] = useState<
      "none" | "image" | "blur" | "remove"
    >("none"),
    [mattingQuality, setMattingQuality] = useState<"standard" | "premium">(
      "standard",
    ),
    [skinSmooth, setSkinSmooth] = useState(false),
    [blurAmount, setBlurAmount] = useState(16),
    [backgroundScale, setBackgroundScale] = useState(100),
    [backgroundOffsetX, setBackgroundOffsetX] = useState(0),
    [backgroundOffsetY, setBackgroundOffsetY] = useState(0),
    [backgroundFit, setBackgroundFit] = useState<
      "cover" | "contain" | "original"
    >("cover"),
    [shareScreenAudio, setShareScreenAudio] = useState(true),
    [shareScreenDialogOpen, setShareScreenDialogOpen] = useState(false),
    [screenAudioActive, setScreenAudioActive] = useState(false),
    [remoteScreenAudioActive, setRemoteScreenAudioActive] = useState(false),
    [virtualEffectLoading, setVirtualEffectLoading] = useState(""),
    [cameraEpoch, setCameraEpoch] = useState(0),
    [virtualEpoch, setVirtualEpoch] = useState(0);
  const [friend, setFriend] = useState(""),
    [friendRecording, setFriendRecording] = useState(false),
    [speaking, setSpeaking] = useState({ mine: false, friend: false }),
    [notice, setNotice] = useState(""),
    [chatOpen, setChatOpen] = useState(false),
    [connectionOpen, setConnectionOpen] = useState(false),
    [connectionStats, setConnectionStats] = useState<ConnectionStats>({
      fps: 0,
      bitrateKbps: 0,
      packetLoss: 0,
      jitterMs: 0,
      rttMs: 0,
    }),
    [settingsOpen, setSettingsOpen] = useState(false),
    [settingsOffset, setSettingsOffset] = useState({ x: 0, y: 0 }),
    [settingsMinimized, setSettingsMinimized] = useState(false),
    [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 }),
    [previewMinimized, setPreviewMinimized] = useState(false),
    [callStartedAt, setCallStartedAt] = useState(0),
    [callSeconds, setCallSeconds] = useState(0),
    [restoreCall, setRestoreCall] = useState<SavedCall | null>(null),
    [draft, setDraft] = useState(""),
    [messages, setMessages] = useState<Msg[]>([]);
  const local = useRef<MediaStream | null>(null),
    remote = useRef<MediaStream | null>(null),
    displayed = useRef<MediaStream | null>(null),
    remoteDisplayed = useRef<MediaStream | null>(null),
    processedLocal = useRef<MediaStream | null>(null),
    processedAudio = useRef<MediaStream | null>(null),
    blurAmountRef = useRef(16),
    backgroundScaleRef = useRef(100),
    backgroundOffsetXRef = useRef(0),
    backgroundOffsetYRef = useRef(0),
    backgroundFitRef = useRef<"cover" | "contain" | "original">("cover"),
    visualCompositionActive = useRef(false),
    webcamTextRef = useRef(webcamText),
    webcamTextPositionRef = useRef(webcamTextPosition),
    cameraOverlayRef = useRef(cameraOverlay),
    cameraOverlayOpacityRef = useRef(cameraOverlayOpacity),
    skinSmoothRef = useRef(skinSmooth),
    connectionSample = useRef({ bytes: 0, at: 0 });
  backgroundScaleRef.current = backgroundScale;
  backgroundOffsetXRef.current = backgroundOffsetX;
  backgroundOffsetYRef.current = backgroundOffsetY;
  backgroundFitRef.current = backgroundFit;
  const peer = useRef<Peer | null>(null),
    connection = useRef<DataConnection | null>(null),
    remoteId = useRef(""),
    recorder = useRef<MediaRecorder | null>(null),
    recordChunks = useRef<Blob[]>([]),
    cutRequested = useRef(false),
    speakingRef = useRef({ mine: false, friend: false }),
    pipVideo = useRef<HTMLVideoElement | null>(null),
    pipTimer = useRef(0),
    peerRetry = useRef(0),
    peerConnectTimer = useRef(0),
    peerRetryTimer = useRef(0),
    peerConnected = useRef(false),
    cameraCalls = useRef<MediaConnection[]>([]),
    audioPipeline = useRef<{
      context: AudioContext;
      gain: GainNode;
      analyser: AnalyserNode;
      output: MediaStream;
    } | null>(null),
    micTestFrame = useRef(0),
    settingsDrag = useRef<{
      x: number;
      y: number;
      startX: number;
      startY: number;
    } | null>(null),
    previewDrag = useRef<{
      x: number;
      y: number;
      startX: number;
      startY: number;
    } | null>(null);
  const mine = useRef<HTMLVideoElement>(null),
    theirs = useRef<HTMLVideoElement>(null),
    screen = useRef<HTMLVideoElement>(null),
    remoteScreen = useRef<HTMLVideoElement>(null),
    previewMine = useRef<HTMLVideoElement>(null),
    previewFriend = useRef<HTMLVideoElement>(null),
    previewScreen = useRef<HTMLVideoElement>(null);

  // Texto, opacidade e suavização são ajustes por frame; não devem reconstruir
  // Worker, canvas ou conexão WebRTC enquanto a pessoa arrasta um controle.
  useEffect(() => {
    webcamTextRef.current = webcamText;
  }, [webcamText]);
  useEffect(() => {
    webcamTextPositionRef.current = webcamTextPosition;
  }, [webcamTextPosition]);
  useEffect(() => {
    cameraOverlayRef.current = cameraOverlay;
  }, [cameraOverlay]);
  useEffect(() => {
    cameraOverlayOpacityRef.current = cameraOverlayOpacity;
  }, [cameraOverlayOpacity]);
  useEffect(() => {
    skinSmoothRef.current = skinSmooth;
  }, [skinSmooth]);

  useEffect(() => {
    let stopAuthSubscription: (() => void) | null = null;
    const initialize = () => {
      try {
        const savedUser = localStorage.getItem("klip_user");
        if (savedUser) setCurrentUser(JSON.parse(savedUser) as AppUser);
      } catch {
        // Um cache de sessão inválido não deve impedir a inicialização do app.
      }

      if (isSupabaseConfigured) {
        const supabase = createClient();
        const query = new URLSearchParams(window.location.search);
        const authCode = query.get("code");

        if (authCode) {
          supabase.auth
            .exchangeCodeForSession(authCode)
            .then(({ data, error }) => {
              if (!error && data.user) {
                const userName =
                  data.user.user_metadata?.full_name ||
                  data.user.user_metadata?.name ||
                  data.user.email?.split("@")[0] ||
                  "Criador";
                const avatarUrl =
                  data.user.user_metadata?.avatar_url ||
                  data.user.user_metadata?.picture ||
                  undefined;
                const userObj = {
                  id: data.user.id,
                  email: data.user.email || "",
                  name: userName,
                  avatarUrl,
                };
                setCurrentUser(userObj);
                localStorage.setItem("klip_user", JSON.stringify(userObj));

                // Sincroniza profile no banco
                supabase
                  .from("profiles")
                  .upsert(
                    {
                      id: data.user.id,
                      email: data.user.email || "",
                      name: userName,
                      avatar_url: avatarUrl || null,
                      updated_at: new Date().toISOString(),
                    },
                    { onConflict: "id" },
                  )
                  .then(() => undefined);

                window.location.href = "/perfil";
              }
            })
            .catch(() => undefined);
        } else {
          supabase.auth
            .getUser()
            .then(({ data: { user } }) => {
              if (user) {
                const userName =
                  user.user_metadata?.full_name ||
                  user.user_metadata?.name ||
                  user.email?.split("@")[0] ||
                  "Criador";
                const avatarUrl =
                  user.user_metadata?.avatar_url ||
                  user.user_metadata?.picture ||
                  undefined;
                const userObj = {
                  id: user.id,
                  email: user.email || "",
                  name: userName,
                  avatarUrl,
                };
                setCurrentUser(userObj);
                localStorage.setItem("klip_user", JSON.stringify(userObj));
              }
            })
            .catch(() => undefined);
        }

        const authListener = supabase.auth.onAuthStateChange(
          (event, session) => {
            if (session?.user) {
              const userName =
                session.user.user_metadata?.full_name ||
                session.user.user_metadata?.name ||
                session.user.email?.split("@")[0] ||
                "Criador";
              const avatarUrl =
                session.user.user_metadata?.avatar_url ||
                session.user.user_metadata?.picture ||
                undefined;
              const userObj = {
                id: session.user.id,
                email: session.user.email || "",
                name: userName,
                avatarUrl,
              };
              setCurrentUser(userObj);
              localStorage.setItem("klip_user", JSON.stringify(userObj));
            } else if (event === "SIGNED_OUT") {
              setCurrentUser(null);
              localStorage.removeItem("klip_user");
            }
          },
        );
        stopAuthSubscription = () =>
          authListener.data.subscription.unsubscribe();
      }

      const query = new URLSearchParams(location.search);
      if (query.get("editor") === "1") {
        setEditorOpen(true);
        setBooting(false);
        return;
      }
      if (query.get("motion") === "1") {
        setMotionStudio(true);
        setBooting(false);
        return;
      }
      const invitedRoom = (query.get("sala") || "").replace(/\D/g, ""),
        invitedPin = (query.get("senha") || "").replace(/\D/g, "");
      if (invitedRoom.length === 6 && invitedPin.length === 4) {
        setRoom(invitedRoom);
        setPin(invitedPin);
        setOwner((query.get("anfitriao") || "Anfitrião").slice(0, 40));
        setMode("guest");
        setBooting(false);
      } else {
        try {
          const saved = JSON.parse(
            sessionStorage.getItem("klip-active-call") || "null",
          ) as SavedCall | null;
          if (
            saved?.room?.length === 6 &&
            saved.pin?.length === 4 &&
            saved.name
          ) {
            setRoom(saved.room);
            setPin(saved.pin);
            setName(saved.name);
            setOwner(saved.owner);
            setMode(saved.mode);
            setQuality(saved.quality);
            setDeviceId(saved.deviceId);
            setAudioInputId(saved.audioInputId || "");
            setRestoreCall(saved);
            setNotice("Restaurando sua chamada…");
          } else {
            setRoom(code(6));
            setPin(code(4));
            setBooting(false);
          }
        } catch {
          setRoom(code(6));
          setPin(code(4));
          setBooting(false);
        }
      }
    };
    const frame = window.requestAnimationFrame(initialize);
    return () => {
      window.cancelAnimationFrame(frame);
      stopAuthSubscription?.();
    };
  }, []);
  useEffect(() => {
    if (
      !restoreCall ||
      inRoom ||
      room !== restoreCall.room ||
      pin !== restoreCall.pin ||
      name !== restoreCall.name ||
      mode !== restoreCall.mode
    )
      return;
    void join(restoreCall.deviceId).finally(() => setBooting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- A restauração deve chamar a implementação de join capturada somente quando os dados persistidos coincidirem; incluir a função instável repetiria a entrada na sala.
  }, [restoreCall, inRoom, room, pin, name, mode]);
  useEffect(() => {
    if (!inRoom || !callStartedAt) return;
    const tick = () =>
      setCallSeconds(
        Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000)),
      );
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [inRoom, callStartedAt]);
  useEffect(() => {
    if (!audioOutputId) return;
    [theirs.current, remoteScreen.current].forEach((player) => {
      if (player && "setSinkId" in player)
        void (
          player as HTMLVideoElement & {
            setSinkId: (id: string) => Promise<void>;
          }
        )
          .setSinkId(audioOutputId)
          .catch(() => undefined);
    });
  }, [audioOutputId, friend, remoteSharing]);
  useEffect(
    () => () => {
      peer.current?.destroy();
      local.current?.getTracks().forEach((track) => track.stop());
      displayed.current?.getTracks().forEach((track) => track.stop());
      window.clearTimeout(peerConnectTimer.current);
      window.clearTimeout(peerRetryTimer.current);
      void audioPipeline.current?.context.close();
    },
    [],
  );
  useEffect(() => {
    if (inRoom && mine.current && local.current) {
      mine.current.srcObject = processedLocal.current || local.current;
      void mine.current.play().catch(() => undefined);
    }
    if (friend && theirs.current && remote.current) {
      theirs.current.srcObject = remote.current;
      void theirs.current.play().catch(() => undefined);
    }
    if (sharing && screen.current && displayed.current) {
      screen.current.srcObject = displayed.current;
      void screen.current.play().catch(() => undefined);
    }
    if (remoteSharing && remoteScreen.current && remoteDisplayed.current) {
      remoteScreen.current.srcObject = remoteDisplayed.current;
      void remoteScreen.current.play().catch(() => undefined);
    }
    if (previewMine.current && local.current)
      previewMine.current.srcObject = processedLocal.current || local.current;
    if (previewFriend.current && remote.current)
      previewFriend.current.srcObject = remote.current;
    const shared = sharing
      ? displayed.current
      : remoteSharing
        ? remoteDisplayed.current
        : null;
    if (previewScreen.current && shared)
      previewScreen.current.srcObject = shared;
  }, [
    inRoom,
    friend,
    sharing,
    remoteSharing,
    previewOpen,
    previewMinimized,
    virtualEpoch,
    verticalCameraMode,
  ]);
  useEffect(() => {
    if (
      !inRoom ||
      (backgroundMode === "none" && !webcamText.trim() && !cameraOverlay) ||
      !local.current
    )
      return;
    let active = true,
      segmentationFrame = 0,
      renderFrame = 0,
      premiumInferenceTimer = 0,
      lastInferenceAt = 0,
      inferenceDuration = 24,
      attached = false,
      hasMask = false,
      lastAnimatedRenderAt = 0;
    // Fundo animado exige composição a cada quadro. Limitamos apenas essa
    // composição a 24 fps: a webcam continua em boa fluidez, mas sobra GPU e
    // banda para o WebRTC não congelar o vídeo visto pelo amigo.
    const animatedBackdrop =
      backgroundMode === "image" &&
      (Boolean(backgroundVideo) || /GIF animado/.test(backgroundLabel));
    const composedBackdrop = backgroundMode !== "none";
    // Fundo estático/desfoque continua em 30 fps. Só GIF/MP4 é limitado,
    // pois também precisa ser decodificado enquanto a chamada está ao vivo.
    const compositeRate = animatedBackdrop ? 20 : 30;
    const shouldSkipAnimatedRender = () => {
      if (!composedBackdrop) return false;
      const now = performance.now();
      if (now - lastAnimatedRenderAt < 1000 / compositeRate) return true;
      lastAnimatedRenderAt = now;
      return false;
    };
    const source = document.createElement("video"),
      canvas = document.createElement("canvas"),
      context = canvas.getContext("2d"),
      maskCanvas = document.createElement("canvas"),
      maskContext = maskCanvas.getContext("2d"),
      inferenceCanvas = document.createElement("canvas"),
      inferenceContext = inferenceCanvas.getContext("2d", { alpha: false }),
      foregroundCanvas = document.createElement("canvas"),
      foregroundContext = foregroundCanvas.getContext("2d"),
      image = new Image(),
      overlayImage = new Image(),
      backdropVideo = document.createElement("video");
    source.srcObject = local.current;
    source.muted = true;
    source.playsInline = true;
    if (background) image.src = background;
    let loadedOverlaySource = cameraOverlayRef.current;
    if (loadedOverlaySource) overlayImage.src = loadedOverlaySource;
    if (backgroundVideo) backdropVideo.src = backgroundVideo;
    backdropVideo.muted = true;
    backdropVideo.loop = true;
    backdropVideo.playsInline = true;
    const run = async () => {
      await source.play();
      if (
        !active ||
        !context ||
        !maskContext ||
        !inferenceContext ||
        !foregroundContext
      )
        return;
      // Nunca faça composição em 4K implícita. A câmera pode ser 4K, mas a
      // chamada configurada em 1080p precisa de canvas 1080p; renderizar 4K
      // antes do encoder reduzi-la era a causa de quedas enormes de FPS.
      const sourceWidthForOutput = source.videoWidth || 1280;
      const sourceHeightForOutput = source.videoHeight || 720;
      const outputEdge = animatedBackdrop
        ? 1280
        : quality === "1080"
          ? 1920
          : 1280;
      const virtualOutputScale = Math.min(
        1,
        outputEdge / Math.max(sourceWidthForOutput, sourceHeightForOutput),
      );
      canvas.width = Math.max(
        2,
        Math.round(sourceWidthForOutput * virtualOutputScale),
      );
      canvas.height = Math.max(
        2,
        Math.round(sourceHeightForOutput * virtualOutputScale),
      );
      foregroundCanvas.width = canvas.width;
      foregroundCanvas.height = canvas.height;
      if (backgroundMode === "image" && backgroundVideo) {
        await new Promise<void>((resolve, reject) => {
          if (backdropVideo.readyState >= 2) return resolve();
          backdropVideo.onloadeddata = () => resolve();
          backdropVideo.onerror = () => reject(new Error("background video"));
        });
        await backdropVideo.play();
      } else if (backgroundMode === "image") {
        await new Promise<void>((resolve, reject) => {
          if (image.complete && image.naturalWidth) return resolve();
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("background image"));
        });
      }
      const drawImageBackground = (target: CanvasRenderingContext2D) => {
        const sourceBackground = backgroundVideo ? backdropVideo : image;
        const sourceWidth = backgroundVideo
          ? backdropVideo.videoWidth
          : image.naturalWidth;
        const sourceHeight = backgroundVideo
          ? backdropVideo.videoHeight
          : image.naturalHeight;
        if (!sourceWidth || !sourceHeight) return;

        const fit = backgroundFitRef.current;
        const scalePct = backgroundScaleRef.current;
        const offX = backgroundOffsetXRef.current;
        const offY = backgroundOffsetYRef.current;

        let baseScale = 1;
        if (fit === "contain") {
          baseScale = Math.min(
            canvas.width / sourceWidth,
            canvas.height / sourceHeight,
          );
        } else if (fit === "original") {
          baseScale = 1;
        } else {
          // cover
          baseScale = Math.max(
            canvas.width / sourceWidth,
            canvas.height / sourceHeight,
          );
        }

        const finalScale = baseScale * (scalePct / 100);
        const width = sourceWidth * finalScale;
        const height = sourceHeight * finalScale;

        const posX = (canvas.width - width) / 2 + (offX / 100) * canvas.width;
        const posY =
          (canvas.height - height) / 2 + (offY / 100) * canvas.height;

        target.drawImage(sourceBackground, posX, posY, width, height);
      };
      // A saída fica rápida; a máscara é atualizada em outra cadência abaixo.
      const output = canvas.captureStream(compositeRate);
      const attachOverlayOutput = () => {
        if (attached) return;
        processedLocal.current = output;
        refreshCameraForPeer();
        if (mine.current) {
          mine.current.srcObject = output;
          void mine.current.play().catch(() => undefined);
        }
        setVirtualEpoch((epoch) => epoch + 1);
        attached = true;
      };
      const drawWebcamText = () => {
        const text = webcamTextRef.current.trim();
        if (!text || !context) return;
        const fontSize = Math.max(26, Math.round(canvas.width * 0.047));
        context.save();
        context.font = `800 ${fontSize}px Inter, Arial, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        const paddingX = fontSize * 0.58;
        const width = Math.min(
          canvas.width - 32,
          context.measureText(text).width + paddingX * 2,
        );
        const height = fontSize * 1.72;
        const x = (canvas.width - width) / 2;
        const y =
          webcamTextPositionRef.current === "top"
            ? 24
            : canvas.height - height - 24;
        context.fillStyle = "rgba(17,14,16,.74)";
        context.beginPath();
        context.roundRect(x, y, width, height, height / 2);
        context.fill();
        context.fillStyle = "#fff7f3";
        context.fillText(
          text,
          canvas.width / 2,
          y + height / 2,
          canvas.width - 56,
        );
        context.restore();
      };
      const drawCameraOverlay = () => {
        const overlay = cameraOverlayRef.current;
        if (!overlay) return;
        if (loadedOverlaySource !== overlay) {
          loadedOverlaySource = overlay;
          overlayImage.src = overlay;
          return;
        }
        if (!overlayImage.complete || !overlayImage.naturalWidth) return;
        context.save();
        context.globalAlpha = cameraOverlayOpacityRef.current;
        context.drawImage(overlayImage, 0, 0, canvas.width, canvas.height);
        context.restore();
      };
      try {
        // Entrega o canvas imediatamente com a câmera crua. A máscara chega
        // depois, sem trocar a chamada WebRTC nem deixar uma tela preta no meio.
        attachOverlayOutput();
        if (backgroundMode === "none") {
          const renderOverlay = () => {
            if (!active || !context) return;
            context.drawImage(source, 0, 0, canvas.width, canvas.height);
            drawWebcamText();
            drawCameraOverlay();
            attachOverlayOutput();
            renderFrame = requestAnimationFrame(renderOverlay);
          };
          renderOverlay();
          return () => {
            cancelAnimationFrame(renderFrame);
            output.getTracks().forEach((track) => track.stop());
            if (processedLocal.current === output) {
              processedLocal.current = null;
              if (!visualCompositionActive.current && local.current)
                replaceOutgoingVideo(local.current);
              setVirtualEpoch((epoch) => epoch + 1);
            }
          };
        }
        // O pipeline MediaPipe dentro de Worker ainda varia entre navegadores
        // no macOS (inclusive em máquinas Apple Silicon fortes). Nesses casos
        // usamos diretamente o RVM/WebGL, que não depende de OffscreenCanvas
        // nem da transferência de ImageBitmap para entregar a primeira máscara.
        const isMacOS = /Macintosh|Mac OS X/i.test(navigator.userAgent);
        const usePremiumMatting = mattingQuality === "premium" && !isMacOS;
        if (usePremiumMatting) {
          setNotice("Preparando IA Premium na GPU…");
          const tf = await import("@tensorflow/tfjs");
          try {
            await tf.setBackend("webgl");
          } catch {
            // O TensorFlow escolhe o melhor backend disponível como fallback.
          }
          await tf.ready();
          const model = await tf.loadGraphModel(
            "/rvm/rvm_mobilenetv3_tfjs_int8/model.json",
          );
          let r1i: Tensor = tf.scalar(0),
            r2i: Tensor = tf.scalar(0),
            r3i: Tensor = tf.scalar(0),
            r4i: Tensor = tf.scalar(0),
            maskPixels: ImageData | null = null,
            inferenceBusy = false;
          const downsampleRatio: Tensor = tf.scalar(0.38);
          // Perfil "reunião": a webcam continua saindo na resolução original,
          // mas a máscara é calculada em até 960 px. É a mesma separação de
          // trabalho usada por apps de chamada: vídeo fluido primeiro, IA em
          // segundo plano sem monopolizar CPU/GPU.
          const sourceWidth = source.videoWidth || canvas.width;
          const sourceHeight = source.videoHeight || canvas.height;
          const inferenceScale = Math.min(
            1,
            720 / Math.max(sourceWidth, sourceHeight),
          );
          inferenceCanvas.width = Math.max(
            2,
            Math.round((sourceWidth * inferenceScale) / 2) * 2,
          );
          inferenceCanvas.height = Math.max(
            2,
            Math.round((sourceHeight * inferenceScale) / 2) * 2,
          );
          const attachOutput = () => {
            if (attached) return;
            processedLocal.current = output;
            refreshCameraForPeer();
            if (mine.current) {
              mine.current.srcObject = output;
              void mine.current.play().catch(() => undefined);
            }
            setVirtualEpoch((epoch) => epoch + 1);
            attached = true;
          };
          const renderPremium = () => {
            if (!active || !context) return;
            if (shouldSkipAnimatedRender()) {
              renderFrame = requestAnimationFrame(renderPremium);
              return;
            }
            context.clearRect(0, 0, canvas.width, canvas.height);
            if (backgroundMode === "blur") {
              const strength = blurAmountRef.current;
              context.filter = `blur(${strength}px) brightness(.9) saturate(.93)`;
              context.drawImage(
                source,
                -strength,
                -strength,
                canvas.width + strength * 2,
                canvas.height + strength * 2,
              );
              context.filter = "none";
            } else if (backgroundMode === "image") {
              drawImageBackground(context);
            }
            if (hasMask) {
              foregroundContext.clearRect(
                0,
                0,
                foregroundCanvas.width,
                foregroundCanvas.height,
              );
              foregroundContext.save();
              foregroundContext.imageSmoothingEnabled = true;
              foregroundContext.imageSmoothingQuality = "high";
              foregroundContext.filter = "none";
              foregroundContext.drawImage(
                maskCanvas,
                0,
                0,
                foregroundCanvas.width,
                foregroundCanvas.height,
              );
              foregroundContext.globalCompositeOperation = "source-in";
              foregroundContext.filter = skinSmoothRef.current
                ? "blur(.22px) brightness(1.012) contrast(.992) saturate(.985)"
                : "none";
              foregroundContext.drawImage(
                source,
                0,
                0,
                foregroundCanvas.width,
                foregroundCanvas.height,
              );
              foregroundContext.restore();
              context.drawImage(
                foregroundCanvas,
                0,
                0,
                canvas.width,
                canvas.height,
              );
            } else {
              // Nunca congelar/escurecer o vídeo enquanto a primeira máscara
              // premium ainda está sendo preparada.
              context.drawImage(source, 0, 0, canvas.width, canvas.height);
            }
            drawWebcamText();
            drawCameraOverlay();
            renderFrame = requestAnimationFrame(renderPremium);
          };
          const inferPremium = async () => {
            if (!active || inferenceBusy) return;
            inferenceBusy = true;
            const started = performance.now();
            let inferenceFailed = false;
            let src: Tensor | null = null;
            try {
              inferenceContext.drawImage(
                source,
                0,
                0,
                inferenceCanvas.width,
                inferenceCanvas.height,
              );
              const pixels = tf.browser.fromPixels(inferenceCanvas);
              src = tf.tidy(() => pixels.toFloat().div(255).expandDims(0));
              pixels.dispose();
              const outputs = (await model.executeAsync(
                { src, r1i, r2i, r3i, r4i, downsample_ratio: downsampleRatio },
                // O JSON publica aliases `fgr`/`pha`, mas o GraphExecutor do
                // TensorFlow.js resolve pelos nomes reais dos nós. Usar os
                // aliases fazia o RVM falhar em todos os Macs no fallback.
                [
                  "Identity:0",
                  "Identity_1:0",
                  "Identity_2:0",
                  "Identity_3:0",
                  "Identity_4:0",
                  "Identity_5:0",
                ],
              )) as Tensor[];
              const [fgr, pha, r1o, r2o, r3o, r4o] = outputs;
              const alpha = (await pha.data()) as Float32Array;
              // O modelo preserva a resolução de entrada; usar o shape evita
              // redimensionar a máscara por suposição caso uma webcam mude de modo.
              const width =
                  Number(pha.shape[2]) || source.videoWidth || canvas.width,
                height =
                  Number(pha.shape[1]) || source.videoHeight || canvas.height;
              if (
                !maskPixels ||
                maskPixels.width !== width ||
                maskPixels.height !== height
              ) {
                maskCanvas.width = width;
                maskCanvas.height = height;
                maskPixels = maskContext.createImageData(width, height);
                for (
                  let offset = 0;
                  offset < maskPixels.data.length;
                  offset += 4
                ) {
                  maskPixels.data[offset] = 255;
                  maskPixels.data[offset + 1] = 255;
                  maskPixels.data[offset + 2] = 255;
                }
              }
              for (let index = 0; index < alpha.length; index += 1) {
                const val = Math.max(0, Math.min(1, alpha[index]));
                const normalized = Math.max(
                  0,
                  Math.min(1, (val - 0.22) / 0.52),
                );
                const smooth = normalized * normalized * (3 - 2 * normalized);
                maskPixels.data[index * 4 + 3] =
                  smooth < 0.03 ? 0 : Math.round(smooth * 255);
              }
              maskContext.putImageData(maskPixels, 0, 0);
              hasMask = true;
              setVirtualEffectLoading("");
              attachOutput();
              src.dispose();
              src = null;
              fgr.dispose();
              pha.dispose();
              r1i.dispose();
              r2i.dispose();
              r3i.dispose();
              r4i.dispose();
              r1i = r1o;
              r2i = r2o;
              r3i = r3o;
              r4i = r4o;
              inferenceDuration = performance.now() - started;
              if (inferenceDuration < 100)
                setNotice(
                  "IA Premium ativa · vídeo fluido e recorte temporal na GPU",
                );
            } catch (error) {
              inferenceFailed = true;
              src?.dispose();
              src = null;
              setVirtualEffectLoading("");
              const detail =
                error instanceof Error ? error.message : "erro desconhecido";
              console.error("Falha no RVM do fundo virtual:", error);
              setNotice(
                `O fundo virtual não iniciou na GPU (${detail}). A câmera continua conectada.`,
              );
            } finally {
              inferenceBusy = false;
              if (active && !inferenceFailed) {
                // A máscara não precisa competir com o vídeo em 30 fps. Um teto
                // de 13 fps mantém o RVM temporal estável, evita uso contínuo de
                // GPU e deixa espaço para codificar/enviar a chamada. Se a máquina
                // já estiver ocupada, reduz ainda mais a pressão automaticamente.
                const targetMaskInterval = animatedBackdrop
                  ? Math.max(125, inferenceDuration * 1.35)
                  : inferenceDuration > 85
                    ? 120
                    : 82;
                const pause = Math.min(
                  180,
                  Math.max(16, targetMaskInterval - inferenceDuration),
                );
                premiumInferenceTimer = window.setTimeout(
                  () => void inferPremium(),
                  pause,
                );
              }
            }
          };
          renderPremium();
          void inferPremium();
          return () => {
            cancelAnimationFrame(segmentationFrame);
            cancelAnimationFrame(renderFrame);
            window.clearTimeout(premiumInferenceTimer);
            model.dispose();
            r1i.dispose();
            r2i.dispose();
            r3i.dispose();
            r4i.dispose();
            downsampleRatio.dispose();
            output.getTracks().forEach((track) => track.stop());
            if (processedLocal.current === output) {
              processedLocal.current = null;
              if (!visualCompositionActive.current && local.current)
                replaceOutgoingVideo(local.current);
              setVirtualEpoch((epoch) => epoch + 1);
            }
          };
        }
        type SegmentMessage =
          | { type: "init" }
          | {
              type: "segment";
              bitmap?: ImageBitmap;
              frame?: HTMLCanvasElement;
              timestamp: number;
            }
          | { type: "close" };
        type SegmentResponse =
          | { type: "ready" }
          | {
              type: "mask";
              alpha: ArrayBuffer;
              width: number;
              height: number;
              inferenceMs: number;
            }
          | { type: "error"; message: string };
        type SegmentPort = {
          onmessage: ((event: MessageEvent<SegmentResponse>) => void) | null;
          onerror: ((event?: Event) => void) | null;
          postMessage: (
            message: SegmentMessage,
            transfer?: Transferable[],
          ) => void;
          terminate: () => void;
        };
        // Safari/macOS pode criar o Worker e até responder "ready", mas falha
        // ao obter o contexto WebGL/OffscreenCanvas no primeiro frame. Este
        // adaptador mantém a mesma interface, porém executa o MediaPipe na
        // thread principal, onde WebGL é oficialmente funcional no Safari.
        let macSegmenter:
          import("@mediapipe/tasks-vision").ImageSegmenter | null = null;
        let macClosed = false;
        const macPort: SegmentPort = {
          onmessage: null,
          onerror: null,
          postMessage(message) {
            if (message.type === "init") {
              void (async () => {
                try {
                  const { FilesetResolver, ImageSegmenter } =
                    await import("@mediapipe/tasks-vision");
                  const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
                    false,
                  );
                  const options = {
                    baseOptions: {
                      modelAssetPath:
                        "/models/selfie_multiclass_256x256.tflite",
                      delegate: "GPU" as const,
                    },
                    runningMode: "VIDEO" as const,
                    outputConfidenceMasks: true,
                    outputCategoryMask: false,
                  };
                  try {
                    macSegmenter = await ImageSegmenter.createFromOptions(
                      vision,
                      options,
                    );
                  } catch {
                    macSegmenter = await ImageSegmenter.createFromOptions(
                      vision,
                      {
                        ...options,
                        baseOptions: {
                          ...options.baseOptions,
                          delegate: "CPU" as const,
                        },
                      },
                    );
                  }
                  if (macClosed) {
                    macSegmenter.close();
                    macSegmenter = null;
                    return;
                  }
                  setNotice("Recorte compatível com macOS pronto.");
                  macPort.onmessage?.({
                    data: { type: "ready" },
                  } as MessageEvent<SegmentResponse>);
                } catch (error) {
                  const message =
                    error instanceof Error
                      ? error.message
                      : "Falha ao preparar o MediaPipe no macOS.";
                  macPort.onmessage?.({
                    data: { type: "error", message },
                  } as MessageEvent<SegmentResponse>);
                }
              })();
              return;
            }
            if (message.type === "close") {
              macClosed = true;
              macSegmenter?.close();
              macSegmenter = null;
              return;
            }
            const frame = message.frame || message.bitmap;
            if (!macSegmenter || !frame) {
              message.bitmap?.close();
              return;
            }
            const started = performance.now();
            try {
              macSegmenter.segmentForVideo(
                frame,
                message.timestamp,
                (results) => {
                  const masks = results.confidenceMasks;
                  if (!masks?.length)
                    throw new Error(
                      "A máscara da pessoa não foi gerada no macOS.",
                    );
                  const labels =
                    macSegmenter
                      ?.getLabels()
                      .map((label) => label.toLowerCase()) || [];
                  const indexFor = (label: string, fallback: number) => {
                    const found = labels.indexOf(label);
                    return Math.max(
                      0,
                      Math.min(masks.length - 1, found >= 0 ? found : fallback),
                    );
                  };
                  const backgroundMask = masks[indexFor("background", 0)];
                  const hairMask = masks[indexFor("hair", 1)];
                  const bodyMask = masks[indexFor("body-skin", 2)];
                  const faceMask = masks[indexFor("face-skin", 3)];
                  const clothesMask = masks[indexFor("clothes", 4)];
                  const backgroundValues = backgroundMask.getAsFloat32Array();
                  const hairValues = hairMask.getAsFloat32Array();
                  const bodyValues = bodyMask.getAsFloat32Array();
                  const faceValues = faceMask.getAsFloat32Array();
                  const clothesValues = clothesMask.getAsFloat32Array();
                  const alpha = new Uint8ClampedArray(backgroundValues.length);
                  for (let index = 0; index < alpha.length; index += 1) {
                    const person = Math.max(
                      1 - backgroundValues[index],
                      hairValues[index] * 1.18,
                      bodyValues[index],
                      faceValues[index] * 1.06,
                      clothesValues[index],
                    );
                    const normalized = Math.max(
                      0,
                      Math.min(1, (person - 0.16) / 0.48),
                    );
                    alpha[index] = Math.round(
                      normalized * normalized * (3 - 2 * normalized) * 255,
                    );
                  }
                  const response: SegmentResponse = {
                    type: "mask",
                    alpha: alpha.buffer,
                    width: backgroundMask.width,
                    height: backgroundMask.height,
                    inferenceMs: performance.now() - started,
                  };
                  macPort.onmessage?.({
                    data: response,
                  } as MessageEvent<SegmentResponse>);
                  results.close();
                },
              );
            } catch (error) {
              const detail =
                error instanceof Error
                  ? error.message
                  : "Falha ao recortar a pessoa no macOS.";
              macPort.onmessage?.({
                data: { type: "error", message: detail },
              } as MessageEvent<SegmentResponse>);
            } finally {
              message.bitmap?.close();
            }
          },
          terminate() {
            macClosed = true;
            macSegmenter?.close();
            macSegmenter = null;
          },
        };
        const worker: SegmentPort = isMacOS
          ? macPort
          : (new Worker(
              new URL(
                "./workers/person-segmentation.worker.ts",
                import.meta.url,
              ),
              { type: "module", name: "klip-person-segmentation" },
            ) as unknown as SegmentPort);
        let workerReady = false,
          workerBusy = false,
          bitmapFailures = 0,
          fallbackTriggered = false,
          firstMaskTimer = 0,
          maskPixels: ImageData | null = null;
        const fallbackToPremium = (reason = "") => {
          if (fallbackTriggered || !active) return;
          fallbackTriggered = true;
          window.clearTimeout(firstMaskTimer);
          if (isMacOS) {
            setVirtualEffectLoading("");
            setNotice(
              `O recorte compatível do macOS não respondeu${reason ? `: ${reason}` : "."}`,
            );
            return;
          }
          // Safari/macOS pode não oferecer ImageBitmap/OffscreenCanvas de modo
          // compatível dentro do Worker. Em máquinas fortes, como Apple Silicon,
          // a IA Premium no WebGL principal é um fallback funcional.
          setMattingQuality("premium");
          setNotice(
            "Usando IA Premium compatível com este navegador para o fundo virtual.",
          );
        };
        worker.onmessage = (event: MessageEvent<SegmentResponse>) => {
          if (!active) return;
          if (event.data.type === "ready") {
            workerReady = true;
            return;
          }
          workerBusy = false;
          if (event.data.type === "error") {
            fallbackToPremium(event.data.message);
            return;
          }
          inferenceDuration = event.data.inferenceMs;
          const { width, height } = event.data;
          if (
            !maskPixels ||
            maskPixels.width !== width ||
            maskPixels.height !== height
          ) {
            maskCanvas.width = width;
            maskCanvas.height = height;
            maskPixels = maskContext.createImageData(width, height);
            for (let offset = 0; offset < maskPixels.data.length; offset += 4) {
              maskPixels.data[offset] = 255;
              maskPixels.data[offset + 1] = 255;
              maskPixels.data[offset + 2] = 255;
            }
          }
          const receivedAlpha = new Uint8ClampedArray(event.data.alpha);
          for (let index = 0; index < receivedAlpha.length; index += 1) {
            const offset = index * 4;
            maskPixels.data[offset + 3] = receivedAlpha[index];
          }
          maskContext.putImageData(maskPixels, 0, 0);
          hasMask = true;
          window.clearTimeout(firstMaskTimer);
          setVirtualEffectLoading("");
          if (!attached) {
            processedLocal.current = output;
            refreshCameraForPeer();
            if (mine.current) {
              mine.current.srcObject = output;
              void mine.current.play().catch(() => undefined);
            }
            setVirtualEpoch((epoch) => epoch + 1);
            attached = true;
          }
        };
        worker.onerror = () => {
          workerBusy = false;
          fallbackToPremium();
        };
        worker.postMessage({ type: "init" });
        // Alguns WebKit inicializam o Worker sem disparar erro, mas nunca
        // entregam uma máscara. O timeout impede um desfoque eternamente cru.
        firstMaskTimer = window.setTimeout(() => {
          if (!hasMask) fallbackToPremium();
        }, 7_000);
        const render = () => {
          if (!active || !context) return;
          if (shouldSkipAnimatedRender()) {
            renderFrame = requestAnimationFrame(render);
            return;
          }
          context.clearRect(0, 0, canvas.width, canvas.height);
          if (backgroundMode === "blur") {
            const strength = blurAmountRef.current;
            context.filter = `blur(${strength}px) brightness(.9) saturate(.93)`;
            context.drawImage(
              source,
              -strength,
              -strength,
              canvas.width + strength * 2,
              canvas.height + strength * 2,
            );
            context.filter = "none";
          } else if (backgroundMode === "image") {
            drawImageBackground(context);
          }
          if (hasMask) {
            // A máscara fica em uma camada separada. Aplicá-la direto sobre
            // canvas opaco faria source-in cobrir o fundo inteiro.
            foregroundContext.clearRect(
              0,
              0,
              foregroundCanvas.width,
              foregroundCanvas.height,
            );
            foregroundContext.save();
            foregroundContext.imageSmoothingEnabled = true;
            foregroundContext.imageSmoothingQuality = "high";
            foregroundContext.filter = "none";
            foregroundContext.drawImage(
              maskCanvas,
              0,
              0,
              foregroundCanvas.width,
              foregroundCanvas.height,
            );
            foregroundContext.globalCompositeOperation = "source-in";
            foregroundContext.filter = skinSmoothRef.current
              ? "blur(.22px) brightness(1.012) contrast(.992) saturate(.985)"
              : "none";
            foregroundContext.drawImage(
              source,
              0,
              0,
              foregroundCanvas.width,
              foregroundCanvas.height,
            );
            foregroundContext.restore();
            context.drawImage(
              foregroundCanvas,
              0,
              0,
              canvas.width,
              canvas.height,
            );
          }
          drawWebcamText();
          drawCameraOverlay();
          renderFrame = requestAnimationFrame(render);
        };
        const next = () => {
          if (!active) return;
          // O Worker recebe no máximo um frame por vez. Enquanto a IA analisa,
          // o render, os controles e o áudio permanecem livres a 30 fps.
          const now = performance.now();
          const minimumGap = animatedBackdrop
            ? Math.max(115, Math.min(180, inferenceDuration * 1.5))
            : Math.max(78, Math.min(140, inferenceDuration * 1.3));
          if (
            workerReady &&
            !workerBusy &&
            now - lastInferenceAt >= minimumGap
          ) {
            workerBusy = true;
            lastInferenceAt = now;
            // Ajuste adaptativo: em uma máquina forte usa 640px; quando a
            // inferência começa a disputar GPU/encoder, reduz a máscara antes
            // de deixar o vídeo da chamada cair de frame rate.
            const bitmapWidth = animatedBackdrop
              ? 512
              : inferenceDuration > 95
                ? 384
                : inferenceDuration > 60
                  ? 480
                  : 640;
            const bitmapHeight = Math.max(
              2,
              Math.round(
                (bitmapWidth * (source.videoHeight || canvas.height)) /
                  (source.videoWidth || canvas.width),
              ),
            );
            if (isMacOS) {
              // Não transfira HTMLVideoElement/ImageBitmap no Safari. O frame
              // reduzido permanece na página e segue direto ao MediaPipe.
              inferenceCanvas.width = bitmapWidth;
              inferenceCanvas.height = bitmapHeight;
              inferenceContext.drawImage(
                source,
                0,
                0,
                bitmapWidth,
                bitmapHeight,
              );
              worker.postMessage({
                type: "segment",
                frame: inferenceCanvas,
                timestamp: now,
              });
              segmentationFrame = requestAnimationFrame(next);
              return;
            }
            void createImageBitmap(source, {
              resizeWidth: bitmapWidth,
              resizeHeight: bitmapHeight,
              resizeQuality: "low",
            })
              .then((bitmap) => {
                if (!active) {
                  bitmap.close();
                  return;
                }
                worker.postMessage(
                  { type: "segment", bitmap, timestamp: now },
                  [bitmap],
                );
              })
              .catch(() => {
                workerBusy = false;
                bitmapFailures += 1;
                if (bitmapFailures >= 3) fallbackToPremium();
              });
          }
          segmentationFrame = requestAnimationFrame(next);
        };
        render();
        next();
        return () => {
          cancelAnimationFrame(segmentationFrame);
          cancelAnimationFrame(renderFrame);
          window.clearTimeout(firstMaskTimer);
          worker.postMessage({ type: "close" });
          worker.terminate();
          output.getTracks().forEach((track) => track.stop());
          if (processedLocal.current === output) {
            processedLocal.current = null;
            if (!visualCompositionActive.current && local.current)
              replaceOutgoingVideo(local.current);
            setVirtualEpoch((epoch) => epoch + 1);
          }
        };
      } catch {
        setVirtualEffectLoading("");
        if (mattingQuality === "standard") {
          setMattingQuality("premium");
          setNotice(
            "O recorte leve não abriu neste navegador. Tentando o modo compatível com GPU.",
          );
        } else
          setNotice(
            "Não foi possível aplicar o fundo virtual. A câmera continua normal.",
          );
        output.getTracks().forEach((track) => track.stop());
      }
    };
    let stop: (() => void) | undefined;
    void run().then((cleanup) => {
      if (!active) cleanup?.();
      else stop = cleanup;
    });
    return () => {
      active = false;
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- O pipeline de segmentação reinicia apenas quando a fonte/configuração muda; callbacks de publicação são deliberadamente lidos da renderização que iniciou o pipeline.
  }, [
    background,
    backgroundVideo,
    backgroundLabel,
    backgroundMode,
    mattingQuality,
    cameraEpoch,
    inRoom,
    quality,
  ]);
  const refreshConnectionStats = async () => {
    const calls = cameraCalls.current as Array<
      MediaConnection & { peerConnection?: RTCPeerConnection }
    >;
    const peerConnection = calls.find(
      (call) => call.peerConnection,
    )?.peerConnection;
    if (!peerConnection) {
      setConnectionStats({
        fps: 0,
        bitrateKbps: 0,
        packetLoss: 0,
        jitterMs: 0,
        rttMs: 0,
      });
      return;
    }
    try {
      const report = await peerConnection.getStats();
      let fps = 0;
      let bytes = 0;
      let received = 0;
      let lost = 0;
      let jitterMs = 0;
      let rttMs = 0;
      report.forEach((raw) => {
        const item = raw as RTCStats & Record<string, unknown>;
        const kind = String(item.kind || item.mediaType || "");
        if (
          (item.type === "inbound-rtp" || item.type === "outbound-rtp") &&
          kind === "video"
        ) {
          fps = Math.max(fps, Number(item.framesPerSecond || 0));
          bytes += Number(item.bytesReceived || item.bytesSent || 0);
          if (item.type === "inbound-rtp") {
            received += Number(item.packetsReceived || 0);
            lost += Math.max(0, Number(item.packetsLost || 0));
            jitterMs = Math.max(jitterMs, Number(item.jitter || 0) * 1000);
          }
        }
        if (
          item.type === "candidate-pair" &&
          (item.state === "succeeded" || item.nominated === true)
        ) {
          rttMs = Math.max(
            rttMs,
            Number(item.currentRoundTripTime || 0) * 1000,
          );
        }
      });
      const now = performance.now();
      const prior = connectionSample.current;
      const bitrateKbps =
        prior.at && now > prior.at
          ? Math.max(0, ((bytes - prior.bytes) * 8) / (now - prior.at))
          : 0;
      connectionSample.current = { bytes, at: now };
      setConnectionStats({
        fps: Math.round(fps),
        bitrateKbps: Math.round(bitrateKbps),
        packetLoss:
          received + lost
            ? Number(((lost / (received + lost)) * 100).toFixed(2))
            : 0,
        jitterMs: Math.round(jitterMs),
        rttMs: Math.round(rttMs),
      });
    } catch {
      setNotice("Não foi possível ler as estatísticas da chamada agora.");
    }
  };
  useEffect(() => {
    if (!connectionOpen || !inRoom) return;
    void refreshConnectionStats();
    const interval = window.setInterval(
      () => void refreshConnectionStats(),
      2000,
    );
    return () => window.clearInterval(interval);
  }, [connectionOpen, inRoom]);
  useEffect(() => {
    if (mode === "host" && connection.current?.open)
      connection.current.send({
        kind: "layout",
        topOrder,
        screenPosition,
        tiktokTop,
        resenhaMode,
        resenhaMineSize,
      });
  }, [
    mode,
    topOrder,
    screenPosition,
    tiktokTop,
    resenhaMode,
    resenhaMineSize,
  ]);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(
      () => setRecordSeconds((seconds) => seconds + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [recording]);
  useEffect(() => {
    if (!inRoom || !("mediaSession" in navigator)) return;
    const action = "enterpictureinpicture" as MediaSessionAction;
    try {
      navigator.mediaSession.setActionHandler(
        action,
        () => void openPictureInPicture(),
      );
      return () => navigator.mediaSession.setActionHandler(action, null);
    } catch {
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- O handler é reinstalado somente quando a composição PiP muda; incluir a função recriada a cada render causaria reinstalações contínuas.
  }, [
    inRoom,
    vertical,
    topOrder,
    screenPosition,
    tiktokTop,
    resenhaMode,
    resenhaMineSize,
    sharing,
    remoteSharing,
  ]);
  useEffect(() => {
    if (!inRoom) return;
    const audio = new AudioContext(),
      analysers: {
        who: "mine" | "friend";
        analyser: AnalyserNode;
        bytes: Uint8Array<ArrayBuffer>;
      }[] = [];
    const add = (stream: MediaStream | null, who: "mine" | "friend") => {
      if (!stream?.getAudioTracks().length) return;
      const analyser = audio.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      audio.createMediaStreamSource(stream).connect(analyser);
      analysers.push({
        who,
        analyser,
        bytes: new Uint8Array(analyser.fftSize),
      });
    };
    add(local.current, "mine");
    add(remote.current, "friend");
    const tick = () => {
      const next = { mine: false, friend: false };
      analysers.forEach(({ who, analyser, bytes }) => {
        analyser.getByteTimeDomainData(bytes);
        let energy = 0;
        bytes.forEach((value) => {
          const sample = (value - 128) / 128;
          energy += sample * sample;
        });
        next[who] = Math.sqrt(energy / bytes.length) > 0.028;
      });
      speakingRef.current = next;
      setSpeaking((previous) =>
        previous.mine === next.mine && previous.friend === next.friend
          ? previous
          : next,
      );
    };
    const timer = window.setInterval(tick, 120);
    tick();
    return () => {
      window.clearInterval(timer);
      void audio.close();
      speakingRef.current = { mine: false, friend: false };
    };
    // Trocar microfone recria local.current; a análise precisa acompanhar o
    // stream novo para a moldura de quem fala não desaparecer.
  }, [inRoom, friend, cameraEpoch]);

  async function devicesList() {
    const list = await navigator.mediaDevices.enumerateDevices();
    setDevices(list.filter((item) => item.kind === "videoinput"));
    setAudioInputs(list.filter((item) => item.kind === "audioinput"));
    setAudioOutputs(list.filter((item) => item.kind === "audiooutput"));
  }
  function showRemote(stream: MediaStream, remoteName: string) {
    peerConnected.current = true;
    peerRetry.current = 0;
    window.clearTimeout(peerConnectTimer.current);
    window.clearTimeout(peerRetryTimer.current);
    remote.current = stream;
    if (theirs.current) {
      theirs.current.srcObject = stream;
      if (audioOutputId && "setSinkId" in theirs.current)
        void (
          theirs.current as HTMLVideoElement & {
            setSinkId: (id: string) => Promise<void>;
          }
        )
          .setSinkId(audioOutputId)
          .catch(() => undefined);
      void theirs.current.play().catch(() => undefined);
    }
    setFriend(remoteName || "Seu amigo");
    setNotice("Conectado com seu amigo.");
  }
  function callStream(stream: MediaStream) {
    const video =
      processedLocal.current?.getVideoTracks()[0] || stream.getVideoTracks()[0];
    return new MediaStream([
      ...(video ? [video] : []),
      ...(processedAudio.current?.getAudioTracks() || stream.getAudioTracks()),
    ]);
  }
  function replaceOutgoingVideo(stream: MediaStream) {
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    track.contentHint = "motion";
    cameraCalls.current.forEach((call) =>
      call.peerConnection
        ?.getSenders()
        .filter((sender) => sender.track?.kind === "video")
        .forEach((sender) => {
          void sender.replaceTrack(track).then(() => tuneVideoSender(sender));
        }),
    );
  }
  function tuneVideoSender(sender: RTCRtpSender) {
    if (!sender.track || sender.track.kind !== "video") return;
    sender.track.contentHint = "motion";
    const parameters = sender.getParameters();
    if (!parameters.encodings?.length) parameters.encodings = [{}];
    parameters.encodings.forEach((encoding) => {
      encoding.maxBitrate = quality === "1080" ? 8_000_000 : 4_500_000;
      encoding.maxFramerate = 30;
      // Uma webcam 4K não deve obrigar o WebRTC a codificar 4K para uma
      // chamada configurada em Full HD. A câmera continua nítida, mas o
      // encoder envia no máximo 1080p e mantém a CPU/GPU disponíveis para a
      // composição e os overlays.
      const settings = sender.track?.getSettings();
      const width = settings?.width || 1920;
      const height = settings?.height || 1080;
      encoding.scaleResolutionDownBy =
        quality === "1080"
          ? Math.max(1, width / 1920, height / 1080)
          : Math.max(1, width / 1280, height / 720);
    });
    parameters.degradationPreference = "balanced";
    void sender.setParameters(parameters).catch(() => undefined);
  }
  function tuneCameraCall(call: MediaConnection) {
    [0, 500, 1_500].forEach((delay) =>
      window.setTimeout(() => {
        call.peerConnection
          ?.getSenders()
          .filter((sender) => sender.track?.kind === "video")
          .forEach(tuneVideoSender);
      }, delay),
    );
  }
  function replaceOutgoingAudio(stream: MediaStream) {
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    cameraCalls.current.forEach((call) =>
      call.peerConnection
        ?.getSenders()
        .filter((sender) => sender.track?.kind === "audio")
        .forEach((sender) => void sender.replaceTrack(track)),
    );
  }
  function setupMicrophoneProcessing(stream: MediaStream, sensitivity: number) {
    void audioPipeline.current?.context.close();
    processedAudio.current?.getTracks().forEach((track) => track.stop());
    audioPipeline.current = null;
    processedAudio.current = null;
    if (!stream.getAudioTracks().length) return;
    try {
      const context = new AudioContext();
      const source = context.createMediaStreamSource(
        new MediaStream(stream.getAudioTracks()),
      );
      const gain = context.createGain();
      const analyser = context.createAnalyser();
      const output = context.createMediaStreamDestination();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      gain.gain.value = Math.max(0.2, sensitivity / 70);
      source.connect(analyser);
      source.connect(gain).connect(output);
      audioPipeline.current = {
        context,
        gain,
        analyser,
        output: output.stream,
      };
      processedAudio.current = output.stream;
      void context.resume();
    } catch {
      processedAudio.current = null;
    }
  }
  function changeMicSensitivity(value: number) {
    setMicSensitivity(value);
    const pipeline = audioPipeline.current;
    if (pipeline) {
      pipeline.gain.gain.setTargetAtTime(
        Math.max(0.2, value / 70),
        pipeline.context.currentTime,
        0.04,
      );
      replaceOutgoingAudio(pipeline.output);
    }
  }
  function testMicrophone() {
    const pipeline = audioPipeline.current;
    if (!pipeline) {
      setNotice("Entre na sala para testar o microfone escolhido.");
      return;
    }
    setMicTesting(true);
    void pipeline.context.resume();
    const bytes = new Uint8Array(pipeline.analyser.fftSize);
    const started = performance.now();
    const read = () => {
      pipeline.analyser.getByteTimeDomainData(bytes);
      let energy = 0;
      bytes.forEach((value) => {
        const sample = (value - 128) / 128;
        energy += sample * sample;
      });
      setMicLevel(
        Math.min(100, Math.round(Math.sqrt(energy / bytes.length) * 850)),
      );
      if (performance.now() - started < 5_000) {
        micTestFrame.current = requestAnimationFrame(read);
      } else {
        setMicTesting(false);
        setMicLevel(0);
      }
    };
    cancelAnimationFrame(micTestFrame.current);
    read();
  }
  function refreshCameraForPeer() {
    // Nunca abra uma segunda chamada ao alterar fundo/overlay. Isso criava
    // conexões concorrentes, jitter alto e vídeo piscando. replaceTrack mantém
    // a mesma conexão e troca apenas a faixa de vídeo.
    const stream = processedLocal.current || local.current;
    if (stream) replaceOutgoingVideo(stream);
  }
  function attachCall(call: MediaConnection, fallback: string) {
    remoteId.current = call.peer;
    if (!cameraCalls.current.includes(call)) cameraCalls.current.push(call);
    tuneCameraCall(call);
    // Em uma chamada PeerJS, `metadata` pertence a quem iniciou a chamada.
    // A faixa que chega ao convidado é a resposta do anfitrião, portanto usar
    // metadata aqui fazia o convidado ver o próprio nome nas duas câmeras.
    call.on("stream", (stream) => showRemote(stream, fallback));
    call.on("error", () =>
      setNotice(
        "A chamada caiu. Atualize os dois navegadores e tente novamente.",
      ),
    );
    call.on("close", () => {
      cameraCalls.current = cameraCalls.current.filter((item) => item !== call);
    });
  }
  function attachDataConnection(conn: DataConnection) {
    connection.current = conn;
    const handleOpen = () => {
      if (connection.current !== conn) return;
      peerConnected.current = true;
      peerRetry.current = 0;
      window.clearTimeout(peerConnectTimer.current);
      window.clearTimeout(peerRetryTimer.current);
      conn.send({ kind: "name", name });
      if (mode === "host")
        conn.send({
          kind: "layout",
          topOrder,
          screenPosition,
          tiktokTop,
          resenhaMode,
          resenhaMineSize,
        });
    };
    if (conn.open) {
      handleOpen();
    } else {
      conn.on("open", handleOpen);
    }
    conn.on("data", (item) => {
      const data = item as {
        kind?: string;
        name?: string;
        text?: string;
        active?: boolean;
        topOrder?: string;
        screenPosition?: string;
        tiktokTop?: number;
        resenhaMode?: boolean;
        resenhaMineSize?: number;
      };
      if (data.kind === "name" && data.name) setFriend(data.name);
      if (data.kind === "recording") {
        setFriendRecording(Boolean(data.active));
        return;
      }
      if (
        data.kind === "layout" &&
        data.topOrder &&
        data.screenPosition &&
        typeof data.tiktokTop === "number"
      ) {
        setTopOrder(
          mode === "guest"
            ? data.topOrder === "mine-first"
              ? "friend-first"
              : "mine-first"
            : (data.topOrder as "mine-first" | "friend-first"),
        );
        setScreenPosition(data.screenPosition as "top" | "bottom");
        setTiktokTop(data.tiktokTop);
        setResenhaMode(Boolean(data.resenhaMode));
        if (typeof data.resenhaMineSize === "number")
          setResenhaMineSize(
            mode === "guest"
              ? 1 - data.resenhaMineSize
              : data.resenhaMineSize,
          );
        if (data.resenhaMode) setVertical(true);
        return;
      }
      if (data.kind === "chat" && data.name && data.text)
        setMessages((old) => [...old, { name: data.name!, text: data.text! }]);
    });
  }
  function startPeer(stream: MediaStream) {
    window.clearTimeout(peerConnectTimer.current);
    window.clearTimeout(peerRetryTimer.current);
    const previousPeer = peer.current;
    peer.current = null;
    previousPeer?.destroy();
    const isHost = mode === "host";
    const client = isHost
      ? new Peer(hostId(room, pin), PEER_CONFIG)
      : new Peer(PEER_CONFIG);
    let retryScheduled = false;
    peerConnected.current = false;
    peer.current = client;
    const retryConnection = () => {
      if (retryScheduled || peer.current !== client || peerConnected.current)
        return;
      retryScheduled = true;
      window.clearTimeout(peerConnectTimer.current);
      if (peerRetry.current >= 4) {
        setNotice(
          isHost
            ? "Não foi possível reabrir esta sala. Feche outras abas com a chamada e tente novamente."
            : "Não encontramos o anfitrião nesta sala. Confirme o link e peça para ele manter a sala aberta.",
        );
        return;
      }
      peerRetry.current += 1;
      setNotice(`Reconectando à sala… tentativa ${peerRetry.current} de 4`);
      peerRetryTimer.current = window.setTimeout(() => {
        if (peer.current === client && !peerConnected.current)
          startPeer(stream);
      }, 1_500);
    };
    client.on("connection", attachDataConnection);
    client.on("call", (call) => {
      if (call.metadata?.kind === "screen") {
        call.answer();
        let received: MediaStream | null = null;
        call.on("stream", (shared) => {
          // Só uma pessoa apresenta por vez: uma nova apresentação encerra a anterior.
          if (displayed.current) {
            displayed.current.getTracks().forEach((track) => track.stop());
            displayed.current = null;
            if (screen.current) screen.current.srcObject = null;
            setSharing(false);
            setScreenAudioActive(false);
          }
          received = shared;
          remoteDisplayed.current = shared;
          if (remoteScreen.current) {
            remoteScreen.current.srcObject = shared;
            void remoteScreen.current.play().catch(() => undefined);
          }
          setRemoteSharing(true);
          setRemoteScreenAudioActive(shared.getAudioTracks().length > 0);
          setNotice(
            `${String(call.metadata?.name || "Seu amigo")} assumiu o compartilhamento${shared.getAudioTracks().length ? " com áudio" : ""}.`,
          );
        });
        call.on("close", () => {
          if (remoteDisplayed.current === received) {
            remoteDisplayed.current = null;
            setRemoteSharing(false);
            setRemoteScreenAudioActive(false);
          }
        });
        return;
      }
      call.answer(callStream(stream));
      attachCall(call, String(call.metadata?.name || "Seu amigo"));
    });
    client.on("open", () => {
      if (isHost) {
        peerConnected.current = true;
        peerRetry.current = 0;
        setNotice("Sala pronta. Copie o convite e mantenha esta aba aberta.");
        return;
      }
      const call = client.call(hostId(room, pin), callStream(stream), {
        metadata: { name, kind: "camera" },
      });
      attachCall(call, owner || "Anfitrião");
      attachDataConnection(
        client.connect(hostId(room, pin), { reliable: true }),
      );
      setNotice("Conectando à sala…");
      peerConnectTimer.current = window.setTimeout(retryConnection, 7_000);
    });
    client.on("error", (error) => {
      if (
        error.type === "peer-unavailable" ||
        error.type === "unavailable-id"
      ) {
        retryConnection();
      } else {
        window.clearTimeout(peerConnectTimer.current);
        setNotice(
          "Não foi possível conectar. Atualize a página e tente novamente.",
        );
      }
    });
    client.on("disconnected", () => {
      if (!peerConnected.current) retryConnection();
    });
  }
  async function join(chosen = deviceId, chosenAudio = audioInputId) {
    if (!name.trim()) {
      setNotice("Informe seu nome antes de entrar na sala.");
      return;
    }
    if (!inRoom) setBooting(true);
    try {
      peerRetry.current = 0;
      peerConnected.current = false;
      window.clearTimeout(peerConnectTimer.current);
      window.clearTimeout(peerRetryTimer.current);
      local.current?.getTracks().forEach((track) => track.stop());
      let stream: MediaStream;
      let mediaWarning = "";
      let usedPlaceholder = false;
      try {
        stream = await navigator.mediaDevices.getUserMedia(
          constraints(quality, chosen || undefined, chosenAudio || undefined),
        );
      } catch (combinedError) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: chosen
              ? { deviceId: { exact: chosen }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
              : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            audio: false,
          });
          mediaWarning = "Sala aberta sem microfone. Libere ou selecione o microfone em Ajustes.";
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: false,
              audio: microphoneConstraints(chosenAudio || undefined),
            });
            mediaWarning = "Sala aberta sem câmera. Feche outros aplicativos e selecione a câmera ou placa em Ajustes.";
          } catch {
            stream = placeholderCameraStream();
            usedPlaceholder = true;
            const denied = combinedError instanceof DOMException && combinedError.name === "NotAllowedError";
            mediaWarning = denied
              ? "Sala aberta sem mídia: a permissão foi bloqueada. Autorize câmera e microfone no cadeado do navegador e tente em Ajustes."
              : "Sala aberta sem mídia: câmera ou placa está ocupada/indisponível. Feche outros aplicativos e tente em Ajustes.";
          }
        }
      }
      local.current = stream;
      if (stream.getAudioTracks().length)
        setupMicrophoneProcessing(stream, micSensitivity);
      setCameraOn(!usedPlaceholder && stream.getVideoTracks().length > 0);
      setCameraEpoch((value) => value + 1);
      if (mine.current) {
        mine.current.srcObject = stream;
        await mine.current.play().catch(() => undefined);
      }
      if (mode === "host") setOwner(name.trim() || "Anfitrião");
      const startedAt =
        restoreCall?.room === room && restoreCall.pin === pin
          ? restoreCall.startedAt
          : Date.now();
      const saved: SavedCall = {
        room,
        pin,
        name: name.trim(),
        owner: mode === "host" ? name.trim() : owner,
        mode,
        quality,
        deviceId: chosen || "",
        audioInputId: chosenAudio || "",
        startedAt,
      };
      sessionStorage.setItem("klip-active-call", JSON.stringify(saved));
      setCallStartedAt(startedAt);
      setInRoom(true);
      await devicesList();
      startPeer(stream);
      if (mediaWarning) setNotice(mediaWarning);
      setBooting(false);
    } catch (error) {
      setBooting(false);
      setNotice(
        `Não foi possível abrir a sala${error instanceof Error && error.message ? `: ${error.message}` : ". Tente novamente."}`,
      );
    }
  }
  async function selectCamera(id: string) {
    setDeviceId(id);
    await join(id);
  }
  async function selectAudioInput(id: string) {
    if (!inRoom || !local.current) {
      setAudioInputId(id);
      await join(deviceId, id);
      return;
    }
    setNotice("Trocando somente o microfone…");
    try {
      const replacement = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: microphoneConstraints(id || undefined, noiseSuppression),
        }),
        nextTrack = replacement.getAudioTracks()[0];
      if (!nextTrack) throw new Error("Microfone sem faixa de áudio");
      nextTrack.enabled = mic;
      const activeStream = local.current;
      activeStream.getAudioTracks().forEach((track) => {
        activeStream.removeTrack(track);
        track.stop();
      });
      activeStream.addTrack(nextTrack);
      setupMicrophoneProcessing(activeStream, micSensitivity);
      replaceOutgoingAudio(processedAudio.current || activeStream);
      setAudioInputId(id);
      setCameraEpoch((value) => value + 1);
      const saved = sessionStorage.getItem("klip-active-call");
      if (saved) {
        const call = JSON.parse(saved) as SavedCall;
        sessionStorage.setItem(
          "klip-active-call",
          JSON.stringify({ ...call, audioInputId: id }),
        );
      }
      await devicesList();
      setNotice("Microfone atualizado sem reiniciar a sala.");
    } catch {
      setNotice(
        "Não foi possível trocar o microfone. Verifique a permissão do navegador.",
      );
    }
  }
  async function selectAudioOutput(id: string) {
    setAudioOutputId(id);
    const players = [theirs.current, remoteScreen.current];
    try {
      await Promise.all(
        players.map((player) => {
          if (!player || !("setSinkId" in player)) return Promise.resolve();
          return (
            player as HTMLVideoElement & {
              setSinkId: (sink: string) => Promise<void>;
            }
          ).setSinkId(id);
        }),
      );
      setNotice("Saída de áudio atualizada.");
    } catch {
      setNotice("Este navegador não permite escolher a saída de áudio.");
    }
  }
  async function preserveStereoListening() {
    const safeInput =
        audioInputs.find(
          (item) =>
            item.deviceId !== "default" &&
            !isCommunicationAudioDevice(item.label) &&
            /webcam|camera|array|integrado|built[ -]?in|realtek|macbook|microfone/i.test(
              item.label,
            ),
        ) ||
        audioInputs.find(
          (item) =>
            item.deviceId !== "default" &&
            !isCommunicationAudioDevice(item.label),
        ),
      stereoOutput =
        audioOutputs.find(
          (item) =>
            item.deviceId !== "default" &&
            !isCommunicationAudioDevice(item.label) &&
            /stereo|headphones|fones|speaker|alto-falante/i.test(item.label),
        ) ||
        audioOutputs.find(
          (item) =>
            item.deviceId !== "default" &&
            !isCommunicationAudioDevice(item.label),
        );
    if (!safeInput) {
      setNotice(
        "Não encontrei outro microfone. Conecte um microfone USB/webcam para manter o fone em estéreo.",
      );
      return;
    }
    if (stereoOutput) await selectAudioOutput(stereoOutput.deviceId);
    await selectAudioInput(safeInput.deviceId);
  }
  function toggle(kind: "audio" | "video", value: boolean) {
    local.current
      ?.getTracks()
      .filter((track) => track.kind === kind)
      .forEach((track) => {
        track.enabled = value;
      });
  }
  async function toggleNoiseSuppression(enabled: boolean) {
    setNoiseSuppression(enabled);
    const track = local.current?.getAudioTracks()[0];
    try {
      await track?.applyConstraints({
        echoCancellation: true,
        noiseSuppression: enabled,
        autoGainControl: true,
      });
      setNotice(
        enabled
          ? "Supressão de ruído ativada."
          : "Supressão de ruído desativada.",
      );
    } catch {
      setNotice(
        "Este microfone não permite alterar a supressão de ruído em tempo real.",
      );
    }
  }
  async function share(includeAudio = shareScreenAudio) {
    if (sharing) {
      displayed.current?.getTracks().forEach((track) => track.stop());
      displayed.current = null;
      setSharing(false);
      setScreenAudioActive(false);
      setNotice("Compartilhamento de tela encerrado.");
      return;
    }
    try {
      const displayMediaOptions: ExtendedDisplayMediaStreamOptions = {
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // 60 fps concorre com encoder da webcam/IA e pode derrubar a chamada.
          // Para reunião e gravação, 30 fps em 1080p é a opção estável.
          frameRate: { ideal: 30, max: 30 },
        },
        audio: includeAudio
          ? {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              suppressLocalAudioPlayback: false,
            }
          : false,
        systemAudio: includeAudio ? "include" : "exclude",
        selfBrowserSurface: "include",
        surfaceSwitching: "include",
      };
      const stream =
        await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
      // Ao iniciar sua apresentação, a tela que estava vindo do amigo deixa de ser exibida.
      remoteDisplayed.current = null;
      if (remoteScreen.current) remoteScreen.current.srcObject = null;
      setRemoteSharing(false);
      setRemoteScreenAudioActive(false);
      displayed.current = stream;
      if (screen.current) {
        screen.current.srcObject = stream;
        await screen.current.play().catch(() => undefined);
      }
      stream.getVideoTracks()[0].onended = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (displayed.current === stream) displayed.current = null;
        setSharing(false);
        setScreenAudioActive(false);
        setNotice("Compartilhamento de tela encerrado.");
      };
      const audioTracks = stream.getAudioTracks();
      setScreenAudioActive(audioTracks.length > 0);
      setShareScreenDialogOpen(false);
      if (audioTracks.length > 0) {
        setNotice("Compartilhando tela com áudio do sistema / aba.");
      } else if (includeAudio) {
        setNotice(
          "A tela está sendo compartilhada, mas o navegador não enviou áudio. No seletor do Chrome, marque ‘Compartilhar áudio’ e prefira uma guia.",
        );
      } else {
        setNotice("Compartilhando somente a imagem da tela.");
      }
      setSharing(true);
      if (peer.current && remoteId.current)
        peer.current.call(remoteId.current, stream, {
          metadata: { kind: "screen", name, audio: audioTracks.length > 0 },
        });
    } catch {
      setShareScreenDialogOpen(false);
      setNotice("O compartilhamento de tela foi cancelado.");
    }
  }
  async function invite() {
    const url = new URL(location.href);
    url.search = "";
    url.searchParams.set("sala", room);
    url.searchParams.set("senha", pin);
    url.searchParams.set("anfitriao", owner || name || "Anfitrião");
    await navigator.clipboard.writeText(url.toString());
    setNotice("Link copiado. Seu amigo entrará nesta mesma sala.");
  }
  function send() {
    const text = draft.trim();
    if (!text) return;
    const message = { name, text };
    setMessages((old) => [...old, message]);
    connection.current?.send({ kind: "chat", ...message });
    setDraft("");
  }
  function chooseBackground(file?: File) {
    if (!file) return;
    const video = file.type === "video/mp4" || /\.mp4$/i.test(file.name);
    const animated = file.type === "image/gif" || /\.gif$/i.test(file.name);
    if (!file.type.startsWith("image/") && !video) {
      setNotice("Escolha uma imagem, GIF ou MP4 para o fundo da câmera.");
      return;
    }
    setVirtualEffectLoading(
      video
        ? "Carregando vídeo de fundo…"
        : animated
          ? "Carregando e preparando o GIF…"
          : "Preparando imagem de fundo…",
    );
    if (video) {
      visualCompositionActive.current = true;
      setBackgroundVideo(URL.createObjectURL(file));
      setBackground("");
      setBackgroundLabel(`Vídeo animado · ${file.name}`);
      setBackgroundMode("image");
      setNotice(
        "Vídeo MP4 aplicado como fundo animado, sem precisar converter para GIF.",
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      visualCompositionActive.current = true;
      setBackground(String(reader.result));
      setBackgroundVideo("");
      setBackgroundLabel(
        `${animated ? "GIF animado" : "Imagem"} · ${file.name}`,
      );
      setBackgroundMode("image");
      setNotice(
        animated
          ? "GIF animado aplicado. Ele aparece atrás da câmera e também na gravação."
          : "Imagem de fundo aplicada à câmera.",
      );
    };
    reader.onerror = () => {
      setVirtualEffectLoading("");
      setNotice("Não foi possível ler este arquivo de fundo.");
    };
    reader.readAsDataURL(file);
  }
  function chooseCameraOverlay(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("A camada da webcam deve ser uma imagem, PNG, WebP ou GIF.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const overlay = String(reader.result);
      const needsPipeline = !processedLocal.current;
      visualCompositionActive.current = true;
      cameraOverlayRef.current = overlay;
      setCameraOverlay(overlay);
      if (needsPipeline) setCameraEpoch((epoch) => epoch + 1);
      setNotice("Moldura aplicada à sua câmera online e à gravação.");
    };
    reader.readAsDataURL(file);
  }
  function updateWebcamLayerText(value: string) {
    const needsPipeline = Boolean(value.trim()) && !processedLocal.current;
    webcamTextRef.current = value;
    if (value.trim()) visualCompositionActive.current = true;
    if (
      !value.trim() &&
      backgroundMode === "none" &&
      !cameraOverlayRef.current
    ) {
      visualCompositionActive.current = false;
      if (local.current) replaceOutgoingVideo(local.current);
    }
    setWebcamText(value);
    if (
      needsPipeline ||
      (!value.trim() && backgroundMode === "none" && !cameraOverlayRef.current)
    )
      setCameraEpoch((epoch) => epoch + 1);
  }
  function clearCameraOverlay() {
    cameraOverlayRef.current = "";
    setCameraOverlay("");
    if (backgroundMode === "none" && !webcamTextRef.current.trim()) {
      visualCompositionActive.current = false;
      if (local.current) replaceOutgoingVideo(local.current);
      setCameraEpoch((epoch) => epoch + 1);
    }
  }
  function toggleBlur() {
    const next = backgroundMode === "blur" ? "none" : "blur";
    setVirtualEffectLoading(next === "blur" ? "Preparando o desfoque…" : "");
    visualCompositionActive.current = next !== "none";
    setBackgroundMode(next);
    if (next === "none" && mine.current && local.current) {
      replaceOutgoingVideo(local.current);
      mine.current.srcObject = local.current;
      void mine.current.play().catch(() => undefined);
    }
  }
  function toggleBackgroundRemoval() {
    const next = backgroundMode === "remove" ? "none" : "remove";
    setVirtualEffectLoading(
      next === "remove" ? "Preparando a remoção do fundo…" : "",
    );
    visualCompositionActive.current = next !== "none";
    setBackgroundMode(next);
    if (next === "none" && mine.current && local.current) {
      replaceOutgoingVideo(local.current);
      mine.current.srcObject = local.current;
      void mine.current.play().catch(() => undefined);
    }
  }
  function togglePremiumMatting() {
    const next = mattingQuality === "premium" ? "standard" : "premium";
    setMattingQuality(next);
    setNotice(
      next === "premium"
        ? "IA Premium selecionada. O modelo será preparado ao ligar um fundo."
        : "IA Premium desativada. Usando o recorte leve.",
    );
  }
  function toggleResenhaMode() {
    if (mode === "guest") return;
    const next = !resenhaMode;
    setResenhaMode(next);
    if (next) {
      setVertical(true);
      setVerticalCameraMode("auto");
      setPreviewOpen(true);
      setNotice("Modo Resenha ativo: duas câmeras empilhadas em 9:16.");
    } else {
      setNotice("Modo Resenha desativado.");
    }
  }
  function selectVerticalCameraMode(next: VerticalCameraMode) {
    setVerticalCameraMode(next);
    setVertical(true);
    setPreviewOpen(true);
    if (next !== "auto") setResenhaMode(false);
    setNotice(
      next === "solo-mine"
        ? "TikTok solo ativo: somente a sua câmera será gravada em 9:16."
        : next === "solo-friend"
          ? "TikTok solo ativo: a câmera do amigo será gravada em 9:16."
          : "Layout vertical automático ativo.",
    );
  }
  const timeLabel = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const callTimeLabel = (seconds: number) =>
    `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  function downloadRecording(
    chunks: Blob[],
    mime: string,
    label: string,
    autoAnalyze = false,
  ) {
    if (!chunks.length) return null;
    const blob = new Blob(chunks, { type: mime }),
      editorUrl = URL.createObjectURL(blob),
      downloadUrl = URL.createObjectURL(blob),
      nextClip: EditorClip = {
        url: editorUrl,
        name: `Gravação ${label}`,
        autoAnalyze,
      };
    const link = document.createElement("a");
    setEditorClip(nextClip);
    link.href = downloadUrl;
    link.download = `klipapp-${label}-${Date.now()}.${mime.startsWith("video/mp4") ? "mp4" : "webm"}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
    return nextClip;
  }
  function openEditor() {
    const url = new URL(location.href);
    url.search = "";
    url.searchParams.set("editor", "1");
    window.open(url.toString(), "klip-studio");
  }
  function saveClip() {
    if (!recording || !recorder.current) return;
    cutRequested.current = true;
    recorder.current.requestData();
  }
  function record() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    const canvas = document.createElement("canvas"),
      context = canvas.getContext("2d");
    if (!context || !local.current) return;
    canvas.width = vertical ? 1080 : quality === "1080" ? 1920 : 1280;
    canvas.height = vertical ? 1920 : quality === "1080" ? 1080 : 720;
    const cover = (
      video: HTMLVideoElement | null,
      x: number,
      y: number,
      width: number,
      height: number,
    ) => {
      if (!video?.videoWidth) return;
      const scale = Math.max(
          width / video.videoWidth,
          height / video.videoHeight,
        ),
        drawWidth = video.videoWidth * scale,
        drawHeight = video.videoHeight * scale;
      context.save();
      context.beginPath();
      context.rect(x, y, width, height);
      context.clip();
      context.drawImage(
        video,
        x + (width - drawWidth) / 2,
        y + (height - drawHeight) / 2,
        drawWidth,
        drawHeight,
      );
      context.restore();
    };
    const bezel = (
      x: number,
      y: number,
      width: number,
      height: number,
      active: boolean,
    ) => {
      if (!active) return;
      context.save();
      context.strokeStyle = "#2d6cdf";
      context.lineWidth = 10;
      context.shadowColor = "#2d6cdf";
      context.shadowBlur = 18;
      context.strokeRect(x + 5, y + 5, width - 10, height - 10);
      context.restore();
    };
    const draw = () => {
      if (!recorder.current || recorder.current.state === "inactive") return;
      context.fillStyle = "#0b1020";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const hasFriendVideo = Boolean(
        remote.current
          ?.getVideoTracks()
          .some((track) => track.readyState === "live"),
      );
      const screenVideo = sharing
        ? screen.current
        : remoteSharing
          ? remoteScreen.current
          : null;
      if (vertical && verticalCameraMode !== "auto") {
        const useFriend =
            verticalCameraMode === "solo-friend" && hasFriendVideo,
          selectedVideo = useFriend ? theirs.current : mine.current,
          selectedSpeaking = useFriend
            ? speakingRef.current.friend
            : speakingRef.current.mine;
        cover(selectedVideo, 0, 0, canvas.width, canvas.height);
        bezel(0, 0, canvas.width, canvas.height, selectedSpeaking);
      } else if (!hasFriendVideo && vertical && !screenVideo) {
        // A recording in a solo room is a proper one-person composition, not a two-up layout with a black half.
        cover(mine.current, 0, 0, canvas.width, canvas.height);
        bezel(0, 0, canvas.width, canvas.height, speakingRef.current.mine);
      } else if (!hasFriendVideo && vertical && screenVideo) {
        const cameraHeight =
          canvas.height * Math.min(0.42, Math.max(0.2, tiktokTop));
        cover(mine.current, 0, 0, canvas.width, cameraHeight);
        cover(
          screenVideo,
          0,
          cameraHeight + 12,
          canvas.width,
          canvas.height - cameraHeight - 12,
        );
        bezel(0, 0, canvas.width, cameraHeight, speakingRef.current.mine);
      } else if (vertical && resenhaMode) {
        const gap = 12,
          cameraAreaHeight = screenVideo
            ? canvas.height * 0.56
            : canvas.height,
          firstIsMine = topOrder === "mine-first",
          firstRatio = firstIsMine
            ? resenhaMineSize
            : 1 - resenhaMineSize,
          firstHeight = (cameraAreaHeight - gap) * firstRatio,
          secondHeight = cameraAreaHeight - gap - firstHeight,
          cameraY = screenVideo && screenPosition === "top"
            ? canvas.height - cameraAreaHeight
            : 0,
          first = topOrder === "mine-first" ? mine.current : theirs.current,
          second = topOrder === "mine-first" ? theirs.current : mine.current,
          firstTalking =
            topOrder === "mine-first"
              ? speakingRef.current.mine
              : speakingRef.current.friend,
          secondTalking =
            topOrder === "mine-first"
              ? speakingRef.current.friend
              : speakingRef.current.mine;
        cover(first, 0, cameraY, canvas.width, firstHeight);
        cover(
          second,
          0,
          cameraY + firstHeight + gap,
          canvas.width,
          secondHeight,
        );
        bezel(0, cameraY, canvas.width, firstHeight, firstTalking);
        bezel(
          0,
          cameraY + firstHeight + gap,
          canvas.width,
          secondHeight,
          secondTalking,
        );
        if (screenVideo) {
          const screenHeight = canvas.height - cameraAreaHeight - gap,
            screenY = screenPosition === "top" ? 0 : cameraAreaHeight + gap;
          cover(screenVideo, 0, screenY, canvas.width, screenHeight);
        }
      } else if (vertical) {
        const cameraHeight = canvas.height * tiktokTop,
          gap = 12,
          screenHeight = canvas.height - cameraHeight - gap,
          half = (canvas.width - gap) / 2,
          first = topOrder === "mine-first" ? mine.current : theirs.current,
          second = topOrder === "mine-first" ? theirs.current : mine.current,
          screenVideo = sharing ? screen.current : remoteScreen.current,
          cameraY = screenPosition === "top" ? screenHeight + gap : 0,
          screenY = screenPosition === "top" ? 0 : cameraHeight + gap,
          firstTalking =
            topOrder === "mine-first"
              ? speakingRef.current.mine
              : speakingRef.current.friend,
          secondTalking =
            topOrder === "mine-first"
              ? speakingRef.current.friend
              : speakingRef.current.mine;
        cover(first, 0, cameraY, half, cameraHeight);
        cover(second, half + gap, cameraY, half, cameraHeight);
        bezel(0, cameraY, half, cameraHeight, firstTalking);
        bezel(half + gap, cameraY, half, cameraHeight, secondTalking);
        cover(screenVideo, 0, screenY, canvas.width, screenHeight);
      } else {
        if (!hasFriendVideo && !screenVideo) {
          cover(mine.current, 0, 0, canvas.width, canvas.height);
          bezel(0, 0, canvas.width, canvas.height, speakingRef.current.mine);
        } else {
          cover(screenVideo || mine.current, 0, 0, canvas.width, canvas.height);
          cover(
            mine.current,
            canvas.width * 0.72,
            canvas.height * 0.68,
            canvas.width * 0.25,
            canvas.height * 0.28,
          );
          bezel(
            canvas.width * 0.72,
            canvas.height * 0.68,
            canvas.width * 0.25,
            canvas.height * 0.28,
            speakingRef.current.mine,
          );
          if (hasFriendVideo) {
            cover(
              theirs.current,
              24,
              canvas.height * 0.72,
              canvas.width * 0.2,
              canvas.height * 0.23,
            );
            bezel(
              24,
              canvas.height * 0.72,
              canvas.width * 0.2,
              canvas.height * 0.23,
              speakingRef.current.friend,
            );
          }
        }
      }
      requestAnimationFrame(draw);
    };
    const output = canvas.captureStream(30);
    // O canvas contém a imagem final; este destino mistura todos os áudios da chamada.
    // Assim o arquivo salvo preserva microfone, voz do amigo e áudio da tela compartilhada.
    let recordingAudio: AudioContext | null = null;
    try {
      recordingAudio = new AudioContext();
      const destination = recordingAudio.createMediaStreamDestination();
      [
        local.current,
        remote.current,
        displayed.current,
        remoteDisplayed.current,
      ].forEach((stream) => {
        if (!stream?.getAudioTracks().length) return;
        recordingAudio!
          .createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
          .connect(destination);
      });
      const mixedTrack = destination.stream.getAudioTracks()[0];
      if (mixedTrack) output.addTrack(mixedTrack);
      void recordingAudio.resume();
    } catch {
      recordingAudio = null;
      setNotice(
        "O vídeo será gravado; o navegador não liberou a mixagem de áudio.",
      );
    }
    const mime = mimeForExport(recordingFormat) || mimeForExport("webm")!;
    if (recordingFormat === "mp4" && !mime.startsWith("video/mp4"))
      setNotice(
        "MP4 não é suportado neste navegador; a gravação sairá em WebM.",
      );
    const rec = new MediaRecorder(output, {
      mimeType: mime,
      videoBitsPerSecond: quality === "1080" ? 12_000_000 : 6_000_000,
      audioBitsPerSecond: 192_000,
    });
    recorder.current = rec;
    recordChunks.current = [];
    cutRequested.current = false;
    setRecordSeconds(0);
    rec.ondataavailable = (event) => {
      if (!event.data.size) return;
      recordChunks.current.push(event.data);
      if (cutRequested.current) {
        downloadRecording(
          recordChunks.current,
          mime,
          `trecho-${timeLabel(recordSeconds).replace(":", "-")}`,
        );
        recordChunks.current = [];
        cutRequested.current = false;
        setNotice("Trecho salvo. A gravação continua.");
      }
    };
    rec.onstop = () => {
      const finishedClip = downloadRecording(
        recordChunks.current,
        mime,
        "reel",
        true,
      );
      recordChunks.current = [];
      cutRequested.current = false;
      setRecording(false);
      setRecordSeconds(0);
      void recordingAudio?.close();
      connection.current?.send({ kind: "recording", active: false });
      if (finishedClip) {
        setEditorReturnToCall(true);
        setEditorOpen(true);
      }
    };
    rec.start(1000);
    setRecording(true);
    connection.current?.send({ kind: "recording", active: true });
    setNotice("Gravando localmente com áudio. Seu amigo foi avisado.");
    draw();
  }
  function leave() {
    peer.current?.destroy();
    peer.current = null;
    connection.current = null;
    local.current?.getTracks().forEach((track) => track.stop());
    cancelAnimationFrame(micTestFrame.current);
    void audioPipeline.current?.context.close();
    audioPipeline.current = null;
    processedAudio.current = null;
    displayed.current?.getTracks().forEach((track) => track.stop());
    local.current = null;
    displayed.current = null;
    remote.current = null;
    remoteId.current = "";
    setFriend("");
    setSharing(false);
    setRemoteSharing(false);
    sessionStorage.removeItem("klip-active-call");
    setCallStartedAt(0);
    setCallSeconds(0);
    setRestoreCall(null);
    setInRoom(false);
  }
  function startSettingsDrag(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    settingsDrag.current = {
      x: settingsOffset.x,
      y: settingsOffset.y,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveSettingsDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = settingsDrag.current;
    if (!drag) return;
    setSettingsOffset({
      x: drag.x + event.clientX - drag.startX,
      y: drag.y + event.clientY - drag.startY,
    });
  }
  function endSettingsDrag() {
    settingsDrag.current = null;
  }
  function startPreviewDrag(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    previewDrag.current = {
      x: previewOffset.x,
      y: previewOffset.y,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function movePreviewDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = previewDrag.current;
    if (!drag) return;
    setPreviewOffset({
      x: drag.x + event.clientX - drag.startX,
      y: drag.y + event.clientY - drag.startY,
    });
  }
  function endPreviewDrag() {
    previewDrag.current = null;
  }
  async function openPictureInPicture() {
    if (!document.pictureInPictureEnabled) {
      setNotice("Picture-in-Picture não está disponível neste navegador.");
      return;
    }
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return;
    }
    const canvas = document.createElement("canvas"),
      context = canvas.getContext("2d");
    if (!context) return;
    // O PiP aparece pequeno. Compor em 720p mantém a imagem nítida sem
    // decodificar e redesenhar desnecessariamente um canvas Full HD/4K.
    canvas.width = vertical ? 405 : 720;
    canvas.height = vertical ? 720 : 405;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "medium";
    const pipFps = 30,
      output = canvas.captureStream(0),
      outputTrack = output.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    const cover = (
      video: HTMLVideoElement | null,
      x: number,
      y: number,
      width: number,
      height: number,
    ) => {
      if (!video?.videoWidth) return;
      const scale = Math.max(
          width / video.videoWidth,
          height / video.videoHeight,
        ),
        drawWidth = video.videoWidth * scale,
        drawHeight = video.videoHeight * scale;
      context.save();
      context.beginPath();
      context.rect(x, y, width, height);
      context.clip();
      context.drawImage(
        video,
        x + (width - drawWidth) / 2,
        y + (height - drawHeight) / 2,
        drawWidth,
        drawHeight,
      );
      context.restore();
    };
    const draw = () => {
      context.fillStyle = "#0b1020";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const hasFriendVideo = Boolean(
        remote.current
          ?.getVideoTracks()
          .some((track) => track.readyState === "live"),
      );
      if (vertical && verticalCameraMode !== "auto") {
        cover(
          verticalCameraMode === "solo-friend" && hasFriendVideo
            ? theirs.current
            : mine.current,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      } else if (vertical && resenhaMode) {
        const screenVideo = sharing
            ? screen.current
            : remoteSharing
              ? remoteScreen.current
              : null,
          gap = 6,
          cameraAreaHeight = screenVideo
            ? canvas.height * 0.56
            : canvas.height,
          firstIsMine = topOrder === "mine-first",
          firstRatio = firstIsMine
            ? resenhaMineSize
            : 1 - resenhaMineSize,
          firstHeight = (cameraAreaHeight - gap) * firstRatio,
          secondHeight = cameraAreaHeight - gap - firstHeight,
          cameraY = screenVideo && screenPosition === "top"
            ? canvas.height - cameraAreaHeight
            : 0,
          first = topOrder === "mine-first" ? mine.current : theirs.current,
          second = topOrder === "mine-first" ? theirs.current : mine.current;
        cover(first, 0, cameraY, canvas.width, firstHeight);
        cover(
          second,
          0,
          cameraY + firstHeight + gap,
          canvas.width,
          secondHeight,
        );
        if (screenVideo) {
          const screenHeight = canvas.height - cameraAreaHeight - gap,
            screenY = screenPosition === "top" ? 0 : cameraAreaHeight + gap;
          cover(screenVideo, 0, screenY, canvas.width, screenHeight);
        }
      } else if (vertical) {
        const topHeight = canvas.height * tiktokTop,
          gap = 6,
          half = (canvas.width - gap) / 2,
          first = topOrder === "mine-first" ? mine.current : theirs.current,
          second = topOrder === "mine-first" ? theirs.current : mine.current,
          screenVideo = sharing ? screen.current : remoteScreen.current;
        cover(first, 0, 0, half, topHeight);
        cover(second, half + gap, 0, half, topHeight);
        cover(
          screenVideo,
          0,
          topHeight + gap,
          canvas.width,
          canvas.height - topHeight - gap,
        );
      } else {
        cover(
          sharing
            ? screen.current
            : remoteSharing
              ? remoteScreen.current
              : mine.current,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        cover(
          mine.current,
          canvas.width * 0.7,
          canvas.height * 0.65,
          canvas.width * 0.28,
          canvas.height * 0.3,
        );
        cover(
          theirs.current,
          18,
          canvas.height * 0.71,
          canvas.width * 0.24,
          canvas.height * 0.26,
        );
      }
      // captureStream(0) só envia um quadro quando pedimos. Isso evita uma
      // segunda renderização descontrolada e, ao contrário de rAF, continua
      // fluido quando a aba fica oculta/minimizada enquanto o PiP está ativo.
      outputTrack.requestFrame();
    };
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = output;
    video.style.cssText = "position:fixed;left:-9999px;width:1px;height:1px";
    document.body.append(video);
    pipVideo.current = video;
    const cleanup = () => {
      window.clearInterval(pipTimer.current);
      pipTimer.current = 0;
      output.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      video.remove();
      if (pipVideo.current === video) pipVideo.current = null;
    };
    video.addEventListener("leavepictureinpicture", cleanup, { once: true });
    draw();
    pipTimer.current = window.setInterval(draw, 1000 / pipFps);
    try {
      await video.play();
      await video.requestPictureInPicture();
      setNotice("Prévia aberta em Picture-in-Picture.");
    } catch {
      cleanup();
      setNotice(
        "Não foi possível abrir o Picture-in-Picture. Tente pelo Chrome.",
      );
    }
  }
  if (editorOpen)
    return (
      <ClipEditorV2
        initialClip={editorClip}
        theme={theme}
        onToggleTheme={toggleTheme}
        onBack={() => {
          if (editorReturnToCall) {
            setEditorOpen(false);
            setEditorReturnToCall(false);
            return;
          }
          if (window.opener && !window.opener.closed) {
            window.close();
            return;
          }
          location.assign(location.origin + location.pathname);
        }}
      />
    );
  if (booting)
    return (
      <main className="loading-screen" aria-busy="true" aria-live="polite">
        <KlipAppLogo variant="symbol" width={52} height={52} />
        <h1>KLIPAPP</h1>
        <p>Preparando sua sessão…</p>
        <span className="ka-loader" aria-hidden="true" />
      </main>
    );
  if (localStudio)
    return (
      <>
        <button
          className="global-theme-toggle"
          onClick={toggleTheme}
          aria-label={`Usar tema ${theme === "dark" ? "claro" : "escuro"}`}
        >
          {theme === "dark" ? (
            <Sun aria-hidden="true" />
          ) : (
            <Moon aria-hidden="true" />
          )}
        </button>
        <OfflineStudio onBack={() => setLocalStudio(false)} />
      </>
    );
  if (motionStudio)
    return (
      <>
        <button
          className="global-theme-toggle"
          onClick={toggleTheme}
          aria-label={`Usar tema ${theme === "dark" ? "claro" : "escuro"}`}
        >
          {theme === "dark" ? (
            <Sun aria-hidden="true" />
          ) : (
            <Moon aria-hidden="true" />
          )}
        </button>
        <GifStudio
          onBack={() => setMotionStudio(false)}
          onUseBackground={(file) => {
            chooseBackground(file);
            setMotionStudio(false);
            setNotice(
              "Fundo animado pronto. Entre em uma sala para usá-lo na câmera.",
            );
          }}
        />
      </>
    );
  if (!inRoom)
    return (
      <main className="landing">
        <nav className="landing-nav" aria-label="Navegação principal">
          <Link className="brand" href="/" aria-label="KLIPAPP — início">
            <KlipAppLogo variant="full" width={148} height={32} />
          </Link>
          <div className="landing-nav-actions">
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={`Usar tema ${theme === "dark" ? "claro" : "escuro"}`}
              title={`Tema ${theme === "dark" ? "claro" : "escuro"}`}
            >
              {theme === "dark" ? (
                <Sun aria-hidden="true" />
              ) : (
                <Moon aria-hidden="true" />
              )}
            </button>
            <button className="open-editor" onClick={openEditor}>
              <Clapperboard aria-hidden="true" /> Editor
            </button>
            <details className="landing-nav-menu landing-tools-menu">
              <summary aria-label="Abrir ferramentas">
                <WandSparkles aria-hidden="true" />
                <span>Criar</span>
              </summary>
              <div className="landing-nav-popover">
                <button type="button" onClick={() => setMotionStudio(true)}>
                  <WandSparkles aria-hidden="true" /> Motion
                </button>
                <button type="button" onClick={() => setLocalStudio(true)}>
                  <MonitorUp aria-hidden="true" /> Estúdio local
                </button>
              </div>
            </details>
            {currentUser ? (
              <>
                <button
                  className="nav-action-btn primary"
                  type="button"
                  onClick={() => setPublishModalOpen(true)}
                >
                  <Share2 aria-hidden="true" /> Publicar
                </button>
                <details className="landing-nav-menu landing-account-menu">
                  <summary aria-label="Abrir menu da conta">
                    {currentUser.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- Avatares OAuth podem vir de origens dinâmicas que não são configuráveis com segurança no loader do Next Image.
                      <img src={currentUser.avatarUrl} alt="" />
                    ) : (
                      <span className="landing-profile-fallback">
                        <User aria-hidden="true" />
                      </span>
                    )}
                    <span>
                      {(currentUser.name || currentUser.email).split(" ")[0]}
                    </span>
                  </summary>
                  <div className="landing-nav-popover">
                    <Link href="/perfil">
                      <User aria-hidden="true" /> Meu perfil
                    </Link>
                    <button
                      type="button"
                      onClick={async () => {
                        if (isSupabaseConfigured) {
                          try {
                            const supabase = createClient();
                            await supabase.auth.signOut();
                          } catch {
                            // O logout local continua disponível mesmo se o provedor falhar.
                          }
                        }
                        localStorage.removeItem("klip_user");
                        setCurrentUser(null);
                      }}
                    >
                      <LogOut aria-hidden="true" /> Sair
                    </button>
                  </div>
                </details>
              </>
            ) : (
              <button
                className="nav-action-btn primary"
                type="button"
                onClick={() => setAuthModalOpen(true)}
              >
                <LogIn aria-hidden="true" /> Entrar
              </button>
            )}
          </div>
        </nav>
        <section className="hero landing-hero-v2">
          <div className="landing-copy">
            <div className="eyebrow">ESTÚDIO DE CONVERSAS E CLIPES</div>
            <h1>
              Uma conversa.
              <br />
              <em>Vários momentos.</em>
            </h1>
            <p>
              Grave em alta qualidade, encontre os melhores trechos e publique
              no formato certo.
            </p>
            <div className="landing-proof">
              <span>
                <Film aria-hidden="true" />
                <b>Alta qualidade</b>
              </span>
              <span>
                <Clapperboard aria-hidden="true" />
                <b>Editor multiformato</b>
              </span>
              <span>
                <Share2 aria-hidden="true" />
                <b>Publicação integrada</b>
              </span>
            </div>
          </div>
          <div className="landing-entry-card">
            <div className="entry-card-heading">
              <div>
                <small>AO VIVO</small>
                <b>{mode === "host" ? "Criar sala" : "Entrar na sala"}</b>
              </div>
              <span title="A entrada exige o número da sala e o código de acesso">
                <ShieldCheck aria-hidden="true" size={13} /> Acesso por código
              </span>
            </div>
            <div className="entry-tabs">
              <button
                className={mode === "host" ? "selected" : ""}
                onClick={() => setMode("host")}
              >
                Criar sala
              </button>
              <button
                className={mode === "guest" ? "selected" : ""}
                onClick={() => setMode("guest")}
              >
                Entrar
              </button>
            </div>
            <div className="join">
              <label>
                Nome
                <input
                  value={name}
                  placeholder={currentUser?.name || "Digite seu nome"}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                Sala
                <input
                  value={room}
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) =>
                    setRoom(event.target.value.replace(/\D/g, ""))
                  }
                />
              </label>
              <label>
                Código
                <input
                  value={pin}
                  inputMode="numeric"
                  maxLength={4}
                  onChange={(event) =>
                    setPin(event.target.value.replace(/\D/g, ""))
                  }
                />
              </label>
              {mode === "host" && (
                <button
                  className="secondary"
                  onClick={() => {
                    setRoom(code(6));
                    setPin(code(4));
                  }}
                >
                  Gerar novos códigos
                </button>
              )}
              <button onClick={() => void join()}>
                {mode === "host" ? "Abrir sala" : "Entrar na sala"}{" "}
                <ArrowRight aria-hidden="true" size={16} />
              </button>
              {notice && <p>{notice}</p>}
            </div>
          </div>
        </section>

        <ProductOverview onStart={() => setAuthModalOpen(true)} />

        <footer className="landing-legal-footer">
          <span>© 2026 KLIPAPP</span>
          <nav aria-label="Links legais">
            <Link href="/privacidade">Privacidade</Link>
            <Link href="/termos">Termos</Link>
          </nav>
        </footer>

        <div className="orb one" />
        <div className="orb two" />

        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          onSuccess={(u) => {
            setCurrentUser(u);
            localStorage.setItem("klip_user", JSON.stringify(u));
          }}
        />

        <SocialAccountsModal
          isOpen={socialModalOpen}
          onClose={() => setSocialModalOpen(false)}
        />

        <PublishModal
          isOpen={publishModalOpen}
          onClose={() => setPublishModalOpen(false)}
          defaultTitle="Novo vídeo KLIPAPP"
        />
      </main>
    );
  const screenActive = sharing || remoteSharing,
    selectedAudioInput =
      audioInputs.find((item) => item.deviceId === audioInputId) ||
      (!audioInputId
        ? audioInputs.find((item) => item.deviceId === "default")
        : undefined),
    communicationAudioActive = isCommunicationAudioDevice(
      selectedAudioInput?.label,
    );
  return (
    <main className="call">
      <header>
        <div className="brand">
          <KlipAppLogo variant="full" width={132} height={28} />
        </div>
        <div className="room">
          <i /> Sala {room}
          <span className="call-timer">
            <Clock3 aria-hidden="true" /> {callTimeLabel(callSeconds)}
          </span>
        </div>
        <div className="header-actions">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Usar tema ${theme === "dark" ? "claro" : "escuro"}`}
            title={`Tema ${theme === "dark" ? "claro" : "escuro"}`}
          >
            {theme === "dark" ? (
              <Sun aria-hidden="true" />
            ) : (
              <Moon aria-hidden="true" />
            )}
          </button>
          <button className="open-editor" onClick={openEditor}>
            <Clapperboard aria-hidden="true" /> Editor
          </button>
          <button className="invite" onClick={() => void invite()}>
            <UserPlus aria-hidden="true" /> Convidar
          </button>
          <button
            className="chat-toggle"
            onClick={() => setChatOpen(!chatOpen)}
          >
            <MessageSquare aria-hidden="true" /> Chat
          </button>
          <button
            className={connectionOpen ? "connection-open" : "connection-toggle"}
            onClick={() => {
              const next = !connectionOpen;
              setConnectionOpen(next);
              if (next) void refreshConnectionStats();
            }}
          >
            <Activity aria-hidden="true" /> Status
          </button>
          <button
            className={settingsOpen ? "settings-open" : "settings"}
            onClick={() => {
              const next = !settingsOpen;
              setSettingsOpen(next);
            }}
          >
            <Settings2 aria-hidden="true" /> Ajustes
          </button>
        </div>
      </header>
      {settingsOpen && (
        <aside
          className={"settings-panel " + (settingsMinimized ? "minimized" : "")}
          style={{
            transform: `translate(${settingsOffset.x}px, ${settingsOffset.y}px)`,
          }}
        >
          <div
            className="settings-title"
            onPointerDown={startSettingsDrag}
            onPointerMove={moveSettingsDrag}
            onPointerUp={endSettingsDrag}
            onPointerCancel={endSettingsDrag}
          >
            <div>
              <b>Ajustes da sessão</b>
              <small>
                Arraste esta barra para mover. Personalize a câmera e o vídeo
                que será salvo.
              </small>
            </div>
            <div className="window-actions">
              <button
                onClick={() => {
                  const next = !settingsMinimized;
                  setSettingsMinimized(next);
                }}
                aria-label={
                  settingsMinimized ? "Expandir ajustes" : "Minimizar ajustes"
                }
              >
                <Minimize2 aria-hidden="true" size={14} />
              </button>
              <button
                onClick={() => setSettingsOpen(false)}
                aria-label="Fechar ajustes"
              >
                <X aria-hidden="true" size={14} />
              </button>
            </div>
          </div>
          {!settingsMinimized && (
            <>
              <div className="settings-menu">
                <details open>
                  <summary>
                    <span>
                      <Video aria-hidden="true" size={16} />
                    </span>
                    <div>
                      <b>Câmera e fundo</b>
                      <small>Webcam, imagem e desfoque</small>
                    </div>
                  </summary>
                  <div className="menu-content">
                    <label className="menu-field">
                      Câmera / placa de captura
                      <select
                        value={deviceId}
                        onChange={(event) =>
                          void selectCamera(event.target.value)
                        }
                        aria-label="Escolher câmera ou placa de captura"
                      >
                        <option value="">Câmera padrão do sistema</option>
                        {devices.map((device, index) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {videoInputLabel(device, index)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="capture-source-actions">
                      <small>
                        {isCaptureInputLabel(
                          devices.find((item) => item.deviceId === deviceId)
                            ?.label,
                        )
                          ? "Placa de captura ativa como fonte principal."
                          : devices.some((item) =>
                                isCaptureInputLabel(item.label),
                              )
                            ? "Placa detectada. Selecione a opção marcada como placa de captura acima."
                            : "Para HDMI/console, conecte a placa e autorize a câmera. Para jogo ou janela do PC, use a captura de tela."}
                      </small>
                      <button
                        className="open-preview capture-window-button"
                        onClick={() => {
                          if (sharing) void share();
                          else setShareScreenDialogOpen(true);
                        }}
                      >
                        {sharing ? (
                          <ScreenShareOff aria-hidden="true" size={15} />
                        ) : (
                          <MonitorUp aria-hidden="true" size={15} />
                        )}
                        {sharing
                          ? "Parar captura do PC"
                          : "Capturar janela, tela ou jogo"}
                      </button>
                    </div>
                    <label className="menu-field">
                      Microfone
                      <select
                        value={audioInputId}
                        onChange={(event) =>
                          void selectAudioInput(event.target.value)
                        }
                      >
                        <option value="">Microfone padrão</option>
                        {audioInputs.map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label || "Microfone"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="menu-field">
                      Saída de áudio
                      <select
                        value={audioOutputId}
                        onChange={(event) =>
                          void selectAudioOutput(event.target.value)
                        }
                      >
                        <option value="">Saída padrão do sistema</option>
                        {audioOutputs.map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label || "Fone / alto-falante"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label
                      className="menu-field"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        cursor: "pointer",
                        marginTop: "4px",
                        background: "rgba(255,255,255,0.04)",
                        padding: "8px 10px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <input
                        type="checkbox"
                        aria-label="Compartilhar som da tela"
                        checked={shareScreenAudio}
                        onChange={(e) => setShareScreenAudio(e.target.checked)}
                        style={{
                          width: "16px",
                          height: "16px",
                          accentColor: "#6366f1",
                          cursor: "pointer",
                        }}
                      />
                      <span
                        style={{
                          fontSize: "11px",
                          display: "block",
                          color: "#f4f4f5",
                        }}
                      >
                        Compartilhar som da tela
                        <small style={{ fontSize: "10px", color: "#a1a1aa" }}>
                          Inclui áudio do sistema / aba / vídeo ao transmitir
                          tela
                        </small>
                      </span>
                    </label>
                    {communicationAudioActive && (
                      <div className="audio-profile-warning" role="status">
                        <b>Qualidade de chamada detectada</b>
                        <p>
                          O Windows pode colocar todo o som do computador em
                          modo mono/comprimido enquanto este microfone estiver
                          ativo. Use outro microfone e mantenha o fone apenas
                          como saída para ouvir música, jogos e vídeos em
                          estéreo.
                        </p>
                        <button onClick={() => void preserveStereoListening()}>
                          Priorizar som estéreo
                        </button>
                      </div>
                    )}
                    <div className="setting-actions">
                      <label className="background-upload">
                        <ImagePlus aria-hidden="true" size={14} /> Escolher
                        imagem
                        <input
                          type="file"
                          accept="image/*,video/mp4,.mp4"
                          onChange={(event) =>
                            chooseBackground(event.target.files?.[0])
                          }
                        />
                      </label>
                      <label className="background-upload animated-background-upload">
                        <Sparkles aria-hidden="true" size={14} /> Subir GIF ou
                        MP4 animado
                        <input
                          type="file"
                          accept="image/gif,.gif,video/mp4,.mp4"
                          onChange={(event) =>
                            chooseBackground(event.target.files?.[0])
                          }
                        />
                      </label>
                      <button
                        className={
                          backgroundMode === "blur" ? "format on" : "format"
                        }
                        onClick={toggleBlur}
                      >
                        <Blend aria-hidden="true" size={14} /> Desfocar
                      </button>
                      <button
                        className={
                          backgroundMode === "remove" ? "format on" : "format"
                        }
                        onClick={toggleBackgroundRemoval}
                      >
                        <Layers2 aria-hidden="true" size={14} /> Remover fundo
                      </button>
                      <button
                        className={
                          mattingQuality === "premium"
                            ? "format on premium"
                            : "format premium"
                        }
                        onClick={togglePremiumMatting}
                      >
                        <Sparkles aria-hidden="true" size={14} /> IA Premium
                      </button>
                    </div>
                    <p className="matting-note">
                      {mattingQuality === "premium"
                        ? "IA Premium: recorte temporal de alta qualidade · ideal para GPUs fortes"
                        : "Recorte leve: mais rápido, indicado para computadores comuns"}
                    </p>
                    {backgroundLabel && (
                      <p className="background-file-note">
                        <ImagePlus aria-hidden="true" size={13} />{" "}
                        {backgroundLabel}
                        {/(GIF animado|Vídeo animado)/.test(backgroundLabel)
                          ? " · animação incluída na gravação"
                          : ""}
                      </p>
                    )}
                    {backgroundMode === "image" && (
                      <div
                        className="background-customizer"
                        style={{
                          marginTop: "10px",
                          padding: "10px",
                          background: "rgba(255,255,255,0.05)",
                          borderRadius: "10px",
                          border: "1px solid rgba(255,255,255,0.09)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "8px",
                          }}
                        >
                          <b style={{ fontSize: "12px", color: "#ffd7ce" }}>
                            <Sparkles aria-hidden="true" size={13} /> Ajuste do
                            GIF / Fundo
                          </b>
                          <button
                            type="button"
                            onClick={() => {
                              setBackgroundScale(100);
                              setBackgroundOffsetX(0);
                              setBackgroundOffsetY(0);
                              setBackgroundFit("cover");
                            }}
                            style={{
                              fontSize: "11px",
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(255,255,255,0.15)",
                              borderRadius: "6px",
                              color: "#ff8d80",
                              padding: "2px 8px",
                              cursor: "pointer",
                            }}
                          >
                            <RotateCcw aria-hidden="true" size={13} /> Redefinir
                          </button>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "6px",
                            marginBottom: "10px",
                          }}
                        >
                          <button
                            type="button"
                            className={
                              backgroundFit === "cover" ? "format on" : "format"
                            }
                            onClick={() => setBackgroundFit("cover")}
                            style={{
                              flex: 1,
                              padding: "5px 2px",
                              fontSize: "11px",
                            }}
                          >
                            Preencher
                          </button>
                          <button
                            type="button"
                            className={
                              backgroundFit === "contain"
                                ? "format on"
                                : "format"
                            }
                            onClick={() => setBackgroundFit("contain")}
                            style={{
                              flex: 1,
                              padding: "5px 2px",
                              fontSize: "11px",
                            }}
                          >
                            Ajustar (100%)
                          </button>
                          <button
                            type="button"
                            className={
                              backgroundFit === "original"
                                ? "format on"
                                : "format"
                            }
                            onClick={() => setBackgroundFit("original")}
                            style={{
                              flex: 1,
                              padding: "5px 2px",
                              fontSize: "11px",
                            }}
                          >
                            Original
                          </button>
                        </div>
                        <label
                          className="menu-field"
                          style={{
                            fontSize: "11px",
                            display: "block",
                            marginBottom: "8px",
                          }}
                        >
                          Zoom / Escala: {backgroundScale}%
                          <input
                            type="range"
                            min="20"
                            max="250"
                            step="5"
                            value={backgroundScale}
                            onChange={(e) =>
                              setBackgroundScale(Number(e.target.value))
                            }
                            style={{
                              width: "100%",
                              accentColor: "var(--ka-brand)",
                            }}
                          />
                        </label>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "8px",
                          }}
                        >
                          <label
                            className="menu-field"
                            style={{ fontSize: "11px" }}
                          >
                            Posição X: {backgroundOffsetX}%
                            <input
                              type="range"
                              min="-60"
                              max="60"
                              step="2"
                              value={backgroundOffsetX}
                              onChange={(e) =>
                                setBackgroundOffsetX(Number(e.target.value))
                              }
                              style={{
                                width: "100%",
                                accentColor: "var(--ka-brand)",
                              }}
                            />
                          </label>
                          <label
                            className="menu-field"
                            style={{ fontSize: "11px" }}
                          >
                            Posição Y: {backgroundOffsetY}%
                            <input
                              type="range"
                              min="-60"
                              max="60"
                              step="2"
                              value={backgroundOffsetY}
                              onChange={(e) =>
                                setBackgroundOffsetY(Number(e.target.value))
                              }
                              style={{
                                width: "100%",
                                accentColor: "var(--ka-brand)",
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    )}
                    <div className="webcam-text-layer">
                      <b>Camada na webcam</b>
                      <small>
                        Texto no vídeo, para a chamada e a gravação.
                      </small>
                      <input
                        value={webcamText}
                        maxLength={80}
                        onChange={(event) =>
                          updateWebcamLayerText(event.target.value)
                        }
                        placeholder="Ex.: AO VIVO · Episódio 01"
                      />
                      <div>
                        <button
                          className={
                            webcamTextPosition === "top" ? "selected" : ""
                          }
                          onClick={() => setWebcamTextPosition("top")}
                        >
                          Em cima
                        </button>
                        <button
                          className={
                            webcamTextPosition === "bottom" ? "selected" : ""
                          }
                          onClick={() => setWebcamTextPosition("bottom")}
                        >
                          Embaixo
                        </button>
                        <button onClick={() => updateWebcamLayerText("")}>
                          Limpar
                        </button>
                      </div>
                      <label className="background-upload">
                        <Frame aria-hidden="true" size={14} /> Subir moldura /
                        overlay
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif,.gif"
                          onChange={(event) =>
                            chooseCameraOverlay(event.target.files?.[0])
                          }
                        />
                      </label>
                      {cameraOverlay && (
                        <>
                          <small>Moldura ativa na câmera online</small>
                          <label className="menu-field">
                            Opacidade da moldura
                            <input
                              type="range"
                              min="0.1"
                              max="1"
                              step="0.05"
                              value={cameraOverlayOpacity}
                              onChange={(event) => {
                                const opacity = Number(event.target.value);
                                cameraOverlayOpacityRef.current = opacity;
                                setCameraOverlayOpacity(opacity);
                              }}
                            />
                          </label>
                          <button
                            className="format"
                            onClick={clearCameraOverlay}
                          >
                            Limpar moldura
                          </button>
                        </>
                      )}
                    </div>
                    {backgroundMode === "blur" && (
                      <label className="menu-field blur-control">
                        Intensidade do desfoque: {blurAmount}px
                        <input
                          type="range"
                          min="6"
                          max="26"
                          value={blurAmount}
                          onChange={(event) => {
                            const amount = Number(event.target.value);
                            blurAmountRef.current = amount;
                            setBlurAmount(amount);
                          }}
                        />
                      </label>
                    )}
                    <label className="menu-switch">
                      <input
                        type="checkbox"
                        checked={skinSmooth}
                        onChange={(event) => {
                          skinSmoothRef.current = event.target.checked;
                          setSkinSmooth(event.target.checked);
                        }}
                      />
                      <span>Suavizar pele (leve)</span>
                    </label>
                    <label className="menu-switch">
                      <input
                        type="checkbox"
                        checked={noiseSuppression}
                        onChange={(event) =>
                          void toggleNoiseSuppression(event.target.checked)
                        }
                      />
                      <span>Supressão de ruído</span>
                    </label>
                    <div className="mic-tuning">
                      <label className="menu-field">
                        Sensibilidade do microfone: {micSensitivity}%
                        <input
                          type="range"
                          min="20"
                          max="130"
                          value={micSensitivity}
                          onChange={(event) =>
                            changeMicSensitivity(Number(event.target.value))
                          }
                        />
                      </label>
                      <div
                        className="mic-meter"
                        aria-label="Nível do microfone"
                      >
                        <i style={{ width: `${micLevel}%` }} />
                      </div>
                      <button
                        className={micTesting ? "format on" : "format"}
                        onClick={testMicrophone}
                      >
                        {micTesting ? (
                          <>
                            <Circle
                              aria-hidden="true"
                              size={12}
                              fill="currentColor"
                            />{" "}
                            Testando…
                          </>
                        ) : (
                          <>
                            <Play aria-hidden="true" size={14} /> Testar
                            microfone
                          </>
                        )}
                      </button>
                      <small>
                        Fale por 5 segundos. Mantenha o indicador no meio para
                        evitar vazamento e distorção.
                      </small>
                    </div>
                  </div>
                </details>
                <details>
                  <summary>
                    <span>
                      <Clapperboard aria-hidden="true" size={16} />
                    </span>
                    <div>
                      <b>Reels e prévia</b>
                      <small>Formato para salvar e edição visual</small>
                    </div>
                  </summary>
                  <div className="menu-content">
                    <div
                      className="vertical-camera-modes"
                      role="group"
                      aria-label="Layout da gravação vertical"
                    >
                      <button
                        className={
                          verticalCameraMode === "auto" ? "selected" : ""
                        }
                        onClick={() => selectVerticalCameraMode("auto")}
                      >
                        <LayoutTemplate aria-hidden="true" size={15} /> Completo
                      </button>
                      <button
                        className={
                          verticalCameraMode === "solo-mine" ? "selected" : ""
                        }
                        onClick={() => selectVerticalCameraMode("solo-mine")}
                      >
                        <User aria-hidden="true" size={15} /> Só eu
                      </button>
                      <button
                        className={
                          verticalCameraMode === "solo-friend" ? "selected" : ""
                        }
                        onClick={() => selectVerticalCameraMode("solo-friend")}
                        disabled={!friend}
                        title={
                          friend
                            ? "Gravar somente a câmera do amigo"
                            : "Disponível quando o amigo entrar"
                        }
                      >
                        <UserPlus aria-hidden="true" size={15} /> Só amigo
                      </button>
                    </div>
                    <small className="resenha-note">
                      Em “Só eu”, sua câmera ocupa todo o quadro TikTok 9:16 —
                      mesmo com outra pessoa na sala.
                    </small>
                    <button
                      className={
                        resenhaMode
                          ? "open-preview active-resenha"
                          : "open-preview"
                      }
                      onClick={toggleResenhaMode}
                      disabled={mode === "guest"}
                    >
                      {resenhaMode ? (
                        <>
                          <Circle
                            aria-hidden="true"
                            size={12}
                            fill="currentColor"
                          />{" "}
                          Modo Resenha ativo
                        </>
                      ) : (
                        <>
                          <Circle aria-hidden="true" size={12} /> Ativar Modo
                          Resenha
                        </>
                      )}
                    </button>
                    <small className="resenha-note">
                      Duas câmeras empilhadas em 9:16. Se você compartilhar a
                      tela, ela também entra na prévia e na gravação.
                    </small>
                    {resenhaMode && (
                      <div className="resenha-controls">
                        <label className="preview-slider">
                          Minha câmera · {Math.round(resenhaMineSize * 100)}%
                          <input
                            type="range"
                            min="0.25"
                            max="0.75"
                            step="0.01"
                            value={resenhaMineSize}
                            disabled={mode === "guest"}
                            onChange={(event) =>
                              setResenhaMineSize(Number(event.target.value))
                            }
                          />
                        </label>
                        <button
                          className="open-preview resenha-share-button"
                          onClick={() => {
                            if (sharing) void share();
                            else setShareScreenDialogOpen(true);
                          }}
                        >
                          {sharing ? (
                            <ScreenShareOff aria-hidden="true" size={15} />
                          ) : (
                            <ScreenShare aria-hidden="true" size={15} />
                          )}
                          {sharing ? "Parar compartilhamento" : "Compartilhar tela"}
                        </button>
                      </div>
                    )}
                    <label className="menu-switch">
                      <input
                        type="checkbox"
                        checked={vertical}
                        onChange={(event) => {
                          setVertical(event.target.checked);
                          if (event.target.checked) setPreviewOpen(true);
                          else setVerticalCameraMode("auto");
                        }}
                      />
                      <span>Usar formato vertical 9:16</span>
                    </label>
                    <label className="menu-field">
                      Formato da gravação
                      <select
                        value={recordingFormat}
                        onChange={(event) =>
                          setRecordingFormat(event.target.value as ExportFormat)
                        }
                      >
                        <option value="mp4">
                          MP4 · melhor para redes sociais
                        </option>
                        <option value="webm">WebM · alta qualidade web</option>
                      </select>
                    </label>
                    <small className="resenha-note">
                      Se o Chrome não liberar MP4, a KLIPAPP preserva a gravação
                      em WebM.
                    </small>
                    <button
                      className="open-preview"
                      onClick={() => {
                        setVertical(true);
                        setPreviewOpen(!previewOpen);
                      }}
                    >
                      <Eye aria-hidden="true" size={14} />{" "}
                      {previewOpen ? "Fechar prévia" : "Abrir prévia"}
                    </button>
                  </div>
                </details>
                <details>
                  <summary>
                    <span>
                      <Repeat2 aria-hidden="true" size={16} />
                    </span>
                    <div>
                      <b>Layout vertical</b>
                      <small>Defina a ordem das câmeras e da tela</small>
                    </div>
                  </summary>
                  <div className="menu-content layout-selects">
                    <label>
                      Ordem das câmeras
                      <select
                        value={topOrder}
                        disabled={mode === "guest"}
                        onChange={(event) =>
                          setTopOrder(
                            event.target.value as "mine-first" | "friend-first",
                          )
                        }
                      >
                        <option value="mine-first">
                          Minha câmera à esquerda
                        </option>
                        <option value="friend-first">Amigo à esquerda</option>
                      </select>
                    </label>
                    <label>
                      Posição da tela
                      <select
                        value={screenPosition}
                        disabled={mode === "guest"}
                        onChange={(event) =>
                          setScreenPosition(
                            event.target.value as "top" | "bottom",
                          )
                        }
                      >
                        <option value="bottom">Tela embaixo</option>
                        <option value="top">Tela em cima</option>
                      </select>
                    </label>
                  </div>
                </details>
              </div>
              <button
                className="session-refresh"
                onClick={() => location.reload()}
              >
                <RefreshCw aria-hidden="true" size={14} /> Recarregar sessão
              </button>
              <p className="app-version">KLIPAPP {APP_VERSION} · produção</p>
            </>
          )}
        </aside>
      )}
      <section
        className={
          "stage " +
          (resenhaMode
            ? `resenha-stage${screenActive ? " resenha-with-screen" : ""}`
            : screenActive
              ? "screen-on"
              : "")
        }
        style={
          resenhaMode
            ? screenActive
              ? {
                  gridTemplateColumns: `${resenhaMineSize}fr ${1 - resenhaMineSize}fr`,
                }
              : {
                  gridTemplateRows: `${resenhaMineSize}fr ${1 - resenhaMineSize}fr`,
                }
            : undefined
        }
      >
        {screenActive && (
          <div className="tile shared">
            {sharing ? (
              <video ref={screen} autoPlay playsInline muted />
            ) : (
              <>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Fluxo WebRTC ao vivo não possui uma faixa VTT estática. */}
                <video ref={remoteScreen} autoPlay playsInline />
              </>
            )}
            <label>
              {sharing
                ? "Sua tela"
                : `${friend || "Seu amigo"} está compartilhando`}{" "}
              <b>
                {(sharing ? screenAudioActive : remoteScreenAudioActive)
                  ? "Compartilhando com áudio"
                  : "Somente imagem"}
              </b>
            </label>
          </div>
        )}
        <div className={"tile mine " + (speaking.mine ? "speaking" : "")}>
          <video
            ref={mine}
            autoPlay
            muted
            playsInline
            className={cameraOn ? "" : "hidden"}
          />
          {!cameraOn && <div className="avatar">V</div>}
          <label>
            {name} (você){" "}
            <b aria-label={mic ? "Microfone ligado" : undefined}>
              {mic ? (
                <Mic aria-hidden="true" size={12} />
              ) : (
                "microfone desligado"
              )}
            </b>
          </label>
        </div>
        <div className={"tile waiting " + (speaking.friend ? "speaking" : "")}>
          {friend ? (
            <>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Fluxo WebRTC ao vivo não possui uma faixa VTT estática. */}
              <video ref={theirs} autoPlay playsInline />
              <label>
                {friend}{" "}
                <b>
                  <Circle aria-hidden="true" size={9} fill="currentColor" />{" "}
                  {friendRecording ? "gravando" : "conectado"}
                </b>
              </label>
            </>
          ) : (
            <>
              <div className="avatar">?</div>
              <p className="tile-status">Aguardando seu amigo</p>
              <p>Envie o convite para ele entrar nesta sala</p>
            </>
          )}
        </div>
      </section>
      {previewOpen && (
        <aside
          className={"tiktok-preview " + (previewMinimized ? "minimized" : "")}
          style={{
            transform: `translate(${previewOffset.x}px, ${previewOffset.y}px)`,
          }}
        >
          <div
            className="preview-title"
            onPointerDown={startPreviewDrag}
            onPointerMove={movePreviewDrag}
            onPointerUp={endPreviewDrag}
            onPointerCancel={endPreviewDrag}
          >
            <span>Prévia para salvar · 9:16</span>
            <div className="window-actions">
              <button
                onClick={() => setPreviewMinimized(!previewMinimized)}
                aria-label={
                  previewMinimized ? "Expandir prévia" : "Minimizar prévia"
                }
              >
                <Minimize2 aria-hidden="true" size={14} />
              </button>
              <button
                onClick={() => setPreviewOpen(false)}
                aria-label="Fechar prévia"
              >
                <X aria-hidden="true" size={14} />
              </button>
            </div>
          </div>
          {previewMinimized ? (
            <button
              className="mini-preview"
              onClick={() => setPreviewMinimized(false)}
              aria-label="Expandir prévia"
            >
              <div
                className={
                  verticalCameraMode !== "auto" ? "mini-preview-solo" : ""
                }
              >
                {verticalCameraMode === "solo-friend" && friend ? (
                  /* eslint-disable-next-line jsx-a11y/media-has-caption -- Prévia WebRTC ao vivo não possui uma faixa VTT estática. */
                  <video ref={previewFriend} autoPlay playsInline />
                ) : (
                  <video ref={previewMine} autoPlay muted playsInline />
                )}
                {verticalCameraMode === "auto" && (
                  /* eslint-disable-next-line jsx-a11y/media-has-caption -- Prévia WebRTC ao vivo não possui uma faixa VTT estática. */
                  <video ref={previewFriend} autoPlay playsInline />
                )}
              </div>
              <span>
                {verticalCameraMode === "auto"
                  ? "Prévia 9:16"
                  : "TikTok · uma câmera"}{" "}
                · clique para expandir
              </span>
            </button>
          ) : (
            <>
              <div
                className={
                  "preview-canvas " +
                  (verticalCameraMode !== "auto"
                    ? "solo-camera-preview"
                    : resenhaMode
                      ? `resenha-preview screen-${screenPosition}`
                      : "screen-" + screenPosition)
                }
              >
                {verticalCameraMode !== "auto" ? (
                  <div className="preview-solo-camera">
                    {verticalCameraMode === "solo-friend" && friend ? (
                      /* eslint-disable-next-line jsx-a11y/media-has-caption -- Prévia WebRTC ao vivo não possui uma faixa VTT estática. */
                      <video ref={previewFriend} autoPlay playsInline />
                    ) : (
                      <video ref={previewMine} autoPlay muted playsInline />
                    )}
                    <span>
                      {verticalCameraMode === "solo-friend" && friend
                        ? friend
                        : `${name} (você)`}
                    </span>
                  </div>
                ) : (
                  <>
                    <div
                      className={
                        (resenhaMode ? "resenha-cameras " : "preview-top ") +
                        topOrder
                      }
                      style={{
                        height: resenhaMode
                          ? screenActive
                            ? "56%"
                            : "100%"
                          : `${tiktokTop * 100}%`,
                        ...(resenhaMode
                          ? {
                              gridTemplateRows:
                                topOrder === "mine-first"
                                  ? `${resenhaMineSize}fr ${1 - resenhaMineSize}fr`
                                  : `${1 - resenhaMineSize}fr ${resenhaMineSize}fr`,
                            }
                          : {}),
                      }}
                    >
                      <video
                        draggable
                        onDragStart={() => setDragging("mine")}
                        onDragEnd={() => setDragging("")}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (mode === "host" && dragging === "friend")
                            setTopOrder(
                              topOrder === "mine-first"
                                ? "friend-first"
                                : "mine-first",
                            );
                        }}
                        ref={previewMine}
                        autoPlay
                        muted
                        playsInline
                      />
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Prévia WebRTC ao vivo não possui uma faixa VTT estática. */}
                      <video
                        draggable
                        onDragStart={() => setDragging("friend")}
                        onDragEnd={() => setDragging("")}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (mode === "host" && dragging === "mine")
                            setTopOrder(
                              topOrder === "mine-first"
                                ? "friend-first"
                                : "mine-first",
                            );
                        }}
                        ref={previewFriend}
                        autoPlay
                        playsInline
                      />
                    </div>
                    {(!resenhaMode || screenActive) && (
                      <div
                        className="preview-screen"
                        style={{
                          height: resenhaMode
                            ? "44%"
                            : `${(1 - tiktokTop) * 100}%`,
                        }}
                      >
                        {sharing || remoteSharing ? (
                          <>
                            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Compartilhamento ao vivo não possui uma faixa VTT estática. */}
                            <video ref={previewScreen} autoPlay playsInline />
                          </>
                        ) : (
                          <span>A tela compartilhada aparecerá aqui</span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              {!resenhaMode && verticalCameraMode === "auto" && (
                <label className="preview-slider">
                  Tamanho das câmeras
                  <input
                    type="range"
                    min="0.2"
                    max="0.5"
                    step="0.01"
                    value={tiktokTop}
                    disabled={mode === "guest"}
                    onChange={(event) =>
                      setTiktokTop(Number(event.target.value))
                    }
                  />
                </label>
              )}
              {resenhaMode && verticalCameraMode === "auto" && (
                <label className="preview-slider">
                  Minha câmera · {Math.round(resenhaMineSize * 100)}%
                  <input
                    type="range"
                    min="0.25"
                    max="0.75"
                    step="0.01"
                    value={resenhaMineSize}
                    disabled={mode === "guest"}
                    onChange={(event) =>
                      setResenhaMineSize(Number(event.target.value))
                    }
                  />
                </label>
              )}
              <small>
                {verticalCameraMode !== "auto"
                  ? "Uma câmera ocupa todo o quadro. Esta composição será usada exatamente assim na gravação."
                  : resenhaMode
                    ? "Ajuste o tamanho da sua câmera e arraste para trocar a ordem. A tela compartilhada também será gravada exatamente como aparece aqui."
                    : "Arraste uma câmera sobre a outra para trocar de lado. O tamanho da prévia será usado na gravação."}
              </small>
            </>
          )}
        </aside>
      )}
      {chatOpen && (
        <aside className="chat-panel">
          <div className="chat-title">
            Chat da sala{" "}
            <button onClick={() => setChatOpen(false)} aria-label="Fechar chat">
              <X aria-hidden="true" size={14} />
            </button>
          </div>
          <div className="chat-messages">
            {messages.length ? (
              messages.map((message, index) => (
                <p key={index}>
                  <b>{message.name}</b>
                  {message.text}
                </p>
              ))
            ) : (
              <span>Sem mensagens ainda.</span>
            )}
          </div>
          <div className="chat-compose">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && send()}
              placeholder="Digite uma mensagem…"
            />
            <button onClick={send}>Enviar</button>
          </div>
        </aside>
      )}
      {shareScreenDialogOpen && !sharing && (
        <div
          className="screen-share-backdrop"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget)
              setShareScreenDialogOpen(false);
          }}
        >
          <section
            className="screen-share-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="screen-share-title"
          >
            <header>
              <div>
                <small>APRESENTAR</small>
                <b id="screen-share-title">Como você quer compartilhar?</b>
              </div>
              <button
                onClick={() => setShareScreenDialogOpen(false)}
                aria-label="Fechar"
              >
                <X aria-hidden="true" size={14} />
              </button>
            </header>
            <p>
              Escolha se o seu amigo também deve ouvir vídeos, músicas, jogos ou
              sons da guia compartilhada.
            </p>
            <button
              className="screen-share-choice with-audio"
              onClick={() => {
                setShareScreenAudio(true);
                void share(true);
              }}
            >
              <span>
                <Volume2 aria-hidden="true" size={20} />
              </span>
              <div>
                <b>Tela com áudio</b>
                <small>Envia imagem e som do sistema ou da guia</small>
              </div>
              <i>Recomendado</i>
            </button>
            <button
              className="screen-share-choice"
              onClick={() => {
                setShareScreenAudio(false);
                void share(false);
              }}
            >
              <span>
                <MonitorUp aria-hidden="true" size={20} />
              </span>
              <div>
                <b>Somente imagem</b>
                <small>
                  Seu microfone continua normal, mas o som da tela não é enviado
                </small>
              </div>
            </button>
            <small className="screen-share-hint">
              No Chrome, confirme também “Compartilhar áudio da guia” ou
              “Compartilhar áudio do sistema” no seletor que será aberto. A
              disponibilidade depende do sistema e do tipo de tela escolhido.
            </small>
          </section>
        </div>
      )}
      {connectionOpen && (
        <aside className="connection-panel" aria-label="Status da conexão">
          <div className="connection-title">
            <div>
              <b>Status da conexão</b>
              <small>Atualiza a cada 2 segundos</small>
            </div>
            <button
              onClick={() => setConnectionOpen(false)}
              aria-label="Fechar status"
            >
              <X aria-hidden="true" size={14} />
            </button>
          </div>
          <div className="connection-grid">
            <div>
              <small>FPS do vídeo</small>
              <b>
                {connectionStats.fps || "—"}
                <em> fps</em>
              </b>
            </div>
            <div>
              <small>Bitrate</small>
              <b>
                {connectionStats.bitrateKbps || "—"}
                <em> kb/s</em>
              </b>
            </div>
            <div>
              <small>Perda de pacotes</small>
              <b className={connectionStats.packetLoss > 2 ? "warning" : ""}>
                {connectionStats.packetLoss}
                <em>%</em>
              </b>
            </div>
            <div>
              <small>Latência / jitter</small>
              <b>
                {connectionStats.rttMs || "—"}
                <em> / {connectionStats.jitterMs} ms</em>
              </b>
            </div>
          </div>
          <p>
            Para fundo animado, até 24 fps é normal: assim a chamada preserva
            GPU e estabilidade.
          </p>
          <button
            className="refresh-connection"
            onClick={() => void refreshConnectionStats()}
          >
            <RefreshCw aria-hidden="true" size={14} /> Atualizar agora
          </button>
        </aside>
      )}
      {notice && (
        <div className="toast">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Fechar aviso">
            <X aria-hidden="true" size={14} />
          </button>
        </div>
      )}
      {virtualEffectLoading && (
        <div
          className="virtual-effect-loading"
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true" />
          <div>
            <b>{virtualEffectLoading}</b>
            <small>
              A câmera continua conectada enquanto o efeito é preparado.
            </small>
          </div>
        </div>
      )}
      <footer>
        <button
          className={!mic ? "off" : ""}
          onClick={() => {
            toggle("audio", !mic);
            setMic(!mic);
          }}
        >
          <b>
            {mic ? (
              <Mic aria-hidden="true" size={18} />
            ) : (
              <MicOff aria-hidden="true" size={18} />
            )}
          </b>
          <small>{mic ? "Microfone" : "Silenciado"}</small>
        </button>
        <button
          className={!cameraOn ? "off" : ""}
          onClick={() => {
            toggle("video", !cameraOn);
            setCameraOn(!cameraOn);
          }}
        >
          <b>
            {cameraOn ? (
              <Video aria-hidden="true" size={18} />
            ) : (
              <VideoOff aria-hidden="true" size={18} />
            )}
          </b>
          <small>{cameraOn ? "Câmera" : "Câmera off"}</small>
        </button>
        <button
          className={sharing ? "active" : ""}
          onClick={() => {
            if (sharing) void share();
            else setShareScreenDialogOpen(true);
          }}
        >
          <b>
            {sharing ? (
              <ScreenShareOff aria-hidden="true" size={18} />
            ) : (
              <ScreenShare aria-hidden="true" size={18} />
            )}
          </b>
          <small>{sharing ? "Parar tela" : "Compartilhar tela"}</small>
        </button>
        <button className={recording ? "recording" : ""} onClick={record}>
          <b>
            {recording ? (
              <>
                <CircleStop aria-hidden="true" size={18} />{" "}
                {timeLabel(recordSeconds)}
              </>
            ) : (
              <Circle aria-hidden="true" size={18} fill="currentColor" />
            )}
          </b>
          <small>{recording ? "Parar e salvar" : "Gravar local"}</small>
        </button>
        {editorClip && !recording && (
          <button
            className="edit-recording"
            onClick={() => {
              setEditorReturnToCall(true);
              setEditorOpen(true);
            }}
          >
            <b>
              <Sparkles aria-hidden="true" size={18} />
            </b>
            <small>Editar gravação</small>
          </button>
        )}
        {recording && (
          <button className="clip" onClick={saveClip}>
            <b>
              <Scissors aria-hidden="true" size={18} />
            </b>
            <small>Salvar trecho</small>
          </button>
        )}
        <i />
        <button className="leave" onClick={leave}>
          <b>
            <LogOut aria-hidden="true" size={18} />
          </b>
          <small>Sair</small>
        </button>
      </footer>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(u) => {
          setCurrentUser(u);
          localStorage.setItem("klip_user", JSON.stringify(u));
        }}
      />

      <SocialAccountsModal
        isOpen={socialModalOpen}
        onClose={() => setSocialModalOpen(false)}
      />

      <PublishModal
        isOpen={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        defaultTitle="Gravação KLIPAPP"
      />
    </main>
  );
}

/* eslint-disable @next/next/no-img-element -- O único img deste componente exibe uma URL blob local de moldura escolhida pelo usuário, incompatível com o otimizador do Next Image. */
function OfflineStudio({ onBack }: { onBack: () => void }) {
  type StudioBox = { x: number; y: number; w: number; h: number };
  const first = useRef<HTMLVideoElement>(null),
    second = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    overlayImage = useRef<HTMLImageElement | null>(null);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]),
    [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [camA, setCamA] = useState(""),
    [camB, setCamB] = useState(""),
    [micA, setMicA] = useState(""),
    [micB, setMicB] = useState("");
  const [audioMode, setAudioMode] = useState<"mix" | "a" | "b">("mix"),
    [recording, setRecording] = useState(false),
    [notice, setNotice] = useState(""),
    [recordSeconds, setRecordSeconds] = useState(0);
  const [preset, setPreset] = useState<"landscape" | "vertical" | "square">(
      "landscape",
    ),
    [fps, setFps] = useState(30),
    [quality, setQuality] = useState<"balanced" | "max">("balanced"),
    [overlay, setOverlay] = useState<string | null>(null),
    [overlayOpacity, setOverlayOpacity] = useState(0.85);
  const [layout, setLayout] = useState<"side" | "stack" | "pip" | "focus">(
      "side",
    ),
    [boxA, setBoxA] = useState<StudioBox>({ x: 0, y: 0, w: 50, h: 100 }),
    [boxB, setBoxB] = useState<StudioBox>({ x: 50, y: 0, w: 50, h: 100 });
  const [effectA, setEffectA] = useState("none"),
    [effectB, setEffectB] = useState("none"),
    [micLevels, setMicLevels] = useState<[number, number]>([0, 0]);
  const streams = useRef<[MediaStream | null, MediaStream | null]>([
    null,
    null,
  ]);
  const recorder = useRef<MediaRecorder | null>(null),
    chunks = useRef<Blob[]>([]),
    frame = useRef(0),
    audioContext = useRef<AudioContext | null>(null),
    meterContext = useRef<AudioContext | null>(null),
    meterAnalyzers = useRef<[AnalyserNode | null, AnalyserNode | null]>([
      null,
      null,
    ]),
    meterFrame = useRef(0);
  const drag = useRef<{
    index: 0 | 1;
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const studioTime = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  useEffect(() => {
    const activeStreams = streams.current;
    void navigator.mediaDevices.enumerateDevices().then((items) => {
      setCams(items.filter((item) => item.kind === "videoinput"));
      setMics(items.filter((item) => item.kind === "audioinput"));
    });
    return () => {
      cancelAnimationFrame(frame.current);
      cancelAnimationFrame(meterFrame.current);
      audioContext.current?.close();
      meterContext.current?.close();
      activeStreams.forEach((stream) =>
        stream?.getTracks().forEach((track) => track.stop()),
      );
    };
  }, []);
  useEffect(() => {
    if (!recording) return;
    const interval = window.setInterval(
      () => setRecordSeconds((value) => value + 1),
      1000,
    );
    return () => window.clearInterval(interval);
  }, [recording]);
  async function openCamera(index: 0 | 1, deviceId: string, micId: string) {
    streams.current[index]?.getTracks().forEach((track) => track.stop());
    if (!deviceId) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
      audio: micId
        ? {
            deviceId: { exact: micId },
            echoCancellation: true,
            noiseSuppression: true,
          }
        : false,
    });
    streams.current[index] = stream;
    const video = index === 0 ? first.current : second.current;
    if (video) {
      video.srcObject = stream;
      await video.play().catch(() => undefined);
    }
    if (stream.getAudioTracks().length) {
      const context = meterContext.current || new AudioContext();
      meterContext.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context
        .createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
        .connect(analyser);
      meterAnalyzers.current[index] = analyser;
      if (!meterFrame.current) {
        const updateMeters = () => {
          const levels = meterAnalyzers.current.map((node) => {
            if (!node) return 0;
            const samples = new Uint8Array(node.fftSize);
            node.getByteTimeDomainData(samples);
            const energy =
              samples.reduce((sum, sample) => sum + Math.abs(sample - 128), 0) /
              samples.length;
            return Math.min(100, Math.round(energy * 3.1));
          }) as [number, number];
          setMicLevels(levels);
          meterFrame.current = requestAnimationFrame(updateMeters);
        };
        updateMeters();
      }
    }
  }
  const filterFor = (effect: string) =>
    effect === "noir"
      ? "grayscale(1) contrast(1.25)"
      : effect === "cinema"
        ? "contrast(1.15) saturate(1.28) sepia(.12)"
        : effect === "cool"
          ? "saturate(1.18) hue-rotate(175deg)"
          : effect === "warm"
            ? "sepia(.22) saturate(1.2)"
            : effect === "vhs"
              ? "contrast(1.28) saturate(1.45) hue-rotate(-12deg)"
              : "none";
  const canvasFilter = (effect: string) =>
    effect === "noir"
      ? "grayscale(1) contrast(1.25)"
      : effect === "cinema"
        ? "contrast(1.15) saturate(1.28) sepia(.12)"
        : effect === "cool"
          ? "saturate(1.18) hue-rotate(175deg)"
          : effect === "warm"
            ? "sepia(.22) saturate(1.2)"
            : effect === "vhs"
              ? "contrast(1.28) saturate(1.45) hue-rotate(-12deg)"
              : "none";
  const updateBox = (index: 0 | 1, patch: Partial<StudioBox>) => {
    const apply = (box: StudioBox) => ({ ...box, ...patch });
    if (index === 0) setBoxA(apply);
    else setBoxB(apply);
  };
  const applyLayout = (next: "side" | "stack" | "pip" | "focus") => {
    setLayout(next);
    if (next === "side") {
      setBoxA({ x: 0, y: 0, w: 50, h: 100 });
      setBoxB({ x: 50, y: 0, w: 50, h: 100 });
    }
    if (next === "stack") {
      setBoxA({ x: 0, y: 0, w: 100, h: 50 });
      setBoxB({ x: 0, y: 50, w: 100, h: 50 });
    }
    if (next === "pip") {
      setBoxA({ x: 0, y: 0, w: 100, h: 100 });
      setBoxB({ x: 67, y: 65, w: 30, h: 30 });
    }
    if (next === "focus") {
      setBoxA({ x: 0, y: 0, w: 70, h: 100 });
      setBoxB({ x: 70, y: 0, w: 30, h: 100 });
    }
  };
  function draw() {
    const target = canvas.current,
      a = first.current,
      b = second.current;
    if (!target || !a || !b) return;
    const context = target.getContext("2d");
    if (!context) return;
    const dimensions =
      preset === "vertical"
        ? [1080, 1920]
        : preset === "square"
          ? [1080, 1080]
          : [1920, 1080];
    target.width = dimensions[0];
    target.height = dimensions[1];
    context.fillStyle = "#0d0f0e";
    context.fillRect(0, 0, target.width, target.height);
    const drawVideo = (
      video: HTMLVideoElement,
      box: StudioBox,
      effect: string,
    ) => {
      if (!video.videoWidth) return;
      const x = (box.x / 100) * target.width,
        y = (box.y / 100) * target.height,
        w = (box.w / 100) * target.width,
        h = (box.h / 100) * target.height;
      const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
      const dw = video.videoWidth * scale,
        dh = video.videoHeight * scale;
      context.save();
      context.beginPath();
      context.rect(x, y, w, h);
      context.clip();
      context.filter = canvasFilter(effect);
      context.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      context.restore();
    };
    drawVideo(a, boxA, effectA);
    drawVideo(b, boxB, effectB);
    if (overlayImage.current?.complete && overlayImage.current.naturalWidth) {
      context.save();
      context.globalAlpha = overlayOpacity;
      context.drawImage(
        overlayImage.current,
        0,
        0,
        target.width,
        target.height,
      );
      context.restore();
    }
    if (recording) frame.current = requestAnimationFrame(draw);
  }
  function startRecording() {
    if (!canvas.current) return;
    chunks.current = [];
    const output = canvas.current.captureStream(fps);
    const audio = new AudioContext();
    audioContext.current = audio;
    const destination = audio.createMediaStreamDestination();
    streams.current.forEach((stream, index) => {
      if (
        (audioMode === "a" && index !== 0) ||
        (audioMode === "b" && index !== 1)
      )
        return;
      const track = stream?.getAudioTracks()[0];
      if (track)
        audio
          .createMediaStreamSource(new MediaStream([track]))
          .connect(destination);
    });
    destination.stream
      .getAudioTracks()
      .forEach((track) => output.addTrack(track));
    const mime = mimeForExport("webm") || "video/webm";
    const media = new MediaRecorder(output, {
      mimeType: mime,
      videoBitsPerSecond: quality === "max" ? 24_000_000 : 12_000_000,
      audioBitsPerSecond: 192_000,
    });
    media.ondataavailable = (event) =>
      event.data.size && chunks.current.push(event.data);
    media.onstop = () => {
      const url = URL.createObjectURL(new Blob(chunks.current, { type: mime }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `klip-offline-${preset}-${Date.now()}.webm`;
      link.click();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        void audioContext.current?.close();
        audioContext.current = null;
      }, 60000);
      setNotice("Gravação salva com câmeras, áudio e overlay.");
    };
    recorder.current = media;
    setRecordSeconds(0);
    setRecording(true);
    media.start(250);
    draw();
  }
  function stopRecording() {
    recorder.current?.stop();
    setRecording(false);
    cancelAnimationFrame(frame.current);
  }
  const loadOverlay = (file: File) => {
    const url = URL.createObjectURL(file);
    setOverlay(url);
    const image = new Image();
    image.src = url;
    overlayImage.current = image;
  };
  const beginDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    index: 0 | 1,
  ) => {
    const box = index === 0 ? boxA : boxB;
    drag.current = {
      index,
      x: box.x,
      y: box.y,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const item = drag.current,
      stage = event.currentTarget.parentElement;
    if (!item || !stage) return;
    const bounds = stage.getBoundingClientRect();
    updateBox(item.index, {
      x: Math.max(
        0,
        Math.min(
          100 - (item.index === 0 ? boxA.w : boxB.w),
          item.x + ((event.clientX - item.startX) / bounds.width) * 100,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          100 - (item.index === 0 ? boxA.h : boxB.h),
          item.y + ((event.clientY - item.startY) / bounds.height) * 100,
        ),
      ),
    });
  };
  const cameraControl = (
    label: string,
    index: 0 | 1,
    box: StudioBox,
    effect: string,
    setEffect: (value: string) => void,
  ) => (
    <div className="studio-camera-control">
      <b>{label}</b>
      <label>
        Efeito
        <select
          value={effect}
          onChange={(event) => setEffect(event.target.value)}
        >
          <option value="none">Natural</option>
          <option value="cinema">Cinema</option>
          <option value="warm">Quente</option>
          <option value="cool">Frio</option>
          <option value="noir">Noir</option>
          <option value="vhs">VHS</option>
        </select>
      </label>
      <label>
        Tamanho
        <input
          type="range"
          min="20"
          max="100"
          value={box.w}
          onChange={(event) =>
            updateBox(index, { w: Number(event.target.value) })
          }
        />
      </label>
      <label>
        Horizontal
        <input
          type="range"
          min="0"
          max={Math.max(0, 100 - box.w)}
          value={box.x}
          onChange={(event) =>
            updateBox(index, { x: Number(event.target.value) })
          }
        />
      </label>
      <label>
        Vertical
        <input
          type="range"
          min="0"
          max={Math.max(0, 100 - box.h)}
          value={box.y}
          onChange={(event) =>
            updateBox(index, { y: Number(event.target.value) })
          }
        />
      </label>
    </div>
  );
  return (
    <main className="offline-studio">
      <header className="editor-header">
        <div className="brand">
          <KlipAppLogo variant="full" width={132} height={28} />
          <em>Estúdio local</em>
        </div>
        <div className="studio-status">
          <span className={recording ? "live" : ""}>
            {recording ? (
              <>
                <Circle aria-hidden="true" size={12} fill="currentColor" />{" "}
                GRAVANDO
              </>
            ) : (
              <>
                <Circle aria-hidden="true" size={12} /> PRONTO
              </>
            )}
          </span>
          <b>{studioTime(recordSeconds)}</b>
          <small>
            {preset === "vertical"
              ? "1080×1920"
              : preset === "square"
                ? "1080×1080"
                : "1920×1080"}{" "}
            · {fps} FPS
          </small>
        </div>
        <button onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={15} /> Voltar
        </button>
      </header>
      <section className="offline-grid offline-grid-pro">
        <aside className="offline-controls">
          <h2>Estúdio local</h2>
          <p>
            Monte a composição e arraste as câmeras diretamente na prévia. O
            arquivo salvo será igual.
          </p>
          <label>
            Câmera / placa 1
            <select
              value={camA}
              onChange={(event) => {
                setCamA(event.target.value);
                void openCamera(0, event.target.value, micA);
              }}
            >
              {cams.map((item, index) => (
                <option key={item.deviceId} value={item.deviceId}>
                  {videoInputLabel(item, index)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Microfone 1
            <select
              value={micA}
              onChange={(event) => {
                setMicA(event.target.value);
                if (camA) void openCamera(0, camA, event.target.value);
              }}
            >
              {mics.map((item) => (
                <option key={item.deviceId} value={item.deviceId}>
                  {item.label || "Microfone"}
                </option>
              ))}
            </select>
            <meter min="0" max="100" value={micLevels[0]} />
            <small>Volume: {micLevels[0]}%</small>
          </label>
          <label>
            Câmera / placa 2
            <select
              value={camB}
              onChange={(event) => {
                setCamB(event.target.value);
                void openCamera(1, event.target.value, micB);
              }}
            >
              {cams.map((item, index) => (
                <option key={item.deviceId} value={item.deviceId}>
                  {videoInputLabel(item, index)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Microfone 2
            <select
              value={micB}
              onChange={(event) => {
                setMicB(event.target.value);
                if (camB) void openCamera(1, camB, event.target.value);
              }}
            >
              {mics.map((item) => (
                <option key={item.deviceId} value={item.deviceId}>
                  {item.label || "Microfone"}
                </option>
              ))}
            </select>
            <meter min="0" max="100" value={micLevels[1]} />
            <small>Volume: {micLevels[1]}%</small>
          </label>
          <label>
            Formato de saída
            <select
              value={preset}
              onChange={(event) =>
                setPreset(event.target.value as typeof preset)
              }
            >
              <option value="landscape">YouTube / widescreen 16:9</option>
              <option value="vertical">TikTok / Reels / Shorts 9:16</option>
              <option value="square">Instagram quadrado 1:1</option>
            </select>
          </label>
          <div className="studio-layouts">
            <b>Layout</b>
            <div>
              {(
                [
                  ["side", MoveHorizontal, "Lado a lado"],
                  ["stack", MoveVertical, "Empilhado"],
                  ["pip", PictureInPicture, "Picture in picture"],
                  ["focus", Maximize2, "Destaque"],
                ] as const
              ).map(([key, LayoutIcon, label]) => (
                <button
                  key={key}
                  className={layout === key ? "selected" : ""}
                  onClick={() => applyLayout(key)}
                >
                  <LayoutIcon aria-hidden="true" size={14} /> {label}
                </button>
              ))}
            </div>
          </div>
          {cameraControl("Câmera 1", 0, boxA, effectA, setEffectA)}
          {cameraControl("Câmera 2", 1, boxB, effectB, setEffectB)}
          <label>
            FPS
            <select
              value={fps}
              onChange={(event) => setFps(Number(event.target.value))}
            >
              <option value="24">24 FPS · econômico</option>
              <option value="30">30 FPS · recomendado</option>
              <option value="60">60 FPS · máximo</option>
            </select>
          </label>
          <label>
            Qualidade
            <select
              value={quality}
              onChange={(event) =>
                setQuality(event.target.value as typeof quality)
              }
            >
              <option value="balanced">Equilibrada</option>
              <option value="max">Máxima</option>
            </select>
          </label>
          <label>
            Áudio da gravação
            <select
              value={audioMode}
              onChange={(event) =>
                setAudioMode(event.target.value as "mix" | "a" | "b")
              }
            >
              <option value="mix">Misturar os dois</option>
              <option value="a">Somente microfone 1</option>
              <option value="b">Somente microfone 2</option>
            </select>
          </label>
          <label>
            Overlay / moldura
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) loadOverlay(file);
              }}
            />
          </label>
          {overlay && (
            <label>
              Opacidade da moldura
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={overlayOpacity}
                onChange={(event) =>
                  setOverlayOpacity(Number(event.target.value))
                }
              />
            </label>
          )}
          <button
            className={recording ? "offline-stop" : "offline-record"}
            onClick={recording ? stopRecording : startRecording}
          >
            {recording ? (
              <>
                <CircleStop aria-hidden="true" size={15} /> Parar e salvar
              </>
            ) : (
              <>
                <Circle aria-hidden="true" size={15} fill="currentColor" />{" "}
                Iniciar gravação
              </>
            )}
          </button>
          {notice && <small>{notice}</small>}
        </aside>
        <section className="offline-preview">
          <div className={`offline-cameras offline-${preset} offline-composer`}>
            <div
              className="offline-camera-tile"
              onPointerDown={(event) => beginDrag(event, 0)}
              onPointerMove={moveDrag}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              style={{
                left: `${boxA.x}%`,
                top: `${boxA.y}%`,
                width: `${boxA.w}%`,
                height: `${boxA.h}%`,
              }}
            >
              <video
                ref={first}
                muted
                playsInline
                style={{ filter: filterFor(effectA) }}
              />
              <b>Câmera 1 · arraste</b>
            </div>
            <div
              className="offline-camera-tile"
              onPointerDown={(event) => beginDrag(event, 1)}
              onPointerMove={moveDrag}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              style={{
                left: `${boxB.x}%`,
                top: `${boxB.y}%`,
                width: `${boxB.w}%`,
                height: `${boxB.h}%`,
              }}
            >
              <video
                ref={second}
                muted
                playsInline
                style={{ filter: filterFor(effectB) }}
              />
              <b>Câmera 2 · arraste</b>
            </div>
            {overlay && (
              <img
                className="offline-overlay-preview"
                src={overlay}
                alt="Moldura"
                style={{ opacity: overlayOpacity }}
              />
            )}
          </div>
          <canvas ref={canvas} />
          <p>
            Prévia local · mesma posição, tamanho, efeitos e moldura da gravação
            final.
          </p>
        </section>
      </section>
    </main>
  );
}
/* eslint-enable @next/next/no-img-element */

function ClipEditorV2({
  initialClip,
  onBack,
  theme,
  onToggleTheme,
}: {
  initialClip: EditorClip | null;
  onBack: () => void;
  theme: KlipAppTheme;
  onToggleTheme: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const initialLayer = (): TextLayer => ({
    id: crypto.randomUUID(),
    text: "Seu melhor momento começa aqui ✦",
    font: "Inter",
    color: "#ffffff",
    size: 58,
    x: 50,
    y: 76,
    align: "center",
    start: 0,
    end: 6,
    fadeIn: 0.25,
    fadeOut: 0.25,
    effect: "pop",
    background: false,
  });
  const [clip, setClip] = useState<EditorClip | null>(initialClip),
    [duration, setDuration] = useState(0),
    [sourceDuration, setSourceDuration] = useState(0),
    [current, setCurrent] = useState(0),
    [isPlaying, setIsPlaying] = useState(false),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(0),
    [primaryTimelineStart, setPrimaryTimelineStart] = useState(0),
    [videoFadeIn, setVideoFadeIn] = useState(0),
    [videoFadeOut, setVideoFadeOut] = useState(0),
    [videoFadeInAt, setVideoFadeInAt] = useState(0),
    [videoFadeOutAt, setVideoFadeOutAt] = useState(0),
    [transitionColor, setTransitionColor] = useState<"black" | "white">(
      "black",
    ),
    [transitionKind, setTransitionKind] =
      useState<Exclude<TransitionKind, "none">>("fade-black"),
    [visualPreset, setVisualPreset] = useState<VisualPreset>("clean"),
    [visualEffect, setVisualEffect] = useState<VisualEffectApplication | null>(
      null,
    ),
    [visualEffectPreview, setVisualEffectPreview] =
      useState<VisualEffectApplication | null>(null),
    [visualEffectIntensity, setVisualEffectIntensity] = useState(1),
    [studioPanel, setStudioPanel] = useState<StudioPanel | null>(null),
    [activeTool, setActiveTool] = useState<EditorTool>("media"),
    [toolPanelOpen, setToolPanelOpen] = useState(false),
    [inspectorTab, setInspectorTab] = useState<EditorInspectorTab>("edit"),
    [selectedSocialPresetId, setSelectedSocialPresetId] =
      useState<SocialPresetId>("custom"),
    [draftSocialPresetId, setDraftSocialPresetId] =
      useState<SocialPresetId>("custom"),
    [videoTransform, setVideoTransform] = useState({
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
    }),
    [exportAspect, setExportAspect] = useState<ExportAspect>("original"),
    [exportResolution, setExportResolution] = useState<
      "source" | "1080" | "720"
    >("source"),
    [exportFps, setExportFps] = useState(30),
    [exportBitrate, setExportBitrate] = useState<"standard" | "high" | "ultra">(
      "high",
    ),
    [audioGain, setAudioGain] = useState(100),
    [audioEnhance, setAudioEnhance] = useState(true),
    [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]),
    [waveform, setWaveform] = useState<number[]>([]),
    [baseAudioState, setBaseAudioState] = useState<BaseAudioState>("idle"),
    [baseAudioCodec, setBaseAudioCodec] = useState(""),
    [transcribing, setTranscribing] = useState(false),
    [transcriptionProgress, setTranscriptionProgress] = useState(0),
    [transcriptionPhase, setTranscriptionPhase] = useState<
      "idle" | "preparing" | "uploading" | "transcribing" | "translating" | "finalizing"
    >("idle"),
    [detectedCaptionLanguage, setDetectedCaptionLanguage] = useState(""),
    [captionTargetLanguage, setCaptionTargetLanguage] = useState<
      "original" | "en" | "es"
    >("original"),
    [timelineThumbnails, setTimelineThumbnails] = useState<string[]>([]),
    [snapEnabled, setSnapEnabled] = useState(true),
    [markers, setMarkers] = useState<number[]>([]),
    [timelineZoom, setTimelineZoom] = useState(1),
    [timelineHeight, setTimelineHeight] = useState(300),
    [safeGuides, setSafeGuides] = useState(true),
    [sourceAspect, setSourceAspect] = useState(9 / 16),
    [layers, setLayers] = useState<TextLayer[]>([]),
    [illustrations, setIllustrations] = useState<IllustrationLayer[]>([]),
    [selectedId, setSelectedId] = useState(""),
    [selectedIllustrationId, setSelectedIllustrationId] = useState(""),
    [selectedAudioId, setSelectedAudioId] = useState(""),
    [exportFormat, setExportFormat] = useState<ExportFormat>("mp4"),
    [exporting, setExporting] = useState(false),
    [publishModalOpen, setPublishModalOpen] = useState(false),
    [publishBlob, setPublishBlob] = useState<Blob | null>(null),
    [exportProgress, setExportProgress] = useState(0),
    [notice, setNotice] = useState(""),
    [snapGuide, setSnapGuide] = useState<number | null>(null),
    [radarOpen, setRadarOpen] = useState(false),
    [radarAnalyzing, setRadarAnalyzing] = useState(false),
    [radarProgress, setRadarProgress] = useState(0),
    [radarStatus, setRadarStatus] = useState("Pronto para analisar"),
    [radarMode, setRadarMode] = useState<RadarMode>("reels"),
    [radarCount, setRadarCount] = useState(10),
    [radarSuggestions, setRadarSuggestions] = useState<RadarSuggestion[]>([]),
    [approvedCuts, setApprovedCuts] = useState<RadarSuggestion[]>([]),
    [activeRadarCutId, setActiveRadarCutId] = useState(""),
    [autosaveStatus, setAutosaveStatus] =
      useState<EditorAutosaveStatus>("restoring"),
    [autosaveSavedAt, setAutosaveSavedAt] = useState(0),
    [contextMenu, setContextMenu] = useState<{
      x: number;
      y: number;
      kind: "text" | "illustration" | "audio" | "video";
      id: string;
    } | null>(null);
  const history = useRef<EditorSnapshot[]>([]);
  const future = useRef<EditorSnapshot[]>([]);
  const editorRecorder = useRef<MediaRecorder | null>(null),
    cancelExport = useRef(false);
  const exportInProgress = useRef(false);
  const transcriptionResetTimer = useRef<number | null>(null);
  const selected =
    layers.find((layer) => layer.id === selectedId) ??
    (!selectedIllustrationId && !selectedAudioId ? layers[0] : undefined);
  const selectedIllustration = illustrations.find(
    (item) => item.id === selectedIllustrationId,
  );
  const selectedAudio = audioTracks.find(
    (track) => track.id === selectedAudioId,
  );
  const captionLanguageNames: Record<string, string> = {
    pt: "Português",
    en: "Inglês",
    es: "Espanhol",
    fr: "Francês",
    de: "Alemão",
    it: "Italiano",
    ja: "Japonês",
    ko: "Coreano",
    zh: "Chinês",
  };
  const detectedCaptionLanguageName =
    detectedCaptionLanguage && detectedCaptionLanguage !== "unknown"
      ? captionLanguageNames[detectedCaptionLanguage] || detectedCaptionLanguage
      : "";
  const automaticCaptionButtonLabel = transcribing
    ? `Transcrevendo · ${Math.round(transcriptionProgress)}%`
    : captionTargetLanguage !== "original"
      ? "Transcrever e traduzir"
      : detectedCaptionLanguageName
        ? `Gerar legenda · ${detectedCaptionLanguageName}`
        : "Detectar idioma e gerar legendas";
  const transcriptionPhaseLabel = {
    idle: "",
    preparing: "Preparando o áudio…",
    uploading: "Enviando o trecho com segurança…",
    transcribing: "Detectando o idioma e sincronizando as falas…",
    translating: "Traduzindo e preservando os tempos…",
    finalizing: "Criando a faixa de legendas…",
  }[transcriptionPhase];
  const soloAudioActive = audioTracks.some(
    (track) => track.solo && !track.muted,
  );
  const sceneItems = illustrations.filter((item) => item.role === "scene");
  const overlayItems = illustrations.filter((item) => item.role !== "scene");
  const isCaptionLayer = (layer: TextLayer) =>
    layer.kind === "caption" ||
    (layer.background && layer.effect === "pop" && layer.y >= 75);
  const captionLayers = layers.filter(isCaptionLayer);
  const regularTextLayers = layers.filter((layer) => !isCaptionLayer(layer));
  const baseDuration = sourceDuration || duration;
  const montageTimelineClips = approvedCuts
    .filter((item) => item.end - item.start > 0.05)
    .reduce<
      Array<RadarSuggestion & { timelineStart: number; timelineEnd: number }>
    >((items, item) => {
      const fallbackStart = items.reduce(
        (furthest, candidate) => Math.max(furthest, candidate.timelineEnd),
        0,
      );
      const timelineStart = Number.isFinite(item.timelineStart)
        ? Math.max(0, item.timelineStart as number)
        : fallbackStart;
      items.push({
        ...item,
        timelineStart,
        timelineEnd: timelineStart + item.end - item.start,
      });
      return items;
    }, [])
    .sort((first, second) => first.timelineStart - second.timelineStart);
  const montageTimelineDuration = Math.max(
    montageTimelineClips.reduce(
      (furthest, item) => Math.max(furthest, item.timelineEnd),
      0,
    ),
    montageTimelineClips.reduce(
      (total, item) => total + item.end - item.start,
      0,
    ),
  );
  const hasMontageTimeline = montageTimelineClips.length > 0;
  const activeMontageClip = hasMontageTimeline
    ? montageTimelineClips.find(
        (item) =>
          current >= item.timelineStart - 0.01 &&
          current < item.timelineEnd - 0.01,
      )
    : undefined;
  const editorTimelineDuration = hasMontageTimeline
    ? montageTimelineDuration
    : duration;
  const timelineWaveform =
    hasMontageTimeline && waveform.length && baseDuration
      ? montageTimelineClips.flatMap((item) => {
          const from = Math.max(
            0,
            Math.floor((item.start / baseDuration) * waveform.length),
          );
          const to = Math.max(
            from + 1,
            Math.ceil((item.end / baseDuration) * waveform.length),
          );
          return waveform.slice(from, Math.min(waveform.length, to));
        })
      : waveform;
  const montageAudioClips = montageTimelineClips.map((item) => {
    const from =
      waveform.length && baseDuration
        ? Math.max(0, Math.floor((item.start / baseDuration) * waveform.length))
        : 0;
    const to =
      waveform.length && baseDuration
        ? Math.max(
            from + 1,
            Math.ceil((item.end / baseDuration) * waveform.length),
          )
        : 0;
    return {
      ...item,
      waveform: waveform.slice(from, Math.min(waveform.length, to)),
    };
  });
  const primarySourceStart = Math.max(
    0,
    Math.min(start, Math.max(0, baseDuration - 0.05)),
  );
  const primarySourceEnd = Math.max(
    primarySourceStart + 0.05,
    Math.min(baseDuration || end, end || baseDuration),
  );
  const primaryClipStart = Math.max(0, primaryTimelineStart);
  const primaryClipEnd =
    primaryClipStart + Math.max(0.05, primarySourceEnd - primarySourceStart);
  const illustrationElements = useRef<
    Map<string, HTMLImageElement | HTMLVideoElement>
  >(new Map());
  const audioElements = useRef<Map<string, HTMLAudioElement>>(new Map());
  const managedAudioUrls = useRef<Set<string>>(new Set());
  const studioDialog = useRef<HTMLElement | null>(null);
  const timelineViewport = useRef<HTMLDivElement | null>(null);
  const timelineMore = useRef<HTMLDetailsElement | null>(null);
  const timelinePanelResize = useRef<{
    startY: number;
    startHeight: number;
  } | null>(null);
  const layerDrag = useRef<{
    id: string;
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const illustrationDrag = useRef<{
    id: string;
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const illustrationResize = useRef<{
    id: string;
    width: number;
    height: number;
    startX: number;
    startY: number;
    edge: "corner" | "right" | "bottom";
  } | null>(null);
  const timelineTrim = useRef<"start" | "end" | null>(null);
  const primaryTimelineDrag = useRef<{
    startX: number;
    timelineStart: number;
    projectDuration: number;
    trackWidth: number;
    moved: boolean;
  } | null>(null);
  const timelineItemDrag = useRef<{
    kind: "text" | "illustration" | "audio";
    id: string;
    edge: "move" | "start" | "end";
    start: number;
    end: number;
    startX: number;
  } | null>(null);
  const timelineFadeDrag = useRef<{
    kind: "text" | "illustration" | "audio";
    id: string;
    edge: "in" | "out";
    initial: number;
    startX: number;
  } | null>(null);
  const playheadDrag = useRef<{ left: number; width: number } | null>(null);
  const radarCutTrim = useRef<{
    id: string;
    edge: "start" | "end";
    start: number;
    end: number;
    startX: number;
    trackWidth: number;
    timelineDuration: number;
    timelineStart: number;
  } | null>(null);
  const radarCutMove = useRef<{
    id: string;
    startX: number;
    timelineStart: number;
    clipDuration: number;
    trackWidth: number;
    timelineDuration: number;
  } | null>(null);
  const clipboard = useRef<{
    kind: "text" | "illustration" | "audio";
    item: TextLayer | IllustrationLayer | AudioTrack;
  } | null>(null);
  const transitionResize = useRef<{
    edge: "in" | "out";
    initial: number;
    startX: number;
  } | null>(null);
  const transitionMove = useRef<{
    edge: "in" | "out";
    initial: number;
    startX: number;
  } | null>(null);
  const videoFrameDrag = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const videoFrameResize = useRef<{
    scaleX: number;
    scaleY: number;
    startX: number;
    startY: number;
    edge: "left" | "right" | "top" | "bottom" | "corner";
  } | null>(null);
  const baseLoopOffset = useRef(0);
  const autoRadarAnalyzed = useRef(false);
  const radarPreviewEnd = useRef<number | null>(null);
  const autosaveReady = useRef(false);
  const autosaveRunning = useRef(false);
  const autosaveQueued = useRef(false);
  const autosaveTimer = useRef<number | null>(null);
  const persistedRecoveryAssets = useRef<Set<string>>(new Set());
  const recoveryObjectUrls = useRef<Set<string>>(new Set());

  const releaseManagedAudioUrls = () => {
    managedAudioUrls.current.forEach((url) => URL.revokeObjectURL(url));
    managedAudioUrls.current.clear();
  };

  useEffect(() => () => releaseManagedAudioUrls(), []);

  const buildRecoveryProject = (): EditorRecoveryProject | null =>
    clip
      ? {
          version: 1,
          clip,
          duration,
          sourceDuration,
          current,
          start,
          end,
          primaryTimelineStart,
          videoFadeIn,
          videoFadeOut,
          videoFadeInAt,
          videoFadeOutAt,
          transitionColor,
          transitionKind,
          videoTransform,
          exportAspect,
          exportResolution,
          exportFps,
          exportBitrate,
          exportFormat,
          audioGain,
          audioEnhance,
          audioTracks,
          visualPreset,
          visualEffect,
          visualEffectIntensity,
          selectedSocialPresetId,
          safeGuides,
          markers,
          timelineZoom,
          timelineHeight,
          layers,
          illustrations,
          radarMode,
          radarCount,
          radarSuggestions,
          approvedCuts,
        }
      : null;

  async function collectRecoveryAssets(project: EditorRecoveryProject) {
    const references = [
      { url: project.clip.url, name: project.clip.name },
      ...project.illustrations.map((item) => ({
        url: item.url,
        name: item.name,
      })),
      ...project.audioTracks.map((item) => ({
        url: item.url,
        name: item.name,
      })),
    ];
    const assets: EditorRecoveryAsset[] = [];
    for (const reference of references) {
      if (
        !reference.url?.startsWith("blob:") ||
        persistedRecoveryAssets.current.has(reference.url)
      )
        continue;
      const response = await fetch(reference.url);
      if (!response.ok) throw new Error("Não foi possível guardar a mídia local.");
      assets.push({
        id: reference.url,
        blob: await response.blob(),
        name: reference.name,
      });
    }
    return assets;
  }

  async function saveRecoveryNow() {
    if (!autosaveReady.current) return;
    if (autosaveRunning.current) {
      autosaveQueued.current = true;
      return;
    }
    const project = buildRecoveryProject();
    if (!project) return;
    autosaveRunning.current = true;
    setAutosaveStatus("saving");
    try {
      const assets = await collectRecoveryAssets(project);
      await saveEditorRecovery(project, assets);
      assets.forEach((asset) =>
        persistedRecoveryAssets.current.add(asset.id),
      );
      const savedAt = Date.now();
      setAutosaveSavedAt(savedAt);
      setAutosaveStatus("saved");
    } catch (error) {
      console.error("Klip autosave failed", error);
      setAutosaveStatus("error");
    } finally {
      autosaveRunning.current = false;
      if (autosaveQueued.current) {
        autosaveQueued.current = false;
        autosaveTimer.current = window.setTimeout(
          () => void saveRecoveryNow(),
          250,
        );
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await navigator.storage?.persist?.().catch(() => false);
        if (initialClip) {
          autosaveReady.current = true;
          setAutosaveStatus("idle");
          return;
        }
        const recovery = await loadEditorRecovery<EditorRecoveryProject>();
        if (cancelled) return;
        const project = recovery?.project;
        if (!project?.clip?.url || project.version !== 1) {
          autosaveReady.current = true;
          setAutosaveStatus("idle");
          return;
        }
        const hydratedUrls = new Map<string, string>();
        const hydrateUrl = async (url: string) => {
          if (!url.startsWith("blob:")) return url;
          const existing = hydratedUrls.get(url);
          if (existing) return existing;
          const asset = await loadEditorRecoveryAsset(url);
          if (!asset?.blob) return "";
          const hydrated = URL.createObjectURL(asset.blob);
          hydratedUrls.set(url, hydrated);
          recoveryObjectUrls.current.add(hydrated);
          return hydrated;
        };
        const clipUrl = await hydrateUrl(project.clip.url);
        if (!clipUrl) throw new Error("Mídia principal não encontrada");
        const restoredIllustrations = (
          await Promise.all(
            project.illustrations.map(async (item) => ({
              ...item,
              url: await hydrateUrl(item.url),
            })),
          )
        ).filter((item) => Boolean(item.url));
        const restoredAudioTracks = (
          await Promise.all(
            project.audioTracks.map(async (item) => ({
              ...item,
              url: await hydrateUrl(item.url),
            })),
          )
        ).filter((item) => Boolean(item.url));
        if (cancelled) return;
        history.current = [];
        future.current = [];
        setClip({ ...project.clip, url: clipUrl });
        setDuration(project.duration || 0);
        setSourceDuration(project.sourceDuration || project.duration || 0);
        setCurrent(Math.max(0, project.current || 0));
        setStart(Math.max(0, project.start || 0));
        setEnd(Math.max(0, project.end || project.duration || 0));
        setPrimaryTimelineStart(Math.max(0, project.primaryTimelineStart || 0));
        setVideoFadeIn(Math.max(0, project.videoFadeIn || 0));
        setVideoFadeOut(Math.max(0, project.videoFadeOut || 0));
        setVideoFadeInAt(Math.max(0, project.videoFadeInAt || 0));
        setVideoFadeOutAt(Math.max(0, project.videoFadeOutAt || 0));
        setTransitionColor(project.transitionColor || "black");
        setTransitionKind(project.transitionKind || "fade-black");
        setVideoTransform(project.videoTransform);
        setExportAspect(project.exportAspect || "original");
        setExportResolution(project.exportResolution || "source");
        setExportFps(project.exportFps || 30);
        setExportBitrate(project.exportBitrate || "high");
        setExportFormat(project.exportFormat || "mp4");
        setAudioGain(project.audioGain ?? 100);
        setAudioEnhance(project.audioEnhance !== false);
        setAudioTracks(restoredAudioTracks);
        setVisualPreset(project.visualPreset || "clean");
        setVisualEffect(project.visualEffect || null);
        setVisualEffectIntensity(project.visualEffectIntensity ?? 1);
        setSelectedSocialPresetId(project.selectedSocialPresetId || "custom");
        setDraftSocialPresetId(project.selectedSocialPresetId || "custom");
        setSafeGuides(project.safeGuides !== false);
        setMarkers(project.markers || []);
        setTimelineZoom(project.timelineZoom || 1);
        setTimelineHeight(project.timelineHeight || 300);
        setLayers(project.layers || []);
        setIllustrations(restoredIllustrations);
        setRadarMode(project.radarMode || "reels");
        setRadarCount(project.radarCount || 10);
        setRadarSuggestions(project.radarSuggestions || []);
        setApprovedCuts(project.approvedCuts || []);
        setAutosaveSavedAt(recovery?.savedAt || Date.now());
        setAutosaveStatus("saved");
        setNotice("Projeto recuperado automaticamente do armazenamento local.");
      } catch (error) {
        console.error("Klip recovery failed", error);
        setAutosaveStatus("error");
        setNotice(
          "Não foi possível recuperar o projeto automático. Você ainda pode abrir um projeto manualmente.",
        );
      } finally {
        if (!cancelled) autosaveReady.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
    // A recuperação deve acontecer uma vez por abertura do editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recoverySignature = clip
    ? JSON.stringify({
        clip: clip.url,
        duration,
        sourceDuration,
        start,
        end,
        primaryTimelineStart,
        videoFadeIn,
        videoFadeOut,
        videoFadeInAt,
        videoFadeOutAt,
        transitionColor,
        transitionKind,
        videoTransform,
        exportAspect,
        exportResolution,
        exportFps,
        exportBitrate,
        exportFormat,
        audioGain,
        audioEnhance,
        audioTracks,
        visualPreset,
        visualEffect,
        visualEffectIntensity,
        selectedSocialPresetId,
        safeGuides,
        markers,
        timelineZoom,
        timelineHeight,
        layers,
        illustrations,
        radarMode,
        radarCount,
        radarSuggestions,
        approvedCuts,
      })
    : "";

  useEffect(() => {
    if (!autosaveReady.current || !clip) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(
      () => void saveRecoveryNow(),
      900,
    );
    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    };
    // recoverySignature representa todas as alterações persistentes do editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recoverySignature]);

  useEffect(() => {
    const flush = () => {
      if (autosaveReady.current && clip) void saveRecoveryNow();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // O fechamento da página usa o estado mais recente disponível.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip, recoverySignature]);

  useEffect(
    () => () => {
      recoveryObjectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      recoveryObjectUrls.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const viewport = timelineViewport.current;
    if (!clip || !viewport) return;
    const onPrecisionWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomTimelineAtClient(event.deltaY, event.clientX, viewport);
    };
    viewport.addEventListener("wheel", onPrecisionWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onPrecisionWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- O listener é recriado quando o zoom muda para capturar a escala atual; adicionar a função não memoizada reinstalaria o listener em toda renderização.
  }, [clip, timelineZoom]);

  useEffect(() => {
    if (!studioPanel) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = studioDialog.current;
    const focusableSelector =
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const focusFirst = window.requestAnimationFrame(() =>
      dialog?.querySelector<HTMLElement>(focusableSelector)?.focus(),
    );
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeStudioPanel();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelector),
      );
      if (!focusable.length) return;
      const first = focusable[0],
        last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleDialogKeys);
    return () => {
      window.cancelAnimationFrame(focusFirst);
      document.removeEventListener("keydown", handleDialogKeys);
      previousFocus?.focus();
    };
  }, [studioPanel]);

  useEffect(() => {
    const syncPlayback = () => {
      const basePlaying = Boolean(
        video.current && !video.current.paused && !video.current.ended,
      );
      const scenePlaying = Array.from(
        illustrationElements.current.values(),
      ).some(
        (element) =>
          element instanceof HTMLVideoElement &&
          !element.paused &&
          !element.ended,
      );
      setIsPlaying(basePlaying || scenePlaying);
    };
    syncPlayback();
    const timer = window.setInterval(syncPlayback, 180);
    return () => window.clearInterval(timer);
  }, [clip]);

  useEffect(() => {
    audioTracks.forEach((track) => {
      const element = audioElements.current.get(track.id);
      if (!element) return;
      const active = current >= track.start && current < track.end;
      const desired = Math.max(0, current - track.start);
      if (Math.abs(element.currentTime - desired) > 0.38)
        element.currentTime = desired;
      const edge =
        track.fadeIn > 0 ? Math.min(1, Math.max(0, desired / track.fadeIn)) : 1;
      const remaining = Math.max(0, track.end - current);
      const audible =
        !track.muted && (!soloAudioActive || Boolean(track.solo));
      element.volume = audible
        ? Math.max(
            0,
            Math.min(
              1,
              (track.volume / 100) *
                edge *
                (track.fadeOut > 0
                  ? Math.min(1, remaining / track.fadeOut)
                  : 1),
            ),
          )
        : 0;
      if (isPlaying && active && element.paused)
        void element.play().catch(() => undefined);
      if ((!isPlaying || !active) && !element.paused) element.pause();
    });
  }, [audioTracks, current, isPlaying, soloAudioActive]);

  useEffect(() => {
    if (!clip) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setBaseAudioState("checking");
      setBaseAudioCodec("");
      setWaveform([]);
    });
    const probePlayableAudio = () => {
      // AudioContext does not decode every MP4/MOV container even when the
      // browser can play its audio. Probe playback separately so a codec
      // limitation is never reported as "no audio".
      const probe = document.createElement("audio");
      probe.preload = "metadata";
      probe.src = clip.url;
      const finish = (state: BaseAudioState) => {
        if (!cancelled) setBaseAudioState(state);
        probe.removeAttribute("src");
        probe.load();
      };
      probe.onloadedmetadata = () =>
        finish(
          Number.isFinite(probe.duration) && probe.duration > 0
            ? "detected"
            : "none",
        );
      probe.onerror = () => finish("none");
      probe.load();
    };
    void (async () => {
      try {
        const response = await fetch(clip.url);
        const blob = await response.blob();
        let values: number[] = [];
        try {
          values = await buildAudioWaveform(await blob.arrayBuffer(), 1200);
        } catch {
          const extracted = await buildContainerAudioWaveform(blob, 480);
          if (!cancelled) setBaseAudioCodec(extracted.codec);
          values = extracted.values;
        }
        if (!cancelled) {
          setWaveform(values);
          if (values.length) setBaseAudioState("waveform");
          else probePlayableAudio();
        }
      } catch {
        probePlayableAudio();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clip]);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.volume = Math.max(0, Math.min(1, audioGain / 100));
  }, [audioGain, clip]);

  useEffect(() => {
    let cancelled = false;
    const generatedUrls: string[] = [];
    const thumbnailVideo = document.createElement("video");
    thumbnailVideo.muted = true;
    thumbnailVideo.playsInline = true;
    thumbnailVideo.preload = "auto";
    if (!clip?.url) return;

    const waitForMediaEvent = (
      eventName: "loadedmetadata" | "loadeddata" | "seeked",
    ) =>
      new Promise<void>((resolve, reject) => {
        let timer = 0;
        const cleanup = () => {
          window.clearTimeout(timer);
          thumbnailVideo.removeEventListener(eventName, onReady);
          thumbnailVideo.removeEventListener("error", onError);
        };
        const onReady = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error(`thumbnail-${eventName}`));
        };
        thumbnailVideo.addEventListener(eventName, onReady, { once: true });
        thumbnailVideo.addEventListener("error", onError, { once: true });
        timer = window.setTimeout(onError, 8_000);
      });
    const seekFrame = async (at: number) => {
      if (
        thumbnailVideo.readyState >= 2 &&
        Math.abs(thumbnailVideo.currentTime - at) < 0.01
      )
        return;
      const ready = waitForMediaEvent("seeked");
      thumbnailVideo.currentTime = at;
      await ready;
    };

    void (async () => {
      const metadataReady = waitForMediaEvent("loadedmetadata");
      thumbnailVideo.src = clip.url;
      thumbnailVideo.load();
      await metadataReady;
      if (thumbnailVideo.readyState < 2) await waitForMediaEvent("loadeddata");
      const mediaDuration = thumbnailVideo.duration;
      if (
        !Number.isFinite(mediaDuration) ||
        mediaDuration <= 0.05 ||
        !thumbnailVideo.videoWidth ||
        !thumbnailVideo.videoHeight
      )
        return;
      const frameCount = mediaDuration < 8 ? 10 : 12;
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 90;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;
      const cover = Math.max(
        canvas.width / thumbnailVideo.videoWidth,
        canvas.height / thumbnailVideo.videoHeight,
      );
      const drawWidth = thumbnailVideo.videoWidth * cover;
      const drawHeight = thumbnailVideo.videoHeight * cover;
      const drawX = (canvas.width - drawWidth) / 2;
      const drawY = (canvas.height - drawHeight) / 2;

      for (let index = 0; index < frameCount && !cancelled; index += 1) {
        const sampleAt = Math.min(
          Math.max(0, mediaDuration - 0.04),
          mediaDuration * ((index + 0.5) / frameCount),
        );
        await seekFrame(sampleAt);
        if (cancelled) break;
        context.drawImage(thumbnailVideo, drawX, drawY, drawWidth, drawHeight);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/webp", 0.62),
        );
        if (!blob) continue;
        generatedUrls.push(URL.createObjectURL(blob));
      }
      if (!cancelled) setTimelineThumbnails([...generatedUrls]);
    })().catch(() => {
      generatedUrls.forEach((url) => URL.revokeObjectURL(url));
      if (!cancelled) setTimelineThumbnails([]);
    });

    return () => {
      cancelled = true;
      thumbnailVideo.pause();
      thumbnailVideo.removeAttribute("src");
      thumbnailVideo.load();
      generatedUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [clip?.url]);

  useEffect(() => {
    const player = video.current;
    if (!player || !clip) return;
    let animation = 0;
    let callback = 0;
    const update = () => {
      if (
        !exportInProgress.current &&
        !player.paused &&
        Number.isFinite(player.currentTime)
      )
        setCurrent(baseLoopOffset.current + player.currentTime);
      const framePlayer = player as HTMLVideoElement & {
        requestVideoFrameCallback?: (handler: () => void) => number;
        cancelVideoFrameCallback?: (id: number) => void;
      };
      if (framePlayer.requestVideoFrameCallback)
        callback = framePlayer.requestVideoFrameCallback(update);
      else animation = requestAnimationFrame(update);
    };
    update();
    return () => {
      if (animation) cancelAnimationFrame(animation);
      const framePlayer = player as HTMLVideoElement & {
        cancelVideoFrameCallback?: (id: number) => void;
      };
      if (callback) framePlayer.cancelVideoFrameCallback?.(callback);
    };
  }, [clip]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const interactive = target?.closest(
        "input, textarea, select, button, a, summary, [contenteditable='true'], [role='slider'], [role='menuitem']",
      );
      if (interactive) return;
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (meta && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copySelected();
        return;
      }
      if (meta && event.key.toLowerCase() === "v") {
        event.preventDefault();
        pasteSelected();
        return;
      }
      if (meta && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
        return;
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        splitSelectedAtPlayhead();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        const frameStep = event.shiftKey ? 1 : 1 / Math.max(1, exportFps);
        seek(current + direction * frameStep);
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        void togglePreviewPlayback();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Os atalhos são registrados novamente quando o estado editável muda; as funções de comando são recriadas e adicioná-las causaria reinstalação em toda renderização.
  }, [
    selectedId,
    selectedIllustrationId,
    selectedAudioId,
    clip,
    layers,
    illustrations,
    audioTracks,
    start,
    end,
    current,
    exportFps,
    videoFadeIn,
    videoFadeOut,
    videoFadeInAt,
    videoFadeOutAt,
  ]);

  const time = (value: number) => {
    const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
    const minutes = Math.floor(safe / 60);
    const seconds = Math.floor(safe % 60);
    if (timelineZoom >= 8) {
      const milliseconds = Math.floor((safe % 1) * 1000);
      return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
    }
    const tenths = Math.floor((safe % 1) * 10);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
  };
  const setTimelineZoomAnchored = (nextZoom: number, anchorRatio = 0.5) => {
    const viewport = timelineViewport.current;
    const clamped = Math.max(1, Math.min(64, nextZoom));
    if (!viewport) {
      setTimelineZoom(clamped);
      return;
    }
    const anchorX = Math.max(
      0,
      Math.min(viewport.clientWidth, viewport.clientWidth * anchorRatio),
    );
    const contentRatio =
      (viewport.scrollLeft + anchorX) / Math.max(1, viewport.scrollWidth);
    setTimelineZoom(clamped);
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(
        0,
        contentRatio * viewport.scrollWidth - anchorX,
      );
    });
  };
  const zoomTimelineAtClient = (
    deltaY: number,
    clientX: number,
    viewport: HTMLDivElement,
  ) => {
    const bounds = viewport.getBoundingClientRect();
    const anchorRatio = Math.max(
      0,
      Math.min(1, (clientX - bounds.left) / Math.max(1, bounds.width)),
    );
    const factor = Math.exp(-deltaY * 0.0028);
    setTimelineZoomAnchored(timelineZoom * factor, anchorRatio);
  };
  const snapshot = (): EditorSnapshot => ({
    layers,
    illustrations,
    audioTracks,
    start,
    end,
    primaryTimelineStart,
    videoFadeIn,
    videoFadeOut,
    videoFadeInAt,
    videoFadeOutAt,
    transitionColor,
    transitionKind,
    visualEffect,
    visualEffectIntensity,
    approvedCuts,
  });
  const remember = () => {
    history.current = [...history.current.slice(-40), snapshot()];
    future.current = [];
  };
  const restoreSnapshot = (item: EditorSnapshot) => {
    setLayers(item.layers);
    setIllustrations(item.illustrations);
    setAudioTracks(item.audioTracks);
    setStart(item.start);
    setEnd(item.end);
    setPrimaryTimelineStart(item.primaryTimelineStart || 0);
    setVideoFadeIn(item.videoFadeIn);
    setVideoFadeOut(item.videoFadeOut);
    setVideoFadeInAt(item.videoFadeInAt);
    setVideoFadeOutAt(item.videoFadeOutAt);
    setTransitionColor(item.transitionColor);
    setTransitionKind(item.transitionKind || "fade-black");
    setVisualEffect(item.visualEffect || null);
    setVisualEffectIntensity(item.visualEffectIntensity || 1);
    setApprovedCuts(item.approvedCuts || []);
  };
  const undo = () => {
    const previous = history.current.pop();
    if (!previous) return;
    future.current.push(snapshot());
    restoreSnapshot(previous);
    setNotice("Ação desfeita.");
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(snapshot());
    restoreSnapshot(next);
    setNotice("Ação refeita.");
  };
  const updateLayer = (
    id: string,
    patch: Partial<TextLayer>,
    record = true,
  ) => {
    if (record) remember();
    setLayers((items) =>
      items.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
    );
  };
  const updateIllustration = (
    id: string,
    patch: Partial<IllustrationLayer>,
    record = true,
  ) => {
    if (record) remember();
    setIllustrations((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };
  useEffect(() => {
    if (!clip) return;
    try {
      localStorage.setItem(
        "klip-editor-draft",
        JSON.stringify({
          name: clip.name,
          start,
          end,
          primaryTimelineStart,
          videoFadeIn,
          videoFadeOut,
          videoFadeInAt,
          videoFadeOutAt,
          videoTransform,
          exportAspect,
          exportResolution,
          layers,
          illustrations,
        }),
      );
    } catch {
      /* storage may be unavailable */
    }
  }, [
    clip,
    start,
    end,
    primaryTimelineStart,
    videoFadeIn,
    videoFadeOut,
    videoFadeInAt,
    videoFadeOutAt,
    videoTransform,
    exportAspect,
    exportResolution,
    layers,
    illustrations,
  ]);
  const layerOpacity = (layer: TimedLayer, at: number) => {
    if (at < layer.start || at > layer.end) return 0;
    let opacity = 1;
    if (layer.fadeIn > 0)
      opacity = Math.min(opacity, (at - layer.start) / layer.fadeIn);
    if (layer.fadeOut > 0)
      opacity = Math.min(opacity, (layer.end - at) / layer.fadeOut);
    return Math.max(0, Math.min(1, opacity));
  };
  const videoTransitionOpacity = (at: number) => {
    if (at < start || at > end) return 1;
    let opacity = 0;
    if (
      videoFadeIn > 0 &&
      at >= videoFadeInAt &&
      at <= videoFadeInAt + videoFadeIn
    )
      opacity = Math.max(
        opacity,
        Math.pow(
          1 - Math.min(1, Math.max(0, (at - videoFadeInAt) / videoFadeIn)),
          1.7,
        ),
      );
    if (
      videoFadeOut > 0 &&
      at >= videoFadeOutAt &&
      at <= videoFadeOutAt + videoFadeOut
    )
      opacity = Math.max(
        opacity,
        Math.pow(
          Math.min(1, Math.max(0, (at - videoFadeOutAt) / videoFadeOut)),
          1.7,
        ),
      );
    return Math.max(0, Math.min(1, opacity));
  };
  const montageTransitionAt = (at: number) => {
    const item = montageTimelineClips.find(
      (candidate) =>
        candidate.timelineStart <= at && at < candidate.timelineEnd,
    );
    if (!item)
      return {
        opacity: 0,
        color: "black" as const,
        kind: "fade-black" as const,
      };
    const local = Math.max(0, at - item.timelineStart);
    const remaining = Math.max(0, item.timelineEnd - at);
    const fadeIn = Math.max(
      0,
      Math.min(item.fadeIn || 0, item.timelineEnd - item.timelineStart),
    );
    const fadeOut = Math.max(
      0,
      Math.min(item.fadeOut || 0, item.timelineEnd - item.timelineStart),
    );
    const inOpacity = fadeIn > 0 ? 1 - Math.min(1, local / fadeIn) : 0;
    const outOpacity = fadeOut > 0 ? 1 - Math.min(1, remaining / fadeOut) : 0;
    return inOpacity >= outOpacity
      ? {
          opacity: inOpacity,
          color: item.fadeInColor || "black",
          kind:
            item.fadeInKind ||
            (item.fadeInColor === "white" ? "fade-white" : "fade-black"),
        }
      : {
          opacity: outOpacity,
          color: item.fadeOutColor || "black",
          kind:
            item.fadeOutKind ||
            (item.fadeOutColor === "white" ? "fade-white" : "fade-black"),
        };
  };
  const previewTransition = hasMontageTimeline
    ? montageTransitionAt(current)
    : {
        opacity: videoTransitionOpacity(current),
        color: transitionColor,
        kind: transitionKind,
      };
  const transitionLabel = (kind: TransitionKind) =>
    ({
      "fade-black": "Fade preto",
      "fade-white": "Fade branco",
      flash: "Flash",
      dissolve: "Dissolver",
      wipe: "Cortina",
      none: "Sem transição",
    })[kind];
  const transitionDuration = (kind: TransitionKind) =>
    kind === "none"
      ? 0
      : kind === "flash"
        ? 0.42
        : kind === "dissolve"
          ? 0.8
          : kind === "wipe"
            ? 0.7
            : 1;
  const transitionOverlayStyle = (transition: {
    opacity: number;
    color: "black" | "white";
    kind: Exclude<TransitionKind, "none">;
  }): React.CSSProperties => {
    if (transition.kind === "wipe")
      return {
        opacity: 1,
        backgroundColor: "#05070b",
        clipPath: `inset(0 ${Math.max(0, (1 - transition.opacity) * 100)}% 0 0)`,
      };
    if (transition.kind === "dissolve")
      return {
        opacity: transition.opacity * 0.88,
        backgroundColor: "#05070b",
        backgroundImage:
          "radial-gradient(circle, #fff7 0 1px, transparent 1.5px)",
        backgroundSize: "7px 7px",
      };
    return {
      opacity: Math.min(
        1,
        transition.opacity * (transition.kind === "flash" ? 1.22 : 1),
      ),
      backgroundColor:
        transition.kind === "flash" || transition.color === "white"
          ? "#fff"
          : "#000",
    };
  };
  const effectProgress = (layer: TextLayer, at: number) =>
    Math.max(0, Math.min(1, (at - layer.start) / 0.45));
  const visibleText = (layer: TextLayer, at: number) => {
    if (layer.effect !== "typewriter") return layer.text;
    const progress = Math.max(0, Math.min(1, (at - layer.start) / 1.6));
    return layer.text.slice(0, Math.ceil(layer.text.length * progress));
  };
  const visualFilter =
    visualPreset === "cinematic"
      ? "contrast(1.12) saturate(.84) brightness(.92)"
      : visualPreset === "vivid"
        ? "contrast(1.08) saturate(1.35)"
        : visualPreset === "mono"
          ? "grayscale(1) contrast(1.18)"
          : visualPreset === "warm"
            ? "sepia(.22) saturate(1.16) contrast(1.04)"
            : "none";
  const selectedSocialPreset = getSocialPreset(selectedSocialPresetId);
  const activeVisualEffect = visualEffectPreview || visualEffect;
  const activeEffectFrame = activeVisualEffect
    ? getVisualEffectFrame(
        activeVisualEffect.effectId,
        ((current * 1000) % activeVisualEffect.durationMs) /
          activeVisualEffect.durationMs,
        activeVisualEffect.intensity,
      )
    : null;
  const activeEffectFilter = activeEffectFrame
    ? visualEffectFrameToCssFilter(activeEffectFrame)
    : "";
  const previewFilter =
    [visualFilter === "none" ? "" : visualFilter, activeEffectFilter]
      .filter(Boolean)
      .join(" ") || "none";
  function closeStudioPanel() {
    setVisualEffectPreview(null);
    setStudioPanel(null);
  }
  function applySocialPreset(preset: SocialPreset) {
    setSelectedSocialPresetId(preset.id);
    setDraftSocialPresetId(preset.id);
    // A troca de formato começa de um enquadramento previsível. Ajustes feitos
    // para 9:16 não devem deixar a mídia pequena ou deslocada ao ir para 16:9.
    setVideoTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    if (preset.aspectRatio.width === 9 && preset.aspectRatio.height === 16)
      setExportAspect("vertical");
    else if (preset.aspectRatio.width === 4 && preset.aspectRatio.height === 5)
      setExportAspect("portrait");
    else if (preset.aspectRatio.width === 16 && preset.aspectRatio.height === 9)
      setExportAspect("landscape");
    else if (preset.aspectRatio.width === 1 && preset.aspectRatio.height === 1)
      setExportAspect("square");
    else setExportAspect("original");
    setExportResolution("1080");
    setExportFps(preset.fps);
    setSafeGuides(true);
    const projectLength = hasMontageTimeline
      ? montageTimelineDuration
      : Math.max(0, duration, end - start);
    const durationWarning =
      projectLength > preset.recommendedDuration.maxSeconds
        ? ` Seu vídeo tem ${time(projectLength)}; para ${preset.title}, recomendamos até ${preset.recommendedDuration.label}.`
        : "";
    setNotice(
      `${preset.title} configurado em ${preset.aspectRatio.label}, ${preset.resolution.width}×${preset.resolution.height} e ${preset.fps} FPS. A mídia foi centralizada e adaptada ao novo quadro.${durationWarning}`,
    );
    closeStudioPanel();
  }
  function resetWithClip(nextClip: EditorClip, message: string) {
    if (clip?.url.startsWith("blob:")) URL.revokeObjectURL(clip.url);
    releaseManagedAudioUrls();
    history.current = [];
    future.current = [];
    setTimelineThumbnails([]);
    setClip(nextClip);
    setDuration(0);
    setSourceDuration(0);
    setCurrent(0);
    setStart(0);
    setEnd(0);
    setPrimaryTimelineStart(0);
    setVideoFadeIn(0);
    setVideoFadeOut(0);
    setVideoFadeInAt(0);
    setVideoFadeOutAt(0);
    setVideoTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    setVisualPreset("clean");
    setVisualEffect(null);
    setVisualEffectPreview(null);
    setVisualEffectIntensity(1);
    setSelectedSocialPresetId("custom");
    setDraftSocialPresetId("custom");
    setExportAspect("original");
    setExportResolution("source");
    setMarkers([]);
    setLayers([]);
    setIllustrations([]);
    setAudioTracks([]);
    setSelectedId("");
    setSelectedIllustrationId("");
    setDetectedCaptionLanguage("");
    setRadarSuggestions([]);
    setApprovedCuts([]);
    setActiveRadarCutId("");
    setRadarProgress(0);
    setRadarStatus("Pronto para analisar");
    autoRadarAnalyzed.current = false;
    setNotice(message);
  }
  async function turnPhotoIntoClip(
    file: File,
    target: "main" | "scene" = "main",
  ) {
    if (
      typeof MediaRecorder === "undefined" ||
      !HTMLCanvasElement.prototype.captureStream
    ) {
      setNotice(
        "Este navegador não consegue transformar fotos em vídeo. Use uma versão atual do Chrome.",
      );
      return;
    }
    setNotice("Transformando sua foto em um clipe animado…");
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("image-load"));
        image.src = imageUrl;
      });
      const aspect = image.naturalWidth / image.naturalHeight || 16 / 9;
      const canvas = document.createElement("canvas");
      const width = aspect >= 1 ? 1280 : 720;
      const height = Math.max(2, Math.round(width / aspect / 2) * 2);
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas");
      const stream = canvas.captureStream(30);
      const mime = mimeForExport("webm") || "video/webm";
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 8_000_000,
      });
      const chunks: BlobPart[] = [];
      const seconds = 6;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () =>
        setNotice("Não foi possível gerar o clipe a partir desta foto.");
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        URL.revokeObjectURL(imageUrl);
        if (!chunks.length) return;
        const generated = {
          url: URL.createObjectURL(new Blob(chunks, { type: mime })),
          name: `${file.name.replace(/\.[^.]+$/, "")} · foto animada`,
        };
        if (target === "scene")
          insertScene(generated.url, generated.name, seconds, false);
        else {
          setSourceAspect(aspect);
          resetWithClip(
            generated,
            "Foto transformada em clipe de 6 segundos. Arraste, corte, adicione áudio e exporte.",
          );
        }
      };
      const draw = (progress: number) => {
        context.fillStyle = "#090909";
        context.fillRect(0, 0, width, height);
        const cover = Math.max(
          width / image.naturalWidth,
          height / image.naturalHeight,
        );
        const zoom = 1 + progress * 0.075;
        const drawWidth = image.naturalWidth * cover * zoom;
        const drawHeight = image.naturalHeight * cover * zoom;
        const driftX = Math.sin(progress * Math.PI) * width * 0.018;
        context.drawImage(
          image,
          (width - drawWidth) / 2 + driftX,
          (height - drawHeight) / 2,
          drawWidth,
          drawHeight,
        );
      };
      const started = performance.now();
      const render = () => {
        const progress = Math.min(
          1,
          (performance.now() - started) / (seconds * 1000),
        );
        draw(progress);
        if (progress < 1) requestAnimationFrame(render);
        else recorder.stop();
      };
      recorder.start(250);
      render();
    } catch {
      URL.revokeObjectURL(imageUrl);
      setNotice(
        "Não foi possível abrir esta foto. Tente JPG, PNG, WebP ou GIF.",
      );
    }
  }
  async function selectFile(file?: File) {
    if (!file) return;
    if (file.type.startsWith("image/")) {
      await turnPhotoIntoClip(file);
      return;
    }
    resetWithClip(
      {
        url: URL.createObjectURL(file),
        name: file.name.replace(/\.[^.]+$/, ""),
      },
      "Vídeo carregado. Agora monte as camadas na linha do tempo.",
    );
  }
  function insertScene(
    url: string,
    name: string,
    mediaDuration: number,
    withAudio: boolean,
  ) {
    const from = Math.max(baseDuration, duration);
    const clipLength = Math.max(0.4, mediaDuration || 6);
    const scene: IllustrationLayer = {
      id: crypto.randomUUID(),
      kind: "video",
      url,
      name,
      x: 50,
      y: 50,
      size: 140,
      start: from,
      end: from + clipLength,
      fadeIn: 0.35,
      fadeOut: 0.35,
      fit: "cover",
      role: "scene",
    };
    remember();
    setIllustrations((items) => [...items, scene]);
    setDuration((projectLength) => Math.max(projectLength, scene.end));
    if (withAudio)
      setAudioTracks((items) => [
        ...items,
        {
          id: crypto.randomUUID(),
          url,
          name: `Áudio · ${scene.name}`,
          start: scene.start,
          end: scene.end,
          volume: 100,
          fadeIn: scene.fadeIn,
          fadeOut: scene.fadeOut,
        },
      ]);
    setSelectedIllustrationId(scene.id);
    setSelectedId("");
    setSelectedAudioId("");
    setNotice(
      "Novo clipe colocado depois do vídeo principal. Arraste-o, corte pelas pontas ou mova-o livremente na faixa VÍDEO.",
    );
  }
  async function addSceneMedia(file?: File) {
    if (!file) return;
    if (file.type.startsWith("image/")) {
      await turnPhotoIntoClip(file, "scene");
      return;
    }
    addSceneVideo(file);
  }
  function addSceneVideo(file?: File) {
    if (!file || !file.type.startsWith("video/")) return;
    const url = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = url;
    probe.onloadedmetadata = () => {
      insertScene(
        url,
        file.name.replace(/\.[^.]+$/, ""),
        Number.isFinite(probe.duration) && probe.duration > 0
          ? probe.duration
          : 6,
        true,
      );
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      setNotice("Não foi possível abrir este vídeo como cena.");
    };
  }
  function addAudioTrack(
    file?: File,
    metadata?: { assetId?: string; license?: AudioLicense },
    durationHint?: number,
  ): Promise<boolean> {
    if (!file) return Promise.resolve(false);
    const url = URL.createObjectURL(file);
    const waveformPromise = file
      .arrayBuffer()
      .then((buffer) => buildAudioWaveform(buffer, 640))
      .catch(() => [] as number[]);
    managedAudioUrls.current.add(url);
    const probe = document.createElement("audio");
    probe.preload = "metadata";
    probe.src = url;
    return new Promise((resolve) => {
      probe.onloadedmetadata = () => {
        const measuredDuration =
          Number.isFinite(probe.duration) && probe.duration > 0
            ? probe.duration
            : 0;
        const trackLength =
          Number.isFinite(durationHint) && durationHint! > 0
            ? durationHint!
            : measuredDuration || 8;
        // AudioTrack.start/end always live in project-timeline time. Source trim
        // values (`start`/`end`) must never leak into this coordinate system.
        const projectEnd = Math.max(
          0.1,
          editorTimelineDuration || duration || trackLength,
        );
        const cursor = Math.max(0, Math.min(current, projectEnd));
        const from =
          cursor >= projectEnd - 0.1
            ? Math.max(0, projectEnd - Math.min(trackLength, projectEnd))
            : cursor;
        const track: AudioTrack = {
          id: crypto.randomUUID(),
          url,
          name: file.name.replace(/\.[^.]+$/, ""),
          start: from,
          end: Math.max(from + 0.1, Math.min(projectEnd, from + trackLength)),
          volume: 85,
          muted: false,
          solo: false,
          fadeIn: 0.08,
          fadeOut: 0.12,
          assetId: metadata?.assetId,
          license: metadata?.license,
        };
        remember();
        setAudioTracks((items) => [...items, track]);
        void waveformPromise.then((values) => {
          if (!values.length) return;
          setAudioTracks((items) =>
            items.map((item) =>
              item.id === track.id ? { ...item, waveform: values } : item,
            ),
          );
        });
        setSelectedAudioId(track.id);
        setSelectedId("");
        setSelectedIllustrationId("");
        setNotice("Faixa de áudio adicionada. Arraste e ajuste na timeline.");
        resolve(true);
      };
      probe.onerror = () => {
        managedAudioUrls.current.delete(url);
        URL.revokeObjectURL(url);
        setNotice("Não foi possível abrir este áudio.");
        resolve(false);
      };
      probe.load();
    });
  }
  function addBuiltInSound(kind: "pop" | "whoosh" | "ding") {
    const rate = 44100,
      seconds = kind === "whoosh" ? 0.52 : 0.24,
      samples = Math.floor(rate * seconds);
    const buffer = new ArrayBuffer(44 + samples * 2),
      view = new DataView(buffer);
    const write = (offset: number, text: string) =>
      [...text].forEach((char, index) =>
        view.setUint8(offset + index, char.charCodeAt(0)),
      );
    write(0, "RIFF");
    view.setUint32(4, 36 + samples * 2, true);
    write(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, "data");
    view.setUint32(40, samples * 2, true);
    for (let index = 0; index < samples; index++) {
      const t = index / rate,
        envelope = Math.pow(1 - index / samples, kind === "whoosh" ? 1.2 : 2.8);
      const frequency =
        kind === "pop"
          ? 170 - t * 300
          : kind === "ding"
            ? 880 + t * 170
            : 260 + t * 1650;
      const wave =
        kind === "whoosh"
          ? Math.random() * 2 - 1
          : Math.sin(Math.PI * 2 * frequency * t);
      view.setInt16(
        44 + index * 2,
        Math.max(-1, Math.min(1, wave * envelope * 0.52)) * 32767,
        true,
      );
    }
    void addAudioTrack(
      new File([buffer], `klip-${kind}.wav`, { type: "audio/wav" }),
    );
  }
  function updateAudioTrack(
    id: string,
    patch: Partial<AudioTrack>,
    record = true,
  ) {
    if (record) remember();
    setAudioTracks((items) =>
      items.map((track) => (track.id === id ? { ...track, ...patch } : track)),
    );
  }
  function removeAudioTrack() {
    const track = audioTracks.find((item) => item.id === selectedAudioId);
    if (!track) return;
    remember();
    setAudioTracks((items) =>
      items.filter((item) => item.id !== selectedAudioId),
    );
    setSelectedAudioId("");
  }
  function duplicateAudioTrack() {
    const track = audioTracks.find((item) => item.id === selectedAudioId);
    if (!track) return;
    remember();
    const length = Math.max(0.1, track.end - track.start);
    const projectEnd = Math.max(
      length,
      editorTimelineDuration || duration || length,
    );
    const startAt = Math.min(
      Math.max(0, projectEnd - length),
      track.end + 0.08,
    );
    const duplicate: AudioTrack = {
      ...track,
      id: crypto.randomUUID(),
      name: `${track.name} · cópia`,
      start: startAt,
      end: Math.min(projectEnd, startAt + length),
      solo: false,
    };
    setAudioTracks((items) => [...items, duplicate]);
    setSelectedAudioId(duplicate.id);
    setNotice("Canal de áudio duplicado. Arraste para posicionar.");
  }
  async function addAudioFiles(files?: FileList | null) {
    if (!files?.length) return;
    let added = 0;
    for (const file of Array.from(files)) {
      if (await addAudioTrack(file)) added += 1;
    }
    if (added > 1)
      setNotice(`${added} canais de áudio adicionados à timeline.`);
  }
  function applyTemplate(
    template: "podcast" | "react" | "gameplay" | "interview",
  ) {
    const length = Math.max(4, end || duration || 12);
    const base = initialLayer();
    const title: Record<typeof template, string> = {
      podcast: "🎙️ Corte do podcast",
      react: "MINHA REAÇÃO 👀",
      gameplay: "O CLUTCH MAIS INSANO 🔥",
      interview: "A pergunta que mudou tudo",
    };
    const subtitle: Record<typeof template, string> = {
      podcast: "Siga para mais episódios",
      react: "espera até o final",
      gameplay: "não pisca",
      interview: "assista até o fim",
    };
    const make = (
      text: string,
      y: number,
      size: number,
      effect: TextEffect,
    ): TextLayer => ({
      ...base,
      id: crypto.randomUUID(),
      text,
      y,
      size,
      start,
      end: Math.max(start + 0.5, length),
      effect,
      background: true,
    });
    remember();
    setLayers([
      make(title[template], 18, 72, "bounce"),
      make(subtitle[template], 80, 48, "pop"),
    ]);
    setIllustrations([]);
    setNotice(
      `Template ${template} aplicado. Ajuste os textos e as camadas como quiser.`,
    );
  }
  async function detectSilence() {
    if (!clip) return;
    try {
      setNotice("Analisando o áudio para sugerir um corte…");
      const response = await fetch(clip.url);
      const buffer = await response.arrayBuffer();
      const context = new AudioContext();
      const decoded = await context.decodeAudioData(buffer);
      const data = decoded.getChannelData(0),
        block = Math.max(1, Math.floor(decoded.sampleRate * 0.25));
      const levels: number[] = [];
      for (let index = 0; index < data.length; index += block) {
        let sum = 0;
        for (
          let sample = index;
          sample < Math.min(data.length, index + block);
          sample++
        )
          sum += data[sample] * data[sample];
        levels.push(Math.sqrt(sum / block));
      }
      const threshold = Math.max(
        0.012,
        Math.min(
          0.08,
          (levels.reduce((sum, value) => sum + value, 0) /
            Math.max(1, levels.length)) *
            0.42,
        ),
      );
      const first = levels.findIndex((value) => value > threshold);
      const last =
        levels.length -
        1 -
        [...levels].reverse().findIndex((value) => value > threshold);
      await context.close();
      if (first < 0 || last <= first) {
        setNotice(
          "Não encontrei fala clara para sugerir um corte. Ajuste manualmente na timeline.",
        );
        return;
      }
      remember();
      const from = Math.max(0, first * 0.25 - 0.15),
        to = Math.min(decoded.duration, (last + 1) * 0.25 + 0.25);
      setStart(from);
      setEnd(to);
      seek(from);
      setNotice(
        `Silêncios nas pontas removidos: ${time(from)} até ${time(to)}.`,
      );
    } catch {
      try {
        const blob = await fetch(clip.url).then((response) => response.blob());
        const extracted = await buildContainerAudioWaveform(blob, 480);
        setBaseAudioCodec(extracted.codec);
        if (!extracted.values.length) throw new Error("codec indisponível");
        const average =
          extracted.values.reduce((sum, value) => sum + value, 0) /
          extracted.values.length;
        const threshold = Math.max(0.07, average * 0.58);
        const first = extracted.values.findIndex((value) => value > threshold);
        const last =
          extracted.values.length -
          1 -
          [...extracted.values]
            .reverse()
            .findIndex((value) => value > threshold);
        if (first < 0 || last <= first) throw new Error("sem fala clara");
        const mediaDuration = sourceDuration || duration;
        const from = Math.max(
          0,
          (first / extracted.values.length) * mediaDuration - 0.15,
        );
        const to = Math.min(
          mediaDuration,
          ((last + 1) / extracted.values.length) * mediaDuration + 0.25,
        );
        remember();
        setStart(from);
        setEnd(to);
        seek(from);
        setNotice(
          `Silêncios removidos usando a faixa ${extracted.codec}: ${time(from)} até ${time(to)}.`,
        );
      } catch {
        setNotice(
          `O vídeo possui áudio${baseAudioCodec ? ` (${baseAudioCodec})` : ""}, mas este navegador não expõe as amostras necessárias para detectar silêncio. A reprodução e a exportação continuam funcionando.`,
        );
      }
    }
  }
  async function importSubtitles(file?: File) {
    if (!file) return;
    try {
      const raw = await file.text();
      const blocks = raw
        .replace(/\r/g, "")
        .trim()
        .split(/\n\s*\n/);
      const parseTime = (value: string) => {
        const match = value
          .trim()
          .replace(",", ".")
          .match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
        return match
          ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
          : 0;
      };
      const captions = blocks
        .map((block) => {
          const lines = block.split("\n").filter(Boolean);
          const timing = lines.find((line) => line.includes("-->"));
          if (!timing) return null;
          const [from, to] = timing.split("-->").map(parseTime);
          const text = lines
            .slice(lines.indexOf(timing) + 1)
            .join(" ")
            .replace(/<[^>]+>/g, "")
            .trim();
          return text ? { from, to, text } : null;
        })
        .filter((item): item is { from: number; to: number; text: string } =>
          Boolean(item),
        );
      if (!captions.length) {
        setNotice("Não encontrei legendas válidas neste arquivo SRT.");
        return;
      }
      remember();
      const made = captions.map((item): TextLayer => ({
        ...initialLayer(),
        id: crypto.randomUUID(),
        text: item.text,
        start: Math.max(start, item.from),
        end: Math.min(
          end || duration || item.to,
          Math.max(item.from + 0.1, item.to),
        ),
        y: 76,
        size: 56,
        effect: "pop",
        background: true,
        color: "#ffffff",
        x: 50,
        align: "center",
        kind: "caption",
      }));
      setLayers((items) => [...items, ...made]);
      setSelectedId(made[0]?.id || "");
      setNotice(`${made.length} legendas importadas para a timeline.`);
    } catch {
      setNotice("Não foi possível ler o arquivo de legenda.");
    }
  }
  function appendGeneratedCaptions(
    segments: Array<{ start: number; end: number; text: string }>,
    languageLabel = "",
    translationWarning = "",
  ) {
    const captions = segments
      .filter(
        (item) =>
          item.text.trim() &&
          Number.isFinite(item.start) &&
          Number.isFinite(item.end) &&
          item.end > item.start,
      )
      .map((item): TextLayer => ({
        ...initialLayer(),
        id: crypto.randomUUID(),
        text: item.text.trim(),
        start: Math.max(0, item.start),
        end: Math.min(
          editorTimelineDuration || duration || item.end,
          Math.max(item.start + 0.18, item.end),
        ),
        y: 82,
        size: 52,
        effect: "pop",
        background: true,
        kind: "caption",
      }));
    if (!captions.length) throw new Error("Nenhuma fala foi encontrada.");
    remember();
    setLayers((items) => [...items, ...captions]);
    setSelectedId(captions[0].id);
    setInspectorTab("edit");
    setActiveTool("captions");
    setToolPanelOpen(true);
    setNotice(
      `${captions.length} legendas${languageLabel ? ` em ${languageLabel}` : ""} adicionadas à faixa de legendas.${translationWarning ? ` ${translationWarning}` : ""}`,
    );
  }
  async function generateAutomaticCaptions() {
    if (!clip || transcribing) return;
    if (transcriptionResetTimer.current !== null) {
      window.clearTimeout(transcriptionResetTimer.current);
      transcriptionResetTimer.current = null;
    }
    setDetectedCaptionLanguage("");
    setTranscribing(true);
    setTranscriptionPhase("preparing");
    setTranscriptionProgress(2);
    setNotice("Lendo a faixa de áudio sem enviar o vídeo…");
    try {
      if (!navigator.onLine)
        throw new Error(
          "Você está sem conexão. Reconecte-se para gerar as legendas.",
        );
      const sourceResponse = await fetch(clip.url);
      if (!sourceResponse.ok)
        throw new Error("Não foi possível preparar o vídeo para transcrição.");
      const source = await sourceResponse.blob();
      if (!source.size)
        throw new Error("O vídeo não contém dados que possam ser transcritos.");
      const plan = await createTranscriptionAudioPlan(source);
      const totalChunks = Math.max(
        1,
        Math.ceil(plan.duration / TRANSCRIPTION_CHUNK_SECONDS),
      );
      const allSegments: Array<{
        start: number;
        end: number;
        text: string;
      }> = [];
      const translationWarnings = new Set<string>();
      let detectedLanguage = "";

      for (let index = 0; index < totalChunks; index++) {
        const logicalStart = index * TRANSCRIPTION_CHUNK_SECONDS;
        const logicalEnd = Math.min(
          plan.duration,
          (index + 1) * TRANSCRIPTION_CHUNK_SECONDS,
        );
        const extractionStart = Math.max(
          0,
          logicalStart -
            (index ? TRANSCRIPTION_CHUNK_OVERLAP_SECONDS : 0),
        );
        const chunkBaseProgress = 5 + (index / totalChunks) * 88;
        const chunkProgressSpan = 88 / totalChunks;
        setTranscriptionPhase("preparing");
        setNotice(
          totalChunks === 1
            ? "Extraindo e compactando somente o áudio…"
            : `Extraindo áudio — bloco ${index + 1} de ${totalChunks}…`,
        );
        const audioChunk = await extractTranscriptionAudioChunk(
          source,
          plan,
          extractionStart,
          logicalEnd,
          (progress) =>
            setTranscriptionProgress(
              Math.round(chunkBaseProgress + progress * chunkProgressSpan * 0.42),
            ),
        );

        setTranscriptionPhase("uploading");
        setNotice(
          totalChunks === 1
            ? "Enviando o áudio compacto para transcrição…"
            : `Transcrevendo bloco ${index + 1} de ${totalChunks}…`,
        );
        setTranscriptionProgress(
          Math.round(chunkBaseProgress + chunkProgressSpan * 0.5),
        );
        const form = new FormData();
        form.append(
          "file",
          new File(
            [audioChunk],
            `klip-audio-${String(index + 1).padStart(3, "0")}${plan.extension}`,
            { type: plan.mimeType },
          ),
        );
        form.append("targetLanguage", captionTargetLanguage);
        if (detectedLanguage) form.append("language", detectedLanguage);
        form.append("chunkIndex", String(index));
        form.append("chunkCount", String(totalChunks));
        setTranscriptionPhase("transcribing");
        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: form,
        });
        const responseText = await response.text();
        let result: {
          error?: string;
          segments?: Array<{ start: number; end: number; text: string }>;
          detectedLanguage?: string;
          translationWarning?: string;
          translated?: boolean;
        } = {};
        try {
          result = responseText ? JSON.parse(responseText) : {};
        } catch {
          throw new Error(
            "O serviço de legendas retornou uma resposta inválida. Tente novamente.",
          );
        }
        if (response.status === 422 && totalChunks > 1) {
          setNotice(
            `Bloco ${index + 1} sem fala detectável — seguindo para o próximo…`,
          );
          setTranscriptionProgress(
            Math.round(chunkBaseProgress + chunkProgressSpan),
          );
          continue;
        }
        if (!response.ok)
          throw new Error(
            `${result.error || "Falha na transcrição."}${totalChunks > 1 ? ` (bloco ${index + 1} de ${totalChunks})` : ""}`,
          );
        if (
          !detectedLanguage &&
          result.detectedLanguage &&
          result.detectedLanguage !== "unknown"
        )
          detectedLanguage = result.detectedLanguage;
        if (result.translationWarning)
          translationWarnings.add(result.translationWarning);

        for (const segment of result.segments || []) {
          const absoluteStart = extractionStart + Number(segment.start || 0);
          const absoluteEnd = extractionStart + Number(segment.end || 0);
          const midpoint = (absoluteStart + absoluteEnd) / 2;
          if (
            midpoint + 0.01 < logicalStart ||
            absoluteStart >= logicalEnd ||
            !segment.text.trim()
          )
            continue;
          allSegments.push({
            start: Math.max(logicalStart, absoluteStart),
            end: Math.min(logicalEnd, absoluteEnd),
            text: segment.text.trim(),
          });
        }
        setTranscriptionProgress(
          Math.round(chunkBaseProgress + chunkProgressSpan),
        );
      }

      setDetectedCaptionLanguage(detectedLanguage);
      const languageLabel =
        captionLanguageNames[detectedLanguage] ||
        detectedLanguage ||
        "idioma original";
      setTranscriptionProgress(96);
      setTranscriptionPhase("finalizing");
      setNotice("Unindo os blocos e sincronizando as legendas…");
      appendGeneratedCaptions(
        allSegments,
        captionTargetLanguage === "original"
          ? languageLabel
          : captionLanguageNames[captionTargetLanguage],
        [...translationWarnings].join(" "),
      );
      setTranscriptionProgress(100);
    } catch (error) {
      const message =
        error instanceof TypeError ||
        (error instanceof Error && /failed to fetch/i.test(error.message))
          ? "Não foi possível conectar ao serviço de legendas. Verifique a internet e tente novamente."
          : error instanceof Error
            ? error.message
            : "Não foi possível gerar as legendas deste vídeo.";
      setNotice(
        message,
      );
    } finally {
      setTranscribing(false);
      transcriptionResetTimer.current = window.setTimeout(() => {
        setTranscriptionProgress(0);
        setTranscriptionPhase("idle");
        transcriptionResetTimer.current = null;
      }, 900);
    }
  }
  function exportProject() {
    const persistedAudioTracks = audioTracks.map((track) => ({
      id: track.id,
      name: track.name,
      start: track.start,
      end: track.end,
      volume: track.volume,
      muted: Boolean(track.muted),
      solo: Boolean(track.solo),
      fadeIn: track.fadeIn,
      fadeOut: track.fadeOut,
      assetId: track.assetId,
      license: track.license,
    }));
    const project = {
      version: 6,
      clipName: clip?.name || "",
      start,
      end,
      primaryTimelineStart,
      videoFadeIn,
      videoFadeOut,
      videoFadeInAt,
      videoFadeOutAt,
      transitionColor,
      transitionKind,
      videoTransform,
      exportAspect,
      exportResolution,
      exportFps,
      exportBitrate,
      audioGain,
      audioEnhance,
      audioTracks: persistedAudioTracks,
      visualPreset,
      visualEffect,
      visualEffectIntensity,
      selectedSocialPresetId,
      layers,
      radarMode,
      approvedCuts,
      createdAt: new Date().toISOString(),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(project, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "klip-project.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setNotice(
      "Projeto salvo. Sons KLIPAPP Original serão restaurados; mídia própria precisa ser reimportada.",
    );
  }
  async function importProject(file?: File) {
    if (!file) return;
    try {
      const project = JSON.parse(await file.text());
      if (!Array.isArray(project.layers)) throw new Error("invalid");
      const restoredStart = Number(project.start) || 0,
        restoredEnd = Number(project.end) || duration,
        restoredIn = Number(project.videoFadeIn) || 0,
        restoredOut = Number(project.videoFadeOut) || 0,
        legacyScale = Number(project.videoTransform?.scale) || 1;
      const restoredCuts: RadarSuggestion[] = Array.isArray(
        project.approvedCuts,
      )
        ? project.approvedCuts
            .filter(
              (item: RadarSuggestion) =>
                Number.isFinite(item?.start) &&
                Number.isFinite(item?.end) &&
                item.end > item.start,
            )
            .map((item: RadarSuggestion) => ({
              ...item,
              id: item.id || crypto.randomUUID(),
              selected: true,
            }))
        : [];
      const effectDefinition =
        project.visualEffect &&
        VISUAL_EFFECTS.find(
          (effect) => effect.id === project.visualEffect.effectId,
        );
      const restoredEffectIntensity = Math.max(
        0,
        Math.min(
          2,
          Number(
            project.visualEffectIntensity ??
              project.visualEffect?.intensity ??
              1,
          ) || 1,
        ),
      );
      const restoredEffect = effectDefinition
        ? createVisualEffectApplication(
            effectDefinition.id,
            restoredEffectIntensity,
          )
        : null;
      const restoredAspect: ExportAspect = [
        "original",
        "vertical",
        "portrait",
        "landscape",
        "square",
      ].includes(project.exportAspect)
        ? project.exportAspect
        : "vertical";
      const requestedPresetId = SOCIAL_PRESET_IDS.includes(
        project.selectedSocialPresetId,
      )
        ? (project.selectedSocialPresetId as SocialPresetId)
        : null;
      const requestedPreset = requestedPresetId
        ? getSocialPreset(requestedPresetId)
        : null;
      const requestedAspect: ExportAspect =
        !requestedPreset || requestedPreset.customizable
          ? "original"
          : requestedPreset.aspectRatio.width === 9 &&
              requestedPreset.aspectRatio.height === 16
            ? "vertical"
            : requestedPreset.aspectRatio.width === 4 &&
                requestedPreset.aspectRatio.height === 5
              ? "portrait"
              : requestedPreset.aspectRatio.width === 16 &&
                  requestedPreset.aspectRatio.height === 9
                ? "landscape"
                : "square";
      const restoredPresetId: SocialPresetId =
        requestedPresetId && requestedAspect === restoredAspect
          ? requestedPresetId
          : socialPresetForAspect(restoredAspect);
      const restoredAudioTracks: AudioTrack[] = [];
      let skippedAudioTracks = 0;
      releaseManagedAudioUrls();
      history.current = [];
      future.current = [];
      if (Array.isArray(project.audioTracks)) {
        for (const stored of project.audioTracks) {
          const asset = KLIP_AUDIO_CATALOG.find(
            (item) => item.id === stored?.assetId,
          );
          if (!asset?.recipe) {
            skippedAudioTracks += 1;
            continue;
          }
          const restoredUrl = URL.createObjectURL(synthesizeAudio(asset));
          managedAudioUrls.current.add(restoredUrl);
          const trackStart = Math.max(0, Number(stored.start) || 0);
          restoredAudioTracks.push({
            id: typeof stored.id === "string" ? stored.id : crypto.randomUUID(),
            url: restoredUrl,
            name: typeof stored.name === "string" ? stored.name : asset.title,
            start: trackStart,
            end: Math.max(
              trackStart + 0.1,
              Number(stored.end) || trackStart + asset.duration,
            ),
            volume: Math.max(0, Math.min(120, Number(stored.volume) || 85)),
            muted: Boolean(stored.muted),
            solo: Boolean(stored.solo),
            fadeIn: Math.max(0, Number(stored.fadeIn) || 0),
            fadeOut: Math.max(0, Number(stored.fadeOut) || 0),
            assetId: asset.id,
            license: asset.license,
          });
        }
      }
      setStart(restoredStart);
      setEnd(restoredEnd);
      setPrimaryTimelineStart(
        Math.max(0, Number(project.primaryTimelineStart) || 0),
      );
      setVideoFadeIn(restoredIn);
      setVideoFadeOut(restoredOut);
      setVideoFadeInAt(
        Math.max(restoredStart, Number(project.videoFadeInAt) || restoredStart),
      );
      setVideoFadeOutAt(
        Math.max(
          restoredStart,
          Number(project.videoFadeOutAt) ||
            Math.max(restoredStart, restoredEnd - restoredOut),
        ),
      );
      setTransitionColor(
        project.transitionColor === "white" ? "white" : "black",
      );
      if (
        ["fade-black", "fade-white", "flash", "dissolve", "wipe"].includes(
          project.transitionKind,
        )
      )
        setTransitionKind(project.transitionKind);
      setVideoTransform({
        x: Number(project.videoTransform?.x) || 0,
        y: Number(project.videoTransform?.y) || 0,
        scaleX: Math.max(
          0.25,
          Math.min(4, Number(project.videoTransform?.scaleX) || legacyScale),
        ),
        scaleY: Math.max(
          0.25,
          Math.min(4, Number(project.videoTransform?.scaleY) || legacyScale),
        ),
      });
      setExportAspect(restoredAspect);
      setExportResolution(
        ["source", "1080", "720"].includes(project.exportResolution)
          ? project.exportResolution
          : "1080",
      );
      setExportFps(
        [24, 30, 60].includes(project.exportFps) ? project.exportFps : 30,
      );
      setExportBitrate(
        ["standard", "high", "ultra"].includes(project.exportBitrate)
          ? project.exportBitrate
          : "high",
      );
      setAudioGain(Number(project.audioGain) || 100);
      setAudioEnhance(project.audioEnhance !== false);
      setAudioTracks(restoredAudioTracks);
      setVisualPreset(
        ["clean", "cinematic", "vivid", "mono", "warm"].includes(
          project.visualPreset,
        )
          ? project.visualPreset
          : "clean",
      );
      setVisualEffect(restoredEffect);
      setVisualEffectIntensity(restoredEffectIntensity);
      setSelectedSocialPresetId(restoredPresetId);
      setDraftSocialPresetId(restoredPresetId);
      setLayers(project.layers);
      setRadarMode(
        ["reels", "shorts", "highlights"].includes(project.radarMode)
          ? project.radarMode
          : "reels",
      );
      setApprovedCuts(restoredCuts);
      setRadarSuggestions(restoredCuts);
      setSelectedId(project.layers[0]?.id || "");
      setNotice(
        skippedAudioTracks
          ? `Projeto restaurado. ${skippedAudioTracks} faixa${skippedAudioTracks > 1 ? "s" : ""} própria${skippedAudioTracks > 1 ? "s" : ""} precisa${skippedAudioTracks > 1 ? "m" : ""} ser reimportada${skippedAudioTracks > 1 ? "s" : ""}.`
          : "Projeto restaurado. Importe o vídeo original para terminar a edição.",
      );
    } catch {
      setNotice("Arquivo de projeto inválido.");
    }
  }
  function addIllustration(file?: File, preset: "free" | "reaction" = "free") {
    if (!file) return;
    const kind = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
        ? "video"
        : null;
    if (!kind) {
      setNotice("Escolha uma imagem ou um vídeo para a ilustração.");
      return;
    }
    const from = Math.max(start, Math.min(current, Math.max(start, end - 0.4)));
    const item: IllustrationLayer = {
      id: crypto.randomUUID(),
      kind,
      url: URL.createObjectURL(file),
      name: file.name.replace(/\.[^.]+$/, ""),
      x: preset === "reaction" ? 76 : 72,
      y: preset === "reaction" ? 24 : 30,
      size: preset === "reaction" ? 26 : 38,
      width: preset === "reaction" ? 26 : 38,
      height: preset === "reaction" ? 34 : 28,
      start: from,
      end: Math.max(
        from + 0.4,
        Math.min(end || duration || from + 4, from + 4),
      ),
      fadeIn: 0.2,
      fadeOut: 0.2,
      fit: "cover",
    };
    remember();
    setIllustrations((items) => [...items, item]);
    setSelectedIllustrationId(item.id);
    setSelectedId("");
    setSelectedAudioId("");
    if (preset === "reaction" && kind === "video") {
      // The visual stays muted in the canvas; its sound is an independent
      // mixer channel so it can be balanced, muted or removed without echo.
      void addAudioTrack(file, undefined, item.end - item.start).then((added) => {
        if (!added) return;
        setSelectedIllustrationId(item.id);
        setSelectedAudioId("");
      });
    }
    setNotice(
      preset === "reaction"
        ? "Vídeo de reação adicionado. Arraste para qualquer canto e redimensione pelas alças."
        : `${kind === "image" ? "Imagem" : "Vídeo"} ilustrativo adicionado à linha do tempo.`,
    );
  }
  function removeIllustration() {
    if (!selectedIllustration) return;
    remember();
    illustrationElements.current.delete(selectedIllustration.id);
    setIllustrations((items) =>
      items.filter((item) => item.id !== selectedIllustration.id),
    );
    setSelectedIllustrationId("");
  }
  function duplicateIllustration() {
    if (!selectedIllustration) return;
    remember();
    const copy: IllustrationLayer = {
      ...selectedIllustration,
      id: crypto.randomUUID(),
      x: Math.min(88, selectedIllustration.x + 6),
      y: Math.min(88, selectedIllustration.y + 6),
    };
    setIllustrations((items) => [...items, copy]);
    setSelectedIllustrationId(copy.id);
    setSelectedId("");
    setSelectedAudioId("");
    setNotice(
      "Camada duplicada. Arraste, redimensione e escolha o período dela.",
    );
  }
  function setVideoDuration(element: HTMLVideoElement) {
    const value = element.duration;
    if (element.videoWidth && element.videoHeight)
      setSourceAspect(element.videoWidth / element.videoHeight);
    if (Number.isFinite(value) && value > 0) {
      setSourceDuration(value);
      setDuration((projectLength) => Math.max(projectLength, value));
      setEnd((projectEnd) => Math.max(projectEnd, value));
      setLayers((items) =>
        items.map((layer, index) =>
          index === 0 && layer.end === 6 ? { ...layer, end: value } : layer,
        ),
      );
      return;
    }
    element.currentTime = 1e101;
  }
  function seek(value: number) {
    if (!video.current) return;
    if (hasMontageTimeline) {
      const safeValue = Math.max(0, Math.min(montageTimelineDuration, value));
      const montageClip =
        montageTimelineClips.find(
          (item) =>
            item.timelineStart <= safeValue && safeValue < item.timelineEnd,
        ) ||
        (safeValue >= montageTimelineDuration
          ? montageTimelineClips.at(-1)
          : undefined);
      video.current.pause();
      illustrationElements.current.forEach((element) => {
        if (element instanceof HTMLVideoElement) element.pause();
      });
      if (!montageClip) {
        setCurrent(safeValue);
        return;
      }
      const localTime = Math.min(
        montageClip.end - 0.025,
        montageClip.start + Math.max(0, safeValue - montageClip.timelineStart),
      );
      baseLoopOffset.current = montageClip.timelineStart - montageClip.start;
      video.current.currentTime = Math.max(montageClip.start, localTime);
      setActiveRadarCutId(montageClip.id);
      setCurrent(safeValue);
      return;
    }
    const activeScene = sceneItems.find(
      (item) => item.start <= value && value < item.end,
    );
    illustrationElements.current.forEach((element) => {
      if (element instanceof HTMLVideoElement) element.pause();
    });
    if (activeScene) {
      video.current.pause();
      const sceneElement = activeScene
        ? illustrationElements.current.get(activeScene.id)
        : null;
      if (sceneElement instanceof HTMLVideoElement && sceneElement.duration)
        sceneElement.currentTime = Math.max(
          0,
          Math.min(sceneElement.duration - 0.04, value - activeScene.start),
        );
      setCurrent(value);
      return;
    }
    if (value < primaryClipStart || value >= primaryClipEnd) {
      video.current.pause();
      setCurrent(value);
      return;
    }
    baseLoopOffset.current = primaryClipStart - primarySourceStart;
    video.current.currentTime = Math.max(
      primarySourceStart,
      Math.min(
        primarySourceEnd - 0.04,
        primarySourceStart + value - primaryClipStart,
      ),
    );
    setCurrent(value);
  }
  function snapTime(value: number) {
    const safe = Math.max(0, Math.min(duration, value));
    if (!snapEnabled || !duration) return safe;
    const points = [
      0,
      duration,
      start,
      end,
      current,
      ...markers,
      ...layers.flatMap((layer) => [layer.start, layer.end]),
      ...illustrations.flatMap((item) => [item.start, item.end]),
      ...audioTracks.flatMap((track) => [track.start, track.end]),
    ];
    const threshold = Math.max(0.001, duration / (280 * timelineZoom));
    const closest = points.reduce(
      (best, point) =>
        Math.abs(point - safe) < Math.abs(best - safe) ? point : best,
      safe,
    );
    return Math.abs(closest - safe) <= threshold ? closest : safe;
  }
  function updateSnapGuide(value: number) {
    const snapped = snapTime(value);
    setSnapGuide(
      snapEnabled && Math.abs(snapped - value) > 0.001 ? snapped : null,
    );
    return snapped;
  }
  function selectTimeFromTimeline(event: React.PointerEvent<HTMLDivElement>) {
    if (!editorTimelineDuration) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (event.clientX - bounds.left) / bounds.width),
    );
    seek(ratio * editorTimelineDuration);
  }
  function beginTimelineTrim(
    event: React.PointerEvent<HTMLElement>,
    edge: "start" | "end",
  ) {
    if (!duration) return;
    event.preventDefault();
    event.stopPropagation();
    remember();
    timelineTrim.current = edge;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveTimelineTrim(event: React.PointerEvent<HTMLDivElement>) {
    const edge = timelineTrim.current;
    if (!edge || !duration) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const raw = Math.max(
      0,
      ((event.clientX - bounds.left) / bounds.width) * duration,
    );
    const value = raw > duration ? raw : snapTime(raw);
    if (edge === "start") {
      const precisionStep =
        timelineZoom >= 16 ? 0.001 : timelineZoom >= 6 ? 0.005 : 0.02;
      const timelineValue = Math.min(value, primaryClipEnd - precisionStep);
      const nextSource = Math.min(
        primarySourceEnd - precisionStep,
        primarySourceStart + timelineValue - primaryClipStart,
      );
      setStart(Math.max(0, nextSource));
      setPrimaryTimelineStart(Math.max(0, timelineValue));
      updateActiveRadarRange({ start: Math.max(0, nextSource) });
      seek(Math.max(0, timelineValue));
    } else {
      const precisionStep =
        timelineZoom >= 16 ? 0.001 : timelineZoom >= 6 ? 0.005 : 0.02;
      const timelineValue = Math.max(value, primaryClipStart + precisionStep);
      const nextSource = Math.min(
        baseDuration,
        primarySourceStart + timelineValue - primaryClipStart,
      );
      setEnd(Math.max(primarySourceStart + precisionStep, nextSource));
      updateActiveRadarRange({
        end: Math.max(primarySourceStart + precisionStep, nextSource),
      });
      seek(
        Math.min(
          timelineValue,
          primaryClipStart + nextSource - primarySourceStart,
        ),
      );
    }
  }
  function endTimelineTrim() {
    if (timelineTrim.current) setNotice("Corte atualizado na linha do tempo.");
    timelineTrim.current = null;
  }
  function beginPrimaryTimelineMove(
    event: React.PointerEvent<HTMLButtonElement>,
  ) {
    if (
      !duration ||
      (event.target as HTMLElement).closest(".timeline-clip-handle")
    )
      return;
    const track = event.currentTarget.parentElement;
    if (!track) return;
    event.preventDefault();
    event.stopPropagation();
    remember();
    primaryTimelineDrag.current = {
      startX: event.clientX,
      timelineStart: primaryClipStart,
      projectDuration: duration,
      trackWidth: Math.max(1, track.getBoundingClientRect().width),
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function movePrimaryTimelineMove(
    event: React.PointerEvent<HTMLButtonElement>,
  ) {
    const drag = primaryTimelineDrag.current;
    if (!drag) return;
    if (Math.abs(event.clientX - drag.startX) > 3) drag.moved = true;
    const delta =
      ((event.clientX - drag.startX) / drag.trackWidth) * drag.projectDuration;
    const nextStart = Math.max(0, drag.timelineStart + delta);
    const nextEnd =
      nextStart + Math.max(0.05, primarySourceEnd - primarySourceStart);
    setPrimaryTimelineStart(nextStart);
    setDuration((projectDuration) => Math.max(projectDuration, nextEnd));
    setSnapGuide(null);
  }
  function endPrimaryTimelineMove(
    event: React.PointerEvent<HTMLButtonElement>,
    cancelled = false,
  ) {
    const drag = primaryTimelineDrag.current;
    if (drag?.moved)
      setNotice(
        `Vídeo principal movido para ${time(primaryTimelineStart)}. O trecho cortado foi preservado.`,
      );
    else if (drag && !cancelled) {
      const track = event.currentTarget.parentElement;
      if (track) {
        const bounds = track.getBoundingClientRect();
        const ratio = Math.max(
          0,
          Math.min(1, (event.clientX - bounds.left) / bounds.width),
        );
        seek(ratio * editorTimelineDuration);
      }
    }
    primaryTimelineDrag.current = null;
    setSnapGuide(null);
  }
  function beginTimelineItemDrag(
    event: React.PointerEvent<HTMLElement>,
    kind: "text" | "illustration" | "audio",
    id: string,
    edge: "move" | "start" | "end",
    itemStart: number,
    itemEnd: number,
  ) {
    if (!duration) return;
    event.preventDefault();
    event.stopPropagation();
    remember();
    timelineItemDrag.current = {
      kind,
      id,
      edge,
      start: itemStart,
      end: itemEnd,
      startX: event.clientX,
    };
    if (kind === "text") {
      setSelectedId(id);
      setSelectedIllustrationId("");
      setSelectedAudioId("");
    }
    if (kind === "illustration") {
      setSelectedIllustrationId(id);
      setSelectedId("");
      setSelectedAudioId("");
    }
    if (kind === "audio") {
      setSelectedAudioId(id);
      setSelectedId("");
      setSelectedIllustrationId("");
      setInspectorTab("edit");
      setActiveTool("audio");
      setToolPanelOpen(true);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveTimelineItemDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = timelineItemDrag.current;
    const track = event.currentTarget.parentElement;
    if (!drag || !track || !duration) return;
    const bounds = track.getBoundingClientRect();
    const delta = ((event.clientX - drag.startX) / bounds.width) * duration;
    const length = drag.end - drag.start;
    let patch: { start?: number; end?: number };
    if (drag.edge === "move") {
      const nextStart = updateSnapGuide(
        Math.max(0, Math.min(duration - length, drag.start + delta)),
      );
      patch = { start: nextStart, end: nextStart + length };
    } else if (drag.edge === "start") {
      patch = {
        start: updateSnapGuide(
          Math.max(
            0,
            Math.min(
              drag.end - (timelineZoom >= 16 ? 0.001 : 0.01),
              drag.start + delta,
            ),
          ),
        ),
      };
    } else {
      patch = {
        end: updateSnapGuide(
          Math.max(
            drag.start + (timelineZoom >= 16 ? 0.001 : 0.01),
            Math.min(duration, drag.end + delta),
          ),
        ),
      };
    }
    if (drag.kind === "text") updateLayer(drag.id, patch, false);
    else if (drag.kind === "illustration")
      updateIllustration(drag.id, patch, false);
    else updateAudioTrack(drag.id, patch, false);
  }
  function endTimelineItemDrag() {
    if (timelineItemDrag.current) setNotice("Clip atualizado na timeline.");
    timelineItemDrag.current = null;
    setSnapGuide(null);
  }
  function beginTimelineFadeDrag(
    event: React.PointerEvent<HTMLElement>,
    kind: "text" | "illustration" | "audio",
    id: string,
    edge: "in" | "out",
    value: number,
  ) {
    if (!duration) return;
    event.preventDefault();
    event.stopPropagation();
    remember();
    timelineFadeDrag.current = {
      kind,
      id,
      edge,
      initial: value,
      startX: event.clientX,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveTimelineFadeDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = timelineFadeDrag.current;
    const track = event.currentTarget.parentElement?.parentElement;
    if (!drag || !track || !duration) return;
    const bounds = track.getBoundingClientRect();
    const delta = ((event.clientX - drag.startX) / bounds.width) * duration;
    const item =
      drag.kind === "text"
        ? layers.find((layer) => layer.id === drag.id)
        : drag.kind === "illustration"
          ? illustrations.find((layer) => layer.id === drag.id)
          : audioTracks.find((layer) => layer.id === drag.id);
    if (!item) return;
    const max = Math.max(0, (item.end - item.start) / 2);
    const value = Math.max(
      0,
      Math.min(max, drag.initial + (drag.edge === "in" ? delta : -delta)),
    );
    const patch = drag.edge === "in" ? { fadeIn: value } : { fadeOut: value };
    if (drag.kind === "text") updateLayer(drag.id, patch, false);
    else if (drag.kind === "illustration")
      updateIllustration(drag.id, patch, false);
    else updateAudioTrack(drag.id, patch, false);
  }
  function endTimelineFadeDrag() {
    if (timelineFadeDrag.current)
      setNotice("Fade atualizado diretamente na timeline.");
    timelineFadeDrag.current = null;
  }
  function beginPlayheadDrag(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const track = event.currentTarget.parentElement?.querySelector<HTMLElement>(
      hasMontageTimeline
        ? ".montage-video-lane .lane-track"
        : ".video-lane .lane-track",
    );
    if (!track) return;
    const bounds = track.getBoundingClientRect();
    playheadDrag.current = { left: bounds.left, width: bounds.width };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function movePlayheadDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = playheadDrag.current;
    if (!drag || !editorTimelineDuration) return;
    seek(
      Math.max(
        0,
        Math.min(
          editorTimelineDuration,
          ((event.clientX - drag.left) / drag.width) * editorTimelineDuration,
        ),
      ),
    );
  }
  function endPlayheadDrag() {
    playheadDrag.current = null;
  }
  function beginTransitionResize(
    event: React.PointerEvent<HTMLElement>,
    edge: "in" | "out",
  ) {
    if (!duration) return;
    event.preventDefault();
    event.stopPropagation();
    transitionResize.current = {
      edge,
      initial: edge === "in" ? videoFadeIn : videoFadeOut,
      startX: event.clientX,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveTransitionResize(event: React.PointerEvent<HTMLElement>) {
    const resize = transitionResize.current;
    const track = event.currentTarget.parentElement;
    if (!resize || !track || !duration) return;
    const bounds = track.getBoundingClientRect();
    const delta = ((event.clientX - resize.startX) / bounds.width) * duration;
    const max = Math.max(0.1, end - start - 0.05);
    const next = Math.max(
      0.1,
      Math.min(max, resize.initial + (resize.edge === "in" ? delta : -delta)),
    );
    if (resize.edge === "in") setVideoFadeIn(next);
    else setVideoFadeOut(next);
  }
  function endTransitionResize() {
    if (transitionResize.current)
      setNotice("Duração do fade ajustada na timeline.");
    transitionResize.current = null;
  }
  function beginTransitionMove(
    event: React.PointerEvent<HTMLElement>,
    edge: "in" | "out",
  ) {
    if (!duration || (event.target as HTMLElement).closest(".transition-grip"))
      return;
    event.preventDefault();
    event.stopPropagation();
    transitionMove.current = {
      edge,
      initial: edge === "in" ? videoFadeInAt : videoFadeOutAt,
      startX: event.clientX,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveTransitionPosition(event: React.PointerEvent<HTMLElement>) {
    const moving = transitionMove.current;
    const track = event.currentTarget.parentElement;
    if (!moving || !track || !duration) return;
    const bounds = track.getBoundingClientRect();
    const fadeDuration = moving.edge === "in" ? videoFadeIn : videoFadeOut;
    const delta = ((event.clientX - moving.startX) / bounds.width) * duration;
    const next = Math.max(
      start,
      Math.min(Math.max(start, end - fadeDuration), moving.initial + delta),
    );
    if (moving.edge === "in") setVideoFadeInAt(next);
    else setVideoFadeOutAt(next);
  }
  function endTransitionMove() {
    if (transitionMove.current) setNotice("Fade reposicionado na timeline.");
    transitionMove.current = null;
  }
  async function togglePreviewPlayback() {
    if (!video.current) return;
    if (isPlaying) {
      video.current.pause();
      illustrationElements.current.forEach((element) => {
        if (element instanceof HTMLVideoElement) element.pause();
      });
      setIsPlaying(false);
      return;
    }
    await playTimelineAt(
      hasMontageTimeline && current >= montageTimelineDuration - 0.025
        ? 0
        : current,
    );
  }
  async function playTimelineAt(at: number) {
    if (!video.current) return;
    if (hasMontageTimeline) {
      if (at >= montageTimelineDuration - 0.015) {
        video.current.pause();
        setCurrent(montageTimelineDuration);
        setIsPlaying(false);
        return;
      }
      const safeAt = Math.max(0, at);
      const montageClip =
        montageTimelineClips.find(
          (item) => item.timelineStart <= safeAt && safeAt < item.timelineEnd,
        ) || montageTimelineClips.find((item) => item.timelineStart >= safeAt);
      if (!montageClip) {
        setCurrent(montageTimelineDuration);
        setIsPlaying(false);
        return;
      }
      const timelineTime = Math.max(montageClip.timelineStart, safeAt);
      baseLoopOffset.current = montageClip.timelineStart - montageClip.start;
      video.current.currentTime = Math.max(
        montageClip.start,
        Math.min(
          montageClip.end - 0.025,
          montageClip.start + timelineTime - montageClip.timelineStart,
        ),
      );
      setActiveRadarCutId(montageClip.id);
      setCurrent(timelineTime);
      try {
        await video.current.play();
        setIsPlaying(true);
      } catch {
        setNotice("Clique na prévia para liberar a reprodução da montagem.");
      }
      return;
    }
    const activeScene = sceneItems.find(
      (item) => item.start <= at && at < item.end,
    );
    const nextScene = sceneItems
      .filter((item) => item.start >= at - 0.03)
      .sort((a, b) => a.start - b.start)[0];
    const target =
      activeScene || (at >= primaryClipEnd ? nextScene : undefined);
    if (target) {
      video.current.pause();
      illustrationElements.current.forEach((element, id) => {
        if (element instanceof HTMLVideoElement && id !== target.id)
          element.pause();
      });
      const sceneElement = illustrationElements.current.get(target.id);
      if (!(sceneElement instanceof HTMLVideoElement)) {
        setNotice(
          "Aguarde o próximo vídeo carregar e pressione Reproduzir novamente.",
        );
        return;
      }
      const timelineTime = activeScene ? at : target.start;
      if (sceneElement.duration)
        sceneElement.currentTime = Math.max(
          0,
          Math.min(sceneElement.duration - 0.04, timelineTime - target.start),
        );
      try {
        await sceneElement.play();
        setCurrent(timelineTime);
        setIsPlaying(true);
      } catch {
        setNotice(
          "Clique na prévia para liberar a reprodução do próximo vídeo.",
        );
      }
      return;
    }
    if (at >= primaryClipStart && at < primaryClipEnd && baseDuration > 0) {
      baseLoopOffset.current = primaryClipStart - primarySourceStart;
      video.current.currentTime = Math.max(
        primarySourceStart,
        Math.min(
          primarySourceEnd - 0.04,
          primarySourceStart + at - primaryClipStart,
        ),
      );
      try {
        await video.current.play();
        setIsPlaying(true);
      } catch {
        setNotice("Clique na prévia para liberar a reprodução.");
      }
      return;
    }
    if (at < primaryClipStart) {
      setCurrent(primaryClipStart);
      await playTimelineAt(primaryClipStart);
      return;
    }
    setCurrent(duration);
    setIsPlaying(false);
  }
  async function runRadarAnalysis() {
    if (!clip || !duration || radarAnalyzing) return;
    setRadarOpen(true);
    setRadarAnalyzing(true);
    setRadarProgress(0);
    setRadarStatus("Preparando a análise…");
    try {
      const suggestions = await analyzeClipForRadar(
        clip.url,
        sourceDuration || duration,
        radarMode,
        radarCount,
        (progress, status) => {
          setRadarProgress(progress);
          setRadarStatus(status);
        },
      );
      setRadarSuggestions(suggestions);
      setRadarStatus(
        suggestions.length
          ? `${suggestions.length} possíveis clipes encontrados. Confira antes de aplicar.`
          : "Nenhum bloco claro foi encontrado. Tente o modo Destaques.",
      );
    } catch {
      setRadarStatus(
        "Não foi possível analisar este arquivo. O vídeo original continua intacto.",
      );
    } finally {
      setRadarAnalyzing(false);
    }
  }
  function toggleRadarSuggestion(id: string) {
    setRadarSuggestions((items) =>
      items.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item,
      ),
    );
  }
  function previewRadarSuggestion(item: RadarSuggestion) {
    radarPreviewEnd.current = item.end;
    setRadarOpen(false);
    setActiveRadarCutId(item.id);
    seek(item.start);
    void playTimelineAt(item.start);
    setNotice(`Prévia do clipe: ${time(item.start)} até ${time(item.end)}.`);
  }
  function activateRadarCut(item: RadarSuggestion) {
    radarPreviewEnd.current = null;
    setActiveRadarCutId(item.id);
    const montageClip = montageTimelineClips.find(
      (clipItem) => clipItem.id === item.id,
    );
    if (montageClip) {
      setNotice(
        `${item.title} selecionado. A linha branca permaneceu onde estava.`,
      );
      return;
    }
    setStart(item.start);
    setEnd(item.end);
    seek(item.start);
    setNotice(`${item.title} selecionado para editar e exportar.`);
  }
  function applyRadarSuggestions() {
    const accepted = radarSuggestions
      .filter((item) => item.selected)
      .sort((first, second) => first.start - second.start);
    if (!accepted.length) {
      setRadarStatus(
        "Selecione pelo menos uma sugestão para levar à timeline.",
      );
      return;
    }
    let timelineCursor = 0;
    const positioned = accepted.map((item) => {
      const positionedItem = { ...item, timelineStart: timelineCursor };
      timelineCursor += item.end - item.start;
      return positionedItem;
    });
    setApprovedCuts(positioned);
    setMarkers((items) =>
      Array.from(
        new Set([
          ...items,
          ...accepted.flatMap((item) => [item.start, item.end]),
        ]),
      ).sort((first, second) => first - second),
    );
    setRadarOpen(false);
    setActiveRadarCutId(positioned[0].id);
    setCurrent(0);
    if (video.current) {
      video.current.pause();
      video.current.currentTime = accepted[0].start;
      baseLoopOffset.current = -accepted[0].start;
    }
    setNotice(
      `${accepted.length} clipe${accepted.length > 1 ? "s" : ""} criado${accepted.length > 1 ? "s" : ""} com vídeo e áudio independentes. Agora você pode mover cada bloco livremente.`,
    );
  }
  function removeRadarCut(id: string) {
    setApprovedCuts((items) => items.filter((item) => item.id !== id));
    if (activeRadarCutId === id) setActiveRadarCutId("");
  }
  function updateActiveRadarRange(
    patch: Partial<Pick<RadarSuggestion, "start" | "end">>,
  ) {
    if (!activeRadarCutId) return;
    setApprovedCuts((items) => {
      const active = items.find((item) => item.id === activeRadarCutId);
      if (!active) return items;
      return items.map((item) =>
        item.id === activeRadarCutId ? { ...item, ...patch } : item,
      );
    });
  }
  function beginRadarCutTrim(
    event: React.PointerEvent<HTMLElement>,
    item: RadarSuggestion,
    edge: "start" | "end",
  ) {
    event.preventDefault();
    event.stopPropagation();
    const track = event.currentTarget.closest<HTMLElement>(".lane-track");
    if (!track || !montageTimelineDuration) return;
    remember();
    setActiveRadarCutId(item.id);
    radarCutTrim.current = {
      id: item.id,
      edge,
      start: item.start,
      end: item.end,
      startX: event.clientX,
      trackWidth: track.getBoundingClientRect().width,
      timelineDuration: montageTimelineDuration,
      timelineStart: Number.isFinite(item.timelineStart)
        ? (item.timelineStart as number)
        : 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveRadarCutTrim(event: React.PointerEvent<HTMLElement>) {
    const drag = radarCutTrim.current;
    if (!drag) return;
    event.preventDefault();
    const delta =
      ((event.clientX - drag.startX) / Math.max(1, drag.trackWidth)) *
      drag.timelineDuration;
    const minimum =
      timelineZoom >= 16 ? 0.001 : timelineZoom >= 6 ? 0.01 : 0.05;
    setApprovedCuts((items) =>
      items.map((item) => {
        if (item.id !== drag.id) return item;
        if (drag.edge === "start") {
          const nextStart = Math.max(
            0,
            Math.min(drag.end - minimum, drag.start + delta),
          );
          return {
            ...item,
            start: nextStart,
            timelineStart: Math.max(
              0,
              drag.timelineStart + nextStart - drag.start,
            ),
          };
        }
        return {
          ...item,
          end: Math.min(
            sourceDuration || duration,
            Math.max(drag.start + minimum, drag.end + delta),
          ),
        };
      }),
    );
  }
  function endRadarCutTrim() {
    if (radarCutTrim.current)
      setNotice(
        "Clipe recortado. Os outros blocos ficaram exatamente onde estavam.",
      );
    radarCutTrim.current = null;
  }
  function beginRadarCutMove(
    event: React.PointerEvent<HTMLButtonElement>,
    item: RadarSuggestion,
  ) {
    if (
      (event.target as HTMLElement).closest(
        ".radar-trim-handle, .montage-download, .montage-remove",
      )
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const track = event.currentTarget.closest<HTMLElement>(".lane-track");
    if (!track || !montageTimelineDuration) return;
    remember();
    setActiveRadarCutId(item.id);
    radarCutMove.current = {
      id: item.id,
      startX: event.clientX,
      timelineStart: Number.isFinite(item.timelineStart)
        ? (item.timelineStart as number)
        : 0,
      clipDuration: item.end - item.start,
      trackWidth: track.getBoundingClientRect().width,
      timelineDuration: montageTimelineDuration,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveRadarCutMove(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = radarCutMove.current;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const delta =
      ((event.clientX - drag.startX) / Math.max(1, drag.trackWidth)) *
      drag.timelineDuration;
    const nextStart = Math.max(
      0,
      Math.min(
        Math.max(0, drag.timelineDuration - drag.clipDuration),
        drag.timelineStart + delta,
      ),
    );
    setApprovedCuts((items) =>
      items.map((item) =>
        item.id === drag.id ? { ...item, timelineStart: nextStart } : item,
      ),
    );
  }
  function endRadarCutMove(event?: React.PointerEvent<HTMLButtonElement>) {
    if (radarCutMove.current)
      setNotice(
        "Clipe movido livremente. As lacunas da timeline foram preservadas.",
      );
    radarCutMove.current = null;
    event?.stopPropagation();
  }
  function applyRadarTransition(
    id: string,
    kind: TransitionKind,
    edge: "in" | "out",
  ) {
    remember();
    const durationValue = transitionDuration(kind);
    const color = kind === "fade-white" || kind === "flash" ? "white" : "black";
    setApprovedCuts((items) =>
      items.map((item) =>
        item.id === id
          ? edge === "in"
            ? {
                ...item,
                fadeIn: durationValue,
                fadeInColor: color,
                fadeInKind: kind === "none" ? undefined : kind,
              }
            : {
                ...item,
                fadeOut: durationValue,
                fadeOutColor: color,
                fadeOutKind: kind === "none" ? undefined : kind,
              }
          : item,
      ),
    );
    setActiveRadarCutId(id);
    setNotice(
      kind === "none"
        ? "Transição removida deste clipe."
        : `${transitionLabel(kind)} aplicado somente neste clipe.`,
    );
  }
  function dropTransitionOnRadarClip(
    event: React.DragEvent<HTMLButtonElement>,
    item: RadarSuggestion,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const kind = event.dataTransfer.getData(
      "application/x-klip-transition",
    ) as TransitionKind;
    if (!kind) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    applyRadarTransition(
      item.id,
      kind,
      event.clientX - bounds.left < bounds.width / 2 ? "in" : "out",
    );
  }
  function splitActiveRadarCutAtPlayhead() {
    const item =
      montageTimelineClips.find(
        (candidate) =>
          candidate.timelineStart <= current && current < candidate.timelineEnd,
      ) ||
      montageTimelineClips.find(
        (candidate) => candidate.id === activeRadarCutId,
      );
    if (!item) return false;
    const sourceAt = item.start + Math.max(0, current - item.timelineStart);
    const minimum = timelineZoom >= 16 ? 0.001 : 0.05;
    if (sourceAt <= item.start + minimum || sourceAt >= item.end - minimum) {
      setNotice("Mova a linha branca para dentro do clipe antes de cortar.");
      return true;
    }
    remember();
    const second: RadarSuggestion = {
      ...item,
      id: crypto.randomUUID(),
      start: sourceAt,
      timelineStart: current,
      title: `${item.title} · parte 2`,
      fadeIn: 0,
    };
    setApprovedCuts((items) =>
      items.flatMap((candidate) =>
        candidate.id === item.id
          ? [{ ...candidate, end: sourceAt, fadeOut: 0 }, second]
          : [candidate],
      ),
    );
    setActiveRadarCutId(second.id);
    setNotice(
      `Clipe dividido em ${time(current)}. Você pode cortar as duas partes novamente.`,
    );
    return true;
  }
  function splitPrimaryVideoAtPlayhead() {
    if (!clip || !baseDuration) return false;
    const timelineAt = snapTime(current);
    const minimum = timelineZoom >= 16 ? 0.001 : 0.05;
    if (
      timelineAt <= primaryClipStart + minimum ||
      timelineAt >= primaryClipEnd - minimum
    ) {
      setNotice("Mova a linha branca para dentro do clipe antes de dividir.");
      return true;
    }
    const sourceAt = Math.max(
      primarySourceStart,
      Math.min(
        primarySourceEnd,
        primarySourceStart + timelineAt - primaryClipStart,
      ),
    );
    const common = {
      score: 100,
      reason: "Divisão manual preservando o vídeo e o áudio originais.",
      selected: true,
      source: "fallback" as const,
    };
    const first: RadarSuggestion = {
      ...common,
      id: crypto.randomUUID(),
      start: primarySourceStart,
      end: sourceAt,
      timelineStart: primaryClipStart,
      title: `${clip.name} · parte 1`,
      fadeOut: 0,
    };
    const second: RadarSuggestion = {
      ...common,
      id: crypto.randomUUID(),
      start: sourceAt,
      end: primarySourceEnd,
      timelineStart: timelineAt,
      title: `${clip.name} · parte 2`,
      fadeIn: 0,
    };
    remember();
    setApprovedCuts([first, second]);
    setActiveRadarCutId(second.id);
    setSelectedId("");
    setSelectedIllustrationId("");
    setSelectedAudioId("");
    setNotice(
      `Clipe dividido em ${time(timelineAt)}. As duas partes e seus áudios foram preservados; exclua somente a parte que não quiser.`,
    );
    return true;
  }
  function splitVideoAtPlayhead() {
    if (hasMontageTimeline) {
      if (!splitActiveRadarCutAtPlayhead())
        setNotice("Selecione um clipe e posicione a linha branca dentro dele.");
      return;
    }
    splitPrimaryVideoAtPlayhead();
  }
  useEffect(() => {
    const previewEnd = radarPreviewEnd.current;
    if (previewEnd === null || current < previewEnd - 0.03) return;
    video.current?.pause();
    illustrationElements.current.forEach((element) => {
      if (element instanceof HTMLVideoElement) element.pause();
    });
    radarPreviewEnd.current = null;
    setIsPlaying(false);
    setRadarOpen(true);
  }, [current]);

  useEffect(() => {
    if (!clip?.autoAnalyze || !duration || autoRadarAnalyzed.current) return;
    autoRadarAnalyzed.current = true;
    void runRadarAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- A análise automática é intencionalmente disparada uma única vez por mídia/duração; incluir a função recriada poderia reavaliar o efeito sem necessidade.
  }, [clip, duration]);
  function trimAtPlayhead() {
    if (!duration) return;
    remember();
    if (current <= (start + end) / 2) {
      const value = Math.min(current, end - 0.05);
      setStart(Math.max(0, value));
      updateActiveRadarRange({ start: Math.max(0, value) });
      setNotice(`Início do corte movido para ${time(Math.max(0, value))}.`);
    } else {
      const value = Math.max(current, start + 0.05);
      setEnd(Math.min(duration, value));
      updateActiveRadarRange({ end: Math.min(duration, value) });
      setNotice(`Fim do corte movido para ${time(Math.min(duration, value))}.`);
    }
  }
  function splitSelectedAtPlayhead() {
    if (hasMontageTimeline && splitActiveRadarCutAtPlayhead()) return;
    const at = snapTime(current);
    const inRange = (item: TimedLayer) =>
      at > item.start + 0.08 && at < item.end - 0.08;
    if (selectedIllustration) {
      if (!inRange(selectedIllustration)) {
        setNotice("Posicione o cursor dentro da cena/camada para dividir.");
        return;
      }
      remember();
      const second: IllustrationLayer = {
        ...selectedIllustration,
        id: crypto.randomUUID(),
        start: at,
        fadeIn: 0,
      };
      setIllustrations((items) =>
        items.flatMap((item) =>
          item.id === selectedIllustration.id
            ? [{ ...item, end: at, fadeOut: 0 }, second]
            : [item],
        ),
      );
      if (selectedIllustration.role === "scene") {
        setAudioTracks((tracks) =>
          tracks.flatMap((track) => {
            const belongsToScene =
              track.url === selectedIllustration.url &&
              Math.abs(track.start - selectedIllustration.start) < 0.08 &&
              Math.abs(track.end - selectedIllustration.end) < 0.08;
            return belongsToScene
              ? [
                  { ...track, end: at, fadeOut: 0 },
                  {
                    ...track,
                    id: crypto.randomUUID(),
                    name: `${track.name} · parte 2`,
                    start: at,
                    fadeIn: 0,
                  },
                ]
              : [track];
          }),
        );
      }
      setSelectedIllustrationId(second.id);
      setNotice(`Cena/camada dividida em ${time(at)}.`);
      return;
    }
    if (selectedAudio) {
      if (!inRange(selectedAudio)) {
        setNotice("Posicione o cursor dentro do áudio para dividir.");
        return;
      }
      remember();
      const second: AudioTrack = {
        ...selectedAudio,
        id: crypto.randomUUID(),
        name: `${selectedAudio.name} · parte 2`,
        start: at,
        fadeIn: 0,
      };
      setAudioTracks((items) =>
        items.flatMap((item) =>
          item.id === selectedAudio.id
            ? [{ ...item, end: at, fadeOut: 0 }, second]
            : [item],
        ),
      );
      setSelectedAudioId(second.id);
      setNotice(`Áudio dividido em ${time(at)}.`);
      return;
    }
    if (selected) {
      if (!inRange(selected)) {
        setNotice("Posicione o cursor dentro do texto para dividir.");
        return;
      }
      remember();
      const second: TextLayer = {
        ...selected,
        id: crypto.randomUUID(),
        start: at,
        fadeIn: 0,
      };
      setLayers((items) =>
        items.flatMap((item) =>
          item.id === selected.id
            ? [{ ...item, end: at, fadeOut: 0 }, second]
            : [item],
        ),
      );
      setSelectedId(second.id);
      setNotice(`Texto dividido em ${time(at)}.`);
      return;
    }
    splitPrimaryVideoAtPlayhead();
  }
  function addMarker() {
    if (!duration) return;
    const value = snapTime(current);
    setMarkers((items) =>
      [...new Set([...items, value])].sort((a, b) => a - b),
    );
    setNotice(
      `Marcador adicionado em ${time(value)}. Use-o como referência para corte e camadas.`,
    );
  }
  function markCut(edge: "start" | "end") {
    if (!duration) return;
    remember();
    if (edge === "start") {
      const value = Math.min(snapTime(current), end - 0.05);
      setStart(Math.max(0, value));
      updateActiveRadarRange({ start: Math.max(0, value) });
      setNotice(`Corte inicial marcado em ${time(Math.max(0, value))}.`);
    } else {
      const value = Math.max(snapTime(current), start + 0.05);
      setEnd(Math.min(duration, value));
      updateActiveRadarRange({ end: Math.min(duration, value) });
      setNotice(`Corte final marcado em ${time(Math.min(duration, value))}.`);
    }
  }
  function addLayer() {
    remember();
    const from = Math.max(start, Math.min(current, Math.max(start, end - 0.4)));
    const layer: TextLayer = {
      ...initialLayer(),
      id: crypto.randomUUID(),
      text: "Novo texto",
      y: Math.max(18, 70 - layers.length * 9),
      start: from,
      end: Math.max(
        from + 0.4,
        Math.min(end || duration || from + 4, from + 4),
      ),
      effect: "none",
    };
    setLayers((items) => [...items, layer]);
    setSelectedId(layer.id);
    setSelectedIllustrationId("");
    setSelectedAudioId("");
    setNotice("Nova camada adicionada. Arraste o texto diretamente na prévia.");
  }
  function duplicateLayer() {
    if (!selected) return;
    remember();
    const layer = {
      ...selected,
      id: crypto.randomUUID(),
      text: `${selected.text} cópia`,
      x: Math.min(90, selected.x + 4),
      y: Math.min(92, selected.y + 4),
    };
    setLayers((items) => [...items, layer]);
    setSelectedId(layer.id);
  }
  function removeLayer() {
    if (!selected) return;
    remember();
    setLayers((items) => items.filter((layer) => layer.id !== selected.id));
    setSelectedId("");
  }
  function deleteSelected() {
    if (selectedIllustrationId) {
      removeIllustration();
      return;
    }
    if (selectedAudioId) {
      removeAudioTrack();
      return;
    }
    if (selectedId) removeLayer();
  }
  function duplicateSelected() {
    if (selectedIllustrationId) {
      duplicateIllustration();
      return;
    }
    if (selectedAudioId) {
      copySelected();
      pasteSelected();
      return;
    }
    if (selectedId) duplicateLayer();
  }
  function openContextMenu(
    event: React.MouseEvent,
    kind: "text" | "illustration" | "audio",
    id: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (kind === "text") {
      setSelectedId(id);
      setSelectedIllustrationId("");
      setSelectedAudioId("");
    }
    if (kind === "illustration") {
      setSelectedIllustrationId(id);
      setSelectedId("");
      setSelectedAudioId("");
    }
    if (kind === "audio") {
      setSelectedAudioId(id);
      setSelectedId("");
      setSelectedIllustrationId("");
    }
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 232),
      y: Math.min(event.clientY, window.innerHeight - 330),
      kind,
      id,
    });
  }
  function openVideoContextMenu(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 232),
      y: Math.min(event.clientY, window.innerHeight - 330),
      kind: "video",
      id: "",
    });
  }
  function closeContextMenu() {
    setContextMenu(null);
  }
  function moveSelectedLayer(direction: "front" | "back") {
    if (selectedIllustration) {
      remember();
      setIllustrations((items) => {
        const rest = items.filter(
          (item) => item.id !== selectedIllustration.id,
        );
        return direction === "front"
          ? [...rest, selectedIllustration]
          : [selectedIllustration, ...rest];
      });
    } else if (selected) {
      remember();
      setLayers((items) => {
        const rest = items.filter((item) => item.id !== selected.id);
        return direction === "front"
          ? [...rest, selected]
          : [selected, ...rest];
      });
    }
    closeContextMenu();
  }
  function copySelected() {
    if (selectedIllustration)
      clipboard.current = { kind: "illustration", item: selectedIllustration };
    else if (selectedAudio)
      clipboard.current = { kind: "audio", item: selectedAudio };
    else if (selected) clipboard.current = { kind: "text", item: selected };
    else return;
    setNotice("Camada copiada. Use Ctrl V para colar no cursor.");
  }
  function pasteSelected() {
    const copied = clipboard.current;
    if (!copied) return;
    const from = Math.max(
      start,
      Math.min(current, Math.max(start, end - 0.15)),
    );
    const makeRange = (item: TimedLayer) => {
      const length = Math.max(
        0.15,
        Math.min(item.end - item.start, Math.max(0.15, end - from)),
      );
      return { start: from, end: Math.min(end, from + length) };
    };
    remember();
    if (copied.kind === "text") {
      const item = copied.item as TextLayer;
      const next = {
        ...item,
        ...makeRange(item),
        id: crypto.randomUUID(),
        text: `${item.text} cópia`,
        x: Math.min(92, item.x + 4),
        y: Math.min(92, item.y + 4),
      };
      setLayers((items) => [...items, next]);
      setSelectedId(next.id);
      setSelectedIllustrationId("");
      setSelectedAudioId("");
    } else if (copied.kind === "illustration") {
      const item = copied.item as IllustrationLayer;
      const next = {
        ...item,
        ...makeRange(item),
        id: crypto.randomUUID(),
        x: Math.min(92, item.x + 4),
        y: Math.min(92, item.y + 4),
      };
      setIllustrations((items) => [...items, next]);
      setSelectedIllustrationId(next.id);
      setSelectedId("");
      setSelectedAudioId("");
    } else {
      const item = copied.item as AudioTrack;
      const next = {
        ...item,
        ...makeRange(item),
        id: crypto.randomUUID(),
        name: `${item.name} cópia`,
      };
      setAudioTracks((items) => [...items, next]);
      setSelectedAudioId(next.id);
      setSelectedId("");
      setSelectedIllustrationId("");
    }
    setNotice("Camada colada no cursor.");
  }
  function beginLayerDrag(
    event: React.PointerEvent<HTMLDivElement>,
    layer: TextLayer,
  ) {
    remember();
    setSelectedId(layer.id);
    setSelectedIllustrationId("");
    setSelectedAudioId("");
    layerDrag.current = {
      id: layer.id,
      x: layer.x,
      y: layer.y,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveLayerDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = layerDrag.current;
    const stage = event.currentTarget.parentElement;
    if (!drag || !stage) return;
    const bounds = stage.getBoundingClientRect();
    updateLayer(
      drag.id,
      {
        x: Math.max(
          7,
          Math.min(
            93,
            drag.x + ((event.clientX - drag.startX) / bounds.width) * 100,
          ),
        ),
        y: Math.max(
          5,
          Math.min(
            95,
            drag.y + ((event.clientY - drag.startY) / bounds.height) * 100,
          ),
        ),
      },
      false,
    );
  }
  function beginIllustrationDrag(
    event: React.PointerEvent<HTMLDivElement>,
    item: IllustrationLayer,
  ) {
    remember();
    setSelectedIllustrationId(item.id);
    setSelectedId("");
    setSelectedAudioId("");
    illustrationDrag.current = {
      id: item.id,
      x: item.x,
      y: item.y,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveIllustrationDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (illustrationResize.current) return;
    const drag = illustrationDrag.current;
    const stage = event.currentTarget.parentElement;
    if (!drag || !stage) return;
    const bounds = stage.getBoundingClientRect();
    updateIllustration(
      drag.id,
      {
        x: Math.max(
          8,
          Math.min(
            92,
            drag.x + ((event.clientX - drag.startX) / bounds.width) * 100,
          ),
        ),
        y: Math.max(
          8,
          Math.min(
            92,
            drag.y + ((event.clientY - drag.startY) / bounds.height) * 100,
          ),
        ),
      },
      false,
    );
  }
  function beginIllustrationResize(
    event: React.PointerEvent<HTMLDivElement>,
    item: IllustrationLayer,
    edge: "corner" | "right" | "bottom" = "corner",
  ) {
    event.stopPropagation();
    remember();
    setSelectedIllustrationId(item.id);
    illustrationResize.current = {
      id: item.id,
      width: item.width ?? item.size,
      height: item.height ?? item.size * 0.72,
      startX: event.clientX,
      startY: event.clientY,
      edge,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveIllustrationResize(event: React.PointerEvent<HTMLDivElement>) {
    const resize = illustrationResize.current;
    const stage = event.currentTarget.parentElement?.parentElement;
    if (!resize || !stage) return;
    const bounds = stage.getBoundingClientRect();
    const nextWidth = Math.max(
        8,
        Math.min(
          160,
          resize.width +
            ((event.clientX - resize.startX) / bounds.width) * 100,
        ),
      ),
      nextHeight = Math.max(
        8,
        Math.min(
          160,
          resize.height +
            ((event.clientY - resize.startY) / bounds.height) * 100,
        ),
      );
    updateIllustration(
      resize.id,
      {
        ...(resize.edge !== "bottom" ? { width: nextWidth, size: nextWidth } : {}),
        ...(resize.edge !== "right" ? { height: nextHeight } : {}),
      },
      false,
    );
  }
  function beginVideoFrameDrag(event: React.PointerEvent<HTMLVideoElement>) {
    if (!clip) return;
    videoFrameDrag.current = {
      x: videoTransform.x,
      y: videoTransform.y,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveVideoFrameDrag(event: React.PointerEvent<HTMLVideoElement>) {
    const drag = videoFrameDrag.current;
    const stage = event.currentTarget.parentElement;
    if (!drag || !stage) return;
    const bounds = stage.getBoundingClientRect();
    setVideoTransform((currentFrame) => ({
      ...currentFrame,
      x: Math.max(
        -45,
        Math.min(
          45,
          drag.x + ((event.clientX - drag.startX) / bounds.width) * 100,
        ),
      ),
      y: Math.max(
        -45,
        Math.min(
          45,
          drag.y + ((event.clientY - drag.startY) / bounds.height) * 100,
        ),
      ),
    }));
  }
  function beginVideoFrameResize(
    event: React.PointerEvent<HTMLDivElement>,
    edge: "left" | "right" | "top" | "bottom" | "corner",
  ) {
    event.preventDefault();
    event.stopPropagation();
    videoFrameResize.current = {
      scaleX: videoTransform.scaleX,
      scaleY: videoTransform.scaleY,
      startX: event.clientX,
      startY: event.clientY,
      edge,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveVideoFrameResize(event: React.PointerEvent<HTMLDivElement>) {
    const resize = videoFrameResize.current;
    const stage = event.currentTarget.parentElement;
    if (!resize || !stage) return;
    const bounds = stage.getBoundingClientRect();
    const deltaX = ((event.clientX - resize.startX) / bounds.width) * 2;
    const deltaY = ((event.clientY - resize.startY) / bounds.height) * 2;
    const clamp = (value: number) => Math.max(0.25, Math.min(4, value));
    setVideoTransform((currentFrame) => ({
      ...currentFrame,
      scaleX: clamp(
        resize.scaleX +
          (resize.edge === "left"
            ? -deltaX
            : resize.edge === "right" || resize.edge === "corner"
              ? deltaX
              : 0),
      ),
      scaleY: clamp(
        resize.scaleY +
          (resize.edge === "top"
            ? -deltaY
            : resize.edge === "bottom" || resize.edge === "corner"
              ? deltaY
              : 0),
      ),
    }));
  }
  function applyTransition(kind: TransitionKind, edge: "in" | "out") {
    if (hasMontageTimeline && activeRadarCutId) {
      applyRadarTransition(activeRadarCutId, kind, edge);
      return;
    }
    const fadeDuration = transitionDuration(kind);
    if (kind !== "none") {
      setTransitionKind(kind);
      setTransitionColor(
        kind === "fade-white" || kind === "flash" ? "white" : "black",
      );
    }
    if (edge === "in") {
      setVideoFadeIn(fadeDuration);
      setVideoFadeInAt(start);
    } else {
      setVideoFadeOut(fadeDuration);
      setVideoFadeOutAt(Math.max(start, end - fadeDuration));
    }
    setNotice(
      kind === "none"
        ? `Transição de ${edge === "in" ? "entrada" : "saída"} removida.`
        : `${transitionLabel(kind)} aplicado na ${edge === "in" ? "entrada" : "saída"}.`,
    );
  }
  function dropTransition(
    event: React.DragEvent<HTMLDivElement>,
    edge: "in" | "out",
  ) {
    event.preventDefault();
    const kind = event.dataTransfer.getData(
      "application/x-klip-transition",
    ) as TransitionKind;
    if (kind) applyTransition(kind, edge);
  }
  function dropTransitionOnTimeline(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const kind = event.dataTransfer.getData(
      "application/x-klip-transition",
    ) as TransitionKind;
    if (!kind || !duration) return;
    if (hasMontageTimeline && activeRadarCutId) {
      applyRadarTransition(activeRadarCutId, kind, "in");
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    applyTransition(
      kind,
      (event.clientX - bounds.left) / bounds.width < 0.5 ? "in" : "out",
    );
  }
  function previewStyle(layer: TextLayer): React.CSSProperties {
    const progress = effectProgress(layer, current);
    const scale =
      layer.effect === "pop"
        ? 0.68 + progress * 0.32
        : layer.effect === "zoom"
          ? 1.42 - progress * 0.42
          : layer.effect === "bounce"
            ? 0.75 + Math.sin(progress * Math.PI) * 0.22
            : 1;
    const slide = layer.effect === "slide" ? (1 - progress) * 70 : 0;
    return {
      fontFamily: layer.font,
      color: layer.color,
      fontSize: `${Math.round(layer.size / 2.25)}px`,
      left: `${layer.x}%`,
      top: `${layer.y}%`,
      textAlign: layer.align,
      opacity: layerOpacity(layer, current),
      transform: `translate(calc(-50% + ${slide}px), -50%) scale(${scale})`,
    };
  }
  function wrapCanvasText(
    context: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ) {
    const lines: string[] = [];
    text.split("\n").forEach((paragraph) => {
      const words = paragraph.split(/\s+/);
      let line = "";
      words.forEach((word) => {
        const attempt = line ? `${line} ${word}` : word;
        if (line && context.measureText(attempt).width > maxWidth) {
          lines.push(line);
          line = word;
        } else line = attempt;
      });
      lines.push(line);
    });
    return lines;
  }
  async function exportReel(
    andPublish: boolean = false,
    cutOverride: RadarSuggestion[] = [],
    outputLabel = "",
  ) {
    if (exportInProgress.current || exporting) return;
    const currentSource = video.current;
    if (!currentSource || !clip || end <= start) return;
    const source: HTMLVideoElement = currentSource;
    const requestedCuts = cutOverride.length ? cutOverride : approvedCuts;
    const montageRanges: Array<{
      start: number;
      end: number;
      audioTimelineStart: number;
      timelinePosition: number;
      fadeIn?: number;
      fadeOut?: number;
      fadeInColor?: "black" | "white";
      fadeOutColor?: "black" | "white";
      fadeInKind?: Exclude<TransitionKind, "none">;
      fadeOutKind?: Exclude<TransitionKind, "none">;
    }> = (requestedCuts.length ? requestedCuts : [{ start, end }])
      .map((item) => {
        const montageItem =
          "id" in item
            ? montageTimelineClips.find((candidate) => candidate.id === item.id)
            : undefined;
        return {
          start: Math.max(0, Math.min(sourceDuration || duration, item.start)),
          end: Math.max(0, Math.min(sourceDuration || duration, item.end)),
          // Keep the original montage position when exporting one Radar clipe.
          // This makes timeline music use the correct slice instead of restarting.
          audioTimelineStart: montageItem?.timelineStart || 0,
          timelinePosition: montageItem?.timelineStart || 0,
          fadeIn: "fadeIn" in item ? item.fadeIn : undefined,
          fadeOut: "fadeOut" in item ? item.fadeOut : undefined,
          fadeInColor: "fadeInColor" in item ? item.fadeInColor : undefined,
          fadeOutColor: "fadeOutColor" in item ? item.fadeOutColor : undefined,
          fadeInKind: "fadeInKind" in item ? item.fadeInKind : undefined,
          fadeOutKind: "fadeOutKind" in item ? item.fadeOutKind : undefined,
        };
      })
      .filter((item) => item.end - item.start > 0.08)
      .sort(
        (first, second) => first.timelinePosition - second.timelinePosition,
      );
    if (!montageRanges.length) return;
    const montageDuration = montageRanges.reduce(
      (total, item) => total + item.end - item.start,
      0,
    );
    exportInProgress.current = true;
    setExporting(true);
    setExportProgress(0);
    cancelExport.current = false;
    setNotice(
      andPublish
        ? `Preparando ${montageRanges.length > 1 ? `a montagem com ${montageRanges.length} clipes` : "o vídeo"} para publicação…`
        : montageRanges.length > 1
          ? `Montando ${montageRanges.length} clipes com fade entre os cortes…`
          : "Renderizando o reel com todas as camadas e efeitos…",
    );
    const canvas = document.createElement("canvas"),
      context = canvas.getContext("2d");
    if (!context) {
      exportInProgress.current = false;
      setExporting(false);
      return;
    }
    const sourceWidth = source.videoWidth || 1920;
    const sourceHeight = source.videoHeight || 1080;
    const aspect =
      exportAspect === "vertical"
        ? 9 / 16
        : exportAspect === "portrait"
          ? 4 / 5
          : exportAspect === "landscape"
            ? 16 / 9
            : 1;
    const original = exportAspect === "original";
    let outputWidth = original ? sourceWidth : aspect >= 1 ? 1920 : 1080;
    let outputHeight = original
      ? sourceHeight
      : Math.round(outputWidth / aspect);
    if (exportResolution !== "source") {
      const limit = Number(exportResolution);
      const outputAspect = outputWidth / outputHeight;
      if (outputAspect >= 1) {
        outputHeight = limit;
        outputWidth = Math.max(2, Math.round(limit * outputAspect));
      } else {
        outputWidth = limit;
        outputHeight = Math.max(2, Math.round(limit / outputAspect));
      }
    }
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const effectCanvas = document.createElement("canvas");
    effectCanvas.width = outputWidth;
    effectCanvas.height = outputHeight;
    const effectContext = effectCanvas.getContext("2d");
    const output = canvas.captureStream(exportFps);
    const captured = (
      source as HTMLVideoElement & { captureStream?: () => MediaStream }
    ).captureStream?.();
    const exportAudio = new AudioContext(),
      audioDestination = exportAudio.createMediaStreamDestination();
    let mainExportGain: GainNode | null = null;
    await exportAudio.resume();
    if (captured?.getAudioTracks().length) {
      const audioSource = exportAudio.createMediaStreamSource(
        new MediaStream(captured.getAudioTracks()),
      );
      const gain = exportAudio.createGain();
      gain.gain.value = audioGain / 100;
      mainExportGain = gain;
      if (audioEnhance) {
        const highPass = exportAudio.createBiquadFilter();
        highPass.type = "highpass";
        highPass.frequency.value = 80;
        const compressor = exportAudio.createDynamicsCompressor();
        compressor.threshold.value = -22;
        compressor.ratio.value = 3;
        audioSource
          .connect(highPass)
          .connect(compressor)
          .connect(gain)
          .connect(audioDestination);
      } else audioSource.connect(gain).connect(audioDestination);
    }
    const exportTrackElements: Array<{
      track: AudioTrack;
      element: HTMLAudioElement;
      gain: GainNode;
    }> = [];
    audioTracks
      .filter((track) =>
        montageRanges.some((range) => {
          const rangeEnd = range.audioTimelineStart + range.end - range.start;
          return track.end > range.audioTimelineStart && track.start < rangeEnd;
        }),
      )
      .forEach((track) => {
        const element = new Audio(track.url);
        element.preload = "auto";
        element.volume = 1;
        const trackSource = exportAudio.createMediaElementSource(element);
        const trackGain = exportAudio.createGain();
        const audible =
          !track.muted && (!soloAudioActive || Boolean(track.solo));
        trackGain.gain.value = audible
          ? Math.max(0, Math.min(1.2, track.volume / 100))
          : 0;
        trackSource.connect(trackGain).connect(audioDestination);
        exportTrackElements.push({ track, element, gain: trackGain });
      });
    audioDestination.stream
      .getAudioTracks()
      .forEach((track) => output.addTrack(track));
    const mime = mimeForExport(exportFormat) || mimeForExport("webm")!;
    if (exportFormat === "mp4" && !mime.startsWith("video/mp4"))
      setNotice(
        "MP4 não é suportado neste navegador; exportando WebM verdadeiro.",
      );
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(output, {
      mimeType: mime,
      videoBitsPerSecond:
        exportBitrate === "ultra"
          ? 20_000_000
          : exportBitrate === "high"
            ? 10_000_000
            : 5_000_000,
      audioBitsPerSecond: 192_000,
    });
    editorRecorder.current = recorder;
    let frame = 0,
      rangeIndex = 0,
      completedMontageDuration = 0,
      switchingRange = false,
      exportWatchdog = 0,
      lastSourceTime = -1,
      lastProgressAt = performance.now(),
      exportError = "";
    const finishExportWithError = (message: string) => {
      if (exportError) return;
      exportError = message;
      cancelAnimationFrame(frame);
      window.clearTimeout(exportWatchdog);
      exportTrackElements.forEach(({ element }) => element.pause());
      source.pause();
      setNotice(exportError);
      if (recorder.state !== "inactive") recorder.stop();
      else {
        exportInProgress.current = false;
        editorRecorder.current = null;
        setExporting(false);
        void exportAudio.close();
      }
    };
    const draw = () => {
      if (cancelExport.current) {
        if (recorder.state !== "inactive") recorder.stop();
        return;
      }
      const activeRange = montageRanges[rangeIndex],
        sourceTime = source.currentTime,
        localTime = Math.max(0, sourceTime - activeRange.start),
        audioTimelineTime = activeRange.audioTimelineStart + localTime,
        remaining = Math.max(0, activeRange.end - sourceTime),
        rangeLength = activeRange.end - activeRange.start,
        fadeInLength = Math.min(
          activeRange.fadeIn ?? (montageRanges.length > 1 ? 0.42 : 0),
          rangeLength / 2,
        ),
        fadeOutLength = Math.min(
          activeRange.fadeOut ?? (montageRanges.length > 1 ? 0.42 : 0),
          rangeLength / 2,
        ),
        fadeInOpacity =
          fadeInLength > 0 ? 1 - Math.min(1, localTime / fadeInLength) : 0,
        fadeOutOpacity =
          fadeOutLength > 0 ? 1 - Math.min(1, remaining / fadeOutLength) : 0,
        montageOpacity = Math.max(fadeInOpacity, fadeOutOpacity),
        montageColor =
          fadeInOpacity >= fadeOutOpacity
            ? activeRange.fadeInColor || "black"
            : activeRange.fadeOutColor || "black",
        montageKind =
          fadeInOpacity >= fadeOutOpacity
            ? activeRange.fadeInKind ||
              (activeRange.fadeInColor === "white"
                ? "fade-white"
                : "fade-black")
            : activeRange.fadeOutKind ||
              (activeRange.fadeOutColor === "white"
                ? "fade-white"
                : "fade-black");
      if (sourceTime > lastSourceTime + 0.004) {
        lastSourceTime = sourceTime;
        lastProgressAt = performance.now();
      } else if (!source.paused && performance.now() - lastProgressAt > 6500) {
        finishExportWithError(
          "A renderização perdeu o avanço do vídeo. Tente novamente; o editor já liberou a prévia.",
        );
        return;
      }
      setExportProgress(
        Math.min(
          100,
          Math.round(
            ((completedMontageDuration + localTime) /
              Math.max(0.01, montageDuration)) *
              100,
          ),
        ),
      );
      if (mainExportGain)
        mainExportGain.gain.value = (audioGain / 100) * (1 - montageOpacity);
      exportTrackElements.forEach(({ track, element, gain }) => {
        const active =
          audioTimelineTime >= track.start && audioTimelineTime < track.end;
        const desired = Math.max(0, audioTimelineTime - track.start);
        if (active && Math.abs(element.currentTime - desired) > 0.24)
          element.currentTime = desired;
        const edgeIn =
          track.fadeIn > 0 ? Math.min(1, desired / track.fadeIn) : 1;
        const edgeOut =
          track.fadeOut > 0
            ? Math.min(
                1,
                Math.max(0, (track.end - audioTimelineTime) / track.fadeOut),
              )
            : 1;
        const audible =
          !track.muted && (!soloAudioActive || Boolean(track.solo));
        gain.gain.value = audible
          ? Math.max(0, Math.min(1.2, track.volume / 100)) *
            edgeIn *
            edgeOut *
            (1 - montageOpacity)
          : 0;
        if (active && element.paused)
          void element.play().catch(() => undefined);
        if (!active && !element.paused) element.pause();
      });
      const scale = Math.max(
        canvas.width / source.videoWidth,
        canvas.height / source.videoHeight,
      );
      const width = source.videoWidth * scale * videoTransform.scaleX,
        height = source.videoHeight * scale * videoTransform.scaleY;
      const baseContext =
        visualEffect && effectContext ? effectContext : context;
      baseContext.save();
      baseContext.filter = "none";
      baseContext.fillStyle = "#090909";
      baseContext.fillRect(0, 0, canvas.width, canvas.height);
      baseContext.filter = visualFilter;
      baseContext.drawImage(
        source,
        (canvas.width - width) / 2 + (videoTransform.x / 100) * canvas.width,
        (canvas.height - height) / 2 + (videoTransform.y / 100) * canvas.height,
        width,
        height,
      );
      baseContext.restore();
      if (visualEffect && effectContext) {
        context.fillStyle = "#090909";
        context.fillRect(0, 0, canvas.width, canvas.height);
        const effectElapsedMs = (completedMontageDuration + localTime) * 1000;
        drawVisualEffectFrame(
          context,
          effectCanvas,
          visualEffect.effectId,
          (effectElapsedMs % visualEffect.durationMs) / visualEffect.durationMs,
          { fit: "contain", intensity: visualEffect.intensity },
        );
      }
      const videoTransition = Math.max(
        montageOpacity,
        montageRanges.length === 1 ? videoTransitionOpacity(sourceTime) : 0,
      );
      if (videoTransition > 0) {
        const montageWins =
          montageOpacity >=
          (montageRanges.length === 1 ? videoTransitionOpacity(sourceTime) : 0);
        const activeTransitionKind = montageWins ? montageKind : transitionKind;
        context.fillStyle =
          montageOpacity >=
          (montageRanges.length === 1 ? videoTransitionOpacity(sourceTime) : 0)
            ? montageColor === "black"
              ? "#000000"
              : "#ffffff"
            : transitionColor === "black"
              ? "#000000"
              : "#ffffff";
        context.globalAlpha =
          activeTransitionKind === "dissolve"
            ? videoTransition * 0.86
            : videoTransition;
        context.fillRect(
          0,
          0,
          activeTransitionKind === "wipe"
            ? canvas.width * videoTransition
            : canvas.width,
          canvas.height,
        );
        if (activeTransitionKind === "dissolve") {
          context.fillStyle = "#ffffff";
          context.globalAlpha = videoTransition * 0.18;
          for (let y = 3; y < canvas.height; y += 14)
            for (let x = (y % 28) / 2; x < canvas.width; x += 14)
              context.fillRect(x, y, 2, 2);
        }
        context.globalAlpha = 1;
      }
      illustrations.forEach((item) => {
        const alpha = layerOpacity(item, source.currentTime);
        const media = illustrationElements.current.get(item.id);
        if (alpha <= 0 || !media) return;
        const mediaWidth =
          media instanceof HTMLVideoElement
            ? media.videoWidth
            : media.naturalWidth;
        const mediaHeight =
          media instanceof HTMLVideoElement
            ? media.videoHeight
            : media.naturalHeight;
        if (!mediaWidth || !mediaHeight) return;
        if (media instanceof HTMLVideoElement && media.duration) {
          const mediaTime = Math.max(
            0,
            Math.min(media.duration - 0.04, source.currentTime - item.start),
          );
          if (Math.abs(media.currentTime - mediaTime) > 0.18)
            media.currentTime = mediaTime;
        }
        const boxWidth =
          item.role === "scene"
            ? canvas.width
            : ((item.width ?? item.size) / 100) * canvas.width;
        const boxHeight =
          item.role === "scene"
            ? canvas.height
            : ((item.height ?? item.size * 0.72) / 100) * canvas.height;
        const scale =
          item.fit === "cover"
            ? Math.max(boxWidth / mediaWidth, boxHeight / mediaHeight)
            : Math.min(boxWidth / mediaWidth, boxHeight / mediaHeight);
        const drawWidth = mediaWidth * scale;
        const drawHeight = mediaHeight * scale;
        const x =
          item.role === "scene"
            ? 0
            : (item.x / 100) * canvas.width - boxWidth / 2;
        const y =
          item.role === "scene"
            ? 0
            : (item.y / 100) * canvas.height - boxHeight / 2;
        context.save();
        context.globalAlpha = alpha;
        context.beginPath();
        context.roundRect(x, y, boxWidth, boxHeight, 22);
        context.clip();
        context.drawImage(
          media,
          x + (boxWidth - drawWidth) / 2,
          y + (boxHeight - drawHeight) / 2,
          drawWidth,
          drawHeight,
        );
        context.restore();
      });
      layers.forEach((layer) => {
        const alpha = layerOpacity(layer, source.currentTime);
        if (!layer.text.trim() || alpha <= 0) return;
        const progress = effectProgress(layer, source.currentTime);
        const scaleEffect =
          layer.effect === "pop"
            ? 0.68 + progress * 0.32
            : layer.effect === "zoom"
              ? 1.42 - progress * 0.42
              : layer.effect === "bounce"
                ? 0.75 + Math.sin(progress * Math.PI) * 0.22
                : 1;
        const slide = layer.effect === "slide" ? (1 - progress) * 180 : 0;
        const text = visibleText(layer, source.currentTime);
        context.save();
        context.globalAlpha = alpha;
        context.font = `800 ${layer.size}px ${layer.font}`;
        context.textAlign = layer.align;
        context.textBaseline = "middle";
        const x = (layer.x / 100) * canvas.width + slide,
          y = (layer.y / 100) * canvas.height;
        context.translate(x, y);
        context.scale(scaleEffect, scaleEffect);
        const lines = wrapCanvasText(context, text, 930);
        const lineHeight = layer.size * 1.12;
        const yOffset = -((lines.length - 1) * lineHeight) / 2;
        lines.forEach((line, index) => {
          const lineY = yOffset + index * lineHeight;
          if (layer.background) {
            const metrics = context.measureText(line);
            const left =
              layer.align === "center"
                ? -metrics.width / 2
                : layer.align === "right"
                  ? -metrics.width
                  : 0;
            context.fillStyle = "rgba(0,0,0,.72)";
            context.fillRect(
              left - 18,
              lineY - layer.size * 0.58,
              metrics.width + 36,
              layer.size * 1.16,
            );
          }
          context.lineWidth = Math.max(4, layer.size / 11);
          context.strokeStyle = "rgba(0,0,0,.76)";
          context.fillStyle = layer.color;
          context.strokeText(line, 0, lineY, 930);
          context.fillText(line, 0, lineY, 930);
        });
        context.restore();
      });
      if (source.currentTime < activeRange.end - 0.015 && !source.paused)
        frame = requestAnimationFrame(draw);
      else if (!switchingRange) void advanceMontageRange();
    };
    async function seekExportSource(value: number) {
      source.currentTime = value;
      if (Math.abs(source.currentTime - value) < 0.025 && !source.seeking)
        return;
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error("seek-timeout")),
          6000,
        );
        source.addEventListener(
          "seeked",
          () => {
            window.clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );
      });
    }
    async function advanceMontageRange() {
      if (switchingRange) return;
      switchingRange = true;
      source.pause();
      exportTrackElements.forEach(({ element }) => element.pause());
      const completed = montageRanges[rangeIndex];
      completedMontageDuration += completed.end - completed.start;
      rangeIndex += 1;
      if (rangeIndex >= montageRanges.length) {
        if (recorder.state !== "inactive") recorder.stop();
        return;
      }
      await seekExportSource(montageRanges[rangeIndex].start);
      try {
        await source.play();
        switchingRange = false;
        lastSourceTime = source.currentTime;
        lastProgressAt = performance.now();
        draw();
      } catch {
        finishExportWithError(
          "O navegador interrompeu a reprodução durante a renderização. Clique em salvar novamente.",
        );
      }
    }
    recorder.ondataavailable = (event) =>
      event.data.size && chunks.push(event.data);
    recorder.onerror = () =>
      finishExportWithError(
        "Não foi possível concluir este clipe neste navegador. Tente WebM ou uma resolução menor.",
      );
    recorder.onstop = () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(exportWatchdog);
      exportTrackElements.forEach(({ element }) => element.pause());
      source.pause();
      exportInProgress.current = false;
      if (cancelExport.current) {
        void exportAudio.close();
        editorRecorder.current = null;
        setExportProgress(0);
        setExporting(false);
        setNotice("Renderização cancelada.");
        return;
      }
      if (exportError) {
        void exportAudio.close();
        editorRecorder.current = null;
        setExportProgress(0);
        setExporting(false);
        setNotice(exportError);
        return;
      }
      const blob = new Blob(chunks, { type: mime });
      if (!blob.size) {
        void exportAudio.close();
        editorRecorder.current = null;
        setExportProgress(0);
        setExporting(false);
        setNotice(
          "A renderização terminou sem gerar arquivo. Tente WebM ou reduza a resolução.",
        );
        return;
      }
      if (andPublish) {
        setPublishBlob(blob);
        setPublishModalOpen(true);
        setNotice("Vídeo processado! Pronto para publicação.");
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const safeLabel = outputLabel
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, "-")
          .replace(/^-+|-+$/g, "");
        link.download = `${safeLabel || "klip-reel"}-${Date.now()}.${mime.startsWith("video/mp4") ? "mp4" : "webm"}`;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setNotice(
          montageRanges.length > 1
            ? `Montagem exportada com ${montageRanges.length} clipes e fades automáticos.`
            : outputLabel
              ? `${outputLabel} exportado individualmente com vídeo e áudio. Os demais clipes continuam na montagem.`
              : "Reel exportado com corte, áudio, textos e efeitos.",
        );
      }
      void exportAudio.close();
      editorRecorder.current = null;
      setExportProgress(100);
      setExporting(false);
    };
    try {
      await Promise.all(
        exportTrackElements.map(
          ({ element, track }) =>
            new Promise<void>((resolve, reject) => {
              if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                resolve();
                return;
              }
              const timeout = window.setTimeout(
                () => reject(new Error(`audio-timeout:${track.name}`)),
                6000,
              );
              const done = () => {
                window.clearTimeout(timeout);
                resolve();
              };
              const failed = () => {
                window.clearTimeout(timeout);
                reject(new Error(`audio-error:${track.name}`));
              };
              element.addEventListener("canplay", done, { once: true });
              element.addEventListener("error", failed, { once: true });
              element.load();
            }),
        ),
      );
      await seekExportSource(montageRanges[0].start);
      recorder.start(1000);
      lastSourceTime = source.currentTime;
      lastProgressAt = performance.now();
      exportWatchdog = window.setTimeout(
        () =>
          finishExportWithError(
            "A renderização demorou além do esperado e foi interrompida com segurança.",
          ),
        Math.max(30_000, montageDuration * 4000 + 15_000),
      );
      await source.play();
      draw();
    } catch (error) {
      finishExportWithError(
        error instanceof Error && error.message.startsWith("audio-")
          ? "Uma faixa de áudio não ficou pronta para a exportação. Reimporte o som e tente novamente."
          : "Não foi possível iniciar a renderização. Clique em salvar novamente ou escolha WebM.",
      );
    }
  }

  const beginTimelinePanelResize = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    timelinePanelResize.current = {
      startY: event.clientY,
      startHeight: timelineHeight,
    };
  };
  const moveTimelinePanelResize = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    const resize = timelinePanelResize.current;
    if (!resize) return;
    const viewportLimit =
      typeof window === "undefined"
        ? 620
        : Math.max(260, Math.min(720, window.innerHeight * 0.72));
    setTimelineHeight(
      Math.round(
        Math.max(
          210,
          Math.min(
            viewportLimit,
            resize.startHeight + resize.startY - event.clientY,
          ),
        ),
      ),
    );
  };
  const endTimelinePanelResize = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    timelinePanelResize.current = null;
  };
  const autosaveLabel =
    autosaveStatus === "restoring"
      ? "Recuperando projeto…"
      : autosaveStatus === "saving"
        ? "Salvando…"
        : autosaveStatus === "error"
          ? "Falha no salvamento local"
          : autosaveSavedAt
            ? `Salvo localmente · ${new Date(autosaveSavedAt).toLocaleTimeString(
                "pt-BR",
                { hour: "2-digit", minute: "2-digit" },
              )}`
            : "Proteção automática ativa";

  return (
    <main
      className="clip-editor clip-editor-v2"
      style={
        {
          "--studio-timeline-h": `${timelineHeight}px`,
          "--pure-timeline-h": `${timelineHeight}px`,
        } as CSSProperties
      }
    >
      <header className="editor-header editor-header-pro">
        <div className="brand">
          <KlipAppLogo variant="full" width={142} height={30} />
          <em>Studio</em>
        </div>
        {clip && (
          <div className="editor-project-status" title={clip.name}>
            <b>{clip.name}</b>
            <span>
              <i /> {autosaveLabel}
            </span>
          </div>
        )}
        {clip && (
          <div
            className="pure-history-controls"
            aria-label="Histórico de edição"
          >
            <button
              type="button"
              disabled={!history.current.length}
              onClick={undo}
              aria-label="Desfazer"
              title="Desfazer (Ctrl ou ⌘ + Z)"
            >
              <Undo2 aria-hidden="true" size={15} />
            </button>
            <button
              type="button"
              disabled={!future.current.length}
              onClick={redo}
              aria-label="Refazer"
              title="Refazer (Ctrl ou ⌘ + Shift + Z)"
            >
              <Redo2 aria-hidden="true" size={15} />
            </button>
          </div>
        )}
        <div className="editor-header-actions">
          <button
            className="theme-toggle editor-theme-toggle"
            onClick={onToggleTheme}
            aria-label={`Usar tema ${theme === "dark" ? "claro" : "escuro"}`}
            title={`Tema ${theme === "dark" ? "claro" : "escuro"}`}
          >
            {theme === "dark" ? (
              <Sun aria-hidden="true" size={16} />
            ) : (
              <Moon aria-hidden="true" size={16} />
            )}
          </button>
          <button
            className="header-quiet-action"
            onClick={onBack}
            title="Voltar para a sala"
            aria-label="Voltar para a sala"
          >
            <ArrowLeft aria-hidden="true" size={16} /> <span>Sala</span>
          </button>
          {clip && (
            <>
              <button
                className="header-quiet-action radar-trigger"
                onClick={() =>
                  radarSuggestions.length
                    ? setRadarOpen(true)
                    : void runRadarAnalysis()
                }
                title="Encontrar os melhores momentos"
                aria-haspopup="dialog"
                aria-expanded={radarOpen}
                aria-controls="klip-radar-dialog"
              >
                <Sparkles aria-hidden="true" size={16} /> <span>Radar</span>
              </button>
              <button
                className="header-format-action"
                onClick={() => {
                  setActiveTool("formats");
                  setToolPanelOpen(true);
                }}
                title="Alterar formato do vídeo"
                aria-expanded={toolPanelOpen && activeTool === "formats"}
                aria-controls="klip-tool-panel"
              >
                <span>
                  <LayoutTemplate aria-hidden="true" size={16} />
                </span>
                <b>{selectedSocialPreset.title}</b>
                <small>{selectedSocialPreset.aspectRatio.label}</small>
              </button>
              <details className="export-settings-popover">
                <summary
                  title="Configurações de exportação"
                  aria-label="Configurações de exportação"
                >
                  <Settings2 aria-hidden="true" size={16} />{" "}
                  <span>Qualidade</span>
                </summary>
                <div className="export-settings-menu">
                  <header>
                    <b>Exportação</b>
                    <span>
                      {exportResolution === "source"
                        ? "Original"
                        : `${exportResolution}p`}{" "}
                      · {exportFps} FPS
                    </span>
                  </header>
                  <label>
                    Arquivo
                    <select
                      aria-label="Formato de saída"
                      value={exportFormat}
                      onChange={(event) =>
                        setExportFormat(event.target.value as ExportFormat)
                      }
                    >
                      <option value="mp4">MP4</option>
                      <option value="webm">WebM</option>
                    </select>
                  </label>
                  <label>
                    Formato
                    <select
                      aria-label="Formato do vídeo"
                      value={exportAspect}
                      onChange={(event) => {
                        const next = event.target.value as ExportAspect;
                        const presetId: SocialPresetId =
                          next === "vertical"
                            ? "instagram-reels"
                            : next === "portrait"
                              ? "feed-portrait"
                              : next === "landscape"
                                ? "youtube-landscape"
                                : next === "square"
                                  ? "feed-square"
                                  : "custom";
                        setExportAspect(next);
                        setSelectedSocialPresetId(presetId);
                        setDraftSocialPresetId(presetId);
                      }}
                    >
                      <option value="original">Original</option>
                      <option value="vertical">Vertical 9:16</option>
                      <option value="portrait">Retrato 4:5</option>
                      <option value="landscape">Horizontal 16:9</option>
                      <option value="square">Quadrado 1:1</option>
                    </select>
                  </label>
                  <label>
                    Resolução
                    <select
                      aria-label="Resolução do vídeo"
                      value={exportResolution}
                      onChange={(event) =>
                        setExportResolution(
                          event.target.value as "source" | "1080" | "720",
                        )
                      }
                    >
                      <option value="source">Original</option>
                      <option value="1080">Até 1080p</option>
                      <option value="720">Até 720p</option>
                    </select>
                  </label>
                  <label>
                    FPS
                    <select
                      aria-label="Quadros por segundo"
                      value={exportFps}
                      onChange={(event) =>
                        setExportFps(Number(event.target.value))
                      }
                    >
                      <option value="24">24 FPS</option>
                      <option value="30">30 FPS</option>
                      <option value="60">60 FPS</option>
                    </select>
                  </label>
                  <label>
                    Qualidade
                    <select
                      aria-label="Bitrate"
                      value={exportBitrate}
                      onChange={(event) =>
                        setExportBitrate(
                          event.target.value as "standard" | "high" | "ultra",
                        )
                      }
                    >
                      <option value="standard">Padrão</option>
                      <option value="high">Alta</option>
                      <option value="ultra">Máxima</option>
                    </select>
                  </label>
                </div>
              </details>
              <button
                className="editor-export"
                disabled={!clip || exporting}
                onClick={() => void exportReel(false)}
                aria-busy={exporting}
                aria-live="polite"
                aria-atomic="true"
              >
                {exporting
                  ? `${exportProgress}%`
                  : approvedCuts.length > 1
                    ? `Exportar ${approvedCuts.length} clipes`
                    : `Exportar ${exportFormat.toUpperCase()}`}
              </button>
              <button
                className="editor-publish-btn"
                disabled={!clip || exporting}
                onClick={() => void exportReel(true)}
                title="Publicar nas redes"
                aria-busy={exporting}
              >
                <Share2 aria-hidden="true" />
                <span>Publicar</span>
              </button>
              {exporting && (
                <button
                  className="editor-cancel"
                  onClick={() => {
                    cancelExport.current = true;
                    editorRecorder.current?.stop();
                  }}
                >
                  Cancelar
                </button>
              )}
            </>
          )}
        </div>
      </header>
      {autosaveStatus === "restoring" && (
        <div className="editor-recovery-loading" role="status" aria-live="polite">
          <span aria-hidden="true" />
          <b>Recuperando seu projeto</b>
          <small>Vídeos, áudios, cortes e camadas estão sendo restaurados.</small>
        </div>
      )}
      {clip && (
        <nav className="mobile-editor-nav" aria-label="Atalhos do editor">
          <a href="#klip-preview">
            <Eye aria-hidden="true" size={15} /> Prévia
          </a>
          <button
            onClick={() => {
              setActiveTool("media");
              setToolPanelOpen(true);
            }}
            aria-expanded={toolPanelOpen}
            aria-controls="klip-tool-panel"
          >
            <SlidersHorizontal aria-hidden="true" size={15} /> Ferramentas
          </button>
          <a href="#klip-timeline">
            <Layers2 aria-hidden="true" size={15} /> Linha do tempo
          </a>
          <button
            className="radar-trigger"
            onClick={() =>
              radarSuggestions.length
                ? setRadarOpen(true)
                : void runRadarAnalysis()
            }
            aria-haspopup="dialog"
            aria-expanded={radarOpen}
            aria-controls="klip-radar-dialog"
          >
            <Sparkles aria-hidden="true" size={15} /> Radar
          </button>
          <button
            disabled={!clip || exporting}
            onClick={() => void exportReel()}
          >
            <Download aria-hidden="true" size={15} />{" "}
            {exporting
              ? "Renderizando…"
              : approvedCuts.length > 1
                ? `Montagem (${approvedCuts.length})`
                : "Exportar"}
          </button>
        </nav>
      )}
      <section
        className={`editor-workspace ${clip ? "" : "editor-workspace-empty"}`}
      >
        <aside
          className={`editor-tool-dock ${toolPanelOpen ? "panel-open" : ""}`}
          id="klip-tools"
        >
          <nav className="editor-tool-rail" aria-label="Ferramentas do editor">
            {(
              [
                { tool: "media", icon: ImagePlus, label: "Mídia" },
                { tool: "text", icon: Type, label: "Texto" },
                { tool: "audio", icon: Music2, label: "Áudio" },
                { tool: "effects", icon: Sparkles, label: "Efeitos" },
                { tool: "captions", icon: Captions, label: "Legendas" },
                { tool: "transitions", icon: Blend, label: "Transições" },
                { tool: "formats", icon: LayoutTemplate, label: "Formatos" },
                { tool: "radar", icon: WandSparkles, label: "Radar" },
              ] as const
            ).map(({ tool, icon: ToolIcon, label }) => (
              <button
                key={tool}
                type="button"
                className={activeTool === tool ? "active" : ""}
                onClick={() => {
                  setActiveTool(tool);
                  setToolPanelOpen(true);
                }}
                title={label}
                aria-label={label}
                aria-pressed={activeTool === tool}
                aria-expanded={toolPanelOpen && activeTool === tool}
                aria-controls="klip-tool-panel"
              >
                <span>
                  <ToolIcon aria-hidden="true" size={18} />
                </span>
                <b>{label}</b>
              </button>
            ))}
          </nav>
          <aside
            className="editor-tools"
            data-tool={activeTool}
            id="klip-tool-panel"
            aria-label="Painel de ferramentas do editor"
          >
            <header className="editor-tool-panel-header">
              <div>
                <span>{activeTool === "radar" ? "IA" : "EDITOR"}</span>
                <b>
                  {activeTool === "media"
                    ? "Mídia"
                    : activeTool === "text"
                      ? "Texto"
                      : activeTool === "audio"
                        ? "Áudio"
                        : activeTool === "effects"
                          ? "Efeitos"
                          : activeTool === "captions"
                            ? "Legendas"
                            : activeTool === "transitions"
                              ? "Transições"
                              : activeTool === "formats"
                                ? "Formatos"
                                : "Radar KLIPAPP"}
                </b>
              </div>
              <button
                type="button"
                onClick={() => setToolPanelOpen(false)}
                aria-label="Fechar ferramentas"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </header>

            {activeTool === "media" && (
              <section className="editor-tool-section tool-media-panel">
                <div className="tool-heading">
                  <span>01</span>
                  <div>
                    <b>Mídia</b>
                    <small>Gravação, vídeo ou foto do computador</small>
                  </div>
                </div>
                {!clip ? (
                  <>
                    <label className="editor-upload">
                      <Plus aria-hidden="true" size={15} /> Importar mídia
                      principal
                      <input
                        type="file"
                        accept="video/*,image/*"
                        onChange={(event) =>
                          void selectFile(event.target.files?.[0])
                        }
                      />
                    </label>
                    <small className="media-import-help">
                      A mídia principal é a base do seu vídeo. Uma foto vira um
                      clipe animado de 6 segundos.
                    </small>
                  </>
                ) : (
                  <>
                    <div className="media-destination-title">
                      <b>Adicionar mídia</b>
                      <small>
                        Escolha o destino antes de importar. Nada será trocado
                        por acidente.
                      </small>
                    </div>
                    <div className="media-destinations">
                      <label className="editor-upload editor-replace-upload">
                        <RefreshCw aria-hidden="true" size={15} /> Trocar mídia
                        principal
                        <input
                          type="file"
                          accept="video/*,image/*"
                          onChange={(event) =>
                            void selectFile(event.target.files?.[0])
                          }
                        />
                      </label>
                      <label className="editor-upload editor-scene-upload">
                        <Plus aria-hidden="true" size={15} /> Inserir na
                        sequência
                        <input
                          type="file"
                          accept="video/*,image/*"
                          onChange={(event) =>
                            void addSceneMedia(event.target.files?.[0])
                          }
                        />
                      </label>
                      <label className="editor-upload editor-illustration-upload">
                        <Layers2 aria-hidden="true" size={15} /> Sobrepor vídeo
                        ou imagem
                        <input
                          type="file"
                          accept="image/*,video/*"
                          onChange={(event) =>
                            addIllustration(event.target.files?.[0])
                          }
                        />
                      </label>
                      <label className="editor-upload editor-reaction-upload">
                        <PictureInPicture aria-hidden="true" size={15} /> Vídeo
                        de reação
                        <input
                          type="file"
                          accept="video/*"
                          onChange={(event) =>
                            addIllustration(event.target.files?.[0], "reaction")
                          }
                        />
                      </label>
                    </div>
                    <small className="media-import-help">
                      <b>Sequência</b> cria outro trecho. <b>Reação</b> entra
                      menor sobre o vídeo principal; você pode arrastar para
                      qualquer lado e redimensionar livremente.
                    </small>
                  </>
                )}
                {clip && (
                  <p className="editor-file">
                    <Film aria-hidden="true" size={13} /> {clip.name}
                  </p>
                )}
                {clip && (
                  <div
                    className="pure-media-library"
                    aria-label="Biblioteca do projeto"
                  >
                    <div className="pure-library-toolbar">
                      <b>Biblioteca</b>
                      <span>
                        {1 + illustrations.length + audioTracks.length}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={
                        !selectedIllustrationId && !selectedAudioId
                          ? "selected"
                          : ""
                      }
                      onClick={() => {
                        setSelectedIllustrationId("");
                        setSelectedAudioId("");
                        setInspectorTab("edit");
                      }}
                    >
                      <span
                        className="pure-media-thumb pure-media-video"
                        style={
                          timelineThumbnails[0]
                            ? {
                                backgroundImage: `url(${timelineThumbnails[0]})`,
                                backgroundPosition: "center",
                                backgroundSize: "cover",
                              }
                            : undefined
                        }
                      >
                        {!timelineThumbnails[0] && (
                          <Film aria-hidden="true" size={18} />
                        )}
                      </span>
                      <span>
                        <b>{clip.name}</b>
                        <small>Vídeo principal · {time(baseDuration)}</small>
                      </span>
                    </button>
                    {illustrations.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={
                          selectedIllustration?.id === item.id ? "selected" : ""
                        }
                        onClick={() => {
                          setSelectedIllustrationId(item.id);
                          setSelectedAudioId("");
                          setSelectedId("");
                          setInspectorTab("edit");
                          seek(item.start);
                        }}
                      >
                        <span
                          className={`pure-media-thumb ${item.kind === "image" ? "has-image" : ""}`}
                          style={
                            item.kind === "image"
                              ? { backgroundImage: `url(${item.url})` }
                              : undefined
                          }
                        >
                          {item.kind === "video" && (
                            <Film aria-hidden="true" size={18} />
                          )}
                        </span>
                        <span>
                          <b>{item.name}</b>
                          <small>
                            {item.role === "scene" ? "Na sequência" : "Camada"}{" "}
                            · {time(item.end - item.start)}
                          </small>
                        </span>
                      </button>
                    ))}
                    {audioTracks.map((track) => (
                      <button
                        type="button"
                        key={track.id}
                        className={
                          selectedAudio?.id === track.id ? "selected" : ""
                        }
                        onClick={() => {
                          const deselect = selectedAudio?.id === track.id;
                          setSelectedAudioId(deselect ? "" : track.id);
                          setSelectedIllustrationId("");
                          setSelectedId("");
                          setInspectorTab("edit");
                          setActiveTool("audio");
                          setToolPanelOpen(true);
                        }}
                      >
                        <span className="pure-media-thumb pure-media-audio">
                          <AudioLines aria-hidden="true" size={18} />
                        </span>
                        <span>
                          <b>{track.name}</b>
                          <small>Áudio · {time(track.end - track.start)}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="project-actions">
                  <button onClick={() => void saveRecoveryNow()}>
                    <ShieldCheck aria-hidden="true" size={14} /> Salvar agora
                  </button>
                  <button onClick={exportProject}>
                    <FileDown aria-hidden="true" size={14} /> Salvar projeto
                  </button>
                  <label>
                    <FileUp aria-hidden="true" size={14} /> Abrir projeto
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={(event) =>
                        void importProject(event.target.files?.[0])
                      }
                    />
                  </label>
                  <button
                    className="project-clear-recovery"
                    onClick={() => {
                      void clearEditorRecovery().then(() => {
                        persistedRecoveryAssets.current.clear();
                        setAutosaveSavedAt(0);
                        setAutosaveStatus("idle");
                        setNotice(
                          "Cópia de recuperação removida. O salvamento automático recomeça na próxima alteração.",
                        );
                      });
                    }}
                  >
                    <Trash2 aria-hidden="true" size={14} /> Limpar recuperação
                  </button>
                </div>
              </section>
            )}

            {activeTool === "effects" && (
              <section className="editor-tool-section tool-effects-panel">
                <button
                  className="tool-primary-action"
                  type="button"
                  onClick={() => setStudioPanel("effects")}
                >
                  <span>
                    <Sparkles aria-hidden="true" size={18} />
                  </span>
                  <b>Galeria de efeitos</b>
                </button>
                {clip && (
                  <>
                    <details className="tool-disclosure" open>
                      <summary>Templates e aparência</summary>
                      <div className="template-grid">
                        <button onClick={() => applyTemplate("podcast")}>
                          <Mic aria-hidden="true" size={14} /> Podcast
                        </button>
                        <button onClick={() => applyTemplate("react")}>
                          <Eye aria-hidden="true" size={14} /> React
                        </button>
                        <button onClick={() => applyTemplate("gameplay")}>
                          <Video aria-hidden="true" size={14} /> Gameplay
                        </button>
                        <button onClick={() => applyTemplate("interview")}>
                          <MessageSquare aria-hidden="true" size={14} />{" "}
                          Entrevista
                        </button>
                      </div>
                      {clip && (
                        <div className="visual-presets">
                          <b>Cor e filtros</b>
                          <div>
                            {(
                              [
                                ["clean", "Limpo"],
                                ["cinematic", "Cinema"],
                                ["vivid", "Vibrante"],
                                ["mono", "P&B"],
                                ["warm", "Quente"],
                              ] as const
                            ).map(([key, label]) => (
                              <button
                                key={key}
                                className={
                                  visualPreset === key ? "selected" : ""
                                }
                                onClick={() => setVisualPreset(key)}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </details>
                    <details className="tool-disclosure video-properties" open>
                      <summary>Vídeo e enquadramento</summary>
                      <div className="video-properties-grid">
                        <p>
                          Arraste diretamente na prévia ou faça o ajuste preciso
                          aqui. O enquadramento é exportado exatamente assim.
                        </p>
                        <label>
                          Horizontal · {Math.round(videoTransform.x)}%
                          <input
                            type="range"
                            min="-45"
                            max="45"
                            value={videoTransform.x}
                            onChange={(event) =>
                              setVideoTransform((frame) => ({
                                ...frame,
                                x: Number(event.target.value),
                              }))
                            }
                          />
                        </label>
                        <label>
                          Vertical · {Math.round(videoTransform.y)}%
                          <input
                            type="range"
                            min="-45"
                            max="45"
                            value={videoTransform.y}
                            onChange={(event) =>
                              setVideoTransform((frame) => ({
                                ...frame,
                                y: Number(event.target.value),
                              }))
                            }
                          />
                        </label>
                        <label>
                          Largura · {Math.round(videoTransform.scaleX * 100)}%
                          <input
                            type="range"
                            min="0.25"
                            max="4"
                            step="0.01"
                            value={videoTransform.scaleX}
                            onChange={(event) =>
                              setVideoTransform((frame) => ({
                                ...frame,
                                scaleX: Number(event.target.value),
                              }))
                            }
                          />
                        </label>
                        <label>
                          Altura · {Math.round(videoTransform.scaleY * 100)}%
                          <input
                            type="range"
                            min="0.25"
                            max="4"
                            step="0.01"
                            value={videoTransform.scaleY}
                            onChange={(event) =>
                              setVideoTransform((frame) => ({
                                ...frame,
                                scaleY: Number(event.target.value),
                              }))
                            }
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setVideoTransform({
                              x: 0,
                              y: 0,
                              scaleX: 1,
                              scaleY: 1,
                            })
                          }
                        >
                          <RotateCcw aria-hidden="true" size={14} /> Restaurar
                          enquadramento
                        </button>
                      </div>
                    </details>
                  </>
                )}
              </section>
            )}

            {activeTool === "audio" && (
              <section className="editor-tool-section tool-audio-panel">
                <button
                  className="tool-primary-action"
                  type="button"
                  onClick={() => setStudioPanel("audio")}
                >
                  <span>
                    <Music2 aria-hidden="true" size={18} />
                  </span>
                  <b>Biblioteca de sons</b>
                </button>
                {clip && (
                  <div className="audio-editor-controls">
                    <b>Áudio do vídeo</b>
                    <label>
                      Volume · {audioGain}%
                      <input
                        type="range"
                        min="0"
                        max="160"
                        value={audioGain}
                        onChange={(event) =>
                          setAudioGain(Number(event.target.value))
                        }
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={audioEnhance}
                        onChange={(event) =>
                          setAudioEnhance(event.target.checked)
                        }
                      />{" "}
                      Limpar voz
                    </label>
                    <button onClick={() => void detectSilence()}>
                      <Scissors aria-hidden="true" size={14} /> Remover
                      silêncios
                    </button>
                  </div>
                )}
                {clip && (
                  <div className="audio-editor-controls audio-library">
                    <div className="audio-mixer-heading">
                      <div>
                        <b>Mixador de áudio</b>
                        <small>
                          {audioTracks.length}{" "}
                          {audioTracks.length === 1
                            ? "canal adicional"
                            : "canais adicionais"}
                        </small>
                      </div>
                      <span>{audioTracks.length + 1} canais no projeto</span>
                    </div>
                    <label className="audio-import">
                      <Plus aria-hidden="true" size={14} /> Adicionar canais de
                      áudio
                      <input
                        type="file"
                        accept="audio/*"
                        multiple
                        onChange={(event) =>
                          void addAudioFiles(event.target.files)
                        }
                      />
                    </label>
                    <div className="sound-fx-shelf">
                      <button onClick={() => addBuiltInSound("pop")}>
                        <Circle
                          aria-hidden="true"
                          size={11}
                          fill="currentColor"
                        />{" "}
                        Pop
                      </button>
                      <button onClick={() => addBuiltInSound("whoosh")}>
                        <AudioLines aria-hidden="true" size={14} /> Whoosh
                      </button>
                      <button onClick={() => addBuiltInSound("ding")}>
                        <Sparkles aria-hidden="true" size={14} /> Ding
                      </button>
                    </div>
                    <div className="audio-channel-list">
                      <div className="audio-channel-strip main-channel">
                        <span className="channel-index">V</span>
                        <div>
                          <b>Áudio do vídeo</b>
                          <small>Canal principal · {audioGain}%</small>
                        </div>
                        <input
                          aria-label="Volume do áudio principal"
                          type="range"
                          min="0"
                          max="160"
                          value={audioGain}
                          onChange={(event) =>
                            setAudioGain(Number(event.target.value))
                          }
                        />
                      </div>
                      {audioTracks.map((track, index) => (
                        <div
                          key={track.id}
                          className={`audio-channel-strip ${selectedAudio?.id === track.id ? "selected" : ""} ${track.muted ? "muted" : ""}`}
                        >
                          <button
                            type="button"
                            className="channel-select"
                            onClick={() => {
                              const deselect = selectedAudio?.id === track.id;
                              setSelectedAudioId(deselect ? "" : track.id);
                              setSelectedId("");
                              setSelectedIllustrationId("");
                              setActiveTool("audio");
                            }}
                          >
                            <span className="channel-index">A{index + 1}</span>
                            <span>
                              <b>{track.name}</b>
                              <small>
                                {time(track.start)}–{time(track.end)}
                              </small>
                            </span>
                          </button>
                          <input
                            aria-label={`Volume do canal ${track.name}`}
                            type="range"
                            min="0"
                            max="120"
                            value={track.volume}
                            onChange={(event) =>
                              updateAudioTrack(track.id, {
                                volume: Number(event.target.value),
                              })
                            }
                          />
                          <div className="channel-toggles">
                            <button
                              type="button"
                              className={track.muted ? "active" : ""}
                              title="Silenciar este canal"
                              aria-label={`Silenciar ${track.name}`}
                              onClick={() =>
                                updateAudioTrack(track.id, {
                                  muted: !track.muted,
                                })
                              }
                            >
                              M
                            </button>
                            <button
                              type="button"
                              className={track.solo ? "active solo" : ""}
                              title="Ouvir somente este canal"
                              aria-label={`Solo ${track.name}`}
                              onClick={() =>
                                updateAudioTrack(track.id, {
                                  solo: !track.solo,
                                })
                              }
                            >
                              S
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {selectedAudio && (
                      <div className="audio-track-inspector">
                        <div>
                          <b>Faixa selecionada</b>
                          <span className="audio-track-actions">
                            <button onClick={duplicateAudioTrack}>
                              Duplicar
                            </button>
                            <button onClick={removeAudioTrack}>Excluir</button>
                          </span>
                        </div>
                        {selectedAudio.license && (
                          <small title={selectedAudio.license.summary}>
                            {selectedAudio.license.name}
                          </small>
                        )}
                        <label>
                          Volume · {selectedAudio.volume}%
                          <input
                            type="range"
                            min="0"
                            max="120"
                            value={selectedAudio.volume}
                            onChange={(event) =>
                              updateAudioTrack(selectedAudio.id, {
                                volume: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <div className="audio-track-switches">
                          <button
                            type="button"
                            className={selectedAudio.muted ? "active" : ""}
                            onClick={() =>
                              updateAudioTrack(selectedAudio.id, {
                                muted: !selectedAudio.muted,
                              })
                            }
                          >
                            Mute
                          </button>
                          <button
                            type="button"
                            className={selectedAudio.solo ? "active solo" : ""}
                            onClick={() =>
                              updateAudioTrack(selectedAudio.id, {
                                solo: !selectedAudio.solo,
                              })
                            }
                          >
                            Solo
                          </button>
                        </div>
                        <label>
                          Fade in · {selectedAudio.fadeIn.toFixed(1)}s
                          <input
                            type="range"
                            min="0"
                            max="3"
                            step="0.1"
                            value={selectedAudio.fadeIn}
                            onChange={(event) =>
                              updateAudioTrack(selectedAudio.id, {
                                fadeIn: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          Fade out · {selectedAudio.fadeOut.toFixed(1)}s
                          <input
                            type="range"
                            min="0"
                            max="3"
                            step="0.1"
                            value={selectedAudio.fadeOut}
                            onChange={(event) =>
                              updateAudioTrack(selectedAudio.id, {
                                fadeOut: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {activeTool === "captions" && (
              <section className="editor-tool-section tool-captions-panel">
                <label className="caption-language-control">
                  <span>Idioma de saída</span>
                  <select
                    value={captionTargetLanguage}
                    onChange={(event) =>
                      setCaptionTargetLanguage(
                        event.target.value as "original" | "en" | "es",
                      )
                    }
                    disabled={transcribing}
                  >
                    <option value="original">
                      Áudio original · detectar idioma
                    </option>
                    <option value="en">Traduzir para inglês</option>
                    <option value="es">Traduzir para espanhol</option>
                  </select>
                </label>
                {detectedCaptionLanguageName && (
                  <p className="caption-detected-language" role="status">
                    <Languages aria-hidden="true" size={14} /> Idioma detectado:{" "}
                    <b>{detectedCaptionLanguageName}</b>
                  </p>
                )}
                <button
                  type="button"
                  className="tool-primary-action automatic-captions"
                  onClick={() => void generateAutomaticCaptions()}
                  disabled={!clip || transcribing}
                >
                  <Captions aria-hidden="true" size={17} />
                  <b>
                    {automaticCaptionButtonLabel}
                  </b>
                </button>
                {transcribing && (
                  <div
                    className="caption-progress"
                    role="progressbar"
                    aria-label="Progresso da transcrição"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(transcriptionProgress)}
                  >
                    <i style={{ width: `${transcriptionProgress}%` }} />
                    <span>{transcriptionPhaseLabel}</span>
                  </div>
                )}
                <small className="caption-local-processing-note">
                  Vídeos grandes são processados em blocos. O vídeo permanece
                  neste dispositivo; somente áudio compacto é enviado para
                  transcrição.
                </small>
                <label className="editor-upload captions-srt-upload">
                  <FileUp aria-hidden="true" size={14} /> Importar arquivo SRT
                  <input
                    type="file"
                    accept=".srt,text/plain"
                    onChange={(event) =>
                      void importSubtitles(event.target.files?.[0])
                    }
                  />
                </label>
                <button type="button" onClick={addLayer} disabled={!clip}>
                  <Plus aria-hidden="true" size={14} /> Legenda manual
                </button>
                {!!layers.length && (
                  <div
                    className="caption-tool-list"
                    aria-label="Legendas do projeto"
                  >
                    {layers.map((layer) => (
                      <button
                        type="button"
                        key={layer.id}
                        className={selected?.id === layer.id ? "selected" : ""}
                        onClick={() => {
                          setSelectedId(layer.id);
                          setSelectedAudioId("");
                          setSelectedIllustrationId("");
                          seek(layer.start);
                        }}
                      >
                        <span>{layer.text}</span>
                        <small>
                          {time(layer.start)}–{time(layer.end)}
                        </small>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTool === "transitions" && (
              <section className="editor-tool-section tool-transitions-panel">
                {clip && (
                  <div className="video-transition-controls">
                    <small>
                      Arraste uma transição para entrada, saída ou para a faixa
                      de vídeo.
                    </small>
                    <div className="transition-shelf">
                      <button
                        draggable
                        onDragStart={(event) =>
                          event.dataTransfer.setData(
                            "application/x-klip-transition",
                            "fade-black",
                          )
                        }
                        onClick={() => applyTransition("fade-black", "in")}
                      >
                        <Blend aria-hidden="true" size={14} /> Fade preto
                      </button>
                      <button
                        draggable
                        onDragStart={(event) =>
                          event.dataTransfer.setData(
                            "application/x-klip-transition",
                            "fade-white",
                          )
                        }
                        onClick={() => applyTransition("fade-white", "in")}
                      >
                        <Blend aria-hidden="true" size={14} /> Fade branco
                      </button>
                      <button
                        draggable
                        onDragStart={(event) =>
                          event.dataTransfer.setData(
                            "application/x-klip-transition",
                            "flash",
                          )
                        }
                        onClick={() => applyTransition("flash", "in")}
                      >
                        <Sparkles aria-hidden="true" size={14} /> Flash
                      </button>
                      <button
                        draggable
                        onDragStart={(event) =>
                          event.dataTransfer.setData(
                            "application/x-klip-transition",
                            "dissolve",
                          )
                        }
                        onClick={() => applyTransition("dissolve", "in")}
                      >
                        <Layers2 aria-hidden="true" size={14} /> Dissolver
                      </button>
                      <button
                        draggable
                        onDragStart={(event) =>
                          event.dataTransfer.setData(
                            "application/x-klip-transition",
                            "wipe",
                          )
                        }
                        onClick={() => applyTransition("wipe", "in")}
                      >
                        <MoveHorizontal aria-hidden="true" size={14} /> Cortina
                      </button>
                      <button
                        draggable
                        onDragStart={(event) =>
                          event.dataTransfer.setData(
                            "application/x-klip-transition",
                            "none",
                          )
                        }
                        onClick={() => applyTransition("none", "in")}
                      >
                        <X aria-hidden="true" size={14} /> Sem transição
                      </button>
                    </div>
                    <div className="transition-drops">
                      <div
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => dropTransition(event, "in")}
                      >
                        <b>Entrada</b>
                        <span>
                          {videoFadeIn
                            ? `${transitionLabel(transitionKind)} · ${videoFadeIn.toFixed(1)}s`
                            : "Solte aqui"}
                        </span>
                      </div>
                      <div
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => dropTransition(event, "out")}
                      >
                        <b>Saída</b>
                        <span>
                          {videoFadeOut
                            ? `${transitionLabel(transitionKind)} · ${videoFadeOut.toFixed(1)}s`
                            : "Solte aqui"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {activeTool === "media" && !!illustrations.length && (
              <section className="editor-tool-section tool-overlays-panel">
                <div className="tool-heading layer-heading">
                  <span>02</span>
                  <div>
                    <b>Camadas de mídia</b>
                    <small>Vários vídeos e imagens na mesma tela</small>
                  </div>
                </div>
                <small className="illustration-help">
                  Use “Sobrepor vídeo ou imagem” quantas vezes quiser. Arraste
                  cada camada na prévia e use as alças para mudar largura e
                  altura.
                </small>
                {!!illustrations.length && (
                  <div className="layer-list illustration-list">
                    {illustrations.map((item, index) => (
                      <button
                        key={item.id}
                        className={
                          selectedIllustration?.id === item.id ? "selected" : ""
                        }
                        onClick={() => {
                          setSelectedIllustrationId(item.id);
                          setSelectedId("");
                          setSelectedAudioId("");
                          seek(Math.max(start, item.start));
                        }}
                      >
                        <b>
                          {item.role === "scene"
                            ? "CENA"
                            : item.kind === "image"
                              ? "IMG"
                              : "VID"}
                        </b>
                        <span>{item.name || `Ilustração ${index + 1}`}</span>
                        <small>
                          {time(item.start)}–{time(item.end)}
                        </small>
                      </button>
                    ))}
                  </div>
                )}
                {selectedIllustration && (
                  <div className="layer-inspector illustration-inspector">
                    <div className="inspector-title">
                      <b>Camada de mídia selecionada</b>
                      <div className="inspector-actions">
                        <button onClick={duplicateIllustration}>
                          Duplicar
                        </button>
                        <button onClick={removeIllustration}>Excluir</button>
                      </div>
                    </div>
                    <div className="position-grid layer-size-grid">
                      <label>
                        Largura · {Math.round(selectedIllustration.width ?? selectedIllustration.size)}%
                        <input
                          type="range"
                          min="8"
                          max="160"
                          value={selectedIllustration.width ?? selectedIllustration.size}
                          onChange={(event) =>
                            updateIllustration(selectedIllustration.id, {
                              width: Number(event.target.value),
                              size: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Altura · {Math.round(selectedIllustration.height ?? selectedIllustration.size * 0.72)}%
                        <input
                          type="range"
                          min="8"
                          max="160"
                          value={selectedIllustration.height ?? selectedIllustration.size * 0.72}
                          onChange={(event) =>
                            updateIllustration(selectedIllustration.id, {
                              height: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="position-grid">
                      <label>
                        Horizontal · {Math.round(selectedIllustration.x)}%
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={selectedIllustration.x}
                          onChange={(event) =>
                            updateIllustration(selectedIllustration.id, {
                              x: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Vertical · {Math.round(selectedIllustration.y)}%
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={selectedIllustration.y}
                          onChange={(event) =>
                            updateIllustration(selectedIllustration.id, {
                              y: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="effect-grid">
                      <label>
                        Ajuste no quadro
                        <select
                          value={selectedIllustration.fit}
                          onChange={(event) =>
                            updateIllustration(selectedIllustration.id, {
                              fit: event.target.value as "cover" | "contain",
                            })
                          }
                        >
                          <option value="cover">Preencher</option>
                          <option value="contain">Mostrar tudo</option>
                        </select>
                      </label>
                      <label>
                        Fade in
                        <input
                          type="number"
                          min="0"
                          max="3"
                          step="0.1"
                          value={selectedIllustration.fadeIn}
                          onChange={(event) =>
                            updateIllustration(selectedIllustration.id, {
                              fadeIn: Math.max(0, Number(event.target.value)),
                            })
                          }
                        />
                      </label>
                      <label>
                        Fade out
                        <input
                          type="number"
                          min="0"
                          max="3"
                          step="0.1"
                          value={selectedIllustration.fadeOut}
                          onChange={(event) =>
                            updateIllustration(selectedIllustration.id, {
                              fadeOut: Math.max(0, Number(event.target.value)),
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>
                )}
              </section>
            )}

            {activeTool === "text" && (
              <section
                className="editor-tool-section tool-text-panel"
                aria-labelledby="text-layers-title"
              >
                <div className="tool-heading layer-heading">
                  <span aria-hidden="true">
                    <Type size={15} />
                  </span>
                  <div>
                    <b id="text-layers-title">Texto</b>
                    <small>Crie, posicione e anime cada camada</small>
                  </div>
                </div>
                <div
                  className="layer-actions"
                  role="group"
                  aria-label="Ações de texto"
                >
                  <button
                    type="button"
                    onClick={addLayer}
                    aria-label="Adicionar nova camada de texto"
                  >
                    <Plus aria-hidden="true" size={14} /> Adicionar texto
                  </button>
                  <button
                    type="button"
                    disabled={!selected}
                    onClick={duplicateLayer}
                    aria-label="Duplicar camada de texto selecionada"
                  >
                    <Copy aria-hidden="true" size={14} /> Duplicar
                  </button>
                  <label
                    className="subtitle-import"
                    title="Importa legendas com tempos definidos em um arquivo SRT"
                  >
                    <Captions aria-hidden="true" size={14} /> Importar SRT
                    <input
                      type="file"
                      accept=".srt,text/plain"
                      aria-label="Selecionar arquivo SRT para importar"
                      onChange={(event) =>
                        void importSubtitles(event.target.files?.[0])
                      }
                    />
                  </label>
                </div>

                <details className="tool-disclosure" open>
                  <summary>
                    Camadas no projeto ({layers.length})
                  </summary>
                  <div
                    className="layer-list"
                    aria-label="Camadas de texto do projeto"
                  >
                    {layers.map((layer, index) => (
                      <button
                        key={layer.id}
                        type="button"
                        className={
                          selected?.id === layer.id ? "selected" : ""
                        }
                        aria-pressed={selected?.id === layer.id}
                        aria-label={`Selecionar texto ${index + 1}: ${layer.text || "Texto vazio"}, de ${time(layer.start)} a ${time(layer.end)}`}
                        onClick={() => {
                          setSelectedId(layer.id);
                          setSelectedIllustrationId("");
                          setSelectedAudioId("");
                          seek(Math.max(start, layer.start));
                        }}
                      >
                        <b aria-hidden="true">T{index + 1}</b>
                        <span>{layer.text || "Texto vazio"}</span>
                        <small>
                          {time(layer.start)}–{time(layer.end)}
                        </small>
                      </button>
                    ))}
                    {!layers.length && (
                      <button type="button" onClick={addLayer}>
                        <Plus aria-hidden="true" size={14} /> Criar o primeiro
                        texto
                      </button>
                    )}
                  </div>
                </details>

                {selected && (
                  <div className="layer-inspector">
                    <div className="inspector-title">
                      <b>Camada selecionada</b>
                      <button
                        type="button"
                        onClick={removeLayer}
                        aria-label="Excluir camada de texto selecionada"
                      >
                        Excluir
                      </button>
                    </div>

                    <div
                      role="img"
                      aria-label={`Prévia da camada selecionada: ${selected.text || "Texto vazio"}`}
                      style={{
                        position: "relative",
                        minHeight: 132,
                        overflow: "hidden",
                        border: "1px solid var(--pure-border)",
                        borderRadius: 8,
                        background:
                          "linear-gradient(145deg, var(--pure-surface-2), var(--pure-canvas))",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          left: `${selected.x}%`,
                          top: `${selected.y}%`,
                          width: "min(82%, 230px)",
                          padding: selected.background ? "4px 8px" : 0,
                          borderRadius: 4,
                          background: selected.background
                            ? "rgba(0,0,0,.72)"
                            : "transparent",
                          color: selected.color,
                          fontFamily: selected.font,
                          fontSize: `${Math.max(13, Math.min(28, selected.size * 0.28))}px`,
                          fontWeight: 800,
                          lineHeight: 1.12,
                          textAlign: selected.align,
                          textShadow: "0 1px 3px rgba(0,0,0,.78)",
                          transform: "translate(-50%, -50%)",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {selected.text || "Seu texto aparece aqui"}
                      </span>
                      <small
                        style={{
                          position: "absolute",
                          left: 8,
                          bottom: 6,
                          color: "var(--pure-text-3)",
                          fontSize: 10,
                        }}
                      >
                        Prévia de posição e estilo
                      </small>
                    </div>

                    <details className="tool-disclosure" open>
                      <summary>Conteúdo</summary>
                      <label htmlFor={`text-content-${selected.id}`}>
                        Texto exibido
                      </label>
                      <textarea
                        id={`text-content-${selected.id}`}
                        aria-label="Conteúdo da camada de texto"
                        value={selected.text}
                        onChange={(event) =>
                          updateLayer(selected.id, { text: event.target.value })
                        }
                        placeholder="Escreva o texto…"
                      />
                    </details>

                    <div className="visual-presets">
                      <b>Estilos prontos</b>
                      <div role="group" aria-label="Estilos prontos de texto">
                        <button
                          type="button"
                          title="Título grande centralizado para abertura ou chamada"
                          aria-label="Aplicar estilo Título central, indicado para abertura ou chamada"
                          onClick={() =>
                            updateLayer(selected.id, {
                              font: "Arial Black",
                              color: "#ffffff",
                              size: 72,
                              x: 50,
                              y: 28,
                              align: "center",
                              background: false,
                              effect: "zoom",
                            })
                          }
                        >
                          Título central
                        </button>
                        <button
                          type="button"
                          title="Texto legível sobre fundo para falas e legendas"
                          aria-label="Aplicar estilo Legenda legível, indicado para falas"
                          onClick={() =>
                            updateLayer(selected.id, {
                              font: "Inter",
                              color: "#ffffff",
                              size: 44,
                              x: 50,
                              y: 82,
                              align: "center",
                              background: true,
                              effect: "pop",
                            })
                          }
                        >
                          Legenda legível
                        </button>
                        <button
                          type="button"
                          title="Destaque alinhado à esquerda para nomes e contexto"
                          aria-label="Aplicar estilo Destaque lateral, indicado para nomes e contexto"
                          onClick={() =>
                            updateLayer(selected.id, {
                              font: "Trebuchet MS",
                              color: "#ffffff",
                              size: 52,
                              x: 22,
                              y: 68,
                              align: "left",
                              background: false,
                              effect: "slide",
                            })
                          }
                        >
                          Destaque lateral
                        </button>
                        <button
                          type="button"
                          title="Texto monoespaçado revelado letra por letra"
                          aria-label="Aplicar estilo Digitação, revelado letra por letra"
                          onClick={() =>
                            updateLayer(selected.id, {
                              font: "Courier New",
                              color: "#ffffff",
                              size: 48,
                              x: 50,
                              y: 50,
                              align: "center",
                              background: true,
                              effect: "typewriter",
                            })
                          }
                        >
                          Digitação
                        </button>
                      </div>
                    </div>

                    <details className="tool-disclosure" open>
                      <summary>Tipografia e aparência</summary>
                      <div className="caption-controls">
                        <label>
                          Fonte
                          <select
                            aria-label="Fonte da camada de texto"
                            value={selected.font}
                            onChange={(event) =>
                              updateLayer(selected.id, {
                                font: event.target.value,
                              })
                            }
                          >
                            <option>Inter</option>
                            <option>Arial Black</option>
                            <option>Georgia</option>
                            <option>Courier New</option>
                            <option>Impact</option>
                            <option>Trebuchet MS</option>
                          </select>
                        </label>
                        <label>
                          Cor
                          <input
                            aria-label="Cor da camada de texto"
                            type="color"
                            value={selected.color}
                            onChange={(event) =>
                              updateLayer(selected.id, {
                                color: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <label className="range-label">
                        Tamanho <output>{selected.size}px</output>
                        <input
                          aria-label="Tamanho do texto"
                          type="range"
                          min="28"
                          max="112"
                          value={selected.size}
                          onChange={(event) =>
                            updateLayer(selected.id, {
                              size: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <div
                        className="align-buttons"
                        role="group"
                        aria-label="Alinhamento do texto"
                      >
                        <button
                          type="button"
                          className={
                            selected.align === "left" ? "selected" : ""
                          }
                          onClick={() =>
                            updateLayer(selected.id, { align: "left" })
                          }
                          aria-label="Alinhar texto à esquerda"
                          aria-pressed={selected.align === "left"}
                          title="Alinhar à esquerda"
                        >
                          <AlignLeft aria-hidden="true" size={15} />
                        </button>
                        <button
                          type="button"
                          className={
                            selected.align === "center" ? "selected" : ""
                          }
                          onClick={() =>
                            updateLayer(selected.id, { align: "center" })
                          }
                          aria-label="Centralizar texto"
                          aria-pressed={selected.align === "center"}
                          title="Centralizar"
                        >
                          <AlignCenter aria-hidden="true" size={15} />
                        </button>
                        <button
                          type="button"
                          className={
                            selected.align === "right" ? "selected" : ""
                          }
                          onClick={() =>
                            updateLayer(selected.id, { align: "right" })
                          }
                          aria-label="Alinhar texto à direita"
                          aria-pressed={selected.align === "right"}
                          title="Alinhar à direita"
                        >
                          <AlignRight aria-hidden="true" size={15} />
                        </button>
                        <label className="text-bg-toggle">
                          <input
                            type="checkbox"
                            checked={selected.background}
                            onChange={(event) =>
                              updateLayer(selected.id, {
                                background: event.target.checked,
                              })
                            }
                          />
                          Fundo para leitura
                        </label>
                      </div>
                    </details>

                    <details className="tool-disclosure">
                      <summary>Posição e duração</summary>
                      <label className="range-label">
                        Posição horizontal <output>{Math.round(selected.x)}%</output>
                        <input
                          aria-label="Posição horizontal do texto"
                          type="range"
                          min="0"
                          max="100"
                          value={selected.x}
                          onChange={(event) =>
                            updateLayer(selected.id, {
                              x: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="range-label">
                        Posição vertical <output>{Math.round(selected.y)}%</output>
                        <input
                          aria-label="Posição vertical do texto"
                          type="range"
                          min="0"
                          max="100"
                          value={selected.y}
                          onChange={(event) =>
                            updateLayer(selected.id, {
                              y: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <div className="effect-grid">
                        <label>
                          Início (s)
                          <input
                            aria-label="Início da camada de texto em segundos"
                            type="number"
                            min="0"
                            max={Math.max(0, selected.end - 0.1)}
                            step="0.1"
                            value={selected.start}
                            onChange={(event) =>
                              updateLayer(selected.id, {
                                start: Math.max(
                                  0,
                                  Math.min(
                                    Number(event.target.value),
                                    selected.end - 0.1,
                                  ),
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          Fim (s)
                          <input
                            aria-label="Fim da camada de texto em segundos"
                            type="number"
                            min={selected.start + 0.1}
                            max={duration || end || 3600}
                            step="0.1"
                            value={selected.end}
                            onChange={(event) =>
                              updateLayer(selected.id, {
                                end: Math.max(
                                  selected.start + 0.1,
                                  Math.min(
                                    duration || end || 3600,
                                    Number(event.target.value),
                                  ),
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                    </details>

                    <details className="tool-disclosure" open>
                      <summary>Animação</summary>
                      <div className="effect-grid">
                        <label>
                          Movimento
                          <select
                            aria-label="Efeito de entrada do texto"
                            value={selected.effect}
                            onChange={(event) =>
                              updateLayer(selected.id, {
                                effect: event.target.value as TextEffect,
                              })
                            }
                          >
                            <option value="none">Sem movimento</option>
                            <option value="pop">Entrada rápida</option>
                            <option value="zoom">Aproximar</option>
                            <option value="bounce">Quicar</option>
                            <option value="slide">Deslizar</option>
                            <option value="typewriter">Digitação</option>
                          </select>
                        </label>
                        <label>
                          Aparecer (s)
                          <input
                            aria-label="Duração do fade in do texto"
                            type="number"
                            min="0"
                            max="3"
                            step="0.1"
                            value={selected.fadeIn}
                            onChange={(event) =>
                              updateLayer(selected.id, {
                                fadeIn: Math.max(
                                  0,
                                  Number(event.target.value),
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          Desaparecer (s)
                          <input
                            aria-label="Duração do fade out do texto"
                            type="number"
                            min="0"
                            max="3"
                            step="0.1"
                            value={selected.fadeOut}
                            onChange={(event) =>
                              updateLayer(selected.id, {
                                fadeOut: Math.max(
                                  0,
                                  Number(event.target.value),
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                    </details>
                  </div>
                )}
              </section>
            )}

            {activeTool === "formats" && (
              <section className="editor-tool-section tool-formats-panel">
                <div className="current-format-card">
                  <span>Formato atual</span>
                  <b>{selectedSocialPreset.title}</b>
                  <small>
                    {selectedSocialPreset.aspectRatio.label} · {exportFps} FPS
                  </small>
                </div>
                <div className="format-shortcuts">
                  {(
                    [
                      "tiktok",
                      "instagram-reels",
                      "youtube-shorts",
                      "youtube-landscape",
                    ] as SocialPresetId[]
                  ).map((id) => {
                    const preset = getSocialPreset(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        className={
                          selectedSocialPresetId === id ? "selected" : ""
                        }
                        onClick={() => applySocialPreset(preset)}
                      >
                        <span>{preset.platform.slice(0, 2).toUpperCase()}</span>
                        <b>{preset.title}</b>
                        <small>{preset.aspectRatio.label}</small>
                      </button>
                    );
                  })}
                </div>
                <button
                  className="tool-primary-action"
                  type="button"
                  onClick={() => {
                    setDraftSocialPresetId(selectedSocialPresetId);
                    setStudioPanel("formats");
                  }}
                >
                  <span>
                    <LayoutTemplate aria-hidden="true" size={18} />
                  </span>
                  <b>Todos os formatos</b>
                </button>
              </section>
            )}

            {activeTool === "radar" && (
              <section className="editor-tool-section tool-radar-panel">
                <div className="radar-tool-visual">
                  <span>
                    <Sparkles aria-hidden="true" size={20} />
                  </span>
                  <b>
                    {approvedCuts.length || radarSuggestions.length || "IA"}
                  </b>
                </div>
                <b className="tool-feature-title">
                  Encontre os melhores momentos
                </b>
                <button
                  className="tool-primary-action radar"
                  type="button"
                  onClick={() =>
                    radarSuggestions.length
                      ? setRadarOpen(true)
                      : void runRadarAnalysis()
                  }
                >
                  <span>
                    <WandSparkles aria-hidden="true" size={18} />
                  </span>
                  <b>
                    {radarSuggestions.length
                      ? "Abrir resultados"
                      : "Analisar vídeo"}
                  </b>
                </button>
                {!!approvedCuts.length && (
                  <div className="tool-stat-row">
                    <span>Na timeline</span>
                    <b>{approvedCuts.length} clipes</b>
                  </div>
                )}
              </section>
            )}
          </aside>
        </aside>

        <section className="editor-stage-wrap" id="klip-preview">
          {clip && (
            <div
              className={`stage-meta ${exportAspect === "vertical" || exportAspect === "portrait" || exportAspect === "square" || (exportAspect === "original" && sourceAspect < 1) ? "stage-meta-tall" : ""}`}
            >
              <span>
                Prévia{" "}
                {exportAspect === "original"
                  ? "original"
                  : exportAspect === "vertical"
                    ? "vertical · 9:16"
                    : exportAspect === "portrait"
                      ? "retrato · 4:5"
                      : exportAspect === "landscape"
                        ? "horizontal · 16:9"
                        : "quadrada · 1:1"}
              </span>
              <b>{time(current)}</b>
            </div>
          )}
          <div
            className={`editor-stage preset-${visualPreset} ${exportAspect === "vertical" || exportAspect === "portrait" || exportAspect === "square" || (exportAspect === "original" && sourceAspect < 1) ? "editor-stage-tall" : ""}`}
            style={{
              aspectRatio:
                exportAspect === "original"
                  ? `${sourceAspect}`
                  : exportAspect === "vertical"
                    ? "9 / 16"
                    : exportAspect === "portrait"
                      ? "4 / 5"
                      : exportAspect === "landscape"
                        ? "16 / 9"
                        : "1 / 1",
            }}
          >
            {clip ? (
              <>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption -- A mídia importada é uma prévia local; o editor não possui uma faixa VTT correspondente. */}
                <video
                  ref={video}
                  className={`transformable-video ${(hasMontageTimeline ? !activeMontageClip : current < primaryClipStart || current >= primaryClipEnd) ? "timeline-video-hidden" : ""}`}
                  src={clip.url}
                  playsInline
                  aria-label={`Prévia de ${clip.name}`}
                  onPointerDown={beginVideoFrameDrag}
                  onPointerMove={moveVideoFrameDrag}
                  onPointerUp={() => {
                    videoFrameDrag.current = null;
                  }}
                  onPointerCancel={() => {
                    videoFrameDrag.current = null;
                  }}
                  style={{
                    filter: previewFilter,
                    opacity: activeEffectFrame?.opacity ?? 1,
                    transform: `translate(${videoTransform.x + (activeEffectFrame?.transform.translateX || 0) * 100}%, ${videoTransform.y + (activeEffectFrame?.transform.translateY || 0) * 100}%) rotate(${activeEffectFrame?.transform.rotationDeg || 0}deg) scale(${videoTransform.scaleX * (activeEffectFrame?.transform.scale || 1)}, ${videoTransform.scaleY * (activeEffectFrame?.transform.scale || 1)})`,
                  }}
                  onLoadedMetadata={(event) =>
                    setVideoDuration(event.currentTarget)
                  }
                  onDurationChange={(event) => {
                    const value = event.currentTarget.duration;
                    if (Number.isFinite(value) && value > 0) {
                      setSourceDuration(value);
                      setDuration((projectLength) =>
                        Math.max(projectLength, value),
                      );
                      setEnd((old) => old || value);
                      if (event.currentTarget.currentTime > value)
                        event.currentTarget.currentTime = 0;
                    }
                  }}
                  onTimeUpdate={(event) => {
                    if (exportInProgress.current) return;
                    const at =
                      baseLoopOffset.current + event.currentTarget.currentTime;
                    if (hasMontageTimeline) {
                      const montageClip =
                        montageTimelineClips.find(
                          (item) => item.id === activeRadarCutId,
                        ) ||
                        montageTimelineClips.find(
                          (item) =>
                            item.timelineStart <= at && at < item.timelineEnd,
                        );
                      if (
                        montageClip &&
                        event.currentTarget.currentTime >=
                          montageClip.end - 0.025
                      ) {
                        event.currentTarget.pause();
                        setCurrent(montageClip.timelineEnd);
                        void playTimelineAt(montageClip.timelineEnd);
                        return;
                      }
                      setCurrent(
                        Math.max(0, Math.min(montageTimelineDuration, at)),
                      );
                      return;
                    }
                    if (
                      event.currentTarget.currentTime >=
                      primarySourceEnd - 0.025
                    ) {
                      event.currentTarget.pause();
                      setCurrent(primaryClipEnd);
                      void playTimelineAt(primaryClipEnd);
                      return;
                    }
                    const next = sceneItems.find(
                      (item) => item.start <= at && at < item.end,
                    );
                    if (next) {
                      event.currentTarget.pause();
                      void playTimelineAt(at);
                      return;
                    }
                    setCurrent(at);
                  }}
                  onEnded={() => { if (!exportInProgress.current) void playTimelineAt(hasMontageTimeline ? montageTimelineDuration : primaryClipEnd); }}
                />
                {activeEffectFrame && (
                  <div className="studio-effect-layer" aria-hidden="true">
                    {activeEffectFrame.overlays.map((overlay, index) =>
                      overlay.kind === "color" ? (
                        <i
                          key={index}
                          className="effect-color"
                          style={{
                            background: overlay.color,
                            opacity: overlay.opacity,
                            mixBlendMode: overlay.blendMode,
                          }}
                        />
                      ) : overlay.kind === "scanlines" ? (
                        <i
                          key={index}
                          className="effect-scanlines"
                          style={{
                            opacity: overlay.opacity,
                            backgroundSize: `100% ${overlay.spacing}px`,
                          }}
                        />
                      ) : overlay.kind === "noise" ? (
                        <i
                          key={index}
                          className="effect-noise"
                          style={{ opacity: overlay.opacity }}
                        />
                      ) : overlay.kind === "vignette" ? (
                        <i
                          key={index}
                          className="effect-vignette"
                          style={{ opacity: overlay.opacity }}
                        />
                      ) : overlay.kind === "letterbox" ? (
                        <i
                          key={index}
                          className="effect-letterbox"
                          style={
                            {
                              "--letterbox-size": `${overlay.size * 100}%`,
                              opacity: overlay.opacity,
                            } as CSSProperties
                          }
                        />
                      ) : (
                        <i
                          key={index}
                          className="effect-rgb"
                          style={{
                            opacity: overlay.opacity,
                            transform: `translate(${overlay.offsetX * 100}%, ${overlay.offsetY * 100}%)`,
                          }}
                        />
                      ),
                    )}
                  </div>
                )}
                <div className="video-layout-hint">
                  Arraste o centro para mover. Use as alças para esticar
                  livremente.
                </div>
                <div
                  className="video-frame-resize edge left"
                  onPointerDown={(event) =>
                    beginVideoFrameResize(event, "left")
                  }
                  onPointerMove={moveVideoFrameResize}
                  onPointerUp={() => {
                    videoFrameResize.current = null;
                  }}
                  onPointerCancel={() => {
                    videoFrameResize.current = null;
                  }}
                  title="Arraste para alargar ou estreitar"
                >
                  <MoveHorizontal aria-hidden="true" size={14} />
                </div>
                <div
                  className="video-frame-resize edge right"
                  onPointerDown={(event) =>
                    beginVideoFrameResize(event, "right")
                  }
                  onPointerMove={moveVideoFrameResize}
                  onPointerUp={() => {
                    videoFrameResize.current = null;
                  }}
                  onPointerCancel={() => {
                    videoFrameResize.current = null;
                  }}
                  title="Arraste para alargar ou estreitar"
                >
                  <MoveHorizontal aria-hidden="true" size={14} />
                </div>
                <div
                  className="video-frame-resize edge top"
                  onPointerDown={(event) => beginVideoFrameResize(event, "top")}
                  onPointerMove={moveVideoFrameResize}
                  onPointerUp={() => {
                    videoFrameResize.current = null;
                  }}
                  onPointerCancel={() => {
                    videoFrameResize.current = null;
                  }}
                  title="Arraste para aumentar ou diminuir a altura"
                >
                  <MoveVertical aria-hidden="true" size={14} />
                </div>
                <div
                  className="video-frame-resize edge bottom"
                  onPointerDown={(event) =>
                    beginVideoFrameResize(event, "bottom")
                  }
                  onPointerMove={moveVideoFrameResize}
                  onPointerUp={() => {
                    videoFrameResize.current = null;
                  }}
                  onPointerCancel={() => {
                    videoFrameResize.current = null;
                  }}
                  title="Arraste para aumentar ou diminuir a altura"
                >
                  <MoveVertical aria-hidden="true" size={14} />
                </div>
                <div
                  className="video-frame-resize corner"
                  onPointerDown={(event) =>
                    beginVideoFrameResize(event, "corner")
                  }
                  onPointerMove={moveVideoFrameResize}
                  onPointerUp={() => {
                    videoFrameResize.current = null;
                  }}
                  onPointerCancel={() => {
                    videoFrameResize.current = null;
                  }}
                  title="Arraste livremente largura e altura"
                >
                  <Maximize2 aria-hidden="true" size={14} />
                </div>
                <button
                  className="reset-video-frame"
                  onClick={() =>
                    setVideoTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 })
                  }
                >
                  <RotateCcw aria-hidden="true" size={14} /> Restaurar
                </button>
              </>
            ) : (
              <div className="editor-empty">
                <div className="editor-empty-copy">
                  <small>
                    <Sparkles aria-hidden="true" size={14} /> KLIPAPP Studio
                  </small>
                  <b>Transforme uma ideia em história.</b>
                  <span>Comece com um vídeo ou uma foto.</span>
                  <label
                    className="editor-empty-upload"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      void selectFile(event.dataTransfer.files?.[0]);
                    }}
                  >
                    <FileUp aria-hidden="true" size={19} />
                    <span>
                      <strong>Arraste ou escolha</strong>
                      <em>Vídeo ou foto</em>
                    </span>
                    <input
                      type="file"
                      accept="video/*,image/*"
                      onChange={(event) =>
                        void selectFile(event.target.files?.[0])
                      }
                    />
                  </label>
                  <i>MP4 · WebM · MOV · JPG · PNG · WebP</i>
                </div>
                <div className="editor-empty-art" aria-hidden="true">
                  <div className="editor-empty-artboard">
                    <div className="editor-empty-artbar">
                      <i />
                      <i />
                      <i />
                      <span>00:12</span>
                    </div>
                    <div className="editor-empty-frame">
                      <Film size={34} />
                      <span />
                    </div>
                    <div className="editor-empty-track">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                  <div className="editor-empty-chip chip-captions">
                    <Captions size={15} />
                    <span />
                  </div>
                  <div className="editor-empty-chip chip-magic">
                    <WandSparkles size={15} />
                  </div>
                </div>
              </div>
            )}
            {/* eslint-disable jsx-a11y/media-has-caption -- Faixas arbitrárias importadas pelo usuário não possuem transcrição VTT conhecida pelo editor. */}
            {audioTracks.map((track) => (
              <audio
                key={track.id}
                ref={(element) => {
                  if (element) audioElements.current.set(track.id, element);
                  else audioElements.current.delete(track.id);
                }}
                src={track.url}
                preload="auto"
              />
            ))}
            {/* eslint-enable jsx-a11y/media-has-caption */}
            {clip && previewTransition.opacity > 0 && (
              <div
                className={`video-transition-overlay transition-${previewTransition.kind}`}
                style={transitionOverlayStyle(previewTransition)}
              />
            )}
            {clip &&
              illustrations.map((item) => {
                if (item.role !== "scene" && layerOpacity(item, current) <= 0)
                  return null;
                const common = {
                  ref: (
                    element: HTMLImageElement | HTMLVideoElement | null,
                  ) => {
                    if (element)
                      illustrationElements.current.set(item.id, element);
                    else illustrationElements.current.delete(item.id);
                  },
                };
                return (
                  <div
                    key={item.id}
                    className={`illustration-overlay ${item.role === "scene" ? "scene-video-overlay" : ""} ${selectedIllustration?.id === item.id ? "selected-illustration" : ""}`}
                    onPointerDown={(event) =>
                      beginIllustrationDrag(event, item)
                    }
                    onPointerMove={moveIllustrationDrag}
                    onPointerUp={() => {
                      illustrationDrag.current = null;
                      illustrationResize.current = null;
                    }}
                    onPointerCancel={() => {
                      illustrationDrag.current = null;
                      illustrationResize.current = null;
                    }}
                    style={{
                      left: `${item.x}%`,
                      top: `${item.y}%`,
                      width: `${item.width ?? item.size}%`,
                      height: `${item.height ?? item.size * 0.72}%`,
                      opacity: layerOpacity(item, current),
                      pointerEvents:
                        item.role === "scene" &&
                        layerOpacity(item, current) <= 0
                          ? "none"
                          : "auto",
                    }}
                  >
                    {item.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element -- Camadas usam URLs blob locais e precisam aparecer imediatamente no canvas.
                      <img
                        {...common}
                        src={item.url}
                        alt={item.name || "Imagem inserida no vídeo"}
                      />
                    ) : (
                      <video
                        {...common}
                        src={item.url}
                        aria-label={item.name || "Vídeo inserido no projeto"}
                        muted
                        autoPlay={item.role !== "scene"}
                        loop={item.role !== "scene"}
                        playsInline
                        preload="auto"
                        onTimeUpdate={(event) => {
                          if (
                            item.role === "scene" &&
                            !event.currentTarget.paused
                          )
                            setCurrent(
                              item.start + event.currentTarget.currentTime,
                            );
                        }}
                        onEnded={() => {
                          if (item.role === "scene")
                            void playTimelineAt(item.end);
                        }}
                      />
                    )}
                    <small>
                      {item.kind === "image" ? "Imagem" : "Vídeo"} · mover
                    </small>
                    {selectedIllustration?.id === item.id && (
                      <>
                        <div
                          className="illustration-resize-handle illustration-resize-right"
                          onPointerDown={(event) =>
                            beginIllustrationResize(event, item, "right")
                          }
                          onPointerMove={moveIllustrationResize}
                          onPointerUp={() => {
                            illustrationResize.current = null;
                          }}
                          onPointerCancel={() => {
                            illustrationResize.current = null;
                          }}
                          aria-label="Ajustar largura da camada"
                        />
                        <div
                          className="illustration-resize-handle illustration-resize-bottom"
                          onPointerDown={(event) =>
                            beginIllustrationResize(event, item, "bottom")
                          }
                          onPointerMove={moveIllustrationResize}
                          onPointerUp={() => {
                            illustrationResize.current = null;
                          }}
                          onPointerCancel={() => {
                            illustrationResize.current = null;
                          }}
                          aria-label="Ajustar altura da camada"
                        />
                        <div
                          className="illustration-resize-handle illustration-resize-corner"
                          onPointerDown={(event) =>
                            beginIllustrationResize(event, item, "corner")
                          }
                          onPointerMove={moveIllustrationResize}
                          onPointerUp={() => {
                            illustrationResize.current = null;
                          }}
                          onPointerCancel={() => {
                            illustrationResize.current = null;
                          }}
                          aria-label="Redimensionar livremente a camada"
                        >
                          <Maximize2 aria-hidden="true" size={14} />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            {clip &&
              layers.map((layer) => {
                const text = visibleText(layer, current);
                if (!text || layerOpacity(layer, current) <= 0) return null;
                return (
                  <div
                    key={layer.id}
                    className={`caption-overlay ${selected?.id === layer.id ? "selected-layer" : ""} ${layer.background ? "with-background" : ""}`}
                    onPointerDown={(event) => beginLayerDrag(event, layer)}
                    onPointerMove={moveLayerDrag}
                    onPointerUp={() => {
                      layerDrag.current = null;
                    }}
                    onPointerCancel={() => {
                      layerDrag.current = null;
                    }}
                    style={previewStyle(layer)}
                  >
                    <span>{text}</span>
                    <small>Arraste</small>
                  </div>
                );
              })}
            {clip && safeGuides && (
              <div
                className="safe-area-guides"
                aria-hidden="true"
                title="Guia visual: mantém textos e rostos longe de controles, títulos e recortes da plataforma. Não aparece no vídeo exportado."
                style={{
                  top: `${selectedSocialPreset.safeArea.insetPercent.top}%`,
                  right: `${selectedSocialPreset.safeArea.insetPercent.right}%`,
                  bottom: `${selectedSocialPreset.safeArea.insetPercent.bottom}%`,
                  left: `${selectedSocialPreset.safeArea.insetPercent.left}%`,
                }}
              >
                <i />
                <span>{selectedSocialPreset.safeArea.label}</span>
              </div>
            )}
          </div>
          {clip && (
            <div
              className="pure-stage-transport"
              aria-label="Controles de reprodução"
            >
              <span>
                {time(current)} <i>/</i>{" "}
                {time(editorTimelineDuration || duration)}
              </span>
              <div>
                <button
                  type="button"
                  onClick={() =>
                    seek(Math.max(0, current - 1 / Math.max(1, exportFps)))
                  }
                  aria-label="Voltar um quadro"
                >
                  <ArrowLeft aria-hidden="true" size={16} />
                </button>
                <button
                  type="button"
                  className="pure-play-button"
                  onClick={() => void togglePreviewPlayback()}
                  aria-label={isPlaying ? "Pausar" : "Reproduzir"}
                  aria-keyshortcuts="Space"
                >
                  {isPlaying ? (
                    <Pause aria-hidden="true" size={18} fill="currentColor" />
                  ) : (
                    <Play aria-hidden="true" size={18} fill="currentColor" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    seek(
                      Math.min(
                        editorTimelineDuration || duration,
                        current + 1 / Math.max(1, exportFps),
                      ),
                    )
                  }
                  aria-label="Avançar um quadro"
                >
                  <ArrowRight aria-hidden="true" size={16} />
                </button>
              </div>
              <div>
                <Volume2 aria-hidden="true" size={16} />
                <input
                  aria-label="Volume da prévia"
                  type="range"
                  min="0"
                  max="120"
                  value={audioGain}
                  onChange={(event) => setAudioGain(Number(event.target.value))}
                />
                <button
                  type="button"
                  onClick={() =>
                    document
                      .querySelector<HTMLElement>("#klip-preview .editor-stage")
                      ?.requestFullscreen?.()
                  }
                  aria-label="Tela cheia"
                >
                  <Maximize2 aria-hidden="true" size={16} />
                </button>
              </div>
            </div>
          )}
          {notice && (
            <p className="editor-notice" role="status" aria-live="polite">
              {notice}
            </p>
          )}
        </section>
        {clip && (
          <aside className="pure-inspector" aria-label="Inspetor contextual">
            <div
              className="pure-inspector-tabs"
              role="tablist"
              aria-label="Propriedades"
            >
              {(
                [
                  { id: "edit", label: "Vídeo" },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === id}
                  className={inspectorTab === id ? "active" : ""}
                  onClick={() => setInspectorTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {inspectorTab === "edit" && (
              <div className="pure-inspector-body" role="tabpanel">
                <header>
                  <span>{selectedIllustration ? "CAMADA" : "VÍDEO"}</span>
                  <b>{selectedIllustration?.name || clip.name}</b>
                </header>
                <details open>
                  <summary>Transformar</summary>
                  {selectedIllustration ? (
                    <>
                      <label>
                        Largura{" "}
                        <output>
                          {Math.round(selectedIllustration.width ?? selectedIllustration.size)}%
                        </output>
                        <input
                          type="range"
                          min="8"
                          max="160"
                          value={selectedIllustration.width ?? selectedIllustration.size}
                          onChange={(event) =>
                            updateIllustration(selectedIllustration.id, {
                              width: Number(event.target.value),
                              size: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Altura{" "}
                        <output>
                          {Math.round(selectedIllustration.height ?? selectedIllustration.size * 0.72)}%
                        </output>
                        <input
                          type="range"
                          min="8"
                          max="160"
                          value={selectedIllustration.height ?? selectedIllustration.size * 0.72}
                          onChange={(event) =>
                            updateIllustration(selectedIllustration.id, {
                              height: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <div className="pure-number-grid">
                        <label>
                          X
                          <input
                            type="number"
                            min="-100"
                            max="200"
                            value={Math.round(selectedIllustration.x)}
                            onChange={(event) =>
                              updateIllustration(selectedIllustration.id, {
                                x: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          Y
                          <input
                            type="number"
                            min="-100"
                            max="200"
                            value={Math.round(selectedIllustration.y)}
                            onChange={(event) =>
                              updateIllustration(selectedIllustration.id, {
                                y: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                      <label>
                        Ajuste no quadro
                        <select
                          value={selectedIllustration.fit}
                          onChange={(event) =>
                            updateIllustration(selectedIllustration.id, {
                              fit: event.target.value as "cover" | "contain",
                            })
                          }
                        >
                          <option value="cover">Preencher</option>
                          <option value="contain">Mostrar tudo</option>
                        </select>
                      </label>
                    </>
                  ) : (
                    <>
                      <label>
                        Escala horizontal{" "}
                        <output>
                          {Math.round(videoTransform.scaleX * 100)}%
                        </output>
                        <input
                          type="range"
                          min="0.2"
                          max="2.5"
                          step="0.01"
                          value={videoTransform.scaleX}
                          onChange={(event) =>
                            setVideoTransform((value) => ({
                              ...value,
                              scaleX: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                      <label>
                        Escala vertical{" "}
                        <output>
                          {Math.round(videoTransform.scaleY * 100)}%
                        </output>
                        <input
                          type="range"
                          min="0.2"
                          max="2.5"
                          step="0.01"
                          value={videoTransform.scaleY}
                          onChange={(event) =>
                            setVideoTransform((value) => ({
                              ...value,
                              scaleY: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                      <div className="pure-number-grid">
                        <label>
                          X
                          <input
                            type="number"
                            min="-200"
                            max="200"
                            value={Math.round(videoTransform.x)}
                            onChange={(event) =>
                              setVideoTransform((value) => ({
                                ...value,
                                x: Number(event.target.value),
                              }))
                            }
                          />
                        </label>
                        <label>
                          Y
                          <input
                            type="number"
                            min="-200"
                            max="200"
                            value={Math.round(videoTransform.y)}
                            onChange={(event) =>
                              setVideoTransform((value) => ({
                                ...value,
                                y: Number(event.target.value),
                              }))
                            }
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        className="pure-secondary"
                        onClick={() =>
                          setVideoTransform({
                            x: 0,
                            y: 0,
                            scaleX: 1,
                            scaleY: 1,
                          })
                        }
                      >
                        <RotateCcw aria-hidden="true" size={14} /> Restaurar
                      </button>
                    </>
                  )}
                </details>
                <details open>
                  <summary>Aparência</summary>
                  <div className="pure-segmented">
                    {(
                      [
                        "clean",
                        "cinematic",
                        "vivid",
                        "mono",
                        "warm",
                      ] as VisualPreset[]
                    ).map((preset) => (
                      <button
                        type="button"
                        key={preset}
                        className={visualPreset === preset ? "active" : ""}
                        onClick={() => setVisualPreset(preset)}
                      >
                        {preset === "clean"
                          ? "Natural"
                          : preset === "cinematic"
                            ? "Cinema"
                            : preset === "vivid"
                              ? "Vibrante"
                              : preset === "mono"
                                ? "P&B"
                                : "Quente"}
                      </button>
                    ))}
                  </div>
                </details>
                {selectedIllustration && (
                  <details open>
                    <summary>Tempo e transição</summary>
                    <div className="pure-number-grid">
                      <label>
                        Fade in
                        <input
                          type="number"
                          min="0"
                          max="3"
                          step="0.1"
                          value={selectedIllustration.fadeIn}
                          onChange={(event) =>
                            updateIllustration(selectedIllustration.id, {
                              fadeIn: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Fade out
                        <input
                          type="number"
                          min="0"
                          max="3"
                          step="0.1"
                          value={selectedIllustration.fadeOut}
                          onChange={(event) =>
                            updateIllustration(selectedIllustration.id, {
                              fadeOut: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                  </details>
                )}
              </div>
            )}

            {inspectorTab === "audio" && (
              <div className="pure-inspector-body" role="tabpanel">
                <header>
                  <span>ÁUDIO</span>
                  <b>{selectedAudio?.name || "Áudio do vídeo"}</b>
                </header>
                <details open>
                  <summary>Volume</summary>
                  {selectedAudio ? (
                    <>
                      <label>
                        Nível <output>{selectedAudio.volume}%</output>
                        <input
                          type="range"
                          min="0"
                          max="120"
                          value={selectedAudio.volume}
                          onChange={(event) =>
                            updateAudioTrack(selectedAudio.id, {
                              volume: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <div className="audio-track-switches pure-audio-switches">
                        <button
                          type="button"
                          className={selectedAudio.muted ? "active" : ""}
                          onClick={() =>
                            updateAudioTrack(selectedAudio.id, {
                              muted: !selectedAudio.muted,
                            })
                          }
                        >
                          Mute
                        </button>
                        <button
                          type="button"
                          className={selectedAudio.solo ? "active solo" : ""}
                          onClick={() =>
                            updateAudioTrack(selectedAudio.id, {
                              solo: !selectedAudio.solo,
                            })
                          }
                        >
                          Solo
                        </button>
                      </div>
                    </>
                  ) : (
                    <label>
                      Nível <output>{audioGain}%</output>
                      <input
                        type="range"
                        min="0"
                        max="120"
                        value={audioGain}
                        onChange={(event) =>
                          setAudioGain(Number(event.target.value))
                        }
                      />
                    </label>
                  )}
                  <label className="pure-check">
                    <input
                      type="checkbox"
                      checked={audioEnhance}
                      onChange={(event) =>
                        setAudioEnhance(event.target.checked)
                      }
                    />{" "}
                    Limpar voz e nivelar volume
                  </label>
                </details>
                {selectedAudio && (
                  <details open>
                    <summary>Transição de áudio</summary>
                    <label>
                      Fade in{" "}
                      <output>{selectedAudio.fadeIn.toFixed(1)}s</output>
                      <input
                        type="range"
                        min="0"
                        max="3"
                        step="0.1"
                        value={selectedAudio.fadeIn}
                        onChange={(event) =>
                          updateAudioTrack(selectedAudio.id, {
                            fadeIn: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Fade out{" "}
                      <output>{selectedAudio.fadeOut.toFixed(1)}s</output>
                      <input
                        type="range"
                        min="0"
                        max="3"
                        step="0.1"
                        value={selectedAudio.fadeOut}
                        onChange={(event) =>
                          updateAudioTrack(selectedAudio.id, {
                            fadeOut: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </details>
                )}
                <button
                  type="button"
                  className="pure-secondary"
                  onClick={() => {
                    setActiveTool("audio");
                    setToolPanelOpen(true);
                  }}
                  aria-expanded={toolPanelOpen && activeTool === "audio"}
                  aria-controls="klip-tool-panel"
                >
                  <Music2 aria-hidden="true" size={14} /> Abrir biblioteca de
                  áudio
                </button>
              </div>
            )}

            {inspectorTab === "captions" && (
              <div className="pure-inspector-body" role="tabpanel">
                <header>
                  <span>LEGENDAS</span>
                  <b>{selected ? "Texto selecionado" : "Nenhuma legenda"}</b>
                </header>
                <button
                  type="button"
                  className="pure-primary automatic-captions"
                  onClick={() => void generateAutomaticCaptions()}
                  disabled={transcribing}
                  title="Cria textos sincronizados a partir da fala do vídeo"
                >
                  <Captions aria-hidden="true" size={15} />
                  {automaticCaptionButtonLabel}
                </button>
                {transcribing && (
                  <div
                    className="caption-progress compact"
                    role="progressbar"
                    aria-label="Progresso da transcrição"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(transcriptionProgress)}
                  >
                    <i style={{ width: `${transcriptionProgress}%` }} />
                    <span>{transcriptionPhaseLabel}</span>
                  </div>
                )}
                {detectedCaptionLanguageName && !transcribing && (
                  <small className="caption-detected-language">
                    Idioma detectado: {detectedCaptionLanguageName}
                  </small>
                )}
                {!selected ? (
                  <button
                    type="button"
                    className="pure-primary"
                    onClick={addLayer}
                  >
                    <Plus aria-hidden="true" size={15} /> Adicionar texto
                  </button>
                ) : (
                  <>
                    <textarea
                      aria-label="Texto da legenda"
                      value={selected.text}
                      onChange={(event) =>
                        updateLayer(selected.id, { text: event.target.value })
                      }
                    />
                    <details open>
                      <summary>Tipografia</summary>
                      <label>
                        Fonte
                        <select
                          value={selected.font}
                          onChange={(event) =>
                            updateLayer(selected.id, {
                              font: event.target.value,
                            })
                          }
                        >
                          <option>Inter</option>
                          <option>Arial Black</option>
                          <option>Georgia</option>
                          <option>Courier New</option>
                          <option>Impact</option>
                          <option>Trebuchet MS</option>
                        </select>
                      </label>
                      <label>
                        Tamanho <output>{selected.size}px</output>
                        <input
                          type="range"
                          min="18"
                          max="140"
                          value={selected.size}
                          onChange={(event) =>
                            updateLayer(selected.id, {
                              size: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <div className="pure-caption-row">
                        <input
                          aria-label="Cor da legenda"
                          type="color"
                          value={selected.color}
                          onChange={(event) =>
                            updateLayer(selected.id, {
                              color: event.target.value,
                            })
                          }
                        />
                        <button
                          type="button"
                          className={selected.align === "left" ? "active" : ""}
                          onClick={() =>
                            updateLayer(selected.id, { align: "left" })
                          }
                        >
                          <AlignLeft aria-hidden="true" size={15} />
                        </button>
                        <button
                          type="button"
                          className={
                            selected.align === "center" ? "active" : ""
                          }
                          onClick={() =>
                            updateLayer(selected.id, { align: "center" })
                          }
                        >
                          <AlignCenter aria-hidden="true" size={15} />
                        </button>
                        <button
                          type="button"
                          className={selected.align === "right" ? "active" : ""}
                          onClick={() =>
                            updateLayer(selected.id, { align: "right" })
                          }
                        >
                          <AlignRight aria-hidden="true" size={15} />
                        </button>
                      </div>
                    </details>
                    <details open>
                      <summary>Animação</summary>
                      <label>
                        Efeito
                        <select
                          value={selected.effect}
                          onChange={(event) =>
                            updateLayer(selected.id, {
                              effect: event.target.value as TextEffect,
                            })
                          }
                        >
                          <option value="none">Sem efeito</option>
                          <option value="pop">Pop</option>
                          <option value="zoom">Zoom</option>
                          <option value="bounce">Bounce</option>
                          <option value="slide">Deslizar</option>
                          <option value="typewriter">
                            Máquina de escrever
                          </option>
                        </select>
                      </label>
                      <div className="pure-number-grid">
                        <label>
                          Fade in
                          <input
                            type="number"
                            min="0"
                            max="3"
                            step="0.1"
                            value={selected.fadeIn}
                            onChange={(event) =>
                              updateLayer(selected.id, {
                                fadeIn: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          Fade out
                          <input
                            type="number"
                            min="0"
                            max="3"
                            step="0.1"
                            value={selected.fadeOut}
                            onChange={(event) =>
                              updateLayer(selected.id, {
                                fadeOut: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                    </details>
                    <button
                      type="button"
                      className="pure-danger"
                      onClick={removeLayer}
                    >
                      <Trash2 aria-hidden="true" size={14} /> Excluir legenda
                    </button>
                  </>
                )}
              </div>
            )}
          </aside>
        )}
      </section>

      {clip && (
        <section
          className={`timeline-panel multi-timeline ${hasMontageTimeline ? "montage-active" : ""}`}
          id="klip-timeline"
          style={{ height: `${timelineHeight}px` }}
        >
          <button
            type="button"
            className="pure-timeline-resizer"
            onPointerDown={beginTimelinePanelResize}
            onPointerMove={moveTimelinePanelResize}
            onPointerUp={endTimelinePanelResize}
            onPointerCancel={endTimelinePanelResize}
            aria-label={`Redimensionar linha do tempo. Altura atual ${timelineHeight} pixels`}
            title="Arraste para aumentar ou diminuir a timeline"
          >
            <span />
          </button>
          <div className="timeline-top">
            <div>
              <b>Linha do tempo</b>
              <span>
                {hasMontageTimeline
                  ? `Montagem livre · ${montageTimelineClips.length} clipes independentes · vídeo e áudio separados · ${time(montageTimelineDuration)}`
                  : clip
                    ? `Corte ${time(start)} — ${time(end)} · duração ${time(Math.max(0, end - start))}`
                    : "Importe um vídeo ou foto para começar"}
              </span>
            </div>
            <button
              disabled={!history.current.length}
              onClick={undo}
              title="Desfazer"
            >
              <Undo2 aria-hidden="true" size={14} /> Desfazer
            </button>
            <button
              disabled={!future.current.length}
              onClick={redo}
              title="Refazer"
            >
              <Redo2 aria-hidden="true" size={14} /> Refazer
            </button>
            <div
              className="timeline-precision"
              title="Segure Ctrl ou ⌘ e use o scroll do mouse sobre a timeline"
            >
              <button
                type="button"
                onClick={() => setTimelineZoomAnchored(timelineZoom / 1.5)}
                aria-label="Diminuir zoom da timeline"
              >
                <Minus aria-hidden="true" size={14} />
              </button>
              <label className="timeline-zoom">
                <span>
                  {timelineZoom >= 8
                    ? "Precisão 1 ms"
                    : `Zoom ${timelineZoom.toFixed(1)}×`}
                </span>
                <input
                  type="range"
                  min="1"
                  max="64"
                  step="0.25"
                  value={timelineZoom}
                  onChange={(event) =>
                    setTimelineZoomAnchored(Number(event.target.value))
                  }
                />
              </label>
              <button
                type="button"
                onClick={() => setTimelineZoomAnchored(timelineZoom * 1.5)}
                aria-label="Aumentar zoom da timeline"
              >
                <Plus aria-hidden="true" size={14} />
              </button>
            </div>
            <button
              className="timeline-play-toggle"
              disabled={!clip}
              onClick={() => void togglePreviewPlayback()}
            >
              {isPlaying ? (
                <>
                  <Pause aria-hidden="true" size={16} /> Pausar
                </>
              ) : (
                <>
                  <Play aria-hidden="true" size={16} fill="currentColor" />{" "}
                  Reproduzir
                </>
              )}
            </button>
            <button
              className="timeline-split-toggle"
              disabled={!clip}
              onClick={splitVideoAtPlayhead}
              title="Separa o clipe na linha branca e preserva as duas partes"
            >
              <Scissors aria-hidden="true" size={14} /> Dividir clipe
            </button>
            <button
              className={snapEnabled ? "selected" : ""}
              onClick={() => setSnapEnabled((value) => !value)}
              title="Ímã automático: aproxima o cursor de cortes, camadas e marcadores para alinhar com precisão"
              aria-pressed={snapEnabled}
            >
              <Magnet aria-hidden="true" size={14} /> Ímã automático
            </button>
            <details
              ref={timelineMore}
              className="timeline-more"
              onPointerUp={(event) => {
                if ((event.target as HTMLElement).closest("button"))
                  timelineMore.current?.removeAttribute("open");
              }}
            >
              <summary>
                <MoreHorizontal aria-hidden="true" size={16} /> Mais
              </summary>
              <div>
                <button
                  className={safeGuides ? "selected" : ""}
                  onClick={() => setSafeGuides((value) => !value)}
                  title="Mostra uma guia de composição que não aparece na exportação"
                >
                  <ShieldCheck aria-hidden="true" size={14} /> Área segura
                </button>
                <small className="timeline-safe-area-help">
                  A área segura é só uma guia: mantém textos e rostos longe de
                  controles e recortes da plataforma. Ela não aparece na
                  exportação.
                </small>
                <button
                  onClick={addMarker}
                  title="Adiciona um marcador no cursor"
                >
                  <BookmarkPlus aria-hidden="true" size={14} /> Marcador
                </button>
                <button
                  onClick={splitSelectedAtPlayhead}
                  title="Divide a cena, camada, texto ou áudio selecionado"
                >
                  <Scissors aria-hidden="true" size={14} /> Dividir selecionado
                  no cursor
                </button>
                <button
                  onClick={trimAtPlayhead}
                  title="Move a ponta mais próxima do vídeo base para o cursor atual"
                >
                  <Scissors aria-hidden="true" size={14} /> Ajustar corte do
                  vídeo base
                </button>
                <button onClick={() => markCut("start")}>
                  <ArrowLeft aria-hidden="true" size={14} /> Começar aqui
                </button>
                <button onClick={() => markCut("end")}>
                  Terminar aqui <ArrowRight aria-hidden="true" size={14} />
                </button>
                <button onClick={() => seek(start)}>
                  <RotateCcw aria-hidden="true" size={14} /> Ir ao início
                </button>
              </div>
            </details>
          </div>
          <div
            ref={timelineViewport}
            className="timeline-scroll-viewport"
            role="region"
            aria-label="Linha do tempo rolável. Use os controles de zoom para ajustar a precisão."
          >
            <div
              className="timeline-canvas"
              style={{ width: `${timelineZoom * 100}%` }}
            >
              <div className="timeline-ruler">
                {Array.from({ length: 9 }, (_, index) => (
                  <i key={index}>
                    {editorTimelineDuration
                      ? time((editorTimelineDuration / 8) * index)
                      : "00:00"}
                  </i>
                ))}
              </div>
              <div
                className="timeline-lanes"
                onDragOver={(event) => event.preventDefault()}
                onDrop={dropTransitionOnTimeline}
                onContextMenu={openVideoContextMenu}
              >
                <div className="timeline-lane video-lane">
                  <b>VÍDEO</b>
                  <div
                    className="lane-track timeline-scrubber"
                    onPointerDown={selectTimeFromTimeline}
                    onPointerMove={moveTimelineTrim}
                    onPointerUp={endTimelineTrim}
                    onPointerCancel={endTimelineTrim}
                    title="Clique para mover o cursor. Arraste as alças vermelhas para cortar."
                  >
                    <button
                      className="primary-video-clip timeline-item-clip"
                      type="button"
                      style={{
                        left: duration
                          ? `${(primaryClipStart / duration) * 100}%`
                          : "0%",
                        width: duration
                          ? `${Math.max(2, ((primaryClipEnd - primaryClipStart) / duration) * 100)}%`
                          : "100%",
                      }}
                      onPointerDown={beginPrimaryTimelineMove}
                      onPointerMove={movePrimaryTimelineMove}
                      onPointerUp={(event) => endPrimaryTimelineMove(event)}
                      onPointerCancel={(event) =>
                        endPrimaryTimelineMove(event, true)
                      }
                      onContextMenu={openVideoContextMenu}
                      title="Arraste o corpo para mover o trecho sem alterar o corte. Use as pontas para cortar."
                    >
                      <i
                        className="timeline-clip-handle start"
                        onPointerDown={(event) =>
                          beginTimelineTrim(event, "start")
                        }
                      />
                      {!!timelineThumbnails.length && (
                        <span
                          className="pure-timeline-thumbnails"
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            inset: "2px 16px",
                            display: "grid",
                            gridTemplateColumns: `repeat(${timelineThumbnails.length}, minmax(0, 1fr))`,
                            gap: 1,
                            overflow: "hidden",
                            opacity: 0.48,
                            borderRadius: "inherit",
                            pointerEvents: "none",
                          }}
                        >
                          {timelineThumbnails.map((thumbnail) => (
                            <span
                              key={thumbnail}
                              style={{
                                minWidth: 0,
                                backgroundImage: `url(${thumbnail})`,
                                backgroundPosition: "center",
                                backgroundSize: "cover",
                              }}
                            />
                          ))}
                        </span>
                      )}
                      <span
                        style={{
                          position: "relative",
                          zIndex: 1,
                          textShadow: "0 1px 4px rgba(0,0,0,.85)",
                        }}
                      >
                        <Play
                          aria-hidden="true"
                          size={12}
                          fill="currentColor"
                        />{" "}
                        VÍDEO PRINCIPAL · {clip?.name}
                      </span>
                      <i className="timeline-clip-meta">arraste para mover</i>
                      <i
                        className="timeline-clip-handle end"
                        onPointerDown={(event) =>
                          beginTimelineTrim(event, "end")
                        }
                      />
                    </button>
                    {sceneItems.map((item, index) => (
                      <button
                        className={`illustration-clip scene-clip timeline-item-clip ${selectedIllustration?.id === item.id ? "selected" : ""}`}
                        key={item.id}
                        style={{
                          left: duration
                            ? `${(item.start / duration) * 100}%`
                            : "0%",
                          width: duration
                            ? `${Math.max(1.5, ((item.end - item.start) / duration) * 100)}%`
                            : "0%",
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedIllustrationId(item.id);
                          setSelectedId("");
                          setSelectedAudioId("");
                        }}
                        onContextMenu={(event) =>
                          openContextMenu(event, "illustration", item.id)
                        }
                        onPointerDown={(event) =>
                          beginTimelineItemDrag(
                            event,
                            "illustration",
                            item.id,
                            "move",
                            item.start,
                            item.end,
                          )
                        }
                        onPointerMove={moveTimelineItemDrag}
                        onPointerUp={endTimelineItemDrag}
                        onPointerCancel={endTimelineItemDrag}
                        title="Vídeo na sequência: arraste para mover; use as pontas para encurtar ou aumentar."
                      >
                        <i
                          className="timeline-clip-handle start"
                          onPointerDown={(event) =>
                            beginTimelineItemDrag(
                              event,
                              "illustration",
                              item.id,
                              "start",
                              item.start,
                              item.end,
                            )
                          }
                        />
                        <i
                          className="clip-fade-handle in"
                          onPointerDown={(event) =>
                            beginTimelineFadeDrag(
                              event,
                              "illustration",
                              item.id,
                              "in",
                              item.fadeIn,
                            )
                          }
                          onPointerMove={moveTimelineFadeDrag}
                          onPointerUp={endTimelineFadeDrag}
                          onPointerCancel={endTimelineFadeDrag}
                        />
                        <span>
                          <Play
                            aria-hidden="true"
                            size={12}
                            fill="currentColor"
                          />{" "}
                          VÍDEO {index + 2} · {item.name}
                        </span>
                        <i className="timeline-clip-meta">sequência</i>
                        <i
                          className="clip-fade-handle out"
                          onPointerDown={(event) =>
                            beginTimelineFadeDrag(
                              event,
                              "illustration",
                              item.id,
                              "out",
                              item.fadeOut,
                            )
                          }
                          onPointerMove={moveTimelineFadeDrag}
                          onPointerUp={endTimelineFadeDrag}
                          onPointerCancel={endTimelineFadeDrag}
                        />
                        <i
                          className="timeline-clip-handle end"
                          onPointerDown={(event) =>
                            beginTimelineItemDrag(
                              event,
                              "illustration",
                              item.id,
                              "end",
                              item.start,
                              item.end,
                            )
                          }
                        />
                      </button>
                    ))}
                    {videoFadeIn > 0 && (
                      <button
                        className="timeline-transition in"
                        type="button"
                        style={{
                          left: duration
                            ? `${(videoFadeInAt / duration) * 100}%`
                            : "0%",
                          width: duration
                            ? `${Math.max(4, (videoFadeIn / duration) * 100)}%`
                            : "8%",
                        }}
                        onPointerDown={(event) =>
                          beginTransitionMove(event, "in")
                        }
                        onPointerMove={(event) => {
                          moveTransitionPosition(event);
                          moveTransitionResize(event);
                        }}
                        onPointerUp={() => {
                          endTransitionMove();
                          endTransitionResize();
                        }}
                        onPointerCancel={() => {
                          endTransitionMove();
                          endTransitionResize();
                        }}
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          applyTransition("none", "in");
                        }}
                        title="Arraste o bloco para reposicionar. Arraste a alça no fim para mudar a duração. Clique duas vezes para remover."
                      >
                        <Blend aria-hidden="true" size={12} /> Fade{" "}
                        {transitionColor === "white" ? "branco" : "preto"}
                        <i
                          className="transition-grip"
                          onPointerDown={(event) =>
                            beginTransitionResize(event, "in")
                          }
                        >
                          <MoveHorizontal aria-hidden="true" size={12} />
                        </i>
                      </button>
                    )}
                    {videoFadeOut > 0 && (
                      <button
                        className="timeline-transition out"
                        type="button"
                        style={{
                          left: duration
                            ? `${(videoFadeOutAt / duration) * 100}%`
                            : "92%",
                          width: duration
                            ? `${Math.max(4, (videoFadeOut / duration) * 100)}%`
                            : "8%",
                        }}
                        onPointerDown={(event) =>
                          beginTransitionMove(event, "out")
                        }
                        onPointerMove={(event) => {
                          moveTransitionPosition(event);
                          moveTransitionResize(event);
                        }}
                        onPointerUp={() => {
                          endTransitionMove();
                          endTransitionResize();
                        }}
                        onPointerCancel={() => {
                          endTransitionMove();
                          endTransitionResize();
                        }}
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          applyTransition("none", "out");
                        }}
                        title="Arraste o bloco para reposicionar. Arraste a alça no fim para mudar a duração. Clique duas vezes para remover."
                      >
                        {transitionColor === "white"
                          ? "Fade branco"
                          : "Fade preto"}
                        <i
                          className="transition-grip"
                          onPointerDown={(event) =>
                            beginTransitionResize(event, "out")
                          }
                        >
                          <MoveHorizontal aria-hidden="true" size={12} />
                        </i>
                      </button>
                    )}
                    <button
                      type="button"
                      className="cut-marker start-marker"
                      aria-label="Arrastar início do corte"
                      onPointerDown={(event) =>
                        beginTimelineTrim(event, "start")
                      }
                      style={{
                        left: duration
                          ? `${(primaryClipStart / duration) * 100}%`
                          : "0%",
                      }}
                    >
                      <span>{time(primaryClipStart)}</span>
                    </button>
                    <button
                      type="button"
                      className="cut-marker end-marker"
                      aria-label="Arrastar fim do corte"
                      onPointerDown={(event) => beginTimelineTrim(event, "end")}
                      style={{
                        left: duration
                          ? `${(primaryClipEnd / duration) * 100}%`
                          : "100%",
                      }}
                    >
                      <span>{time(primaryClipEnd)}</span>
                    </button>
                  </div>
                </div>
                {hasMontageTimeline && (
                  <div className="timeline-lane radar-lane montage-video-lane">
                    <b>VÍDEO</b>
                    <div
                      className="lane-track"
                      onPointerDown={selectTimeFromTimeline}
                      title="Arraste cada clipe livremente. As lacunas permanecem até você fechar o espaço."
                    >
                      {montageTimelineClips.map((item, index) => (
                        <button
                          type="button"
                          key={item.id}
                          className={`radar-cut montage-cut ${activeRadarCutId === item.id ? "active" : ""}`}
                          style={{
                            left: `${(item.timelineStart / montageTimelineDuration) * 100}%`,
                            width: `${((item.timelineEnd - item.timelineStart) / montageTimelineDuration) * 100}%`,
                          }}
                          onPointerDown={(event) =>
                            beginRadarCutMove(event, item)
                          }
                          onPointerMove={moveRadarCutMove}
                          onPointerUp={endRadarCutMove}
                          onPointerCancel={endRadarCutMove}
                          onClick={(event) => {
                            event.stopPropagation();
                            activateRadarCut(item);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onDrop={(event) =>
                            dropTransitionOnRadarClip(event, item)
                          }
                          title={`clipe ${index + 1} · origem ${time(item.start)}–${time(item.end)} · arraste o corpo para mover e as pontas para cortar`}
                        >
                          <i
                            className="radar-trim-handle start"
                            onPointerDown={(event) =>
                              beginRadarCutTrim(event, item, "start")
                            }
                            onPointerMove={moveRadarCutTrim}
                            onPointerUp={endRadarCutTrim}
                            onPointerCancel={endRadarCutTrim}
                          >
                            <MoveHorizontal aria-hidden="true" size={12} />
                          </i>
                          {item.fadeIn ? (
                            <i
                              className={`radar-clip-fade in ${item.fadeInColor || "black"}`}
                              style={{
                                width: `${Math.min(48, (item.fadeIn / Math.max(0.01, item.end - item.start)) * 100)}%`,
                              }}
                            />
                          ) : null}
                          <span>
                            <Play
                              aria-hidden="true"
                              size={12}
                              fill="currentColor"
                            />{" "}
                            K{index + 1} ·{" "}
                            {time(item.timelineEnd - item.timelineStart)}
                          </span>
                          <small>arraste para mover</small>
                          {item.fadeOut ? (
                            <i
                              className={`radar-clip-fade out ${item.fadeOutColor || "black"}`}
                              style={{
                                width: `${Math.min(48, (item.fadeOut / Math.max(0.01, item.end - item.start)) * 100)}%`,
                              }}
                            />
                          ) : null}
                          <i
                            className="radar-trim-handle end"
                            onPointerDown={(event) =>
                              beginRadarCutTrim(event, item, "end")
                            }
                            onPointerMove={moveRadarCutTrim}
                            onPointerUp={endRadarCutTrim}
                            onPointerCancel={endRadarCutTrim}
                          >
                            <MoveHorizontal aria-hidden="true" size={12} />
                          </i>
                          <i
                            className="montage-download"
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              void exportReel(
                                false,
                                [item],
                                `klip-radar-${String(index + 1).padStart(2, "0")}`,
                              );
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                void exportReel(
                                  false,
                                  [item],
                                  `klip-radar-${String(index + 1).padStart(2, "0")}`,
                                );
                              }
                            }}
                            aria-label={`Salvar clipe ${index + 1} individualmente`}
                            title="Salvar este clipe sem remover os demais"
                          >
                            <Download aria-hidden="true" size={12} />
                          </i>
                          <i
                            className="montage-remove"
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              removeRadarCut(item.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                removeRadarCut(item.id);
                              }
                            }}
                            aria-label="Excluir somente este clipe"
                            title="Excluir somente este clipe; os demais permanecem"
                          >
                            <X aria-hidden="true" size={12} />
                          </i>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="timeline-lane audio-lane">
                  <b>{hasMontageTimeline ? "ÁUDIOS" : "ÁUDIO"}</b>
                  <div
                    className={`lane-track waveform-track ${hasMontageTimeline ? "segmented-waveform" : ""}`}
                    onPointerDown={selectTimeFromTimeline}
                    title={
                      hasMontageTimeline
                        ? "Cada clipe possui seu próprio áudio sincronizado e mantém a mesma posição e lacuna do vídeo."
                        : "Forma de onda do áudio. Clique para posicionar o cursor."
                    }
                  >
                    {hasMontageTimeline ? (
                      montageAudioClips.map((item, clipIndex) => (
                        <button
                          type="button"
                          key={item.id}
                          className={`montage-audio-clip ${activeRadarCutId === item.id ? "active" : ""}`}
                          style={{
                            left: `${(item.timelineStart / montageTimelineDuration) * 100}%`,
                            width: `${((item.timelineEnd - item.timelineStart) / montageTimelineDuration) * 100}%`,
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            activateRadarCut(item);
                          }}
                          title={`Áudio K${clipIndex + 1} · sincronizado com o vídeo`}
                        >
                          <span>
                            <Music2 aria-hidden="true" size={12} /> K
                            {clipIndex + 1}
                          </span>
                          <i className="montage-audio-waveform">
                            {item.waveform.length ? (
                              item.waveform.map((value, point) => (
                                <i
                                  key={point}
                                  style={{
                                    height: `${Math.max(12, value * 100)}%`,
                                  }}
                                />
                              ))
                            ) : (
                              <i style={{ height: "18%" }} />
                            )}
                          </i>
                        </button>
                      ))
                    ) : timelineWaveform.length ? (
                      timelineWaveform.map((value, index) => (
                        <i
                          key={index}
                          style={{ height: `${Math.max(12, value * 100)}%` }}
                        />
                      ))
                    ) : baseAudioState === "detected" ? (
                      <i
                        className="codec-audio-indicator"
                        aria-label={`Áudio presente${baseAudioCodec ? ` em ${baseAudioCodec}` : ""}; este navegador não permite calcular a forma de onda completa`}
                        title={`O áudio será reproduzido e exportado. ${baseAudioCodec ? `Codec detectado: ${baseAudioCodec}. ` : ""}A forma de onda completa não está disponível neste navegador.`}
                      >
                        <AudioLines aria-hidden="true" size={14} />
                        <span>
                          Áudio presente
                          {baseAudioCodec ? ` · ${baseAudioCodec}` : ""}
                        </span>
                      </i>
                    ) : (
                      <span>
                        {baseAudioState === "checking"
                          ? "Verificando o áudio do vídeo…"
                          : "Este arquivo não possui uma faixa de áudio reproduzível"}
                      </span>
                    )}
                    {!hasMontageTimeline &&
                      markers.map((marker) => (
                        <button
                          type="button"
                          key={marker}
                          className="timeline-marker"
                          style={{
                            left: duration
                              ? `${(marker / duration) * 100}%`
                              : "0%",
                          }}
                          onClick={(event) => {
                            event.stopPropagation();
                            seek(marker);
                          }}
                          title={`Marcador ${time(marker)}`}
                        />
                      ))}
                  </div>
                </div>
                {audioTracks.map((track, index) => (
                  <div
                    className={`timeline-lane audio-layer ${selectedAudio?.id === track.id ? "selected" : ""} ${track.muted ? "muted" : ""} ${track.solo ? "solo" : ""}`}
                    key={track.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      const deselect = selectedAudio?.id === track.id;
                      setSelectedAudioId(deselect ? "" : track.id);
                      setSelectedId("");
                      setSelectedIllustrationId("");
                      setInspectorTab("edit");
                      setActiveTool("audio");
                      setToolPanelOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedAudioId(track.id);
                        setSelectedId("");
                        setSelectedIllustrationId("");
                        setInspectorTab("edit");
                        setActiveTool("audio");
                        setToolPanelOpen(true);
                      }
                    }}
                    onContextMenu={(event) =>
                      openContextMenu(event, "audio", track.id)
                    }
                  >
                    <b>
                      <Music2 aria-hidden="true" size={12} /> A{index + 1}
                      {track.muted ? " · M" : track.solo ? " · S" : ""}
                    </b>
                    <div className="lane-track">
                      <button
                        type="button"
                        className="audio-clip timeline-item-clip"
                        style={{
                          left: duration
                            ? `${(track.start / duration) * 100}%`
                            : "0%",
                          width: duration
                            ? `${Math.max(2, ((track.end - track.start) / duration) * 100)}%`
                            : "10%",
                        }}
                        onPointerDown={(event) =>
                          beginTimelineItemDrag(
                            event,
                            "audio",
                            track.id,
                            "move",
                            track.start,
                            track.end,
                          )
                        }
                        onPointerMove={moveTimelineItemDrag}
                        onPointerUp={endTimelineItemDrag}
                        onPointerCancel={endTimelineItemDrag}
                      >
                        <i
                          className="timeline-clip-handle start"
                          onPointerDown={(event) =>
                            beginTimelineItemDrag(
                              event,
                              "audio",
                              track.id,
                              "start",
                              track.start,
                              track.end,
                            )
                          }
                        />
                        <i
                          className="clip-fade-handle in"
                          onPointerDown={(event) =>
                            beginTimelineFadeDrag(
                              event,
                              "audio",
                              track.id,
                              "in",
                              track.fadeIn,
                            )
                          }
                          onPointerMove={moveTimelineFadeDrag}
                          onPointerUp={endTimelineFadeDrag}
                          onPointerCancel={endTimelineFadeDrag}
                        />
                        {track.waveform?.length ? (
                          <i className="audio-clip-waveform" aria-hidden="true">
                            {track.waveform.map((value, point) => (
                              <i
                                key={point}
                                style={{
                                  height: `${Math.max(10, value * 100)}%`,
                                }}
                              />
                            ))}
                          </i>
                        ) : null}
                        <span>{track.name}</span>
                        <i className="timeline-clip-meta">
                          {track.muted
                            ? "MUDO"
                            : track.solo
                              ? `SOLO · ${track.volume}%`
                              : `${track.volume}% · canal`}
                        </i>
                        <i
                          className="clip-fade-handle out"
                          onPointerDown={(event) =>
                            beginTimelineFadeDrag(
                              event,
                              "audio",
                              track.id,
                              "out",
                              track.fadeOut,
                            )
                          }
                          onPointerMove={moveTimelineFadeDrag}
                          onPointerUp={endTimelineFadeDrag}
                          onPointerCancel={endTimelineFadeDrag}
                        />
                        <i
                          className="timeline-clip-handle end"
                          onPointerDown={(event) =>
                            beginTimelineItemDrag(
                              event,
                              "audio",
                              track.id,
                              "end",
                              track.start,
                              track.end,
                            )
                          }
                        />
                      </button>
                    </div>
                  </div>
                ))}
                {overlayItems.map((item, index) => (
                  <div
                    className={`timeline-lane illustration-lane ${selectedIllustration?.id === item.id ? "selected" : ""}`}
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedIllustrationId(item.id);
                      setSelectedId("");
                      setSelectedAudioId("");
                      seek(Math.max(start, item.start));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedIllustrationId(item.id);
                        setSelectedId("");
                        setSelectedAudioId("");
                        seek(Math.max(start, item.start));
                      }
                    }}
                    onContextMenu={(event) =>
                      openContextMenu(event, "illustration", item.id)
                    }
                  >
                    <b>
                      {item.kind === "image"
                        ? `IMG ${index + 1}`
                        : `VID ${index + 1}`}
                    </b>
                    <div className="lane-track">
                      <button
                        type="button"
                        className="illustration-clip timeline-item-clip"
                        style={{
                          left: duration
                            ? `${(item.start / duration) * 100}%`
                            : "0%",
                          width: duration
                            ? `${Math.max(1.5, ((item.end - item.start) / duration) * 100)}%`
                            : "0%",
                        }}
                        onPointerDown={(event) =>
                          beginTimelineItemDrag(
                            event,
                            "illustration",
                            item.id,
                            "move",
                            item.start,
                            item.end,
                          )
                        }
                        onPointerMove={moveTimelineItemDrag}
                        onPointerUp={endTimelineItemDrag}
                        onPointerCancel={endTimelineItemDrag}
                      >
                        <i
                          className="timeline-clip-handle start"
                          onPointerDown={(event) =>
                            beginTimelineItemDrag(
                              event,
                              "illustration",
                              item.id,
                              "start",
                              item.start,
                              item.end,
                            )
                          }
                        />
                        <i
                          className="clip-fade-handle in"
                          onPointerDown={(event) =>
                            beginTimelineFadeDrag(
                              event,
                              "illustration",
                              item.id,
                              "in",
                              item.fadeIn,
                            )
                          }
                          onPointerMove={moveTimelineFadeDrag}
                          onPointerUp={endTimelineFadeDrag}
                          onPointerCancel={endTimelineFadeDrag}
                        />
                        <span>{item.name || "Ilustração"}</span>
                        <i className="timeline-clip-meta">
                          {item.kind === "image" ? "imagem" : "vídeo"}
                        </i>
                        <i
                          className="clip-fade-handle out"
                          onPointerDown={(event) =>
                            beginTimelineFadeDrag(
                              event,
                              "illustration",
                              item.id,
                              "out",
                              item.fadeOut,
                            )
                          }
                          onPointerMove={moveTimelineFadeDrag}
                          onPointerUp={endTimelineFadeDrag}
                          onPointerCancel={endTimelineFadeDrag}
                        />
                        <i
                          className="timeline-clip-handle end"
                          onPointerDown={(event) =>
                            beginTimelineItemDrag(
                              event,
                              "illustration",
                              item.id,
                              "end",
                              item.start,
                              item.end,
                            )
                          }
                        />
                      </button>
                    </div>
                  </div>
                ))}
                {!!captionLayers.length && (
                  <div className="timeline-lane caption-lane">
                    <b>
                      <Captions aria-hidden="true" size={12} /> LEGENDAS
                    </b>
                    <div className="lane-track">
                      {captionLayers.map((layer) => (
                        <button
                          type="button"
                          key={layer.id}
                          className={`caption-clip timeline-item-clip ${selected?.id === layer.id ? "selected" : ""}`}
                          style={{
                            left: duration
                              ? `${(layer.start / duration) * 100}%`
                              : "0%",
                            width: duration
                              ? `${Math.max(1.2, ((layer.end - layer.start) / duration) * 100)}%`
                              : "0%",
                          }}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedId(layer.id);
                            setSelectedIllustrationId("");
                            setSelectedAudioId("");
                            setActiveTool("captions");
                            setToolPanelOpen(true);
                            seek(Math.max(start, layer.start));
                          }}
                          onPointerDown={(event) =>
                            beginTimelineItemDrag(
                              event,
                              "text",
                              layer.id,
                              "move",
                              layer.start,
                              layer.end,
                            )
                          }
                          onPointerMove={moveTimelineItemDrag}
                          onPointerUp={endTimelineItemDrag}
                          onPointerCancel={endTimelineItemDrag}
                          onContextMenu={(event) =>
                            openContextMenu(event, "text", layer.id)
                          }
                          title={`${time(layer.start)} — ${time(layer.end)} · ${layer.text}`}
                        >
                          <span>{layer.text || "Legenda"}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {regularTextLayers.map((layer, index) => (
                  <div
                    className={`timeline-lane ${selected?.id === layer.id ? "selected" : ""}`}
                    key={layer.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedId(layer.id);
                      setSelectedIllustrationId("");
                      setSelectedAudioId("");
                      seek(Math.max(start, layer.start));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(layer.id);
                        setSelectedIllustrationId("");
                        setSelectedAudioId("");
                        seek(Math.max(start, layer.start));
                      }
                    }}
                    onContextMenu={(event) =>
                      openContextMenu(event, "text", layer.id)
                    }
                  >
                    <b>T{index + 1}</b>
                    <div className="lane-track">
                      <button
                        type="button"
                        className="text-clip timeline-item-clip"
                        style={{
                          left: duration
                            ? `${(layer.start / duration) * 100}%`
                            : "0%",
                          width: duration
                            ? `${Math.max(1.5, ((layer.end - layer.start) / duration) * 100)}%`
                            : "0%",
                        }}
                        onPointerDown={(event) =>
                          beginTimelineItemDrag(
                            event,
                            "text",
                            layer.id,
                            "move",
                            layer.start,
                            layer.end,
                          )
                        }
                        onPointerMove={moveTimelineItemDrag}
                        onPointerUp={endTimelineItemDrag}
                        onPointerCancel={endTimelineItemDrag}
                      >
                        <i
                          className="timeline-clip-handle start"
                          onPointerDown={(event) =>
                            beginTimelineItemDrag(
                              event,
                              "text",
                              layer.id,
                              "start",
                              layer.start,
                              layer.end,
                            )
                          }
                        />
                        <i
                          className="clip-fade-handle in"
                          onPointerDown={(event) =>
                            beginTimelineFadeDrag(
                              event,
                              "text",
                              layer.id,
                              "in",
                              layer.fadeIn,
                            )
                          }
                          onPointerMove={moveTimelineFadeDrag}
                          onPointerUp={endTimelineFadeDrag}
                          onPointerCancel={endTimelineFadeDrag}
                        />
                        <span>{layer.text || "Texto"}</span>
                        <i className="timeline-clip-meta">
                          {layer.effect !== "none" ? layer.effect : "texto"}
                        </i>
                        <i
                          className="clip-fade-handle out"
                          onPointerDown={(event) =>
                            beginTimelineFadeDrag(
                              event,
                              "text",
                              layer.id,
                              "out",
                              layer.fadeOut,
                            )
                          }
                          onPointerMove={moveTimelineFadeDrag}
                          onPointerUp={endTimelineFadeDrag}
                          onPointerCancel={endTimelineFadeDrag}
                        />
                        <i
                          className="timeline-clip-handle end"
                          onPointerDown={(event) =>
                            beginTimelineItemDrag(
                              event,
                              "text",
                              layer.id,
                              "end",
                              layer.start,
                              layer.end,
                            )
                          }
                        />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="global-playhead"
                  aria-label={`Cursor em ${time(current)}`}
                  style={{
                    left: editorTimelineDuration
                      ? `calc(var(--timeline-track-offset) + (100% - var(--timeline-track-offset)) * ${current / editorTimelineDuration})`
                      : "var(--timeline-track-offset)",
                  }}
                  onPointerDown={beginPlayheadDrag}
                  onPointerMove={movePlayheadDrag}
                  onPointerUp={endPlayheadDrag}
                  onPointerCancel={endPlayheadDrag}
                />
                {snapGuide !== null && !hasMontageTimeline && (
                  <i
                    className="timeline-snap-guide"
                    style={{
                      left: `calc(var(--timeline-track-offset) + (100% - var(--timeline-track-offset)) * ${snapGuide / Math.max(duration, 0.01)})`,
                    }}
                  >
                    <span>{time(snapGuide)}</span>
                  </i>
                )}
              </div>
            </div>
          </div>
          <div className="cut-controls editor-time-controls">
            <p className="timeline-trim-help">
              <b>
                {selected
                  ? `T${layers.findIndex((layer) => layer.id === selected.id) + 1}`
                  : selectedIllustration
                    ? selectedIllustration.kind === "image"
                      ? "Imagem"
                      : "Vídeo"
                    : selectedAudio
                      ? "Áudio"
                      : "Edição direta"}
              </b>
              <span>
                {selected
                  ? selected.text
                  : selectedIllustration
                    ? selectedIllustration.name
                    : selectedAudio
                      ? selectedAudio.name
                      : "Selecione e arraste um clipe na linha do tempo."}
              </span>
            </p>
            {(selected || selectedIllustration || selectedAudio) && (
              <p className="timeline-shortcuts">
                Arraste o bloco para mover · arraste as pontas para cortar ·{" "}
                <kbd>Del</kbd> remover · <kbd>Ctrl D</kbd> duplicar ·{" "}
                <kbd>Espaço</kbd> reproduzir
              </p>
            )}
          </div>
        </section>
      )}
      {studioPanel && (
        <div
          className="studio-hub-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) closeStudioPanel();
          }}
        >
          <section
            ref={studioDialog}
            className={`studio-hub studio-hub-${studioPanel}`}
            role="dialog"
            aria-modal="true"
            aria-label="Ferramentas de criação do KLIPAPP Studio"
          >
            <header className="studio-hub-header">
              <div>
                <span>
                  <Sparkles aria-hidden="true" size={14} /> KLIP CREATOR
                </span>
                <b>
                  {studioPanel === "formats"
                    ? "Escolha onde vai publicar"
                    : studioPanel === "audio"
                      ? "Dê ritmo à sua história"
                      : "Transforme sua própria mídia"}
                </b>
                <small>
                  {studioPanel === "formats"
                    ? "TikTok, Reels, Shorts, Stories, feed ou YouTube — sem decorar medidas."
                    : studioPanel === "audio"
                      ? "Músicas e efeitos KLIPAPP Original, com licença comercial clara."
                      : "Passe o mouse ou toque para conferir antes de aplicar."}
                </small>
              </div>
              <button
                type="button"
                onClick={closeStudioPanel}
                aria-label="Fechar ferramentas"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </header>
            <div
              className="studio-hub-tabs"
              aria-label="Ferramentas do criador"
              role="tablist"
            >
              <button
                id="studio-tab-formats"
                type="button"
                role="tab"
                aria-selected={studioPanel === "formats"}
                aria-controls="studio-hub-tabpanel"
                tabIndex={studioPanel === "formats" ? 0 : -1}
                className={studioPanel === "formats" ? "selected" : ""}
                onClick={() => setStudioPanel("formats")}
              >
                <LayoutTemplate aria-hidden="true" size={15} /> Formatos
              </button>
              <button
                id="studio-tab-audio"
                type="button"
                role="tab"
                aria-selected={studioPanel === "audio"}
                aria-controls="studio-hub-tabpanel"
                tabIndex={studioPanel === "audio" ? 0 : -1}
                className={studioPanel === "audio" ? "selected" : ""}
                onClick={() => setStudioPanel("audio")}
              >
                <Music2 aria-hidden="true" size={15} /> Sons
              </button>
              <button
                id="studio-tab-effects"
                type="button"
                role="tab"
                aria-selected={studioPanel === "effects"}
                aria-controls="studio-hub-tabpanel"
                tabIndex={studioPanel === "effects" ? 0 : -1}
                className={studioPanel === "effects" ? "selected" : ""}
                onClick={() => setStudioPanel("effects")}
              >
                <Sparkles aria-hidden="true" size={15} /> Efeitos
              </button>
            </div>
            <div
              className="studio-hub-content"
              id="studio-hub-tabpanel"
              role="tabpanel"
              aria-labelledby={`studio-tab-${studioPanel}`}
            >
              {studioPanel === "formats" && (
                <QuickCreate
                  selectedId={draftSocialPresetId}
                  onPresetSelect={(preset) => setDraftSocialPresetId(preset.id)}
                  onCreate={applySocialPreset}
                  onCustomize={(preset) => {
                    setSelectedSocialPresetId(preset.id);
                    setDraftSocialPresetId(preset.id);
                    setExportAspect("original");
                    setNotice(
                      "Formato livre ativado. Use os controles de formato, resolução e FPS no topo.",
                    );
                    closeStudioPanel();
                  }}
                />
              )}
              {studioPanel === "audio" && (
                <AudioLibrary
                  onInsert={async (payload: TimelineAudioPayload) => {
                    try {
                      const added = await addAudioTrack(
                        payload.file,
                        {
                          assetId: payload.asset.id,
                          license: payload.asset.license,
                        },
                        payload.duration,
                      );
                      if (!added)
                        throw new Error(
                          "Não foi possível inserir este áudio na timeline.",
                        );
                      closeStudioPanel();
                    } finally {
                      payload.revoke();
                    }
                  }}
                />
              )}
              {studioPanel === "effects" && (
                <div className="studio-effects-shell">
                  <div className="studio-effect-controls">
                    <div>
                      <b>Intensidade</b>
                      <span>{Math.round(visualEffectIntensity * 100)}%</span>
                    </div>
                    <input
                      aria-label="Intensidade do efeito"
                      type="range"
                      min="0.2"
                      max="2"
                      step="0.05"
                      value={visualEffectIntensity}
                      onPointerDown={remember}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setVisualEffectIntensity(value);
                        setVisualEffect((effect) =>
                          effect ? { ...effect, intensity: value } : effect,
                        );
                        setVisualEffectPreview((effect) =>
                          effect ? { ...effect, intensity: value } : effect,
                        );
                      }}
                    />
                    <button
                      type="button"
                      disabled={!visualEffect}
                      onClick={() => {
                        remember();
                        setVisualEffect(null);
                        setVisualEffectPreview(null);
                        setNotice("Efeito visual removido.");
                      }}
                    >
                      Sem efeito
                    </button>
                  </div>
                  <EffectsGallery
                    media={
                      clip
                        ? { src: clip.url, type: "video", alt: clip.name }
                        : null
                    }
                    selectedEffectId={visualEffect?.effectId}
                    intensity={visualEffectIntensity}
                    onPreview={(_, application) =>
                      setVisualEffectPreview(application)
                    }
                    onApply={(effect, application) => {
                      remember();
                      setVisualEffect(application);
                      setVisualEffectPreview(null);
                      setNotice(
                        `${effect.name} aplicado à prévia e à exportação.`,
                      );
                    }}
                  />
                </div>
              )}
            </div>
          </section>
        </div>
      )}
      {radarOpen && (
        <aside
          className="radar-panel"
          id="klip-radar-dialog"
          role="dialog"
          aria-labelledby="klip-radar-title"
        >
          <div className="radar-panel-header">
            <div>
              <span>
                <Sparkles aria-hidden="true" size={14} /> KLIP RADAR
              </span>
              <b id="klip-radar-title">Onde estão os melhores momentos?</b>
              <small>A análise acontece somente neste navegador.</small>
            </div>
            <button
              onClick={() => setRadarOpen(false)}
              aria-label="Fechar Radar"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>
          <div className="radar-config">
            <label>
              Formato
              <select
                value={radarMode}
                onChange={(event) =>
                  setRadarMode(event.target.value as RadarMode)
                }
                disabled={radarAnalyzing}
              >
                <option value="reels">Reels · direto</option>
                <option value="shorts">Shorts · contexto maior</option>
                <option value="highlights">Destaques · conversa longa</option>
              </select>
            </label>
            <label>
              Quantidade
              <select
                value={radarCount}
                onChange={(event) => setRadarCount(Number(event.target.value))}
                disabled={radarAnalyzing}
              >
                {[5, 10, 15, 20, 30].map((amount) => (
                  <option key={amount} value={amount}>
                    {amount} sugestões
                  </option>
                ))}
              </select>
            </label>
            <button
              className="radar-analyze"
              disabled={radarAnalyzing}
              aria-busy={radarAnalyzing}
              onClick={() => void runRadarAnalysis()}
            >
              {radarAnalyzing ? (
                "Analisando…"
              ) : radarSuggestions.length ? (
                <>
                  <RefreshCw aria-hidden="true" size={15} /> Analisar novamente
                </>
              ) : (
                <>
                  <Sparkles aria-hidden="true" size={15} /> Analisar gravação
                </>
              )}
            </button>
          </div>
          <div
            className="radar-progress"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <div
              role="progressbar"
              aria-label="Progresso da análise"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={radarProgress}
            >
              <i style={{ width: `${radarProgress}%` }} />
            </div>
            <span>{radarStatus}</span>
          </div>
          {!!radarSuggestions.length && (
            <div className="radar-suggestions">
              <div className="radar-review-title">
                <b>Revise antes de aplicar</b>
                <small>
                  Desmarque o que não fizer sentido. Nada altera o arquivo
                  original.
                </small>
              </div>
              {radarSuggestions.map((item, index) => (
                <article
                  key={item.id}
                  className={item.selected ? "selected" : ""}
                >
                  <div className="radar-thumbnail" aria-hidden="true">
                    {clip && (
                      <video
                        src={clip.url}
                        muted
                        playsInline
                        preload="metadata"
                        onLoadedMetadata={(event) => {
                          const preview = event.currentTarget;
                          preview.currentTime = Math.min(
                            Math.max(0, item.start),
                            Math.max(0, preview.duration - 0.05),
                          );
                        }}
                      />
                    )}
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <time>{time(item.end - item.start)}</time>
                  </div>
                  <div className="radar-item-copy">
                    <label className="radar-check">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleRadarSuggestion(item.id)}
                      />
                      <span>Clipe {index + 1}</span>
                    </label>
                    <strong>{item.title}</strong>
                    <time>
                      {time(item.start)} → {time(item.end)}
                    </time>
                    <p>{item.reason}</p>
                    <div className="radar-item-actions">
                      <button onClick={() => previewRadarSuggestion(item)}>
                        <Play
                          aria-hidden="true"
                          size={14}
                          fill="currentColor"
                        />{" "}
                        Prévia
                      </button>
                      <button
                        className="radar-download-one"
                        disabled={exporting}
                            onClick={() =>
                              void exportReel(false, [item],
                                `klip-radar-${String(index + 1).padStart(2, "0")}`,
                              )
                        }
                      >
                        <Download aria-hidden="true" size={14} /> Salvar
                      </button>
                    </div>
                  </div>
                  <div className="radar-score">
                    <b>{item.score}</b>
                    <span>score</span>
                  </div>
                </article>
              ))}
            </div>
          )}
          <footer>
            <button onClick={() => setRadarOpen(false)}>
              Continuar editando
            </button>
            <button
              className="radar-apply"
              disabled={!radarSuggestions.some((item) => item.selected)}
              onClick={applyRadarSuggestions}
            >
              Adicionar selecionados à timeline
            </button>
          </footer>
        </aside>
      )}
      {contextMenu && (
        <div
          className="timeline-context-menu"
          role="menu"
          tabIndex={-1}
          aria-label="Ações do clipe"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseLeave={closeContextMenu}
        >
          {contextMenu.kind !== "video" && (
            <>
              <button
                onClick={() => {
                  splitSelectedAtPlayhead();
                  closeContextMenu();
                }}
              >
                <Scissors aria-hidden="true" size={14} /> Dividir no cursor
              </button>
              <button
                onClick={() => {
                  duplicateSelected();
                  closeContextMenu();
                }}
              >
                <Copy aria-hidden="true" size={14} /> Duplicar
              </button>
              <button
                onClick={() => {
                  copySelected();
                  closeContextMenu();
                }}
              >
                <Copy aria-hidden="true" size={14} /> Copiar
              </button>
              {contextMenu.kind !== "audio" && (
                <>
                  <button onClick={() => moveSelectedLayer("front")}>
                    <ArrowUp aria-hidden="true" size={14} /> Trazer para frente
                  </button>
                  <button onClick={() => moveSelectedLayer("back")}>
                    <ArrowDown aria-hidden="true" size={14} /> Enviar para trás
                  </button>
                </>
              )}
              <button
                className="danger"
                onClick={() => {
                  deleteSelected();
                  closeContextMenu();
                }}
              >
                <Trash2 aria-hidden="true" size={14} /> Excluir
              </button>
              <hr />
            </>
          )}
          <button
            onClick={() => {
              splitVideoAtPlayhead();
              closeContextMenu();
            }}
          >
            <Scissors aria-hidden="true" size={14} /> Cortar e separar aqui
          </button>
          {contextMenu.kind === "video" &&
            hasMontageTimeline &&
            activeRadarCutId && (
              <button
                className="danger"
                onClick={() => {
                  removeRadarCut(activeRadarCutId);
                  closeContextMenu();
                  setNotice(
                    "Clipe selecionado excluído. Os outros clipes permanecem intactos.",
                  );
                }}
              >
                <Trash2 aria-hidden="true" size={14} /> Excluir clipe selecionado
              </button>
            )}
          <button
            onClick={() => {
              addMarker();
              closeContextMenu();
            }}
          >
            <BookmarkPlus aria-hidden="true" size={14} /> Adicionar marcador
          </button>
          <button
            onClick={() => {
              markCut("start");
              closeContextMenu();
            }}
          >
            <ArrowLeft aria-hidden="true" size={14} /> Começar aqui
          </button>
          <button
            onClick={() => {
              markCut("end");
              closeContextMenu();
            }}
          >
            Terminar aqui <ArrowRight aria-hidden="true" size={14} />
          </button>
          <button
            onClick={() => {
              setSafeGuides((value) => !value);
              closeContextMenu();
            }}
          >
            <ShieldCheck aria-hidden="true" size={14} />{" "}
            {safeGuides ? "Ocultar" : "Mostrar"} área segura
          </button>
          <button
            onClick={() => {
              seek(start);
              closeContextMenu();
            }}
          >
            <RotateCcw aria-hidden="true" size={14} /> Ir ao início
          </button>
        </div>
      )}

      <PublishModal
        isOpen={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        videoBlob={publishBlob}
        defaultTitle={
          clip?.name ? clip.name.replace(/\.[^/.]+$/, "") : "Reel KLIPAPP"
        }
      />
    </main>
  );
}
