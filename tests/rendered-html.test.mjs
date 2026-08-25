import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("keeps the Klip editor interaction model in the production source", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(page, /function ClipEditorV2/);
  assert.match(page, /function beginTimelineItemDrag/);
  assert.match(page, /function moveTimelineItemDrag/);
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
  assert.match(css, /\.timeline-more/);
  assert.match(css, /@media \(max-width: 760px\)/);
});
