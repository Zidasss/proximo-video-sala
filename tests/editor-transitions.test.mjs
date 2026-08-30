import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAppliedTransitionKind,
  normalizeOptionalTransitionKind,
  normalizeTransitionKind,
  transitionDuration,
  transitionLabel,
} from "../lib/editor/transitions.ts";

test("migrates the legacy fake dissolve without breaking saved projects", () => {
  assert.equal(normalizeTransitionKind("dissolve"), "noise");
  assert.equal(normalizeAppliedTransitionKind("dissolve"), "noise");
  assert.equal(normalizeOptionalTransitionKind("dissolve"), "noise");
});

test("rejects unknown drag and project transition values", () => {
  assert.equal(normalizeTransitionKind("javascript:alert(1)"), null);
  assert.equal(normalizeAppliedTransitionKind("unknown"), "fade-black");
  assert.equal(normalizeOptionalTransitionKind("unknown"), undefined);
});

test("keeps current transition labels and durations honest", () => {
  assert.equal(transitionLabel("noise"), "Ruído");
  assert.equal(transitionDuration("noise"), 0.8);
  assert.equal(transitionDuration("none"), 0);
  assert.equal(transitionDuration("flash"), 0.42);
});
