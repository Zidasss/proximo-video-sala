import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createVisualEffectApplication,
  drawVisualEffectFrame,
  getVisualEffectFrame,
  VISUAL_EFFECT_CATEGORIES,
  VISUAL_EFFECTS,
  visualEffectFrameToCssFilter,
} from "../lib/video-effects.ts";

const root = new URL("../", import.meta.url);

test("publishes the four creator-facing categories and required effects", () => {
  assert.deepEqual(
    VISUAL_EFFECT_CATEGORIES.map((category) => category.label),
    ["Movimento", "Cor", "Social", "Retrô"],
  );

  const names = new Set(VISUAL_EFFECTS.map((effect) => effect.name));
  for (const required of [
    "Zoom suave",
    "Pan / parallax",
    "Tremor",
    "Flash",
    "Glitch",
    "VHS",
    "Cinema",
    "Vibrante",
    "P&B",
    "Quente",
  ]) {
    assert.ok(names.has(required), `missing ${required}`);
  }

  assert.equal(
    new Set(VISUAL_EFFECTS.map((effect) => effect.id)).size,
    VISUAL_EFFECTS.length,
  );
  assert.ok(VISUAL_EFFECTS.every((effect) => effect.durationMs > 0));
  assert.ok(
    VISUAL_EFFECTS.every(
      (effect) => Object.keys(effect.exportParameters).length > 0,
    ),
  );
});

test("generates deterministic, normalized frames for canvas export", () => {
  for (const effect of VISUAL_EFFECTS) {
    const first = getVisualEffectFrame(effect.id, 0.347, 0.85);
    const second = getVisualEffectFrame(effect.id, 0.347, 0.85);
    assert.deepEqual(first, second, `${effect.id} is not deterministic`);
    assert.deepEqual(first, getVisualEffectFrame(effect.id, 1.347, 0.85));
    assert.ok(Number.isFinite(first.transform.scale));
    assert.ok(first.transform.scale > 0);
    assert.ok(first.opacity >= 0 && first.opacity <= 1);
  }
});

test("exposes portable parameters rather than CSS-only effect names", () => {
  const application = createVisualEffectApplication("pan-parallax", 1.4);
  assert.deepEqual(application, {
    schemaVersion: 1,
    effectId: "pan-parallax",
    durationMs: 3800,
    intensity: 1.4,
    parameters: { scale: 1.09, travelX: 0.075, travelY: 0.018 },
  });

  assert.equal(createVisualEffectApplication("vhs", 99).intensity, 2);
  assert.equal(createVisualEffectApplication("vhs", -2).intensity, 0);
  assert.equal(getVisualEffectFrame("soft-zoom", 0).transform.scale, 1);
  assert.equal(getVisualEffectFrame("soft-zoom", 0.5).transform.scale, 1.075);

  const filter = visualEffectFrameToCssFilter(
    getVisualEffectFrame("black-and-white", 0.2),
  );
  assert.match(filter, /grayscale\(1\.0000\)/);
  assert.match(filter, /contrast\(1\.1800\)/);
});

test("draws a frame through the canvas adapter and returns its parameters", () => {
  const calls = [];
  const context = {
    canvas: { width: 1080, height: 1920 },
    filter: "none",
    globalAlpha: 1,
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    beginPath: () => calls.push("beginPath"),
    rect: (...args) => calls.push(["rect", ...args]),
    clip: () => calls.push("clip"),
    translate: (...args) => calls.push(["translate", ...args]),
    rotate: (...args) => calls.push(["rotate", ...args]),
    scale: (...args) => calls.push(["scale", ...args]),
    drawImage: (...args) => calls.push(["drawImage", ...args]),
  };
  const source = { videoWidth: 1920, videoHeight: 1080 };
  const frame = drawVisualEffectFrame(
    /** @type {CanvasRenderingContext2D} */ (context),
    /** @type {CanvasImageSource} */ (source),
    "vibrant",
    0.25,
  );

  assert.equal(frame.color.saturation, 1.42);
  assert.ok(
    calls.some((call) => Array.isArray(call) && call[0] === "drawImage"),
  );
  assert.match(context.filter, /saturate\(1\.4200\)/);
});

test("ships current-media previews with accessible and mobile controls", async () => {
  const [component, css] = await Promise.all([
    readFile(new URL("components/effects/EffectsGallery.tsx", root), "utf8"),
    readFile(
      new URL("components/effects/EffectsGallery.module.css", root),
      "utf8",
    ),
  ]);

  assert.match(component, /media\.type === "video"/);
  assert.match(component, /src=\{media\.src\}/);
  assert.match(component, /onApply\(effect, applicationFor\(effect\)\)/);
  assert.match(component, /role="tablist"/);
  assert.match(component, /role="tabpanel"/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /playsInline/);
  assert.match(component, /previewingEffectId === effect\.id/);
  assert.match(component, /element\.pause\(\)/);
  assert.doesNotMatch(component, /\sautoPlay/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\[data-effect="glitch"\]/);
  assert.match(css, /\[data-effect="vhs"\]/);
  assert.match(css, /html\[data-klip-theme="dark"\]/);
  assert.match(css, /--effects-accent: #1558b0/);
  assert.doesNotMatch(css, /--effects-accent: #ff7664/);
});
