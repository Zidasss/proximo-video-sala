import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCaptionTranscriptionJobs,
  consolidateCaptionSegments,
  mapCaptionsToTimeline,
  mergeCaptionSourceRanges,
  removeRepeatedCaptionText,
  segmentCaption,
} from "../lib/editor/captions.ts";

test("removes long consecutive Whisper loops without changing short emphasis", () => {
  assert.equal(
    removeRepeatedCaptionText(
      "Esse vídeo ficou muito bom esse vídeo ficou muito bom para publicar.",
    ),
    "Esse vídeo ficou muito bom para publicar.",
  );
  assert.equal(removeRepeatedCaptionText("Não, não faça isso."), "Não, não faça isso.");
});

test("consolidates duplicate and overlapping phrases at transcription borders", () => {
  assert.deepEqual(
    consolidateCaptionSegments([
      { start: 0, end: 2, text: "Agora vamos editar este vídeo" },
      { start: 1.9, end: 4, text: "editar este vídeo com mais cuidado" },
      { start: 4.05, end: 5, text: "com mais cuidado" },
    ]),
    [
      { start: 0, end: 2, text: "Agora vamos editar este vídeo" },
      { start: 1.9, end: 5, text: "com mais cuidado" },
    ],
  );
});

test("merges duplicated timeline sources before sending audio for transcription", () => {
  const ranges = mergeCaptionSourceRanges(
    [
      { sourceStart: 30, sourceEnd: 90, timelineStart: 0 },
      { sourceStart: 30, sourceEnd: 90, timelineStart: 60 },
      { sourceStart: 80, sourceEnd: 120, timelineStart: 120 },
      { sourceStart: 400, sourceEnd: 430, timelineStart: 160 },
    ],
    500,
  );

  assert.deepEqual(ranges, [
    { start: 30, end: 120 },
    { start: 400, end: 430 },
  ]);
});

test("builds caption jobs only for source ranges used by the timeline", () => {
  const jobs = buildCaptionTranscriptionJobs(
    [
      { sourceStart: 60, sourceEnd: 660, timelineStart: 0 },
      { sourceStart: 1_200, sourceEnd: 1_260, timelineStart: 600 },
    ],
    2_000,
    480,
    0.4,
  );

  assert.deepEqual(jobs, [
    { logicalStart: 60, logicalEnd: 540, extractionStart: 60 },
    { logicalStart: 540, logicalEnd: 660, extractionStart: 539.6 },
    { logicalStart: 1_200, logicalEnd: 1_260, extractionStart: 1_200 },
  ]);
});

test("maps source captions to a trimmed and moved primary clip", () => {
  const captions = mapCaptionsToTimeline(
    [
      { start: 0, end: 2, text: "removida" },
      { start: 4, end: 6, text: "fica visível" },
    ],
    [{ sourceStart: 3, sourceEnd: 8, timelineStart: 10 }],
    15,
  );

  assert.deepEqual(captions, [
    { start: 11, end: 13, text: "fica visível" },
  ]);
});
test("maps captions through reordered montage cuts and drops removed speech", () => {
  const captions = mapCaptionsToTimeline(
    [
      { start: 1, end: 2, text: "primeiro" },
      { start: 5, end: 6, text: "removido" },
      { start: 9, end: 10, text: "segundo" },
    ],
    [
      { sourceStart: 8, sourceEnd: 11, timelineStart: 0 },
      { sourceStart: 0, sourceEnd: 3, timelineStart: 3 },
    ],
    6,
  );

  assert.deepEqual(captions, [
    { start: 1, end: 2, text: "segundo" },
    { start: 4, end: 5, text: "primeiro" },
  ]);
});

test("duplicates a caption when the same source range appears twice", () => {
  const captions = mapCaptionsToTimeline(
    [{ start: 2, end: 3, text: "repete" }],
    [
      { sourceStart: 0, sourceEnd: 4, timelineStart: 0 },
      { sourceStart: 0, sourceEnd: 4, timelineStart: 4 },
    ],
    8,
  );

  assert.deepEqual(captions, [
    { start: 2, end: 3, text: "repete" },
    { start: 6, end: 7, text: "repete" },
  ]);
});

test("segments long provider text into readable, contiguous caption cards", () => {
  const cards = segmentCaption({
    start: 2,
    end: 8,
    text: "Uma legenda muito longa precisa quebrar de forma previsível sem escapar do intervalo original do áudio.",
  });

  assert.ok(cards.length > 1);
  assert.equal(cards[0].start, 2);
  assert.equal(cards.at(-1).end, 8);
  assert.ok(cards.every((card) => card.end > card.start));
  assert.ok(cards.every((card) => card.text.split("\n").length <= 2));
  assert.ok(
    cards.every((card) =>
      card.text.split("\n").every((line) => line.length <= 24),
    ),
  );
  for (let index = 1; index < cards.length; index += 1)
    assert.equal(cards[index - 1].end, cards[index].start);
});

test("never emits negative or inverted timings after timeline clamping", () => {
  const captions = mapCaptionsToTimeline(
    [{ start: 80, end: 84, text: "fora do projeto" }],
    [{ sourceStart: 0, sourceEnd: 100, timelineStart: 0 }],
    20,
  );

  assert.deepEqual(captions, []);
});
