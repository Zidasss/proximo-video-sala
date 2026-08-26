export type AudioLibraryCategory = "music" | "effects" | "uploads" | "favorites";

export type SynthRecipe = "creator-beat" | "soft-vlog" | "pop" | "whoosh" | "ding" | "click" | "riser";

export interface AudioLicense {
  name: string;
  summary: string;
  commercialUse: boolean;
  attributionRequired: boolean;
  source: "klip-original" | "user-upload";
}

export interface KlipAudioAsset {
  id: string;
  title: string;
  category: "music" | "effects" | "uploads";
  duration: number;
  tags: string[];
  mood?: string;
  license: AudioLicense;
  recipe?: SynthRecipe;
  file?: File;
}

export interface TimelineAudioPayload {
  asset: KlipAudioAsset;
  blob: Blob;
  file: File;
  url: string;
  duration: number;
  /** Call when the timeline no longer needs the object URL. */
  revoke: () => void;
}

export const KLIP_ORIGINAL_LICENSE: AudioLicense = {
  name: "Klip Original",
  summary: "Uso comercial liberado. Sem atribuição. Áudio sintetizado localmente pelo Klip Studio.",
  commercialUse: true,
  attributionRequired: false,
  source: "klip-original",
};

export const USER_UPLOAD_LICENSE: AudioLicense = {
  name: "Arquivo do usuário",
  summary: "A licença é responsabilidade de quem enviou o arquivo.",
  commercialUse: false,
  attributionRequired: false,
  source: "user-upload",
};

export const KLIP_AUDIO_CATALOG: readonly KlipAudioAsset[] = [
  {
    id: "music-creator-beat",
    title: "Creator Beat",
    category: "music",
    duration: 8,
    mood: "Animada",
    tags: ["vlog", "beleza", "rotina", "beat", "animada"],
    license: KLIP_ORIGINAL_LICENSE,
    recipe: "creator-beat",
  },
  {
    id: "music-soft-vlog",
    title: "Soft Vlog",
    category: "music",
    duration: 8,
    mood: "Leve",
    tags: ["vlog", "calma", "lifestyle", "leve", "delicada"],
    license: KLIP_ORIGINAL_LICENSE,
    recipe: "soft-vlog",
  },
  {
    id: "effect-pop",
    title: "Pop",
    category: "effects",
    duration: 0.36,
    tags: ["pop", "texto", "transição", "aparecer"],
    license: KLIP_ORIGINAL_LICENSE,
    recipe: "pop",
  },
  {
    id: "effect-whoosh",
    title: "Whoosh",
    category: "effects",
    duration: 0.82,
    tags: ["whoosh", "transição", "movimento", "passagem"],
    license: KLIP_ORIGINAL_LICENSE,
    recipe: "whoosh",
  },
  {
    id: "effect-ding",
    title: "Ding",
    category: "effects",
    duration: 1.05,
    tags: ["ding", "sucesso", "notificação", "brilho"],
    license: KLIP_ORIGINAL_LICENSE,
    recipe: "ding",
  },
  {
    id: "effect-click",
    title: "Click",
    category: "effects",
    duration: 0.14,
    tags: ["click", "botão", "interface", "toque"],
    license: KLIP_ORIGINAL_LICENSE,
    recipe: "click",
  },
  {
    id: "effect-riser",
    title: "Riser",
    category: "effects",
    duration: 1.8,
    tags: ["riser", "revelação", "expectativa", "transição"],
    license: KLIP_ORIGINAL_LICENSE,
    recipe: "riser",
  },
] as const;

const TAU = Math.PI * 2;

function seededNoise(index: number, seed: number) {
  let value = (index + 1) * 0x9e3779b1 + seed * 0x85ebca6b;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return ((value >>> 0) / 0xffffffff) * 2 - 1;
}

function envelope(t: number, duration: number, attack = 0.01, release = 0.12) {
  const fadeIn = Math.min(1, t / Math.max(attack, 0.001));
  const fadeOut = Math.min(1, (duration - t) / Math.max(release, 0.001));
  return Math.max(0, Math.min(fadeIn, fadeOut));
}

function oscillator(frequency: number, t: number, kind: "sine" | "triangle" = "sine") {
  const phase = (frequency * t) % 1;
  if (kind === "triangle") return 1 - 4 * Math.abs(Math.round(phase) - phase);
  return Math.sin(TAU * phase);
}

