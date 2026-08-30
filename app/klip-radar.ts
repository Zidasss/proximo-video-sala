import {
  normalizeOptionalTransitionKind,
  type AppliedTransitionKind,
} from "../lib/editor/transitions.ts";
import type { AudioSample } from "mediabunny";

export type RadarMode = "reels" | "shorts" | "highlights";

export type RadarSuggestion = {
  id: string;
  start: number;
  end: number;
  /** Free position in the editor timeline. Source time remains in start/end. */
  timelineStart?: number;
  score: number;
  title: string;
  reason: string;
  selected: boolean;
  source: "voice" | "fallback";
  fadeIn?: number;
  fadeOut?: number;
  fadeInColor?: "black" | "white";
  fadeOutColor?: "black" | "white";
  fadeInKind?: AppliedTransitionKind;
  fadeOutKind?: AppliedTransitionKind;
};

const MAX_STORED_RADAR_CUTS = 200;

export function sanitizeRadarSuggestions(
  value: unknown,
  mediaDuration: number,
  createId: () => string = () => crypto.randomUUID(),
): RadarSuggestion[] {
  if (!Array.isArray(value)) return [];
  const duration = Math.max(
    0.05,
    Number.isFinite(mediaDuration) ? mediaDuration : 0.05,
  );
  const clamp = (number: number, minimum: number, maximum: number) =>
    Math.max(minimum, Math.min(maximum, number));
  const finite = (candidate: unknown, fallback: number) => {
    const number = Number(candidate);
    return Number.isFinite(number) ? number : fallback;
  };
  const text = (candidate: unknown, fallback: string, maximum: number) =>
    typeof candidate === "string" ? candidate.slice(0, maximum) : fallback;

  return value.slice(0, MAX_STORED_RADAR_CUTS).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Record<string, unknown>;
    const start = clamp(finite(item.start, 0), 0, duration - 0.05);
    const end = clamp(finite(item.end, duration), start + 0.05, duration);
    if (end <= start) return [];
    const clipDuration = end - start;
    const timelineStart = finite(item.timelineStart, -1);
    const fadeInKind = normalizeOptionalTransitionKind(item.fadeInKind);
    const fadeOutKind = normalizeOptionalTransitionKind(item.fadeOutKind);

    return [
      {
        id:
          typeof item.id === "string" && item.id.trim()
            ? item.id.slice(0, 128)
            : createId(),
        start,
        end,
        ...(timelineStart >= 0
          ? { timelineStart: clamp(timelineStart, 0, 86_400) }
          : {}),
        score: Math.round(clamp(finite(item.score, 50), 0, 100)),
        title: text(item.title, "Trecho restaurado", 160),
        reason: text(item.reason, "Trecho preservado do projeto salvo.", 600),
        selected: item.selected !== false,
        source: item.source === "voice" ? "voice" : "fallback",
        fadeIn: clamp(finite(item.fadeIn, 0), 0, clipDuration / 2),
        fadeOut: clamp(finite(item.fadeOut, 0), 0, clipDuration / 2),
        fadeInColor: item.fadeInColor === "white" ? "white" : "black",
        fadeOutColor: item.fadeOutColor === "white" ? "white" : "black",
        ...(fadeInKind ? { fadeInKind } : {}),
        ...(fadeOutKind ? { fadeOutKind } : {}),
      },
    ];
  });
}

type VoiceRun = { start: number; end: number; energy: number };

const MAX_RADAR_AUDIO_SAMPLES = 18_000;

export type RadarSamplingPlan = {
  blockSeconds: number;
  sampleCount: number;
};

/**
 * Keeps long recordings bounded. A four-hour source is sampled sparsely
 * instead of being decoded into a multi-gigabyte AudioBuffer.
 */
export function createRadarSamplingPlan(
  mediaDuration: number,
  maximumSamples = MAX_RADAR_AUDIO_SAMPLES,
): RadarSamplingPlan {
  const duration = Math.max(
    0.1,
    Number.isFinite(mediaDuration) ? mediaDuration : 0.1,
  );
  const safeMaximum = Math.max(100, Math.floor(maximumSamples));
  const sampleCount = Math.max(
    1,
    Math.min(safeMaximum, Math.ceil(duration / 0.1)),
  );
  return {
    blockSeconds: Math.max(0.1, duration / sampleCount),
    sampleCount,
  };
}

