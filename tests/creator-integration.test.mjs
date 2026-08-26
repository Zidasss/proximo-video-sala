import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("integrates creator formats, licensed audio and visual effects into the real editor", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(page, /<QuickCreate/);
  assert.match(page, /<AudioLibrary/);
  assert.match(page, /<EffectsGallery/);
  assert.match(page, /drawVisualEffectFrame/);
  assert.match(page, /payload\.revoke\(\)/);
  assert.match(page, /Feed retrato 4:5/);
  assert.match(page, /selectedSocialPreset\.safeArea\.insetPercent/);
  assert.match(page, /version: 6/);
  assert.match(page, /visualEffectIntensity/);
  assert.match(page, /editorTimelineDuration \|\| duration \|\| trackLength/);
  assert.match(page, /audioTimelineStart: montageItem\?\.timelineStart \|\| 0/);
  assert.match(page, /audioTimelineTime = activeRange\.audioTimelineStart \+ localTime/);
  assert.match(page, /APP_VERSION = "v0\.18\.0"/);
});

test("keeps the creator hub readable on desktop and mobile", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(css, /\.studio-hub-backdrop/);
  assert.match(css, /\.studio-quick-actions/);
  assert.match(css, /max-height: 93dvh/);
  assert.match(css, /@media \(max-width: 430px\)/);
});