function sampleRecipe(recipe: SynthRecipe, t: number, duration: number, index: number) {
  if (recipe === "pop") {
    const pitch = 180 + 520 * Math.exp(-t * 14);
    return (oscillator(pitch, t) * 0.72 + seededNoise(index, 4) * 0.13) * Math.exp(-t * 11);
  }

  if (recipe === "whoosh") {
    const position = t / duration;
    const air = seededNoise(index, 11) * Math.sin(Math.PI * position);
    const sweep = oscillator(180 + 950 * position * position, t) * 0.15;
    return (air * 0.52 + sweep) * envelope(t, duration, 0.09, 0.18);
  }

  if (recipe === "ding") {
    const body = oscillator(1046.5, t) * 0.6 + oscillator(1569.75, t) * 0.25;
    return body * Math.exp(-t * 4.8) * envelope(t, duration, 0.004, 0.08);
  }

  if (recipe === "click") {
    return (seededNoise(index, 23) * 0.5 + oscillator(820, t) * 0.3) * Math.exp(-t * 45);
  }

  if (recipe === "riser") {
    const position = t / duration;
    const frequency = 100 + 1100 * position * position;
    return (
      oscillator(frequency, t, "triangle") * 0.3 +
      seededNoise(index, 31) * 0.18 * position
    ) * position * envelope(t, duration, 0.08, 0.08);
  }

  const beatPosition = t % 0.5;
  const beat = Math.floor(t / 0.5);
  if (recipe === "creator-beat") {
    const chord = [261.63, 329.63, 392][Math.floor(t / 2) % 3];
    const kick = oscillator(72 - beatPosition * 35, beatPosition) * Math.exp(-beatPosition * 16);
    const hat = beatPosition < 0.055 ? seededNoise(index, 51) * Math.exp(-beatPosition * 62) : 0;
    const pad = oscillator(chord, t) * 0.17 + oscillator(chord * 1.5, t) * 0.09;
    const bass = oscillator(chord / 2, t, "triangle") * 0.18;
    return (kick * 0.42 + hat * 0.2 + pad + bass) * envelope(t, duration, 0.04, 0.18);
  }

  const notes = [220, 277.18, 329.63, 246.94];
  const note = notes[Math.floor(t / 2) % notes.length];
  const pluck = oscillator(note * (beat % 2 ? 1.5 : 1), t) * Math.exp(-beatPosition * 3.2);
  const pad = oscillator(note / 2, t) * 0.18 + oscillator(note, t) * 0.08;
  return (pad + pluck * 0.16) * envelope(t, duration, 0.08, 0.25);
}

/** Generates a deterministic mono PCM WAV entirely on-device. */
export function synthesizeAudio(asset: KlipAudioAsset, sampleRate = 24_000): Blob {
  if (!asset.recipe) throw new Error("Este item não possui uma receita de síntese.");
  if (!Number.isFinite(sampleRate) || sampleRate < 8_000) throw new Error("Taxa de amostragem inválida.");

  const frameCount = Math.max(1, Math.round(asset.duration * sampleRate));
  const buffer = new ArrayBuffer(44 + frameCount * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + frameCount * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, frameCount * 2, true);

  for (let index = 0; index < frameCount; index += 1) {
    const t = index / sampleRate;
    const sample = Math.max(-1, Math.min(1, sampleRecipe(asset.recipe, t, asset.duration, index) * 0.78));
    view.setInt16(44 + index * 2, Math.round(sample * 0x7fff), true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export function formatAudioDuration(seconds: number) {
  if (seconds > 0 && seconds < 10) return `${seconds.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
  const safeSeconds = Math.max(0, Math.round(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export function filterAudioAssets(assets: readonly KlipAudioAsset[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  if (!normalizedQuery) return [...assets];
  return assets.filter((asset) =>
    [asset.title, asset.mood, asset.category, ...asset.tags]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase("pt-BR").includes(normalizedQuery)),
  );
}

export async function getAudioFileDuration(file: File): Promise<number> {
  if (typeof document === "undefined") return 0;
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Não foi possível ler ${file.name}.`));
    };
    audio.src = url;
  });
}

export function createTimelineAudioPayload(asset: KlipAudioAsset, blob?: Blob): TimelineAudioPayload {
  const audioBlob = blob ?? asset.file;
  if (!audioBlob) throw new Error("O áudio ainda não foi gerado.");
  const safeName = `${asset.title.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "audio"}.${audioBlob.type === "audio/wav" ? "wav" : "audio"}`;
  const file = audioBlob instanceof File ? audioBlob : new File([audioBlob], safeName, { type: audioBlob.type || "audio/wav" });
  const url = URL.createObjectURL(file);
  let revoked = false;
  return {
    asset,
    blob: audioBlob,
    file,
    url,
    duration: asset.duration,
    revoke: () => {
      if (!revoked) URL.revokeObjectURL(url);
      revoked = true;
    },
  };
}
