export interface TimelineSourceRange {
  sourceStart: number;
  sourceEnd: number;
  timelineStart: number;
}

function finiteOrZero(value: number) {
  return Number.isFinite(value) ? value : 0;
}

/**
 * Converts media time into the project's canonical timeline clock. Keeping this
 * conversion in one place prevents preview and export from animating layers on
 * different clocks after trim, move, reorder, or duplicated montage ranges.
 */
export function sourceTimeToTimelineTime(
  range: TimelineSourceRange,
  sourceTime: number,
) {
  const sourceStart = Math.max(0, finiteOrZero(range.sourceStart));
  const sourceEnd = Math.max(sourceStart, finiteOrZero(range.sourceEnd));
  const timelineStart = Math.max(0, finiteOrZero(range.timelineStart));
  const clampedSourceTime = Math.max(
    sourceStart,
    Math.min(sourceEnd, finiteOrZero(sourceTime)),
  );
  return timelineStart + clampedSourceTime - sourceStart;
}

/** Reverse mapping used by seeking and direct manipulation on the timeline. */
export function timelineTimeToSourceTime(
  range: TimelineSourceRange,
  timelineTime: number,
) {
  const sourceStart = Math.max(0, finiteOrZero(range.sourceStart));
  const sourceEnd = Math.max(sourceStart, finiteOrZero(range.sourceEnd));
  const timelineStart = Math.max(0, finiteOrZero(range.timelineStart));
  const rangeDuration = sourceEnd - sourceStart;
  const localTime = Math.max(
    0,
    Math.min(rangeDuration, finiteOrZero(timelineTime) - timelineStart),
  );
  return sourceStart + localTime;
}
