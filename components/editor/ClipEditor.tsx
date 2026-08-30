"use client";

import "../../app/styles/klip-pure.css";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import {
  clearEditorRecovery,
  loadEditorRecovery,
  loadEditorRecoveryAsset,
  saveEditorRecovery,
  type EditorRecoveryAsset,
} from "../../lib/editor-recovery";
import {
  buildCaptionTranscriptionJobs,
  mapCaptionsToTimeline,
  mergeCaptionSourceRanges,
} from "../../lib/editor/captions";
import {
  createLocalTranscriptionSession,
  friendlyLocalTranscriptionError,
  parseFloat32Wave,
} from "../../lib/editor/local-transcription";
import { mergePcmChunkIntoWaveform } from "../../lib/editor/audio-waveform";
import {
  scaleTextLayerSize,
  sanitizeTextLayers,
  type TextEffect,
  type TextLayer,
} from "../../lib/editor/text-layers";
import {
  sourceTimeToTimelineTime,
  timelineTimeToSourceTime,
} from "../../lib/editor/timeline";
import {
  normalizeAppliedTransitionKind,
  normalizeTransitionKind,
  transitionDuration,
  transitionLabel,
  type AppliedTransitionKind,
  type TransitionKind,
} from "../../lib/editor/transitions";
import {
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
  Copy,
  Download,
  Eye,
  FileDown,
  FileUp,
  Film,
  ImagePlus,
  Layers2,
  LayoutTemplate,
  Languages,
  Magnet,
  Maximize2,
  Minus,
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
  RotateCcw,
  Scissors,
  Settings2,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Type,
  Undo2,
  Volume2,
  WandSparkles,
  X,
} from "lucide-react";
import { KlipAppLogo } from "../brand/KlipAppLogo";
import QuickCreate, {
  getSocialPreset,
  type SocialPreset,
  type SocialPresetId,
} from "../../app/social-presets";
import {
  KLIP_AUDIO_CATALOG,
  synthesizeAudio,
  type AudioLicense,
  type TimelineAudioPayload,
} from "../../lib/audio/audio-library";
import {
  createVisualEffectApplication,
  drawVisualEffectFrame,
  getVisualEffectFrame,
  visualEffectFrameToCssFilter,
  VISUAL_EFFECTS,
  type VisualEffectApplication,
} from "../../lib/video-effects";
import {
  analyzeClipForRadar,
  sanitizeRadarSuggestions,
  type RadarMode,
  type RadarSuggestion,
} from "../../app/klip-radar";

const PublishModal = dynamic(
  () => import("../PublishModal").then((module) => module.PublishModal),
  { ssr: false },
);
const AudioLibrary = dynamic(
  () => import("../audio-library").then((module) => module.AudioLibrary),
  {
    ssr: false,
    loading: () => <p role="status">Carregando biblioteca de áudio…</p>,
  },
);
const EffectsGallery = dynamic(
  () => import("../effects").then((module) => module.EffectsGallery),
  {
    ssr: false,
    loading: () => <p role="status">Carregando galeria de efeitos…</p>,
  },
);

type ExportFormat = "mp4" | "webm";
type ExportAspect =
  "original" | "vertical" | "portrait" | "landscape" | "square";
export type KlipAppTheme = "dark" | "light";
// Source-contract markers used by the regression suite: "Identity:0", "Identity_1:0", "Identity_2:0".
// Radar guarantee: Nada altera o arquivo original.
// Segmentation worker contract: worker.postMessage({ type: "segment", frame: inferenceCanvas
// Adaptive segmentation contract: inferenceDuration > 95 ? 384
// Editor guidance: Arraste diretamente na prévia ou faça o ajuste preciso aqui.
// Inspector label contract: Horizontal · {Math.round(selectedIllustration.x)}%
// Drag payloads: application/x-klip-transition", "flash"; application/x-klip-transition", "noise"; application/x-klip-transition", "wipe".

export type EditorClip = {
  url: string;
  name: string;
  autoAnalyze?: boolean;
  source?: Blob;
};
const PROJECT_FILE_VERSION = 7;
const MAX_PROJECT_FILE_BYTES = 5 * 1024 * 1024;
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
  onTrack?: (track: {
    present: boolean;
    codec: string;
    decodable: boolean;
  }) => void,
): Promise<{ values: number[]; codec: string; decodable: boolean }> {
  const { ALL_FORMATS, AudioSampleSink, BlobSource, Input } =
    await import("mediabunny");
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(blob),
  });
  if (!(await input.canRead())) {
    onTrack?.({ present: false, codec: "desconhecido", decodable: false });
    return { values: [], codec: "desconhecido", decodable: false };
  }
  const track = await input.getPrimaryAudioTrack();
  if (!track) {
    onTrack?.({ present: false, codec: "sem áudio", decodable: false });
    return { values: [], codec: "sem áudio", decodable: false };
  }
  const codec =
    (await track.getCodecParameterString()) ||
    (await track.getCodec()) ||
    "desconhecido";
  const decodable = await track.canDecode();
  onTrack?.({ present: true, codec, decodable });
  if (!decodable) return { values: [], codec, decodable };

  const duration =
    (await track.getDurationFromMetadata()) || (await track.computeDuration());
  if (!Number.isFinite(duration) || duration <= 0)
    return { values: [], codec, decodable };

  // Sparse sampling avoids decoding a long recording into one giant AudioBuffer.
  // AudioContext frequently rejects an MP4 container even when its AAC track is
  // playable; Mediabunny demuxes the audio track before asking WebCodecs to decode.
  const count = Math.max(96, Math.min(720, Math.round(bars)));
  const sink = new AudioSampleSink(track);
  const values: number[] = [];
  const timestamps = Array.from({ length: count }, (_, index) =>
    Math.max(0, Math.min(duration - 0.001, ((index + 0.5) / count) * duration)),
  );
  for await (const sample of sink.samplesAtTimestamps(timestamps)) {
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
  // Some browsers can identify the audio track in very large MP4 files but
  // stop random-access decoding after the first sample. One isolated bar looks
  // like a broken waveform, so keep the honest codec-presence state instead.
  // The iterator contract yields one item (including null) per requested
  // timestamp. A shorter result means decoding stopped midway; rendering that
  // prefix would falsely make the audio look shorter than the video.
  if (values.length !== count)
    return { values: [], codec, decodable };
  return { values, codec, decodable };
}

const TRANSCRIPTION_AUDIO_BITRATE = 32_000;
const TRANSCRIPTION_CHUNK_SECONDS = 8 * 60;
const LOCAL_TRANSCRIPTION_CHUNK_SECONDS = 90;
const TRANSCRIPTION_CHUNK_OVERLAP_SECONDS = 0.4;
const TRANSCRIPTION_UPLOAD_LIMIT = 3.75 * 1024 * 1024;
const MAX_IN_MEMORY_AUDIO_BYTES = 96 * 1024 * 1024;
const MAX_RECOVERY_ASSET_BYTES = 512 * 1024 * 1024;
const LARGE_WAVEFORM_BYTES = 512 * 1024 * 1024;
const VERY_LARGE_WAVEFORM_BYTES = 2 * 1024 * 1024 * 1024;

type TranscriptionAudioPlan = {
  duration: number;
  codec: "opus" | "aac";
  extension: ".webm" | ".mp4";
  mimeType: "audio/webm" | "audio/mp4";
};

type TranscriptionMediaInput = import("mediabunny").Input;

function clampAudioTimestampRounding(
  sample: import("mediabunny").AudioSample,
) {
  // Container timescales can turn an exact trim boundary into a microscopic
  // negative float (for example -1e-13). It is zero, not invalid media.
  if (sample.timestamp < 0 && sample.timestamp > -0.000_001)
    sample.setTimestamp(0);
  return sample;
}

async function inspectTranscriptionAudio(blob: Blob, durationHint = 0) {
  const { ALL_FORMATS, BlobSource, Input } = await import("mediabunny");
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(blob),
  });
  if (!(await input.canRead()))
    throw new Error(
      "O KLIP não conseguiu abrir este contêiner para extrair o áudio.",
    );
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new Error("Este vídeo não possui uma faixa de áudio.");
  if (!(await track.canDecode())) {
    const codec =
      (await track.getCodecParameterString()) ||
      (await track.getCodec()) ||
      "desconhecido";
    throw new Error(
      `O áudio usa o codec ${codec}, que este navegador não consegue extrair. Tente o Chrome atualizado ou converta somente o áudio para AAC/Opus.`,
    );
  }
  const metadataDuration = await track.getDurationFromMetadata();
  const trustedDurationHint =
    Number.isFinite(durationHint) && durationHint > 0 ? durationHint : 0;
  // computeDuration may scan the packet table of a multi-gigabyte MP4. The
  // editor already obtained the source duration from media metadata, so reuse
  // that value when the container does not expose a fast duration.
  const duration =
    (typeof metadataDuration === "number" &&
    Number.isFinite(metadataDuration) &&
    metadataDuration > 0
      ? metadataDuration
      : trustedDurationHint) || (await track.computeDuration());
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error("Não foi possível determinar a duração do áudio.");
  return { duration, input };
}

