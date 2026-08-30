export interface CaptionSegment {
  start: number;
  end: number;
  text: string;
}

import type { TimelineSourceRange } from "./timeline";

export type { TimelineSourceRange } from "./timeline";

export interface CaptionSourceRange {
  start: number;
  end: number;
}

export interface CaptionTranscriptionJob {
  logicalStart: number;
  logicalEnd: number;
  extractionStart: number;
}

export interface CaptionSegmentationOptions {
  maxCharactersPerLine?: number;
  maxLines?: number;
  minimumDuration?: number;
}

const DEFAULT_MAX_CHARACTERS_PER_LINE = 24;
const DEFAULT_MAX_LINES = 2;
const DEFAULT_MINIMUM_DURATION = 0.18;

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

/**
 * Collapses overlapping source ranges before transcription. The same source
 * can appear more than once on the timeline, but it only needs to be sent to
 * the transcription service once; mapCaptionsToTimeline duplicates it later.
 */
export function mergeCaptionSourceRanges(
  ranges: readonly TimelineSourceRange[],
  mediaDuration?: number,
): CaptionSourceRange[] {
  const limit =
    Number.isFinite(mediaDuration) && Number(mediaDuration) > 0
      ? Number(mediaDuration)
      : Number.POSITIVE_INFINITY;
  const normalized = ranges
    .map((range) => {
      const start = Math.min(limit, Math.max(0, finite(range.sourceStart)));
      const end = Math.min(
        limit,
        Math.max(start, finite(range.sourceEnd)),
      );
      return { start, end };
    })
    .filter((range) => range.end - range.start >= 0.04)
    .sort((first, second) => first.start - second.start || first.end - second.end);

  const merged: CaptionSourceRange[] = [];
  for (const range of normalized) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end + 0.02) {
      previous.end = Math.max(previous.end, range.end);
      continue;
    }
    merged.push({ ...range });
  }
  return merged;
}

/** Builds bounded, sequential audio-only requests for the source actually used. */
export function buildCaptionTranscriptionJobs(
  ranges: readonly TimelineSourceRange[],
  mediaDuration: number,
  chunkSeconds = 8 * 60,
  overlapSeconds = 0.4,
): CaptionTranscriptionJob[] {
  const safeChunkSeconds = Math.max(10, finite(chunkSeconds) || 8 * 60);
  const safeOverlapSeconds = Math.max(
    0,
    Math.min(safeChunkSeconds / 4, finite(overlapSeconds)),
  );
  const jobs: CaptionTranscriptionJob[] = [];

  for (const range of mergeCaptionSourceRanges(ranges, mediaDuration)) {
    let logicalStart = range.start;
    let rangeJobIndex = 0;
    while (logicalStart < range.end - 0.01) {
      const logicalEnd = Math.min(range.end, logicalStart + safeChunkSeconds);
      jobs.push({
        logicalStart,
        logicalEnd,
        extractionStart:
          rangeJobIndex === 0
            ? logicalStart
            : Math.max(range.start, logicalStart - safeOverlapSeconds),
      });
      logicalStart = logicalEnd;
      rangeJobIndex += 1;
    }
  }

  return jobs;
}

function splitIntoCards(
  text: string,
  maxCharactersPerLine: number,
  maxLines: number,
) {
  const words = cleanText(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const chunks =
      word.length > maxCharactersPerLine
        ? word.match(new RegExp(`.{1,${maxCharactersPerLine}}`, "g")) || [word]
        : [word];

    for (const chunk of chunks) {
      const candidate = line ? `${line} ${chunk}` : chunk;
      if (candidate.length <= maxCharactersPerLine) {
        line = candidate;
        continue;
      }

      if (line) lines.push(line);
      line = chunk;
    }
  }

  if (line) lines.push(line);
  return Array.from(
    { length: Math.ceil(lines.length / maxLines) },
    (_, index) =>
      lines.slice(index * maxLines, (index + 1) * maxLines).join("\n"),
  );
}

