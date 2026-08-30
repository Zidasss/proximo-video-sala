import assert from "node:assert/strict";
import test from "node:test";
import {
  mapCaptionsToTimeline,
  segmentCaption,
} from "../lib/editor/captions.ts";

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
