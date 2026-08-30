import assert from "node:assert/strict";
import test from "node:test";
import {
  sanitizeTextLayers,
  scaleTextLayerSize,
} from "../lib/editor/text-layers.ts";

test("keeps text proportional between preview and export frames", () => {
  assert.equal(scaleTextLayerSize(54, 1_920, 1_080), 54);
  assert.equal(scaleTextLayerSize(54, 1_080, 1_920), 54);
  assert.equal(scaleTextLayerSize(54, 640, 360), 18);
  assert.equal(scaleTextLayerSize(54, 360, 640), 18);
});

test("sanitizes malformed saved captions without losing valid content", () => {
  const [layer] = sanitizeTextLayers(
    [
      {
        id: "caption-1",
        text: "Legenda preservada",
        font: "Inter",
        color: "#ff00aa",
        size: 44,
        x: 50,
        y: 82,
        align: "center",
        start: 2,
        end: 4,
        fadeIn: 0.2,
        fadeOut: 0.2,
        effect: "pop",
        background: true,
        kind: "caption",
        captionOrigin: "generated",
        captionSpeaker: "P2",
      },
    ],
    10,
    () => "fallback-id",
  );

  assert.equal(layer.text, "Legenda preservada");
  assert.equal(layer.kind, "caption");
  assert.equal(layer.captionOrigin, "generated");
  assert.equal(layer.captionSpeaker, "P2");
  assert.equal(layer.start, 2);
  assert.equal(layer.end, 4);
});

test("bounds hostile or corrupt project values", () => {
  const [layer] = sanitizeTextLayers(
    [
      {
        id: "",
        text: { html: "<img onerror=alert(1)>" },
        font: "url(https://attacker.invalid/font)",
        color: "url(javascript:alert(1))",
        size: Infinity,
        x: -900,
        y: 900,
        align: "diagonal",
        start: -30,
        end: 9_999,
        fadeIn: 500,
        fadeOut: 500,
        effect: "execute",
      },
    ],
    12,
    () => "safe-id",
  );

  assert.deepEqual(
    {
      id: layer.id,
      text: layer.text,
      font: layer.font,
      color: layer.color,
      size: layer.size,
      x: layer.x,
      y: layer.y,
      align: layer.align,
      start: layer.start,
      end: layer.end,
      fadeIn: layer.fadeIn,
      fadeOut: layer.fadeOut,
      effect: layer.effect,
    },
    {
      id: "safe-id",
      text: "",
      font: "Inter",
      color: "#ffffff",
      size: 48,
      x: 0,
      y: 100,
      align: "center",
      start: 0,
      end: 12,
      fadeIn: 6,
      fadeOut: 6,
      effect: "none",
    },
  );
});

test("caps the number of renderable text layers", () => {
  const layers = sanitizeTextLayers(
    Array.from({ length: 1_200 }, (_, index) => ({
      id: String(index),
      text: `Layer ${index}`,
      start: 0,
      end: 1,
    })),
    2,
  );
  assert.equal(layers.length, 1_000);
});
