import assert from "node:assert/strict";
import test from "node:test";
import {
  createTimelineAudioPayload,
  filterAudioAssets,
  formatAudioDuration,
  KLIP_AUDIO_CATALOG,
  synthesizeAudio,
} from "../lib/audio/audio-library.ts";

test("built-in catalog only exposes original, commercially safe audio", () => {
  assert.ok(KLIP_AUDIO_CATALOG.length >= 7);
  for (const asset of KLIP_AUDIO_CATALOG) {
    assert.equal(asset.license.source, "klip-original");
    assert.equal(asset.license.commercialUse, true);
    assert.equal(asset.license.attributionRequired, false);
    assert.ok(asset.recipe);
    assert.ok(asset.duration > 0);
  }
});

test("synthesizer creates a valid deterministic mono WAV", async () => {
  const asset = KLIP_AUDIO_CATALOG.find((item) => item.id === "effect-pop");
  assert.ok(asset);
  const first = synthesizeAudio(asset, 8_000);
  const second = synthesizeAudio(asset, 8_000);
  const bytes = new Uint8Array(await first.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RIFF");
  assert.equal(new TextDecoder().decode(bytes.slice(8, 12)), "WAVE");
  assert.equal(first.type, "audio/wav");
  assert.equal(first.size, 44 + Math.round(asset.duration * 8_000) * 2);
  assert.deepEqual(await first.arrayBuffer(), await second.arrayBuffer());
});

test("search matches title, tags and mood in Portuguese", () => {
  assert.deepEqual(filterAudioAssets(KLIP_AUDIO_CATALOG, "transição").map((item) => item.id), [
    "effect-pop",
    "effect-whoosh",
    "effect-riser",
  ]);
  assert.deepEqual(filterAudioAssets(KLIP_AUDIO_CATALOG, "LEVE").map((item) => item.id), ["music-soft-vlog"]);
  assert.equal(filterAudioAssets(KLIP_AUDIO_CATALOG, "  ").length, KLIP_AUDIO_CATALOG.length);
});

test("duration formatter uses timeline-friendly minutes and seconds", () => {
  assert.equal(formatAudioDuration(0.36), "0,4 s");
  assert.equal(formatAudioDuration(65), "1:05");
});

test("timeline payload includes blob, file, object URL and exact duration", () => {
  const asset = KLIP_AUDIO_CATALOG.find((item) => item.id === "effect-click");
  assert.ok(asset);
  const payload = createTimelineAudioPayload(asset, synthesizeAudio(asset, 8_000));
  assert.ok(payload.blob instanceof Blob);
  assert.ok(payload.file instanceof File);
  assert.match(payload.url, /^blob:/);
  assert.equal(payload.duration, asset.duration);
  assert.equal(typeof payload.revoke, "function");
  payload.revoke();
  payload.revoke();
});
