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
  fadeInKind?: "fade-black" | "fade-white" | "flash" | "dissolve" | "wipe";
  fadeOutKind?: "fade-black" | "fade-white" | "flash" | "dissolve" | "wipe";
};

type VoiceRun = { start: number; end: number; energy: number };

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
  return intersection / Math.max(0.01, Math.min(first.end - first.start, second.end - second.start));
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
    percentile = (ratio: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] || 0,
    noiseFloor = percentile(0.2),
    average = levels.reduce((sum, value) => sum + value, 0) / Math.max(1, levels.length),
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
        normalizedEnergy = Math.min(1, energy / Math.max(0.001, spoken * loudReference)),
        durationFit = Math.max(0, 1 - Math.abs(length - profile.ideal) / profile.ideal),
        pauses = Math.max(0, last - first),
        score = Math.round(
          Math.min(98, 45 + speechRatio * 24 + durationFit * 17 + normalizedEnergy * 9 + Math.min(3, pauses)),
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
    for (let from = 0; from < mediaDuration - profile.minimum / 2; from += windowStep) {
      const to = Math.min(mediaDuration, from + windowLength),
        firstBlock = Math.max(0, Math.floor(from / blockSeconds)),
        lastBlock = Math.min(levels.length, Math.ceil(to / blockSeconds)),
        sampleLevels = levels.slice(firstBlock, lastBlock);
      if (to - from < profile.minimum || !sampleLevels.length) continue;
      const speechBlocks = sampleLevels.filter((value) => value >= threshold).length,
        speechRatio = speechBlocks / sampleLevels.length;
      if (speechRatio < 0.34) continue;
      const meanEnergy = sampleLevels.reduce((sum, value) => sum + value, 0) / sampleLevels.length,
        normalizedEnergy = Math.min(1, meanEnergy / loudReference),
        score = Math.round(Math.min(96, 43 + speechRatio * 30 + normalizedEnergy * 15)),
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
      if (chosen.every((item) => overlapRatio(item, candidate) < 0.58)) chosen.push(candidate);
    });

  // Arquivos sem áudio decodificável ou com fala praticamente contínua ainda
  // recebem pontos de revisão, mas são identificados como estimativas.
  if (chosen.length < Math.min(2, wanted) && mediaDuration >= 6) {
    const fallbackLength = Math.min(profile.ideal, mediaDuration),
      slots = Math.max(1, Math.min(wanted, Math.ceil(mediaDuration / fallbackLength)));
    for (let index = 0; index < slots && chosen.length < wanted; index += 1) {
      const start = Math.max(0, Math.min(mediaDuration - fallbackLength, (mediaDuration / slots) * index)),
        candidate: RadarSuggestion = {
          id: crypto.randomUUID(),
          start: Math.round(start * 100) / 100,
          end: Math.round(Math.min(mediaDuration, start + fallbackLength) * 100) / 100,
          score: 58,
          title: "Trecho para revisão",
          reason: "Estimativa pela duração; confira a fala antes de aplicar.",
          selected: true,
          source: "fallback",
        };
      if (chosen.every((item) => overlapRatio(item, candidate) < 0.7)) chosen.push(candidate);
    }
  }
  return chosen.sort((first, second) => first.start - second.start).slice(0, wanted);
}

export async function analyzeClipForRadar(
  url: string,
  mediaDuration: number,
  mode: RadarMode,
  wanted: number,
  onProgress: (progress: number, status: string) => void,
) {
  onProgress(8, "Abrindo o áudio da gravação…");
  const response = await fetch(url),
    buffer = await response.arrayBuffer(),
    context = new AudioContext();
  try {
    onProgress(22, "Decodificando vozes e pausas…");
    const decoded = await context.decodeAudioData(buffer),
      blockSeconds = 0.1,
      blockSize = Math.max(1, Math.floor(decoded.sampleRate * blockSeconds)),
      levels: number[] = [],
      channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index));
    for (let offset = 0; offset < decoded.length; offset += blockSize) {
      let sum = 0,
        samples = 0;
      for (let point = offset; point < Math.min(decoded.length, offset + blockSize); point += 4) {
        let mixed = 0;
        channels.forEach((channel) => { mixed += channel[point] || 0; });
        mixed /= Math.max(1, channels.length);
        sum += mixed * mixed;
        samples += 1;
      }
      levels.push(Math.sqrt(sum / Math.max(1, samples)));
      if (levels.length % 160 === 0) {
        const ratio = offset / Math.max(1, decoded.length);
        onProgress(25 + Math.round(ratio * 48), "Mapeando ritmo e intensidade…");
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }
    onProgress(82, "Montando possíveis Klips…");
    const suggestions = buildSuggestions(
      levels,
      blockSeconds,
      Number.isFinite(decoded.duration) && decoded.duration > 0 ? decoded.duration : mediaDuration,
      mode,
      wanted,
    );
    onProgress(100, `${suggestions.length} sugestões prontas para conferir.`);
    return suggestions;
  } catch {
    // Alguns contêineres MP4/WebM podem tocar normalmente no navegador, mas
    // não serem aceitos pelo decodeAudioData. Nesse caso o Radar ainda oferece
    // blocos de revisão pela duração, claramente marcados como estimativas.
    onProgress(84, "O áudio não pôde ser lido; criando pontos de revisão…");
    const blocks = Math.max(1, Math.ceil(mediaDuration / 0.1)),
      suggestions = buildSuggestions(
        Array.from({ length: blocks }, () => 0),
        0.1,
        mediaDuration,
        mode,
        wanted,
      );
    onProgress(100, `${suggestions.length} sugestões estimadas para conferir.`);
    return suggestions;
  } finally {
    await context.close();
  }
}
