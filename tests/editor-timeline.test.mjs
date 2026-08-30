import assert from "node:assert/strict";
import test from "node:test";
import {
  sourceTimeToTimelineTime,
  timelineTimeToSourceTime,
} from "../lib/editor/timeline.ts";
import { mergePcmChunkIntoWaveform } from "../lib/editor/audio-waveform.ts";
import { readFile } from "node:fs/promises";

test("preview and export share timeline time after trim and move", () => {
  const range = { sourceStart: 12, sourceEnd: 20, timelineStart: 4 };

  assert.equal(sourceTimeToTimelineTime(range, 12), 4);
  assert.equal(sourceTimeToTimelineTime(range, 15.5), 7.5);
  assert.equal(sourceTimeToTimelineTime(range, 20), 12);
});

test("source/timeline conversion is reversible inside a range", () => {
  const range = { sourceStart: 45, sourceEnd: 51, timelineStart: 2 };

  for (const timelineTime of [2, 2.25, 5.5, 8]) {
    const sourceTime = timelineTimeToSourceTime(range, timelineTime);
    assert.equal(
      sourceTimeToTimelineTime(range, sourceTime),
      timelineTime,
    );
  }
});

test("conversion clamps seek and render drift to range boundaries", () => {
  const range = { sourceStart: 10, sourceEnd: 14, timelineStart: 6 };

  assert.equal(sourceTimeToTimelineTime(range, 9.8), 6);
  assert.equal(sourceTimeToTimelineTime(range, 14.2), 10);
  assert.equal(timelineTimeToSourceTime(range, 5), 10);
  assert.equal(timelineTimeToSourceTime(range, 11), 14);
});

test("does not render one sparse sample as a complete audio waveform", async () => {
  const editorSource = await readFile(
    new URL("../components/editor/ClipEditor.tsx", import.meta.url),
    "utf8",
  );

  assert.match(editorSource, /values\.length !== count/);
  assert.match(editorSource, /values\.length < minimumDisplayedSamples/);
  assert.match(editorSource, /Adicionar legenda manual/);
});

test("audio waveform uses the same horizontal zoom as the video timeline", async () => {
  const css = await readFile(
    new URL("../app/styles/klip-pure.css", import.meta.url),
    "utf8",
  );

  assert.match(
    css,
    /waveform-track > i:not\(\.montage-audio-waveform\):not\(\.codec-audio-indicator\)/,
  );
  assert.match(css, /flex: 1 1 0 !important/);
  assert.match(css, /min-width: 0 !important/);
  assert.match(css, /max-width: none !important/);
});

test("codec audio state stays transparent instead of becoming a solid bar", async () => {
  const css = await readFile(
    new URL("../app/styles/klip-pure.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /waveform-track > i\.codec-audio-indicator/);
  assert.match(css, /background: transparent !important/);
});

test("builds the missing large-video waveform from extracted PCM chunks", () => {
  const first = mergePcmChunkIntoWaveform(
    [],
    new Float32Array([0, 0.25, 1, 0.25]),
    0,
    10,
    20,
    96,
  );
  assert.equal(first.length, 96);
  assert.ok(first.slice(0, 48).some((value) => value > 0));
  assert.ok(first.slice(48).every((value) => value === 0));

  const complete = mergePcmChunkIntoWaveform(
    first,
    new Float32Array([0.1, 0.5, 0.2, 0.8]),
    10,
    20,
    20,
    96,
  );
  assert.ok(complete.every((value) => value > 0));
});