function audioSampleEnergy(sample: AudioSample) {
  let sum = 0;
  let points = 0;
  const channels = Math.max(1, Math.min(2, sample.numberOfChannels));
  for (let channel = 0; channel < channels; channel += 1) {
    const options = {
      planeIndex: channel,
      format: "f32-planar" as const,
    };
    const values = new Float32Array(sample.allocationSize(options) / 4);
    sample.copyTo(values, options);
    const stride = Math.max(1, Math.floor(values.length / 192));
    for (let index = 0; index < values.length; index += stride) {
      const value = values[index] || 0;
      sum += value * value;
      points += 1;
    }
  }
  return Math.sqrt(sum / Math.max(1, points));
}

function radarSampleTimestamps(
  duration: number,
  plan: RadarSamplingPlan,
) {
  return Array.from({ length: plan.sampleCount }, (_, index) =>
    Math.max(
      0,
      Math.min(duration - 0.001, (index + 0.5) * plan.blockSeconds),
    ),
  );
}

async function radarSourceBlob(source: string | Blob) {
  if (typeof source !== "string") return source;
  const response = await fetch(source);
  if (!response.ok)
    throw new Error("O KLIP não conseguiu abrir o arquivo para análise local.");
  return response.blob();
}

function formatRadarSourceSize(bytes: number) {
  if (bytes >= 1024 ** 3)
    return `${(bytes / 1024 ** 3).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    })} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2)).toLocaleString("pt-BR")} MB`;
}

const profileFor = (mode: RadarMode) =>
  mode === "reels"
    ? { minimum: 8, ideal: 22, maximum: 36 }
    : mode === "shorts"
      ? { minimum: 18, ideal: 42, maximum: 64 }
      : { minimum: 8, ideal: 50, maximum: 95 };

const overlapRatio = (first: RadarSuggestion, second: RadarSuggestion) => {
  const intersection = Math.max(
    0,
    Math.min(first.end, second.end) - Math.max(first.start, second.start),
  );
  return (
    intersection /
    Math.max(0.01, Math.min(first.end - first.start, second.end - second.start))
  );
};

function titleFor(duration: number, energy: number, pauses: number) {
  if (energy > 0.72) return "Momento de fala mais intensa";
  if (duration <= 24) return "Trecho direto para Reels";
  if (pauses >= 2) return "Conversa com ritmo natural";
  return "Bloco completo de conversa";
}