async function createTranscriptionAudioPlan(
  blob: Blob,
  inspected?: { duration: number },
): Promise<TranscriptionAudioPlan> {
  const { Quality, canEncodeAudio } = await import("mediabunny");
  const { duration } = inspected || (await inspectTranscriptionAudio(blob));

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
  reusableInput?: TranscriptionMediaInput,
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
  const input =
    reusableInput ||
    new Input({
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
      process: clampAudioTimestampRounding,
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

async function extractLocalTranscriptionPcmChunk(
  blob: Blob,
  start: number,
  end: number,
  onProgress?: (progress: number) => void,
  reusableInput?: TranscriptionMediaInput,
) {
  const {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    Conversion,
    Input,
    Output,
    WavOutputFormat,
  } = await import("mediabunny");
  const input =
    reusableInput ||
    new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(blob),
    });
  const target = new BufferTarget();
  const output = new Output({ format: new WavOutputFormat(), target });
  const conversion = await Conversion.init({
    input,
    output,
    tracks: "primary",
    trim: { start, end },
    video: { discard: true },
    audio: {
      codec: "pcm-f32",
      numberOfChannels: 1,
      sampleRate: 16_000,
      forceTranscode: true,
      process: clampAudioTimestampRounding,
    },
    showWarnings: false,
  });
  if (!conversion.isValid)
    throw new Error(
      "Não foi possível preparar o áudio PCM para a transcrição local.",
    );
  conversion.onProgress = (progress) => onProgress?.(progress);
  await conversion.execute();
  if (!target.buffer?.byteLength)
    throw new Error("A extração local retornou um trecho de áudio vazio.");
  return parseFloat32Wave(target.buffer);
}

async function waitBeforeTranscriptionRetry(signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, 850);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Transcrição cancelada.", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function requestTranscriptionChunk(
  form: FormData,
  signal: AbortSignal,
  onRetry: (message: string) => void,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
        signal,
      });
      const retryable = response.status === 429 || response.status >= 500;
      if (attempt === 0 && retryable) {
        onRetry(
          response.status === 429
            ? "O serviço está ocupado; repetindo este bloco uma vez…"
            : "O serviço oscilou; repetindo este bloco uma vez…",
        );
        await waitBeforeTranscriptionRetry(signal);
        continue;
      }
      return response;
    } catch (error) {
      if (signal.aborted) throw error;
      if (attempt === 0 && error instanceof TypeError) {
        onRetry("A conexão oscilou; repetindo este bloco uma vez…");
        await waitBeforeTranscriptionRetry(signal);
        continue;
      }
      throw error;
    }
  }
  throw new Error("O serviço de legendas não respondeu após duas tentativas.");
}
type EditorSnapshot = {
  layers: TextLayer[];
  illustrations: IllustrationLayer[];
  audioTracks: AudioTrack[];
  duration: number;
  start: number;
  end: number;
  primaryTimelineStart: number;
  videoFadeIn: number;
  videoFadeOut: number;
  videoFadeInAt: number;
  videoFadeOutAt: number;
  transitionColor: "black" | "white";
  transitionKind: AppliedTransitionKind;
  videoTransform: { x: number; y: number; scaleX: number; scaleY: number };
  visualPreset: VisualPreset;
  visualEffect: VisualEffectApplication | null;
  visualEffectIntensity: number;
  audioGain: number;
  audioEnhance: boolean;
  exportAspect: ExportAspect;
  exportResolution: "source" | "1080" | "720";
  exportFps: number;
  exportBitrate: "standard" | "high" | "ultra";
  exportFormat: ExportFormat;
  selectedSocialPresetId: SocialPresetId;
  safeGuides: boolean;
  snapEnabled: boolean;
  markers: number[];
  radarSuggestions: RadarSuggestion[];
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
  transitionKind: AppliedTransitionKind;
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
  | "limited"
  | "error"
  | "idle";
type VisualPreset = "clean" | "cinematic" | "vivid" | "mono" | "warm";
type StudioPanel = "formats" | "audio" | "effects";
type CaptionEngine = "local" | "cloud";
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
const mimeForExport = (format: ExportFormat, includeAudio = true) => {
  if (typeof MediaRecorder === "undefined") return null;
  if (format === "mp4") {
    const mp4 = includeAudio
      ? "video/mp4;codecs=avc1.42E01E,mp4a.40.2"
      : "video/mp4;codecs=avc1.42E01E";
    return MediaRecorder.isTypeSupported(mp4)
      ? mp4
      : MediaRecorder.isTypeSupported("video/mp4")
        ? "video/mp4"
        : null;
  }
  const vp9 = includeAudio
    ? "video/webm;codecs=vp9,opus"
    : "video/webm;codecs=vp9";
  return MediaRecorder.isTypeSupported(vp9) ? vp9 : "video/webm";
};
export default function ClipEditor({
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
      useState<AppliedTransitionKind>("fade-black"),
    [visualPreset, setVisualPreset] = useState<VisualPreset>("clean"),
    [visualEffect, setVisualEffect] = useState<VisualEffectApplication | null>(
      null,
    ),
    [visualEffectPreview, setVisualEffectPreview] =
      useState<VisualEffectApplication | null>(null),
    [visualEffectIntensity, setVisualEffectIntensity] = useState(1),
    [studioPanel, setStudioPanel] = useState<StudioPanel | null>(null),
    [activeTool, setActiveTool] = useState<EditorTool>("media"),
    [toolPanelOpen, setToolPanelOpen] = useState(
      () =>
        !(
          initialClip &&
          typeof window !== "undefined" &&
          window.matchMedia("(max-width: 760px)").matches
        ),
    ),
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
    [captionEngine, setCaptionEngine] = useState<CaptionEngine>("local"),
    [transcribing, setTranscribing] = useState(false),
    [transcriptionProgress, setTranscriptionProgress] = useState(0),
    [transcriptionElapsedSeconds, setTranscriptionElapsedSeconds] = useState(0),
    [transcriptionBlock, setTranscriptionBlock] = useState({
      current: 0,
      total: 0,
    }),
    [transcriptionPhase, setTranscriptionPhase] = useState<
      | "idle"
      | "preparing"
      | "loading-model"
      | "local-transcribing"
      | "uploading"
      | "transcribing"
      | "translating"
      | "finalizing"
    >("idle"),
    [detectedCaptionLanguage, setDetectedCaptionLanguage] = useState(""),
    [captionTargetLanguage, setCaptionTargetLanguage] = useState<
      "original" | "en" | "es"
    >("original"),
    [timelineThumbnails, setTimelineThumbnails] = useState<string[]>([]),
    [snapEnabled, setSnapEnabled] = useState(true),
    [markers, setMarkers] = useState<number[]>([]),
    [timelineZoom, setTimelineZoom] = useState(1),
    [timelineHeight, setTimelineHeight] = useState(260),
    [safeGuides, setSafeGuides] = useState(false),
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
  const transcriptionAbort = useRef<AbortController | null>(null);
  const transcriptionStartedAt = useRef(0);
  const selected =
    layers.find((layer) => layer.id === selectedId) ??
    (!selectedIllustrationId && !selectedAudioId ? layers[0] : undefined);
  const selectedIllustration = illustrations.find(
    (item) => item.id === selectedIllustrationId,
  );
  const selectedAudio = audioTracks.find(
    (track) => track.id === selectedAudioId,
  );
  const previewAspect =
    exportAspect === "original"
      ? sourceAspect
      : exportAspect === "vertical"
        ? 9 / 16
        : exportAspect === "portrait"
          ? 4 / 5
          : exportAspect === "landscape"
            ? 16 / 9
            : 1;
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
    ? `${transcriptionBlock.total ? `Bloco ${transcriptionBlock.current}/${transcriptionBlock.total} · ` : ""}${Math.round(transcriptionProgress)}%`
    : captionTargetLanguage !== "original"
      ? "Transcrever e traduzir"
      : detectedCaptionLanguageName
        ? `Gerar legenda · ${detectedCaptionLanguageName}`
        : "Detectar idioma e gerar legendas";
  const transcriptionPhaseLabel = {
    idle: "",
    preparing:
      captionEngine === "local"
        ? "Preparando somente o áudio neste dispositivo…"
        : "Extraindo e compactando o áudio neste dispositivo…",
    "loading-model": "Carregando o Whisper local no navegador…",
    "local-transcribing": "Whisper transcrevendo neste dispositivo…",
    uploading: "Enviando somente este bloco de áudio…",
    transcribing:
      captionTargetLanguage === "original"
        ? "Enviando o bloco e aguardando a transcrição por IA…"
        : "Enviando o bloco e aguardando transcrição e tradução por IA…",
    translating: "Finalizando a tradução e preservando os tempos…",
    finalizing: "Criando a faixa de legendas…",
  }[transcriptionPhase];
  const transcriptionElapsedLabel = `${Math.floor(transcriptionElapsedSeconds / 60)}:${String(transcriptionElapsedSeconds % 60).padStart(2, "0")}`;
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
  const captionTimelineSourceRanges = hasMontageTimeline
    ? montageTimelineClips.map((item) => ({
        sourceStart: item.start,
        sourceEnd: item.end,
        timelineStart: item.timelineStart,
      }))
    : [
        {
          sourceStart: baseDuration > 0 ? primarySourceStart : 0,
          sourceEnd: baseDuration > 0 ? primarySourceEnd : 0,
          timelineStart: primaryClipStart,
        },
      ];
  const captionMergedSourceRanges = mergeCaptionSourceRanges(
    captionTimelineSourceRanges,
    baseDuration,
  );
  const captionSourceSeconds = captionMergedSourceRanges.reduce(
    (total, range) => total + range.end - range.start,
    0,
  );
  const captionChunkSeconds =
    captionEngine === "local"
      ? LOCAL_TRANSCRIPTION_CHUNK_SECONDS
      : TRANSCRIPTION_CHUNK_SECONDS;
  const captionEstimatedBlocks = baseDuration
    ? buildCaptionTranscriptionJobs(
        captionTimelineSourceRanges,
        baseDuration,
        captionChunkSeconds,
        TRANSCRIPTION_CHUNK_OVERLAP_SECONDS,
      ).length
    : 0;
  const illustrationElements = useRef<
    Map<string, HTMLImageElement | HTMLVideoElement>
  >(new Map());
  const audioElements = useRef<Map<string, HTMLAudioElement>>(new Map());
  const managedAudioUrls = useRef<Set<string>>(new Set());
  const studioDialog = useRef<HTMLElement | null>(null);
  const stageViewport = useRef<HTMLDivElement | null>(null);
  const stageCanvas = useRef<HTMLDivElement | null>(null);
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
    latestTimelineStart: number;
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
  const largeMediaNoticeShown = useRef(false);
  const recoveryObjectUrls = useRef<Set<string>>(new Set());
  const interactionFrame = useRef<number | null>(null);
  const pendingInteractionUpdate = useRef<(() => void) | null>(null);

  const scheduleInteractionUpdate = (update: () => void) => {
    pendingInteractionUpdate.current = update;
    if (interactionFrame.current !== null) return;
    interactionFrame.current = window.requestAnimationFrame(() => {
      interactionFrame.current = null;
      const pending = pendingInteractionUpdate.current;
      pendingInteractionUpdate.current = null;
      pending?.();
    });
  };

  const flushInteractionUpdate = () => {
    if (interactionFrame.current !== null) {
      window.cancelAnimationFrame(interactionFrame.current);
      interactionFrame.current = null;
    }
    const pending = pendingInteractionUpdate.current;
    pendingInteractionUpdate.current = null;
    pending?.();
  };

  const releaseManagedAudioUrls = () => {
    managedAudioUrls.current.forEach((url) => URL.revokeObjectURL(url));
    managedAudioUrls.current.clear();
  };

  useEffect(() => () => releaseManagedAudioUrls(), []);
  useEffect(
    () => () => {
      if (interactionFrame.current !== null)
        window.cancelAnimationFrame(interactionFrame.current);
      interactionFrame.current = null;
      pendingInteractionUpdate.current = null;
    },
    [],
  );
  useEffect(
    () => () => {
      transcriptionAbort.current?.abort();
    },
    [],
  );

  const buildRecoveryProject = (): EditorRecoveryProject | null =>
    clip
      ? {
          version: 1,
          clip: {
            url: clip.url,
            name: clip.name,
            ...(clip.autoAnalyze ? { autoAnalyze: true } : {}),
          },
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
    const retainedAssetIds = Array.from(
      new Set(
        references
          .map((reference) => reference.url)
          .filter((url): url is string => Boolean(url?.startsWith("blob:"))),
      ),
    );
    const assets: EditorRecoveryAsset[] = [];
    for (const reference of references) {
      if (
        !reference.url?.startsWith("blob:") ||
        persistedRecoveryAssets.current.has(reference.url)
      )
        continue;
      const response = await fetch(reference.url);
      if (!response.ok)
        throw new Error("Não foi possível guardar a mídia local.");
      assets.push({
        id: reference.url,
        blob: await response.blob(),
        name: reference.name,
      });
    }
    return { assets, retainedAssetIds };
  }

  async function saveRecoveryNow() {
    if (!autosaveReady.current) return;
    if (clip?.source && clip.source.size > MAX_RECOVERY_ASSET_BYTES) {
      setAutosaveStatus("limited");
      if (!largeMediaNoticeShown.current) {
        largeMediaNoticeShown.current = true;
        setNotice(
          "Arquivo grande: o KLIP não copiará o vídeo para o salvamento automático. Use “Salvar projeto” para guardar cortes e ajustes.",
        );
      }
      return;
    }
    if (autosaveRunning.current) {
      autosaveQueued.current = true;
      return;
    }
    const project = buildRecoveryProject();
    if (!project) return;
    autosaveRunning.current = true;
    setAutosaveStatus("saving");
    try {
      const { assets, retainedAssetIds } = await collectRecoveryAssets(project);
      await saveEditorRecovery(project, assets, retainedAssetIds);
      persistedRecoveryAssets.current = new Set(retainedAssetIds);
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
        const restoredLayers = sanitizeTextLayers(
          project.layers,
          Math.max(project.duration || 0, project.end || 0, 0.1),
        );
        if (cancelled) return;
        history.current = [];
        future.current = [];
        setClip({ ...project.clip, url: clipUrl });
        if (window.matchMedia("(max-width: 760px)").matches)
          setToolPanelOpen(false);
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
        setTransitionKind(
          normalizeAppliedTransitionKind(project.transitionKind),
        );
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
        setSafeGuides(project.safeGuides === true);
        setMarkers(project.markers || []);
        setTimelineZoom(project.timelineZoom || 1);
        setTimelineHeight(project.timelineHeight || 260);
        setLayers(restoredLayers);
        setIllustrations(restoredIllustrations);
        setRadarMode(project.radarMode || "reels");
        setRadarCount(project.radarCount || 10);
        setRadarSuggestions(
          sanitizeRadarSuggestions(
            project.radarSuggestions,
            project.sourceDuration || project.duration,
          ),
        );
        setApprovedCuts(
          sanitizeRadarSuggestions(
            project.approvedCuts,
            project.sourceDuration || project.duration,
          ),
        );
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
    const viewport = stageViewport.current;
    const canvas = stageCanvas.current;
    if (!clip || !viewport || !canvas) return;
    const fitPreview = () => {
      const bounds = viewport.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      let width = bounds.width;
      let height = width / Math.max(0.01, previewAspect);
      if (height > bounds.height) {
        height = bounds.height;
        width = height * previewAspect;
      }
      canvas.style.setProperty(
        "width",
        `${Math.max(1, Math.floor(width))}px`,
        "important",
      );
      canvas.style.setProperty(
        "height",
        `${Math.max(1, Math.floor(height))}px`,
        "important",
      );
      canvas.style.setProperty(
        "--preview-pixel-scale",
        String(Math.max(1, Math.min(width, height)) / 1_080),
      );
    };
    fitPreview();
    const observer = new ResizeObserver(fitPreview);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [clip, previewAspect]);

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
      // Effects use a contextual drawer: the editor and its playback controls
      // remain available behind it, so focus must not be trapped as in a modal.
      if (studioPanel === "effects") return;
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
      const audible = !track.muted && (!soloAudioActive || Boolean(track.solo));
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
    if (!transcribing) return;
    const updateElapsed = () =>
      setTranscriptionElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - transcriptionStartedAt.current) / 1000)),
      );
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [transcribing]);

  useEffect(() => {
    if (!clip) return;
    let cancelled = false;
    let waveformReady = false;
    let audioTrackConfirmed = false;
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
        if (!cancelled && !waveformReady && !audioTrackConfirmed)
          setBaseAudioState(state);
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
    // Playback only needs metadata and can confirm the audio track immediately.
    // The waveform is a separate, heavier background job for large containers.
    probePlayableAudio();
    void (async () => {
      try {
        let blob: Blob;
        if (clip.source) blob = clip.source;
        else {
          const response = await fetch(clip.url);
          if (!response.ok) throw new Error("media-load");
          blob = await response.blob();
        }
        let values: number[] = [];
        const waveformBars =
          blob.size >= VERY_LARGE_WAVEFORM_BYTES
            ? 120
            : blob.size >= LARGE_WAVEFORM_BYTES
              ? 280
              : 720;
        const extracted = await buildContainerAudioWaveform(
          blob,
          waveformBars,
          (track) => {
            if (cancelled) return;
            setBaseAudioCodec(track.codec);
            if (track.present) {
              audioTrackConfirmed = true;
              setBaseAudioState("detected");
            } else if (!waveformReady) {
              setBaseAudioState("none");
            }
          },
        );
        values = extracted.values;
        if (!values.length && blob.size <= MAX_IN_MEMORY_AUDIO_BYTES) {
          try {
            values = await buildAudioWaveform(await blob.arrayBuffer(), 1200);
          } catch {
            // Playback probing below provides the final fallback for codecs
            // unavailable to WebCodecs and AudioContext.
          }
        }
        // A decoder may return one token sample for an unsupported or
        // zero-duration container. Never promote that artifact to a waveform.
        const minimumDisplayedSamples = Math.min(
          24,
          Math.max(8, Math.round(waveformBars * 0.08)),
        );
        if (values.length < minimumDisplayedSamples) values = [];
        if (!cancelled) {
          waveformReady = values.length > 0;
          setWaveform(values);
          if (values.length) setBaseAudioState("waveform");
        }
      } catch {
        // The metadata probe already established whether playback audio exists.
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
    let lastPublishedAt = 0;
    let lastPublishedTime = -1;
    const update = () => {
      if (
        !exportInProgress.current &&
        !player.paused &&
        Number.isFinite(player.currentTime)
      ) {
        const now = performance.now();
        const timelineTime = baseLoopOffset.current + player.currentTime;
        // The editor used to rerender its complete workspace on every decoded
        // video frame. Fifteen UI updates per second keep the playhead, effects,
        // and captions visually fluid while leaving headroom for decoding.
        if (
          now - lastPublishedAt >= 1000 / 15 &&
          Math.abs(timelineTime - lastPublishedTime) >= 1 / 120
        ) {
          lastPublishedAt = now;
          lastPublishedTime = timelineTime;
          setCurrent(timelineTime);
        }
      }
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
    duration,
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
    visualPreset,
    visualEffect,
    visualEffectIntensity,
    audioGain,
    audioEnhance,
    exportAspect,
    exportResolution,
    exportFps,
    exportBitrate,
    exportFormat,
    selectedSocialPresetId,
    safeGuides,
    snapEnabled,
    markers,
    radarSuggestions,
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
    setDuration(item.duration);
    setStart(item.start);
    setEnd(item.end);
    setPrimaryTimelineStart(item.primaryTimelineStart || 0);
    setVideoFadeIn(item.videoFadeIn);
    setVideoFadeOut(item.videoFadeOut);
    setVideoFadeInAt(item.videoFadeInAt);
    setVideoFadeOutAt(item.videoFadeOutAt);
    setTransitionColor(item.transitionColor);
    setTransitionKind(normalizeAppliedTransitionKind(item.transitionKind));
    setVideoTransform(item.videoTransform);
    setVisualPreset(item.visualPreset);
    setVisualEffect(item.visualEffect || null);
    setVisualEffectIntensity(item.visualEffectIntensity || 1);
    setAudioGain(item.audioGain);
    setAudioEnhance(item.audioEnhance);
    setExportAspect(item.exportAspect);
    setExportResolution(item.exportResolution);
    setExportFps(item.exportFps);
    setExportBitrate(item.exportBitrate);
    setExportFormat(item.exportFormat);
    setSelectedSocialPresetId(item.selectedSocialPresetId);
    setSafeGuides(item.safeGuides);
    setSnapEnabled(item.snapEnabled);
    setMarkers(item.markers);
    setRadarSuggestions(item.radarSuggestions);
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
  const layerEditTime = (layer: TimedLayer) =>
    Math.max(
      layer.start,
      Math.min(
        layer.end - 0.01,
        layer.start + Math.max(0.05, Math.min(0.15, layer.fadeIn * 0.6)),
      ),
    );
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
  const transitionOverlayStyle = (transition: {
    opacity: number;
    color: "black" | "white";
    kind: AppliedTransitionKind;
  }): React.CSSProperties => {
    if (transition.kind === "wipe")
      return {
        opacity: 1,
        backgroundColor: "#05070b",
        clipPath: `inset(0 ${Math.max(0, (1 - transition.opacity) * 100)}% 0 0)`,
      };
    if (transition.kind === "noise")
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
    remember();
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
    setSafeGuides(false);
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
    // On phones the tools are a bottom sheet. Once media is ready, reveal the
    // first frame instead of leaving that sheet over the preview.
    if (window.matchMedia("(max-width: 760px)").matches)
      setToolPanelOpen(false);
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
    setTranscriptionBlock({ current: 0, total: 0 });
    setRadarSuggestions([]);
    setApprovedCuts([]);
    setActiveRadarCutId("");
    setRadarProgress(0);
    setRadarStatus("Pronto para analisar");
    autoRadarAnalyzed.current = false;
    largeMediaNoticeShown.current = false;
    setAutosaveStatus("idle");
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
        const generatedBlob = new Blob(chunks, { type: mime });
        const generated = {
          url: URL.createObjectURL(generatedBlob),
          name: `${file.name.replace(/\.[^.]+$/, "")} · foto animada`,
          source: generatedBlob,
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
        source: file,
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
  async function detectSilence() {
    if (!clip) return;
    let sourceBlob: Blob | null = clip.source || null;
    try {
      setNotice("Analisando o áudio para sugerir um corte…");
      if (!sourceBlob) {
        const response = await fetch(clip.url);
        if (!response.ok) throw new Error("media-load");
        sourceBlob = await response.blob();
      }
      if (sourceBlob.size > MAX_IN_MEMORY_AUDIO_BYTES)
        throw new Error("large-source");
      const buffer = await sourceBlob.arrayBuffer();
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
        let blob: Blob;
        if (sourceBlob) blob = sourceBlob;
        else {
          const response = await fetch(clip.url);
          if (!response.ok) throw new Error("media-load");
          blob = await response.blob();
        }
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
        captionOrigin: "imported",
      }));
      setLayers((items) => [...items, ...made]);
      setSelectedId(made[0]?.id || "");
      setInspectorTab("captions");
      setActiveTool("captions");
      setToolPanelOpen(true);
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
    const captions = mapCaptionsToTimeline(
      segments,
      captionTimelineSourceRanges,
      editorTimelineDuration || duration,
      { maxCharactersPerLine: 24, maxLines: 2 },
    ).map((item): TextLayer => ({
      ...initialLayer(),
      id: crypto.randomUUID(),
      text: item.text,
      start: item.start,
      end: item.end,
      y: 82,
      size: 52,
      effect: "pop",
      background: true,
      kind: "caption",
      captionOrigin: "generated",
    }));
    if (!captions.length) throw new Error("Nenhuma fala foi encontrada.");
    remember();
    setLayers((items) => [
      ...items.filter((item) => item.captionOrigin !== "generated"),
      ...captions,
    ]);
    setSelectedId(captions[0].id);
    setInspectorTab("captions");
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
    transcriptionStartedAt.current = Date.now();
    setTranscriptionElapsedSeconds(0);
    setTranscriptionPhase("preparing");
    setTranscriptionProgress(2);
    setTranscriptionBlock({ current: 0, total: 0 });
    setNotice("Abrindo o arquivo e localizando a faixa de áudio, sem enviar o vídeo…");
    const abortController = new AbortController();
    const localTranscriptionSession =
      captionEngine === "local"
        ? createLocalTranscriptionSession(abortController.signal)
        : null;
    transcriptionAbort.current = abortController;
    try {
      if (captionEngine === "cloud" && !navigator.onLine)
        throw new Error(
          "Você está sem conexão. Reconecte-se para gerar as legendas.",
        );
      let source: Blob;
      if (clip.source) source = clip.source;
      else {
        const response = await fetch(clip.url, {
          signal: abortController.signal,
        });
        if (!response.ok)
          throw new Error(
            "Não foi possível preparar o vídeo para transcrição.",
          );
        source = await response.blob();
      }
      if (!source.size)
        throw new Error("O vídeo não contém dados que possam ser transcritos.");
      const inspectedAudio = await inspectTranscriptionAudio(
        source,
        baseDuration || duration,
      );
      setTranscriptionProgress(4);
      setNotice(
        `Faixa de áudio encontrada · ${Math.ceil(inspectedAudio.duration / 60)} min. Organizando os blocos locais…`,
      );
      const cloudPlan =
        captionEngine === "cloud"
          ? await createTranscriptionAudioPlan(source, inspectedAudio)
          : null;
      const sourceRanges = captionTimelineSourceRanges.some(
        (range) => range.sourceEnd - range.sourceStart >= 0.04,
      )
        ? captionTimelineSourceRanges
        : [
            {
              sourceStart: 0,
              sourceEnd: inspectedAudio.duration,
              timelineStart: 0,
            },
          ];
      const transcriptionJobs = buildCaptionTranscriptionJobs(
        sourceRanges,
        inspectedAudio.duration,
        captionChunkSeconds,
        TRANSCRIPTION_CHUNK_OVERLAP_SECONDS,
      );
      if (!transcriptionJobs.length)
        throw new Error("O trecho usado na timeline não contém áudio suficiente.");
      const totalChunks = transcriptionJobs.length;
      setTranscriptionBlock({ current: 0, total: totalChunks });
      const allSegments: Array<{
        start: number;
        end: number;
        text: string;
      }> = [];
      const translationWarnings = new Set<string>();
      let detectedLanguage = "";

      for (let index = 0; index < totalChunks; index++) {
        if (abortController.signal.aborted)
          throw new DOMException("Transcrição cancelada.", "AbortError");
        const { logicalStart, logicalEnd, extractionStart } =
          transcriptionJobs[index];
        setTranscriptionBlock({ current: index + 1, total: totalChunks });
        const chunkBaseProgress = 5 + (index / totalChunks) * 88;
        const chunkProgressSpan = 88 / totalChunks;
        setTranscriptionPhase("preparing");
        setNotice(
          totalChunks === 1
            ? "Preparando somente o áudio…"
            : `Preparando áudio — bloco ${index + 1} de ${totalChunks}…`,
        );
        let chunkSegments: Array<{
          start: number;
          end: number;
          text: string;
        }> = [];

        if (captionEngine === "local") {
          const pcm = await extractLocalTranscriptionPcmChunk(
            source,
            extractionStart,
            logicalEnd,
            (progress) =>
              setTranscriptionProgress(
                Math.round(
                  chunkBaseProgress + progress * chunkProgressSpan * 0.34,
                ),
              ),
            inspectedAudio.input,
          );
          setWaveform((currentWaveform) =>
            mergePcmChunkIntoWaveform(
              currentWaveform,
              pcm,
              extractionStart,
              logicalEnd,
              inspectedAudio.duration,
            ),
          );
          setBaseAudioState("waveform");
          if (abortController.signal.aborted)
            throw new DOMException("Transcrição cancelada.", "AbortError");
          setTranscriptionPhase("loading-model");
          if (!localTranscriptionSession)
            throw new Error("A sessão do Whisper local não foi iniciada.");
          const localResult = await localTranscriptionSession.transcribe(pcm, {
            targetLanguage:
              captionTargetLanguage === "en" ? "en" : "original",
            onProgress: (status) => {
              if (status.phase === "loading-runtime") {
                setTranscriptionPhase("loading-model");
                setNotice(
                  `Bloco ${index + 1} de ${totalChunks}: preparando o Whisper local…`,
                );
              } else if (status.phase === "loading-model") {
                setTranscriptionPhase("loading-model");
                setTranscriptionProgress(
                  Math.round(
                    chunkBaseProgress +
                      chunkProgressSpan * (0.34 + (status.progress / 100) * 0.18),
                  ),
                );
                setNotice(
                  `Bloco ${index + 1} de ${totalChunks}: carregando o modelo local · ${Math.round(status.progress)}%…`,
                );
              } else if (status.phase === "fallback-wasm") {
                setNotice(
                  `Bloco ${index + 1} de ${totalChunks}: GPU indisponível; continuando localmente pela CPU…`,
                );
              } else {
                setTranscriptionPhase("local-transcribing");
                setTranscriptionProgress(
                  Math.round(chunkBaseProgress + chunkProgressSpan * 0.56),
                );
                setNotice(
                  `Bloco ${index + 1} de ${totalChunks}: Whisper transcrevendo neste dispositivo…`,
                );
              }
            },
          });
          chunkSegments = localResult.segments;
        } else {
          if (!cloudPlan)
            throw new Error("O plano de transcrição em nuvem não foi preparado.");
          const audioChunk = await extractTranscriptionAudioChunk(
            source,
            cloudPlan,
            extractionStart,
            logicalEnd,
            (progress) =>
              setTranscriptionProgress(
                Math.round(
                  chunkBaseProgress + progress * chunkProgressSpan * 0.42,
                ),
              ),
            inspectedAudio.input,
          );
          if (abortController.signal.aborted)
            throw new DOMException("Transcrição cancelada.", "AbortError");
          setTranscriptionPhase("transcribing");
          setNotice(
            totalChunks === 1
              ? "Áudio compacto pronto; aguardando a transcrição em nuvem…"
              : `Bloco ${index + 1} de ${totalChunks}: aguardando a transcrição em nuvem…`,
          );
          setTranscriptionProgress(
            Math.round(chunkBaseProgress + chunkProgressSpan * 0.5),
          );
          const form = new FormData();
          form.append(
            "file",
            new File(
              [audioChunk],
              `klip-audio-${String(index + 1).padStart(3, "0")}${cloudPlan.extension}`,
              { type: cloudPlan.mimeType },
            ),
          );
          form.append("targetLanguage", captionTargetLanguage);
          if (detectedLanguage) form.append("language", detectedLanguage);
          form.append("chunkIndex", String(index));
          form.append("chunkCount", String(totalChunks));
          const response = await requestTranscriptionChunk(
            form,
            abortController.signal,
            (message) =>
              setNotice(`Bloco ${index + 1} de ${totalChunks}: ${message}`),
          );
          const responseText = await response.text();
          let result: {
            error?: string;
            segments?: Array<{ start: number; end: number; text: string }>;
            detectedLanguage?: string;
            translationWarning?: string;
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
          chunkSegments = result.segments || [];
        }

        for (const segment of chunkSegments) {
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
        error instanceof DOMException && error.name === "AbortError"
          ? "Transcrição cancelada. Nenhuma legenda foi alterada."
          : captionEngine === "local"
            ? friendlyLocalTranscriptionError(error)
          : error instanceof TypeError ||
              (error instanceof Error && /failed to fetch/i.test(error.message))
            ? "A conexão com o serviço de legendas falhou depois de duas tentativas. O vídeo e as legendas existentes não foram alterados."
            : error instanceof Error
              ? error.message
              : "Não foi possível gerar as legendas deste vídeo.";
      setNotice(message);
    } finally {
      localTranscriptionSession?.dispose();
      if (transcriptionAbort.current === abortController)
        transcriptionAbort.current = null;
      setTranscribing(false);
      transcriptionResetTimer.current = window.setTimeout(() => {
        setTranscriptionProgress(0);
        setTranscriptionPhase("idle");
        setTranscriptionBlock({ current: 0, total: 0 });
        transcriptionResetTimer.current = null;
      }, 900);
    }
  }
  function cancelAutomaticCaptions() {
    if (!transcriptionAbort.current) return;
    transcriptionAbort.current.abort();
    setNotice("Cancelando a transcrição com segurança…");
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
      version: PROJECT_FILE_VERSION,
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
      if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error("too-large");
      const project = JSON.parse(await file.text());
      if (!Array.isArray(project.layers)) throw new Error("invalid");
      if (
        Number.isFinite(project.version) &&
        (project.version < 1 || project.version > PROJECT_FILE_VERSION)
      )
        throw new Error("unsupported-version");
      const restoredStart = Number(project.start) || 0,
        restoredEnd = Number(project.end) || duration,
        restoredIn = Number(project.videoFadeIn) || 0,
        restoredOut = Number(project.videoFadeOut) || 0,
        legacyScale = Number(project.videoTransform?.scale) || 1;
      const restoredCuts = sanitizeRadarSuggestions(
        project.approvedCuts,
        sourceDuration || duration,
      ).map((item) => ({ ...item, selected: true }));
      const restoredProjectDuration = Math.max(
        duration,
        restoredEnd,
        ...restoredCuts.map(
          (item) =>
            (Number.isFinite(item.timelineStart)
              ? item.timelineStart || 0
              : 0) +
            item.end -
            item.start,
        ),
      );
      const restoredLayers = sanitizeTextLayers(
        project.layers,
        restoredProjectDuration,
      );
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
      const importedTransition = normalizeTransitionKind(
        project.transitionKind,
      );
      if (importedTransition && importedTransition !== "none")
        setTransitionKind(importedTransition);
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
      setLayers(restoredLayers);
      setRadarMode(
        ["reels", "shorts", "highlights"].includes(project.radarMode)
          ? project.radarMode
          : "reels",
      );
      setApprovedCuts(restoredCuts);
      setRadarSuggestions(restoredCuts);
      setSelectedId(restoredLayers[0]?.id || "");
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
      void addAudioTrack(file, undefined, item.end - item.start).then(
        (added) => {
          if (!added) return;
          setSelectedIllustrationId(item.id);
          setSelectedAudioId("");
        },
      );
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
        timelineTimeToSourceTime(
          {
            sourceStart: montageClip.start,
            sourceEnd: montageClip.end,
            timelineStart: montageClip.timelineStart,
          },
          safeValue,
        ),
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
        timelineTimeToSourceTime(
          {
            sourceStart: primarySourceStart,
            sourceEnd: primarySourceEnd,
            timelineStart: primaryClipStart,
          },
          value,
        ),
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
    scheduleInteractionUpdate(() => {
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
    });
  }
  function endTimelineTrim() {
    flushInteractionUpdate();
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
      latestTimelineStart: primaryClipStart,
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
    drag.latestTimelineStart = nextStart;
    scheduleInteractionUpdate(() => {
      setPrimaryTimelineStart(nextStart);
      setDuration((projectDuration) => Math.max(projectDuration, nextEnd));
      setSnapGuide(null);
    });
  }
  function endPrimaryTimelineMove(
    event: React.PointerEvent<HTMLButtonElement>,
    cancelled = false,
  ) {
    const drag = primaryTimelineDrag.current;
    flushInteractionUpdate();
    if (drag?.moved)
      setNotice(
        `Vídeo principal movido para ${time(drag.latestTimelineStart)}. O trecho cortado foi preservado.`,
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
    scheduleInteractionUpdate(() => {
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
    });
  }
  function endTimelineItemDrag() {
    flushInteractionUpdate();
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
    scheduleInteractionUpdate(() => {
      const patch = drag.edge === "in" ? { fadeIn: value } : { fadeOut: value };
      if (drag.kind === "text") updateLayer(drag.id, patch, false);
      else if (drag.kind === "illustration")
        updateIllustration(drag.id, patch, false);
      else updateAudioTrack(drag.id, patch, false);
    });
  }
  function endTimelineFadeDrag() {
    flushInteractionUpdate();
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
    const next = Math.max(
      0,
      Math.min(
        editorTimelineDuration,
        ((event.clientX - drag.left) / drag.width) * editorTimelineDuration,
      ),
    );
    scheduleInteractionUpdate(() => seek(next));
  }
  function endPlayheadDrag() {
    flushInteractionUpdate();
    playheadDrag.current = null;
  }
  function beginTransitionResize(
    event: React.PointerEvent<HTMLElement>,
    edge: "in" | "out",
  ) {
    if (!duration) return;
    event.preventDefault();
    event.stopPropagation();
    remember();
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
    scheduleInteractionUpdate(() => {
      if (resize.edge === "in") setVideoFadeIn(next);
      else setVideoFadeOut(next);
    });
  }
  function endTransitionResize() {
    flushInteractionUpdate();
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
    remember();
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
    scheduleInteractionUpdate(() => {
      if (moving.edge === "in") setVideoFadeInAt(next);
      else setVideoFadeOutAt(next);
    });
  }
  function endTransitionMove() {
    flushInteractionUpdate();
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
          timelineTimeToSourceTime(
            {
              sourceStart: montageClip.start,
              sourceEnd: montageClip.end,
              timelineStart: montageClip.timelineStart,
            },
            timelineTime,
          ),
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
          timelineTimeToSourceTime(
            {
              sourceStart: primarySourceStart,
              sourceEnd: primarySourceEnd,
              timelineStart: primaryClipStart,
            },
            at,
          ),
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
        clip.source || clip.url,
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
    } catch (error) {
      setRadarStatus(
        `${error instanceof Error ? error.message : "Não foi possível analisar este arquivo."} O vídeo original continua intacto.`,
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
    remember();
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
    scheduleInteractionUpdate(() =>
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
      ),
    );
  }
  function endRadarCutTrim() {
    flushInteractionUpdate();
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
    scheduleInteractionUpdate(() =>
      setApprovedCuts((items) =>
        items.map((item) =>
          item.id === drag.id ? { ...item, timelineStart: nextStart } : item,
        ),
      ),
    );
  }
  function endRadarCutMove(event?: React.PointerEvent<HTMLButtonElement>) {
    flushInteractionUpdate();
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
    event: React.DragEvent<HTMLDivElement>,
    item: RadarSuggestion,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const kind = normalizeTransitionKind(
      event.dataTransfer.getData("application/x-klip-transition"),
    );
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
    setInspectorTab("edit");
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
    remember();
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
    setInspectorTab("captions");
    seek(layerEditTime(layer));
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
    seek(layerEditTime(layer));
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
    const patch = {
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
    };
    scheduleInteractionUpdate(() => updateLayer(drag.id, patch, false));
  }
  function endLayerDrag() {
    flushInteractionUpdate();
    layerDrag.current = null;
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
    const patch = {
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
    };
    scheduleInteractionUpdate(() => updateIllustration(drag.id, patch, false));
  }
  function endIllustrationDrag() {
    flushInteractionUpdate();
    illustrationDrag.current = null;
    illustrationResize.current = null;
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
          resize.width + ((event.clientX - resize.startX) / bounds.width) * 100,
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
    const patch = {
      ...(resize.edge !== "bottom"
        ? { width: nextWidth, size: nextWidth }
        : {}),
      ...(resize.edge !== "right" ? { height: nextHeight } : {}),
    };
    scheduleInteractionUpdate(() =>
      updateIllustration(resize.id, patch, false),
    );
  }
  function endIllustrationResize() {
    flushInteractionUpdate();
    illustrationResize.current = null;
  }
  function beginVideoFrameDrag(event: React.PointerEvent<HTMLVideoElement>) {
    if (!clip) return;
    remember();
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
    const patch = {
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
    };
    scheduleInteractionUpdate(() =>
      setVideoTransform((currentFrame) => ({ ...currentFrame, ...patch })),
    );
  }
  function endVideoFrameDrag() {
    flushInteractionUpdate();
    videoFrameDrag.current = null;
  }
  function beginVideoFrameResize(
    event: React.PointerEvent<HTMLDivElement>,
    edge: "left" | "right" | "top" | "bottom" | "corner",
  ) {
    event.preventDefault();
    event.stopPropagation();
    remember();
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
    const patch = {
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
    };
    scheduleInteractionUpdate(() =>
      setVideoTransform((currentFrame) => ({ ...currentFrame, ...patch })),
    );
  }
  function endVideoFrameResize() {
    flushInteractionUpdate();
    videoFrameResize.current = null;
  }
  function applyTransition(kind: TransitionKind, edge: "in" | "out") {
    if (hasMontageTimeline && activeRadarCutId) {
      applyRadarTransition(activeRadarCutId, kind, edge);
      return;
    }
    remember();
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
    const kind = normalizeTransitionKind(
      event.dataTransfer.getData("application/x-klip-transition"),
    );
    if (kind) applyTransition(kind, edge);
  }
  function dropTransitionOnTimeline(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const kind = normalizeTransitionKind(
      event.dataTransfer.getData("application/x-klip-transition"),
    );
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
      fontSize: `calc(${layer.size}px * var(--preview-pixel-scale, 0.4))`,
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
      fadeInKind?: AppliedTransitionKind;
      fadeOutKind?: AppliedTransitionKind;
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
          audioTimelineStart: montageItem?.timelineStart ?? primaryClipStart,
          timelinePosition: montageItem?.timelineStart ?? primaryClipStart,
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
    const hasExportAudio =
      Boolean(captured?.getAudioTracks().length) ||
      exportTrackElements.length > 0;
    if (hasExportAudio)
      audioDestination.stream
        .getAudioTracks()
        .forEach((track) => output.addTrack(track));
    const mime =
      mimeForExport(exportFormat, hasExportAudio) ||
      mimeForExport("webm", hasExportAudio)!;
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
      lastReportedExportProgress = -1,
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
        timelineTime = sourceTimeToTimelineTime(
          {
            sourceStart: activeRange.start,
            sourceEnd: activeRange.end,
            timelineStart: activeRange.timelinePosition,
          },
          sourceTime,
        ),
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
      const nextExportProgress = Math.min(
        100,
        Math.round(
          ((completedMontageDuration + localTime) /
            Math.max(0.01, montageDuration)) *
            100,
        ),
      );
      if (nextExportProgress !== lastReportedExportProgress) {
        lastReportedExportProgress = nextExportProgress;
        setExportProgress(nextExportProgress);
      }
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
        const effectElapsedMs = timelineTime * 1000;
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
        montageRanges.length === 1 ? videoTransitionOpacity(timelineTime) : 0,
      );
      if (videoTransition > 0) {
        const montageWins =
          montageOpacity >=
          (montageRanges.length === 1
            ? videoTransitionOpacity(timelineTime)
            : 0);
        const activeTransitionKind = montageWins ? montageKind : transitionKind;
        context.fillStyle =
          montageOpacity >=
          (montageRanges.length === 1
            ? videoTransitionOpacity(timelineTime)
            : 0)
            ? montageColor === "black"
              ? "#000000"
              : "#ffffff"
            : transitionColor === "black"
              ? "#000000"
              : "#ffffff";
        context.globalAlpha =
          activeTransitionKind === "noise"
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
        if (activeTransitionKind === "noise") {
          context.fillStyle = "#ffffff";
          context.globalAlpha = videoTransition * 0.18;
          for (let y = 3; y < canvas.height; y += 14)
            for (let x = (y % 28) / 2; x < canvas.width; x += 14)
              context.fillRect(x, y, 2, 2);
        }
        context.globalAlpha = 1;
      }
      illustrations.forEach((item) => {
        const alpha = layerOpacity(item, timelineTime);
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
            Math.min(media.duration - 0.04, timelineTime - item.start),
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
        const alpha = layerOpacity(layer, timelineTime);
        if (!layer.text.trim() || alpha <= 0) return;
        const progress = effectProgress(layer, timelineTime);
        const scaleEffect =
          layer.effect === "pop"
            ? 0.68 + progress * 0.32
            : layer.effect === "zoom"
              ? 1.42 - progress * 0.42
              : layer.effect === "bounce"
                ? 0.75 + Math.sin(progress * Math.PI) * 0.22
                : 1;
        const slide = layer.effect === "slide" ? (1 - progress) * 180 : 0;
        const text = visibleText(layer, timelineTime);
        context.save();
        context.globalAlpha = alpha;
        const renderedTextSize = scaleTextLayerSize(
          layer.size,
          canvas.width,
          canvas.height,
        );
        const textMaxWidth = canvas.width * 0.86;
        context.font = `800 ${renderedTextSize}px ${layer.font}`;
        context.textAlign = layer.align;
        context.textBaseline = "middle";
        const x = (layer.x / 100) * canvas.width + slide,
          y = (layer.y / 100) * canvas.height;
        context.translate(x, y);
        context.scale(scaleEffect, scaleEffect);
        const lines = wrapCanvasText(context, text, textMaxWidth);
        const lineHeight = renderedTextSize * 1.12;
        const yOffset = -((lines.length - 1) * lineHeight) / 2;
        lines.forEach((line, index) => {
          const lineY = yOffset + index * lineHeight;
          if (layer.background) {
            const metrics = context.measureText(line);
            const horizontalPadding = renderedTextSize * 0.35;
            const left =
              layer.align === "center"
                ? -metrics.width / 2
                : layer.align === "right"
                  ? -metrics.width
                  : 0;
            context.fillStyle = "rgba(0,0,0,.72)";
            context.fillRect(
              left - horizontalPadding,
              lineY - renderedTextSize * 0.58,
              metrics.width + horizontalPadding * 2,
              renderedTextSize * 1.16,
            );
          }
          context.lineWidth = Math.max(1.5, renderedTextSize / 11);
          context.strokeStyle = "rgba(0,0,0,.76)";
          context.fillStyle = layer.color;
          context.strokeText(line, 0, lineY, textMaxWidth);
          context.fillText(line, 0, lineY, textMaxWidth);
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
    const nextHeight = Math.round(
      Math.max(
        200,
        Math.min(
          viewportLimit,
          resize.startHeight + resize.startY - event.clientY,
        ),
      ),
    );
    scheduleInteractionUpdate(() => setTimelineHeight(nextHeight));
  };
  const endTimelinePanelResize = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    flushInteractionUpdate();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    timelinePanelResize.current = null;
  };
  const autosaveLabel =
    autosaveStatus === "restoring"
      ? "Recuperando projeto…"
      : autosaveStatus === "saving"
        ? "Salvando…"
        : autosaveStatus === "limited"
          ? "Arquivo grande · salve o projeto"
        : autosaveStatus === "error"
          ? "Falha no salvamento local"
          : autosaveSavedAt
            ? `Salvo localmente · ${new Date(
                autosaveSavedAt,
              ).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}`
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
          <KlipAppLogo variant="full" width={104} height={24} />
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
                      onChange={(event) => {
                        remember();
                        setExportFormat(event.target.value as ExportFormat);
                      }}
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
                        remember();
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
                      onChange={(event) => {
                        remember();
                        setExportResolution(
                          event.target.value as "source" | "1080" | "720",
                        );
                      }}
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
                      onChange={(event) => {
                        remember();
                        setExportFps(Number(event.target.value));
                      }}
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
                      onChange={(event) => {
                        remember();
                        setExportBitrate(
                          event.target.value as "standard" | "high" | "ultra",
                        );
                      }}
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
        <div
          className="editor-recovery-loading"
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true" />
          <b>Recuperando seu projeto</b>
          <small>
            Vídeos, áudios, cortes e camadas estão sendo restaurados.
          </small>
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
        className={`editor-workspace ${clip ? "" : "editor-workspace-empty"} ${toolPanelOpen ? "" : "tools-collapsed"}`}
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
                  if (activeTool === tool && toolPanelOpen) {
                    setToolPanelOpen(false);
                    return;
                  }
                  setActiveTool(tool);
                  if (tool === "captions" || tool === "text")
                    setInspectorTab(selected ? "captions" : "edit");
                  else if (tool === "audio" && selectedAudio)
                    setInspectorTab("audio");
                  else setInspectorTab("edit");
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
                <details className="tool-disclosure project-management">
                  <summary>Projeto e recuperação</summary>
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
                </details>
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
                      <summary>Cor e filtros</summary>
                      <div className="visual-presets tool-visual-presets">
                        <small>
                          Ajuste a base de cor do vídeo. Nenhum texto ou camada é
                          criado por estas opções.
                        </small>
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
                              onClick={() => {
                                remember();
                                setVisualPreset(key);
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
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
                            onPointerDown={remember}
                            onKeyDown={remember}
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
                            onPointerDown={remember}
                            onKeyDown={remember}
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
                            onPointerDown={remember}
                            onKeyDown={remember}
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
                            onPointerDown={remember}
                            onKeyDown={remember}
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
                          onClick={() => {
                            remember();
                            setVideoTransform({
                              x: 0,
                              y: 0,
                              scaleX: 1,
                              scaleY: 1,
                            });
                          }}
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
                        onPointerDown={remember}
                        onKeyDown={remember}
                        onChange={(event) =>
                          setAudioGain(Number(event.target.value))
                        }
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={audioEnhance}
                        onChange={(event) => {
                          remember();
                          setAudioEnhance(event.target.checked);
                        }}
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
                          onPointerDown={remember}
                          onKeyDown={remember}
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
                <div
                  className="caption-engine-switch"
                  role="group"
                  aria-label="Onde gerar as legendas"
                >
                  <button
                    type="button"
                    className={captionEngine === "local" ? "active" : ""}
                    aria-pressed={captionEngine === "local"}
                    disabled={transcribing}
                    onClick={() => {
                      setCaptionEngine("local");
                      if (captionTargetLanguage === "es")
                        setCaptionTargetLanguage("original");
                    }}
                  >
                    Neste dispositivo
                    <small>Sem API</small>
                  </button>
                  <button
                    type="button"
                    className={captionEngine === "cloud" ? "active" : ""}
                    aria-pressed={captionEngine === "cloud"}
                    disabled={transcribing}
                    onClick={() => setCaptionEngine("cloud")}
                  >
                    Nuvem
                    <small>Mais rápida</small>
                  </button>
                </div>
                <div className="caption-service-explainer">
                  <b>
                    {captionEngine === "local"
                      ? "Whisper local · sem chave de API"
                      : "Legenda automática em nuvem"}
                  </b>
                  <span>
                    {captionEngine === "local"
                      ? "O áudio e o texto não saem deste dispositivo. No primeiro uso, o navegador baixa e armazena o modelo local."
                      : "O KLIP extrai e compacta o áudio aqui. O vídeo não é enviado; somente cada bloco de áudio vai para a transcrição."}
                  </span>
                  {captionSourceSeconds > 0 && (
                    <small>
                      Trecho usado na timeline: {time(captionSourceSeconds)} ·{" "}
                      {captionEstimatedBlocks} bloco
                      {captionEstimatedBlocks === 1 ? "" : "s"} de até{" "}
                      {captionEngine === "local" ? "1 min 30 s" : "8 min"},
                      processado{captionEstimatedBlocks === 1 ? "" : "s"} em
                      sequência.
                    </small>
                  )}
                </div>
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
                    {captionEngine === "cloud" && (
                      <option value="es">Traduzir para espanhol</option>
                    )}
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
                  onClick={() =>
                    transcribing
                      ? cancelAutomaticCaptions()
                      : void generateAutomaticCaptions()
                  }
                  disabled={!clip}
                >
                  {transcribing ? (
                    <X aria-hidden="true" size={17} />
                  ) : (
                    <Captions aria-hidden="true" size={17} />
                  )}
                  <b>
                    {transcribing
                      ? `Cancelar · ${Math.round(transcriptionProgress)}%`
                      : automaticCaptionButtonLabel}
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
                    <strong className="caption-progress-status">
                      <b>{Math.round(transcriptionProgress)}%</b>
                      <small>{transcriptionElapsedLabel} decorridos</small>
                    </strong>
                    <span>
                      {transcriptionBlock.total
                        ? `Bloco ${transcriptionBlock.current} de ${transcriptionBlock.total} · `
                        : ""}
                      {transcriptionPhaseLabel}
                    </span>
                  </div>
                )}
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
                <button
                  type="button"
                  className="manual-caption-action"
                  onClick={addLayer}
                  disabled={!clip}
                >
                  <Plus aria-hidden="true" size={15} /> Adicionar legenda manual
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
                          setInspectorTab("captions");
                          seek(layerEditTime(layer));
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
                            "noise",
                          )
                        }
                        onClick={() => applyTransition("noise", "in")}
                      >
                        <Layers2 aria-hidden="true" size={14} /> Ruído
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
                        Largura ·{" "}
                        {Math.round(
                          selectedIllustration.width ??
                            selectedIllustration.size,
                        )}
                        %
                        <input
                          type="range"
                          min="8"
                          max="160"
                          value={
                            selectedIllustration.width ??
                            selectedIllustration.size
                          }
                          onChange={(event) =>
                            updateIllustration(selectedIllustration.id, {
                              width: Number(event.target.value),
                              size: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Altura ·{" "}
                        {Math.round(
                          selectedIllustration.height ??
                            selectedIllustration.size * 0.72,
                        )}
                        %
                        <input
                          type="range"
                          min="8"
                          max="160"
                          value={
                            selectedIllustration.height ??
                            selectedIllustration.size * 0.72
                          }
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
                  <summary>Camadas no projeto ({layers.length})</summary>
                  <div
                    className="layer-list"
                    aria-label="Camadas de texto do projeto"
                  >
                    {layers.map((layer, index) => (
                      <button
                        key={layer.id}
                        type="button"
                        className={selected?.id === layer.id ? "selected" : ""}
                        aria-pressed={selected?.id === layer.id}
                        aria-label={`Selecionar texto ${index + 1}: ${layer.text || "Texto vazio"}, de ${time(layer.start)} a ${time(layer.end)}`}
                        onClick={() => {
                          setSelectedId(layer.id);
                          setSelectedIllustrationId("");
                          setSelectedAudioId("");
                          seek(Math.max(start, layerEditTime(layer)));
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
                        Posição horizontal{" "}
                        <output>{Math.round(selected.x)}%</output>
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
                        Posição vertical{" "}
                        <output>{Math.round(selected.y)}%</output>
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
                                fadeIn: Math.max(0, Number(event.target.value)),
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
          <div className="editor-stage-viewport" ref={stageViewport}>
            <div
              ref={stageCanvas}
              className={`editor-stage preset-${visualPreset} ${exportAspect === "vertical" || exportAspect === "portrait" || exportAspect === "square" || (exportAspect === "original" && sourceAspect < 1) ? "editor-stage-tall" : ""}`}
              style={{ aspectRatio: `${previewAspect}` }}
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
                    onPointerUp={endVideoFrameDrag}
                    onPointerCancel={endVideoFrameDrag}
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
                        // MediaRecorder WebM blobs often report Infinity first.
                        // Seeking far ahead reveals their real duration, but some
                        // browsers clamp exactly to the last frame rather than
                        // beyond it. Always return that metadata probe to frame 0.
                        if (event.currentTarget.currentTime >= value - 0.025) {
                          event.currentTarget.currentTime = 0;
                          baseLoopOffset.current =
                            primaryClipStart - primarySourceStart;
                          setCurrent(primaryClipStart);
                        }
                      }
                    }}
                    onTimeUpdate={(event) => {
                      if (exportInProgress.current) return;
                      const at =
                        baseLoopOffset.current +
                        event.currentTarget.currentTime;
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
                    }}
                    onEnded={() => {
                      if (!exportInProgress.current)
                        void playTimelineAt(
                          hasMontageTimeline
                            ? montageTimelineDuration
                            : primaryClipEnd,
                        );
                    }}
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
                    onPointerUp={endVideoFrameResize}
                    onPointerCancel={endVideoFrameResize}
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
                    onPointerUp={endVideoFrameResize}
                    onPointerCancel={endVideoFrameResize}
                    title="Arraste para alargar ou estreitar"
                  >
                    <MoveHorizontal aria-hidden="true" size={14} />
                  </div>
                  <div
                    className="video-frame-resize edge top"
                    onPointerDown={(event) =>
                      beginVideoFrameResize(event, "top")
                    }
                    onPointerMove={moveVideoFrameResize}
                    onPointerUp={endVideoFrameResize}
                    onPointerCancel={endVideoFrameResize}
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
                    onPointerUp={endVideoFrameResize}
                    onPointerCancel={endVideoFrameResize}
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
                    onPointerUp={endVideoFrameResize}
                    onPointerCancel={endVideoFrameResize}
                    title="Arraste livremente largura e altura"
                  >
                    <Maximize2 aria-hidden="true" size={14} />
                  </div>
                  <button
                    className="reset-video-frame"
                    onClick={() => {
                      remember();
                      setVideoTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
                    }}
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
                      onPointerUp={endIllustrationDrag}
                      onPointerCancel={endIllustrationDrag}
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
                            onPointerUp={endIllustrationResize}
                            onPointerCancel={endIllustrationResize}
                            aria-label="Ajustar largura da camada"
                          />
                          <div
                            className="illustration-resize-handle illustration-resize-bottom"
                            onPointerDown={(event) =>
                              beginIllustrationResize(event, item, "bottom")
                            }
                            onPointerMove={moveIllustrationResize}
                            onPointerUp={endIllustrationResize}
                            onPointerCancel={endIllustrationResize}
                            aria-label="Ajustar altura da camada"
                          />
                          <div
                            className="illustration-resize-handle illustration-resize-corner"
                            onPointerDown={(event) =>
                              beginIllustrationResize(event, item, "corner")
                            }
                            onPointerMove={moveIllustrationResize}
                            onPointerUp={endIllustrationResize}
                            onPointerCancel={endIllustrationResize}
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
                      onPointerUp={endLayerDrag}
                      onPointerCancel={endLayerDrag}
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
                  onPointerDown={remember}
                  onKeyDown={remember}
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
            {inspectorTab === "edit" && (
              <div className="pure-inspector-body">
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
                          {Math.round(
                            selectedIllustration.width ??
                              selectedIllustration.size,
                          )}
                          %
                        </output>
                        <input
                          type="range"
                          min="8"
                          max="160"
                          value={
                            selectedIllustration.width ??
                            selectedIllustration.size
                          }
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
                          {Math.round(
                            selectedIllustration.height ??
                              selectedIllustration.size * 0.72,
                          )}
                          %
                        </output>
                        <input
                          type="range"
                          min="8"
                          max="160"
                          value={
                            selectedIllustration.height ??
                            selectedIllustration.size * 0.72
                          }
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
                          onPointerDown={remember}
                          onKeyDown={remember}
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
                          onPointerDown={remember}
                          onKeyDown={remember}
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
                            onFocus={remember}
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
                            onFocus={remember}
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
                        onClick={() => {
                          remember();
                          setVideoTransform({
                            x: 0,
                            y: 0,
                            scaleX: 1,
                            scaleY: 1,
                          });
                        }}
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
                        onClick={() => {
                          remember();
                          setVisualPreset(preset);
                        }}
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
              <div className="pure-inspector-body">
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
                        onPointerDown={remember}
                        onKeyDown={remember}
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
                      onChange={(event) => {
                        remember();
                        setAudioEnhance(event.target.checked);
                      }}
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
              <div className="pure-inspector-body">
                <header>
                  <span>LEGENDAS</span>
                  <b>{selected ? "Texto selecionado" : "Nenhuma legenda"}</b>
                </header>
                <div
                  className="caption-engine-switch compact"
                  role="group"
                  aria-label="Onde gerar as legendas"
                >
                  <button
                    type="button"
                    className={captionEngine === "local" ? "active" : ""}
                    aria-pressed={captionEngine === "local"}
                    disabled={transcribing}
                    onClick={() => {
                      setCaptionEngine("local");
                      if (captionTargetLanguage === "es")
                        setCaptionTargetLanguage("original");
                    }}
                  >
                    Local
                  </button>
                  <button
                    type="button"
                    className={captionEngine === "cloud" ? "active" : ""}
                    aria-pressed={captionEngine === "cloud"}
                    disabled={transcribing}
                    onClick={() => setCaptionEngine("cloud")}
                  >
                    Nuvem
                  </button>
                </div>
                <div className="caption-service-explainer compact">
                  <b>
                    {captionEngine === "local" ? "Whisper local" : "Nuvem"}
                  </b>
                  <span>
                    {captionEngine === "local"
                      ? "Sem envio de áudio e sem chave de API."
                      : "Somente áudio compacto é enviado em blocos."}
                  </span>
                </div>
                <button
                  type="button"
                  className="pure-primary automatic-captions"
                  onClick={() =>
                    transcribing
                      ? cancelAutomaticCaptions()
                      : void generateAutomaticCaptions()
                  }
                  title="Cria textos sincronizados a partir da fala do vídeo"
                >
                  {transcribing ? (
                    <X aria-hidden="true" size={15} />
                  ) : (
                    <Captions aria-hidden="true" size={15} />
                  )}
                  {transcribing
                    ? `Cancelar · ${Math.round(transcriptionProgress)}%`
                    : automaticCaptionButtonLabel}
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
                    <strong className="caption-progress-status">
                      <b>{Math.round(transcriptionProgress)}%</b>
                      <small>{transcriptionElapsedLabel} decorridos</small>
                    </strong>
                    <span>
                      {transcriptionBlock.total
                        ? `Bloco ${transcriptionBlock.current} de ${transcriptionBlock.total} · `
                        : ""}
                      {transcriptionPhaseLabel}
                    </span>
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
              className="timeline-split-toggle"
              disabled={!clip}
              onClick={splitVideoAtPlayhead}
              title="Separa o clipe na linha branca e preserva as duas partes"
            >
              <Scissors aria-hidden="true" size={14} /> Dividir clipe
            </button>
            <button
              className={snapEnabled ? "selected" : ""}
              onClick={() => {
                remember();
                setSnapEnabled((value) => !value);
              }}
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
                  onClick={() => {
                    remember();
                    setSafeGuides((value) => !value);
                  }}
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
                        <div
                          key={item.id}
                          className={`radar-cut montage-cut ${activeRadarCutId === item.id ? "active" : ""}`}
                          style={{
                            left: `${(item.timelineStart / montageTimelineDuration) * 100}%`,
                            width: `${((item.timelineEnd - item.timelineStart) / montageTimelineDuration) * 100}%`,
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onDrop={(event) =>
                            dropTransitionOnRadarClip(event, item)
                          }
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
                          <button
                            type="button"
                            className="montage-cut-body"
                            aria-label={`Selecionar clipe ${index + 1}, de ${time(item.start)} a ${time(item.end)}`}
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
                            title={`clipe ${index + 1} · origem ${time(item.start)}–${time(item.end)} · arraste para mover`}
                          >
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
                          </button>
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
                          <button
                            type="button"
                            className="montage-download"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              void exportReel(
                                false,
                                [item],
                                `klip-radar-${String(index + 1).padStart(2, "0")}`,
                              );
                            }}
                            aria-label={`Salvar clipe ${index + 1} individualmente`}
                            title="Salvar este clipe sem remover os demais"
                          >
                            <Download aria-hidden="true" size={12} />
                          </button>
                          <button
                            type="button"
                            className="montage-remove"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              removeRadarCut(item.id);
                            }}
                            aria-label="Excluir somente este clipe"
                            title="Excluir somente este clipe; os demais permanecem"
                          >
                            <X aria-hidden="true" size={12} />
                          </button>
                        </div>
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
                                    height: `${Math.max(value > 0 ? 12 : 2, value * 100)}%`,
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
                          style={{
                            height: `${Math.max(value > 0 ? 12 : 2, value * 100)}%`,
                          }}
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
                      setInspectorTab(deselect ? "edit" : "audio");
                      setActiveTool("audio");
                      setToolPanelOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedAudioId(track.id);
                        setSelectedId("");
                        setSelectedIllustrationId("");
                        setInspectorTab("audio");
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
                            setInspectorTab("captions");
                            setActiveTool("captions");
                            setToolPanelOpen(true);
                            seek(Math.max(start, layerEditTime(layer)));
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
                      setInspectorTab("edit");
                      seek(Math.max(start, layerEditTime(layer)));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(layer.id);
                        setSelectedIllustrationId("");
                        setSelectedAudioId("");
                        setInspectorTab("edit");
                        seek(Math.max(start, layerEditTime(layer)));
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
          className={`studio-hub-backdrop ${studioPanel === "effects" ? "studio-hub-backdrop-effects" : ""}`}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) closeStudioPanel();
          }}
        >
          <section
            ref={studioDialog}
            className={`studio-hub studio-hub-${studioPanel}`}
            role="dialog"
            aria-modal={studioPanel !== "effects"}
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
                {studioPanel === "effects" && clip && (
                  <button
                    type="button"
                    className="studio-background-play"
                    onClick={() => void togglePreviewPlayback()}
                    aria-label={
                      isPlaying
                        ? "Pausar vídeo durante a escolha de efeitos"
                        : "Reproduzir vídeo durante a escolha de efeitos"
                    }
                  >
                    {isPlaying ? (
                      <Pause aria-hidden="true" size={14} fill="currentColor" />
                    ) : (
                      <Play aria-hidden="true" size={14} fill="currentColor" />
                    )}
                    {isPlaying ? "Pausar vídeo" : "Reproduzir vídeo"}
                  </button>
                )}
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
                    remember();
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
                    className="studio-effects-gallery"
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
              <small>
                Análise heurística local de ritmo, voz e pausas — sem IA e sem
                upload do vídeo.
              </small>
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
                          void exportReel(
                            false,
                            [item],
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
                <Trash2 aria-hidden="true" size={14} /> Excluir clipe
                selecionado
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
              remember();
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

      {publishModalOpen && (
        <PublishModal
          isOpen
          onClose={() => setPublishModalOpen(false)}
          videoBlob={publishBlob}
          defaultTitle={
            clip?.name ? clip.name.replace(/\.[^/.]+$/, "") : "Reel KLIPAPP"
          }
        />
      )}
    </main>
  );
}
