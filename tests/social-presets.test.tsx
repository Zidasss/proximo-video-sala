import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getSocialPreset,
  SAFE_AREA_PROFILES,
  SOCIAL_PRESETS,
} from "../app/social-preset-data";

const root = new URL("../", import.meta.url);

test("offers every quick-create destination with complete render settings", () => {
  assert.deepEqual(
    SOCIAL_PRESETS.map((preset) => preset.id),
    [
      "tiktok",
      "instagram-reels",
      "youtube-shorts",
      "stories",
      "feed-portrait",
      "feed-square",
      "youtube-landscape",
      "custom",
    ],
  );

  for (const preset of SOCIAL_PRESETS) {
    assert.ok(preset.aspectRatio.width > 0 && preset.aspectRatio.height > 0);
    assert.ok(preset.resolution.width > 0 && preset.resolution.height > 0);
    assert.ok(preset.fps >= 24);
    assert.ok(preset.recommendedDuration.minSeconds <= preset.recommendedDuration.idealSeconds);
    assert.ok(preset.recommendedDuration.idealSeconds <= preset.recommendedDuration.maxSeconds);
    assert.ok(preset.safeArea.id);
    for (const inset of Object.values(preset.safeArea.insetPercent)) {
      assert.ok(inset >= 0 && inset < 50);
    }
  }
});

test("uses platform-specific safe areas for vertical video", () => {
  assert.equal(getSocialPreset("tiktok").safeArea, SAFE_AREA_PROFILES.tiktok);
  assert.equal(getSocialPreset("instagram-reels").safeArea, SAFE_AREA_PROFILES.reels);
  assert.equal(getSocialPreset("youtube-shorts").safeArea, SAFE_AREA_PROFILES.shorts);
  assert.notDeepEqual(SAFE_AREA_PROFILES.tiktok.insetPercent, SAFE_AREA_PROFILES.reels.insetPercent);
});

test("keeps preset resolution proportional to its declared aspect ratio", () => {
  for (const preset of SOCIAL_PRESETS.filter((item) => item.id !== "custom")) {
    const declaredRatio = preset.aspectRatio.width / preset.aspectRatio.height;
    const pixelRatio = preset.resolution.width / preset.resolution.height;
    assert.ok(Math.abs(declaredRatio - pixelRatio) < 0.001, `${preset.id} has a mismatched resolution`);
  }
});

test("ships an accessible quick-create interaction and all integration callbacks", async () => {
  const source = await readFile(new URL("app/social-presets.tsx", root), "utf8");
  assert.match(source, /role="radiogroup"/);
  assert.match(source, /role="radio"/);
  assert.match(source, /aria-checked=\{isSelected\}/);
  assert.match(source, /onPresetSelect\?\.\(preset\)/);
  assert.match(source, /onCreate\?\.\(activePreset\)/);
  assert.match(source, /onCustomize\?\.\(activePreset\)/);
  assert.match(source, /Criar neste formato/);
});

test("ships responsive card styling with touch-sized actions", async () => {
  const source = await readFile(new URL("app/social-presets.module.css", root), "utf8");
  assert.match(source, /@media \(max-width: 560px\)/);
  assert.match(source, /scroll-snap-type: x mandatory/);
  assert.match(source, /min-height: 50px/);
  assert.match(source, /prefers-reduced-motion/);
});