export function buildSuggestions(
  levels: number[],
  blockSeconds: number,
  mediaDuration: number,
  mode: RadarMode,
  wanted: number,
) {
  const sorted = [...levels].sort((a, b) => a - b),
    percentile = (ratio: number) =>
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ||
      0,
    noiseFloor = percentile(0.2),
    average =
      levels.reduce((sum, value) => sum + value, 0) /
      Math.max(1, levels.length),
    loudReference = Math.max(0.012, percentile(0.88)),
    threshold = Math.max(0.0065, noiseFloor * 2.4, average * 0.3),
    speech = levels.map((value) => value >= threshold),
    bridgeBlocks = Math.max(1, Math.round(0.62 / blockSeconds));

  // Pequenas pausas dentro da mesma frase não devem separar um candidato.
  for (let index = 0; index < speech.length; index += 1) {
    if (speech[index]) continue;
    let end = index;
    while (end < speech.length && !speech[end]) end += 1;
    if (index > 0 && end < speech.length && end - index <= bridgeBlocks)
      for (let fill = index; fill < end; fill += 1) speech[fill] = true;
    index = end;
  }

  const runs: VoiceRun[] = [];
  for (let index = 0; index < speech.length; index += 1) {
    if (!speech[index]) continue;
    const from = index;
    let energy = 0,
      samples = 0;
    while (index < speech.length && speech[index]) {
      energy += levels[index];
      samples += 1;
      index += 1;
    }
    const start = from * blockSeconds,
      end = Math.min(mediaDuration, index * blockSeconds);
    if (end - start >= 0.42)
      runs.push({ start, end, energy: energy / Math.max(1, samples) });
  }

  const profile = profileFor(mode),
    candidates: RadarSuggestion[] = [];
  for (let first = 0; first < runs.length; first += 1) {
    let spoken = 0,
      energy = 0;
    for (let last = first; last < runs.length; last += 1) {
      const run = runs[last],
        runLength = run.end - run.start;
      spoken += runLength;
      energy += run.energy * runLength;
      const from = Math.max(0, runs[first].start - 0.24),
        to = Math.min(mediaDuration, run.end + 0.28),
        length = to - from;
      if (length > profile.maximum) break;
      if (length < profile.minimum) continue;
      const speechRatio = Math.min(1, spoken / Math.max(0.01, length)),
        normalizedEnergy = Math.min(
          1,
          energy / Math.max(0.001, spoken * loudReference),
        ),
        durationFit = Math.max(
          0,
          1 - Math.abs(length - profile.ideal) / profile.ideal,
        ),
        pauses = Math.max(0, last - first),
        score = Math.round(
          Math.min(
            98,
            45 +
              speechRatio * 24 +
              durationFit * 17 +
              normalizedEnergy * 9 +
              Math.min(3, pauses),
          ),
        ),
        reason = `${Math.round(speechRatio * 100)}% de fala, ${pauses ? `${pauses} pausa${pauses > 1 ? "s" : ""} natural${pauses > 1 ? "is" : ""}` : "entrada e saída limpas"} e duração boa para ${mode === "reels" ? "Reels" : mode === "shorts" ? "Shorts" : "destaque"}.`;
      candidates.push({
        id: crypto.randomUUID(),
        start: Math.round(from * 100) / 100,
        end: Math.round(to * 100) / 100,
        score,
        title: titleFor(length, normalizedEnergy, pauses),
        reason,
        selected: true,
        source: "voice",
      });
    }
  }

  // Em podcasts a fala pode continuar por vários minutos sem uma pausa longa.
  // Janelas sobrepostas evitam que esse caso seja classificado apenas como
  // fallback e favorecem trechos com mais voz/energia dentro do tempo ideal.
  if (mediaDuration >= profile.minimum) {
    const windowLength = Math.min(profile.ideal, mediaDuration),
      windowStep = Math.max(profile.minimum * 0.7, windowLength * 0.45);
    for (
      let from = 0;
      from < mediaDuration - profile.minimum / 2;
      from += windowStep
    ) {
      const to = Math.min(mediaDuration, from + windowLength),
        firstBlock = Math.max(0, Math.floor(from / blockSeconds)),
        lastBlock = Math.min(levels.length, Math.ceil(to / blockSeconds)),
        sampleLevels = levels.slice(firstBlock, lastBlock);
      if (to - from < profile.minimum || !sampleLevels.length) continue;
      const speechBlocks = sampleLevels.filter(
          (value) => value >= threshold,
        ).length,
        speechRatio = speechBlocks / sampleLevels.length;
      if (speechRatio < 0.34) continue;
      const meanEnergy =
          sampleLevels.reduce((sum, value) => sum + value, 0) /
          sampleLevels.length,
        normalizedEnergy = Math.min(1, meanEnergy / loudReference),
        score = Math.round(
          Math.min(96, 43 + speechRatio * 30 + normalizedEnergy * 15),
        ),
        cleanStart = Math.max(0, Math.round(from * 100) / 100),
        cleanEnd = Math.min(mediaDuration, Math.round(to * 100) / 100);
      candidates.push({
        id: crypto.randomUUID(),
        start: cleanStart,
        end: cleanEnd,
        score,
        title: titleFor(cleanEnd - cleanStart, normalizedEnergy, 0),
        reason: `${Math.round(speechRatio * 100)}% de fala contínua e boa intensidade para ${mode === "reels" ? "Reels" : mode === "shorts" ? "Shorts" : "destaque"}.`,
        selected: true,
        source: "voice",
      });
    }
  }

  const chosen: RadarSuggestion[] = [];
  candidates
    .sort((first, second) => second.score - first.score)
    .forEach((candidate) => {
      if (chosen.length >= wanted) return;
      if (chosen.every((item) => overlapRatio(item, candidate) < 0.58))
        chosen.push(candidate);
    });

  // Arquivos sem áudio decodificável ou com fala praticamente contínua ainda
  // recebem pontos de revisão, mas são identificados como estimativas.
  if (chosen.length < Math.min(2, wanted) && mediaDuration >= 6) {
    const fallbackLength = Math.min(profile.ideal, mediaDuration),
      slots = Math.max(
        1,
        Math.min(wanted, Math.ceil(mediaDuration / fallbackLength)),
      );
    for (let index = 0; index < slots && chosen.length < wanted; index += 1) {
      const start = Math.max(
          0,
          Math.min(
            mediaDuration - fallbackLength,
            (mediaDuration / slots) * index,
          ),
        ),
        candidate: RadarSuggestion = {
          id: crypto.randomUUID(),
          start: Math.round(start * 100) / 100,
          end:
            Math.round(Math.min(mediaDuration, start + fallbackLength) * 100) /
            100,
          score: 58,
          title: "Trecho para revisão",
          reason: "Estimativa pela duração; confira a fala antes de aplicar.",
          selected: true,
          source: "fallback",
        };
      if (chosen.every((item) => overlapRatio(item, candidate) < 0.7))
        chosen.push(candidate);
    }
  }
  return chosen
    .sort((first, second) => first.start - second.start)
    .slice(0, wanted);
}

