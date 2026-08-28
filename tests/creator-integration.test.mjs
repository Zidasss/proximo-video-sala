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
  assert.match(page, /feed-portrait/);
  assert.match(page, /selectedSocialPreset\.safeArea\.insetPercent/);
  assert.match(page, /version: 6/);
  assert.match(page, /visualEffectIntensity/);
  assert.match(page, /editorTimelineDuration \|\| duration \|\| trackLength/);
  assert.match(page, /audioTimelineStart: montageItem\?\.timelineStart \|\| 0/);
  assert.match(page, /audioTimelineTime = activeRange\.audioTimelineStart \+ localTime/);
  assert.match(page, /APP_VERSION = "v0\.22\.2"/);
  assert.match(page, /editor-tool-rail/);
  assert.match(page, /export-settings-popover/);
  assert.match(page, /radar-thumbnail/);
});

test("keeps the KLIPAPP creator hub readable on desktop and mobile", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  const designSystem = await readFile(new URL("app/styles/klipapp.css", root), "utf8");
  assert.match(css, /\.studio-hub-backdrop/);
  assert.match(css, /\.studio-quick-actions/);
  assert.match(css, /max-height: 93dvh/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(page, /KLIPAPP Studio/);
  assert.match(designSystem, /html\[data-klip-theme="dark"\]/);
  assert.match(designSystem, /html\[data-klip-theme="light"\]/);
  assert.match(css, /--studio-timeline-h: 340px/);
  assert.match(css, /\.editor-tool-dock/);
  assert.match(css, /\.timeline-panel\.multi-timeline/);
  assert.match(page, /setTimelineZoomAnchored/);
  assert.match(page, /onPrecisionWheel/);
  assert.match(page, /passive: false/);
  assert.match(page, /max="64"/);
  assert.match(page, /Precisão 1 ms/);
  assert.match(page, /klip_theme/);
  assert.match(css, /data-klip-theme="light"/);
  assert.match(css, /timeline-scroll-viewport/);
});