/**
 * Turns provider-sized transcript segments into short, readable caption cards.
 * Timing is distributed by visible character weight and always remains inside
 * the original segment.
 */
export function segmentCaption(
  segment: CaptionSegment,
  options: CaptionSegmentationOptions = {},
): CaptionSegment[] {
  const text = cleanText(segment.text);
  const start = Math.max(0, finite(segment.start));
  const end = Math.max(start, finite(segment.end));
  if (!text || end <= start) return [];

  const maxCharactersPerLine = Math.max(
    12,
    Math.round(
      options.maxCharactersPerLine ?? DEFAULT_MAX_CHARACTERS_PER_LINE,
    ),
  );
  const maxLines = Math.max(1, Math.round(options.maxLines ?? DEFAULT_MAX_LINES));
  const minimumDuration = Math.max(
    0.08,
    options.minimumDuration ?? DEFAULT_MINIMUM_DURATION,
  );
  const cards = splitIntoCards(text, maxCharactersPerLine, maxLines);
  if (cards.length <= 1) return [{ start, end, text: cards[0] || text }];

  const duration = end - start;
  const weights = cards.map((card) => Math.max(1, cleanText(card).length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const effectiveMinimum = Math.min(minimumDuration, duration / cards.length);
  let cursor = start;
  let accumulatedWeight = 0;

  return cards.map((card, index) => {
    const remainingCards = cards.length - index - 1;
    accumulatedWeight += weights[index];
    const proportionalEnd = start + duration * (accumulatedWeight / totalWeight);
    const latestEnd = end - remainingCards * effectiveMinimum;
    const cardEnd =
      index === cards.length - 1
        ? end
        : Math.min(
            latestEnd,
            Math.max(cursor + effectiveMinimum, proportionalEnd),
          );
    const result = {
      start: cursor,
      end: index === cards.length - 1 ? end : cardEnd,
      text: card,
    };
    cursor = result.end;
    return result;
  });
}

/**
 * Maps transcript source time to project time. Removed source portions vanish;
 * reordered or duplicated ranges generate captions at each matching timeline
 * position.
 */
export function mapCaptionsToTimeline(
  segments: readonly CaptionSegment[],
  ranges: readonly TimelineSourceRange[],
  timelineDuration?: number,
  options: CaptionSegmentationOptions = {},
): CaptionSegment[] {
  const limit =
    Number.isFinite(timelineDuration) && Number(timelineDuration) > 0
      ? Number(timelineDuration)
      : Number.POSITIVE_INFINITY;
  const mapped: CaptionSegment[] = [];

  for (const range of ranges) {
    const sourceStart = Math.max(0, finite(range.sourceStart));
    const sourceEnd = Math.max(sourceStart, finite(range.sourceEnd));
    const timelineStart = Math.max(0, finite(range.timelineStart));
    if (sourceEnd <= sourceStart || timelineStart >= limit) continue;

    for (const segment of segments) {
      const text = cleanText(segment.text);
      const sourceSegmentStart = Math.max(0, finite(segment.start));
      const sourceSegmentEnd = Math.max(
        sourceSegmentStart,
        finite(segment.end),
      );
      const intersectionStart = Math.max(sourceStart, sourceSegmentStart);
      const intersectionEnd = Math.min(sourceEnd, sourceSegmentEnd);
      if (!text || intersectionEnd - intersectionStart < 0.04) continue;

      const start = Math.min(
        limit,
        timelineStart + intersectionStart - sourceStart,
      );
      const end = Math.min(limit, timelineStart + intersectionEnd - sourceStart);
      if (end - start < 0.04) continue;
      mapped.push(...segmentCaption({ start, end, text }, options));
    }
  }

  return mapped
    .filter(
      (segment) =>
        segment.text.trim() &&
        Number.isFinite(segment.start) &&
        Number.isFinite(segment.end) &&
        segment.end > segment.start,
    )
    .sort((first, second) => first.start - second.start || first.end - second.end);
}