export async function analyzeClipForRadar(
  source: string | Blob,
  mediaDuration: number,
  mode: RadarMode,
  wanted: number,
  onProgress: (progress: number, status: string) => void,
) {
  onProgress(5, "Abrindo somente a faixa de áudio…");
  const blob = await radarSourceBlob(source);
  try {
    const { ALL_FORMATS, AudioSampleSink, BlobSource, Input } =
      await import("mediabunny");
    const input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(blob),
    });
    if (!(await input.canRead()))
      throw new Error("O contêiner deste vídeo não pôde ser lido.");
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error("Este vídeo não possui uma faixa de áudio.");
    if (!(await track.canDecode()))
      throw new Error("O navegador não consegue decodificar este áudio.");
    const metadataDuration = await track.getDurationFromMetadata();
    const measuredDuration =
      metadataDuration ||
      (Number.isFinite(mediaDuration) && mediaDuration > 0
        ? mediaDuration
        : await track.computeDuration());
    const duration =
      Number.isFinite(measuredDuration) && measuredDuration > 0
        ? measuredDuration
        : mediaDuration;
    const plan = createRadarSamplingPlan(duration);
    const levels: number[] = [];
    const sink = new AudioSampleSink(track);
    onProgress(
      12,
      `Amostrando o áudio sem carregar ${formatRadarSourceSize(blob.size)} na memória…`,
    );
    for await (const sample of sink.samplesAtTimestamps(
      radarSampleTimestamps(duration, plan),
    )) {
      if (!sample) levels.push(0);
      else {
        try {
          levels.push(audioSampleEnergy(sample));
        } finally {
          sample.close();
        }
      }
      if (levels.length % 128 === 0 || levels.length === plan.sampleCount) {
        const ratio = levels.length / Math.max(1, plan.sampleCount);
        onProgress(
          14 + Math.round(ratio * 66),
          `Mapeando vozes e pausas · ${levels.length.toLocaleString("pt-BR")}/${plan.sampleCount.toLocaleString("pt-BR")} amostras…`,
        );
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    onProgress(84, "Montando possíveis Klips…");
    const suggestions = buildSuggestions(
      levels,
      plan.blockSeconds,
      duration,
      mode,
      wanted,
    );
    onProgress(100, `${suggestions.length} sugestões prontas para conferir.`);
    return suggestions;
  } catch (error) {
    // Unsupported codecs still receive clearly-labelled review points. The
    // fallback is bounded too, so even a day-long recording stays cheap.
    const plan = createRadarSamplingPlan(mediaDuration);
    onProgress(
      84,
      `${error instanceof Error ? error.message : "O áudio não pôde ser lido."} Criando pontos de revisão…`,
    );
    const suggestions = buildSuggestions(
      Array.from({ length: plan.sampleCount }, () => 0),
      plan.blockSeconds,
      mediaDuration,
      mode,
      wanted,
    );
    onProgress(100, `${suggestions.length} sugestões estimadas para conferir.`);
    return suggestions;
  }
}
