import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("keeps the Klip editor interaction model in the production source", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(page, /function ClipEditorV2/);
  assert.match(page, /function beginTimelineItemDrag/);
  assert.match(page, /function moveTimelineItemDrag/);
  assert.match(page, /function beginTimelineFadeDrag/);
  assert.match(page, /function beginPlayheadDrag/);
  assert.match(page, /function copySelected/);
  assert.match(page, /function pasteSelected/);
  assert.match(page, /function openContextMenu/);
  assert.match(page, /function updateSnapGuide/);
  assert.match(page, /function addSceneVideo/);
  assert.match(page, /function addSceneMedia/);
  assert.match(page, /target: "main" \| "scene"/);
  assert.match(page, /role: "scene"/);
  assert.match(page, /editor-workspace-empty/);
  assert.match(page, /empty-timeline-message/);
  assert.match(page, /function turnPhotoIntoClip/);
  assert.match(page, /function togglePreviewPlayback/);
  assert.match(page, /event\.key === "Delete"/);
  assert.match(page, /event\.code === "Space"/);
});

test("ships direct-manipulation styling for desktop and mobile timelines", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(css, /\.timeline-item-clip/);
  assert.match(css, /\.timeline-clip-handle/);
  assert.match(css, /\.timeline-transition/);
  assert.match(css, /\.timeline-play-toggle/);
  assert.match(css, /\.clip-fade-handle/);
  assert.match(css, /\.timeline-context-menu/);
  assert.match(css, /\.timeline-snap-guide/);
  assert.match(css, /\.tool-disclosure/);
  assert.match(css, /\.editor-workspace-empty/);
  assert.match(css, /\.editor-empty-upload/);
  assert.match(css, /\.media-destinations/);
  assert.match(css, /\.editor-replace-upload/);
  assert.match(css, /\.timeline-more/);
  assert.match(css, /@media \(max-width: 760px\)/);
});
