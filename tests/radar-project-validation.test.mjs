import assert from "node:assert/strict";
import test from "node:test";
import {
  createRadarSamplingPlan,
  sanitizeRadarSuggestions,
} from "../app/klip-radar.ts";

test("keeps a multi-hour Radar analysis bounded", () => {
  const plan = createRadarSamplingPlan(4 * 60 * 60 + 28 * 60);
  assert.equal(plan.sampleCount, 18_000);
  assert.ok(plan.blockSeconds > 0.89);
  assert.ok(plan.blockSeconds < 0.9);
});

test("restores valid Radar cuts and migrates legacy transition metadata", () => {
  const [cut] = sanitizeRadarSuggestions(
    [
      {
        id: "cut-1",
        start: 2,
        end: 6,
        timelineStart: 10,
        score: 87,
        title: "Abertura",
        reason: "Fala clara",
        selected: true,
        source: "voice",
        fadeIn: 0.8,
        fadeInKind: "dissolve",
      },
    ],
    20,
  );

  assert.equal(cut.start, 2);
  assert.equal(cut.end, 6);
  assert.equal(cut.timelineStart, 10);
  assert.equal(cut.fadeInKind, "noise");
});

test("bounds malformed Radar project data", () => {
  const [cut] = sanitizeRadarSuggestions(
    [
      {
        id: "",
        start: -10,
        end: Infinity,
        timelineStart: 999_999,
        score: 900,
        title: { unsafe: true },
        reason: ["unsafe"],
        source: "unknown",
        fadeIn: 999,
        fadeOut: -4,
        fadeInKind: "script",
      },
    ],
    12,
    () => "safe-cut",
  );

  assert.equal(cut.id, "safe-cut");
  assert.equal(cut.start, 0);
  assert.equal(cut.end, 12);
  assert.equal(cut.timelineStart, 86_400);
  assert.equal(cut.score, 100);
  assert.equal(cut.title, "Trecho restaurado");
  assert.equal(cut.source, "fallback");
  assert.equal(cut.fadeIn, 6);
  assert.equal(cut.fadeOut, 0);
  assert.equal(cut.fadeInKind, undefined);
});

test("caps restored Radar cuts before rendering the timeline", () => {
  const cuts = sanitizeRadarSuggestions(
    Array.from({ length: 260 }, (_, index) => ({
      id: String(index),
      start: 0,
      end: 1,
    })),
    2,
  );
  assert.equal(cuts.length, 200);
});
