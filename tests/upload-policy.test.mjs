import assert from "node:assert/strict";
import test from "node:test";
import {
  directStorageUploadEndpoint,
  isAllowedPublishingVideoUrl,
  isOwnedUploadPath,
  normalizeVideoContentType,
  storagePathFromPublicVideoUrl,
  validatePublishVideoMetadata,
} from "../lib/publishing/upload-policy.ts";

const supabaseUrl = "https://project-ref.supabase.co";

test("accepts supported video containers and strips codec parameters", () => {
  assert.equal(
    normalizeVideoContentType("video/webm;codecs=vp9,opus"),
    "video/webm",
  );
  assert.deepEqual(validatePublishVideoMetadata({ size: 42, contentType: "video/mp4" }), {
    ok: true,
    contentType: "video/mp4",
    extension: "mp4",
    size: 42,
  });
  assert.equal(
    validatePublishVideoMetadata({ size: 42, contentType: "", fileName: "clip.MOV" })
      .contentType,
    "video/quicktime",
  );
});

test("rejects empty, oversized and non-video upload metadata", () => {
  assert.equal(validatePublishVideoMetadata({ size: 0, contentType: "video/mp4" }).ok, false);
  assert.equal(
    validatePublishVideoMetadata({ size: 501 * 1024 * 1024, contentType: "video/mp4" }).ok,
    false,
  );
  assert.equal(validatePublishVideoMetadata({ size: 10, contentType: "text/html" }).ok, false);
});

test("only accepts a user's unambiguous generated storage path", () => {
  assert.equal(isOwnedUploadPath("user-1/2026-08/asset.mp4", "user-1"), true);
  assert.equal(isOwnedUploadPath("user-2/2026-08/asset.mp4", "user-1"), false);
  assert.equal(isOwnedUploadPath("user-1/../asset.mp4", "user-1"), false);
});

test("publishing URL allowlist blocks arbitrary hosts and private-network SSRF", () => {
  const valid =
    "https://project-ref.supabase.co/storage/v1/object/public/klip-videos/user/file.mp4";
  assert.equal(isAllowedPublishingVideoUrl(valid, supabaseUrl), true);
  assert.equal(
    isAllowedPublishingVideoUrl(
      "https://project-ref.storage.supabase.co/storage/v1/object/public/klip-videos/user/file.mp4",
      supabaseUrl,
    ),
    true,
  );
  assert.equal(isAllowedPublishingVideoUrl("http://127.0.0.1/admin", supabaseUrl), false);
  assert.equal(isAllowedPublishingVideoUrl("https://evil.example/video.mp4", supabaseUrl), false);
  assert.equal(storagePathFromPublicVideoUrl(valid), "user/file.mp4");
});

test("derives the direct TUS storage hostname", () => {
  assert.equal(
    directStorageUploadEndpoint(supabaseUrl),
    "https://project-ref.storage.supabase.co/storage/v1/upload/resumable",
  );
});
