import assert from "node:assert/strict";
import test from "node:test";
import {
  createLocalTranscriptionSession,
  friendlyLocalTranscriptionError,
  parseFloat32Wave,
} from "../lib/editor/local-transcription.ts";

function float32Wave(samples) {
  const buffer = new ArrayBuffer(44 + samples.length * 4);
  const view = new DataView(buffer);
  const writeText = (offset, value) =>
    [...value].forEach((character, index) =>
      view.setUint8(offset + index, character.charCodeAt(0)),
    );
  writeText(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 64_000, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 32, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 4, true);
  samples.forEach((sample, index) => view.setFloat32(44 + index * 4, sample, true));
  return buffer;
}

test("reads mono float WAV generated for the local Whisper worker", () => {
  const samples = parseFloat32Wave(float32Wave([0, 0.25, -0.5, 1]));
  assert.deepEqual([...samples], [0, 0.25, -0.5, 1]);
});

test("rejects malformed local audio before starting the model", () => {
  assert.throws(
    () => parseFloat32Wave(new ArrayBuffer(44)),
    /WAV válido/,
  );
});

test("explains the one-time local model download on a network failure", () => {
  assert.match(
    friendlyLocalTranscriptionError(new TypeError("Failed to fetch")),
    /Conecte-se uma vez/,
  );
});

test("falls back from WebGPU and reuses the CPU worker for later blocks", async (t) => {
  const originalWorker = globalThis.Worker;
  const instances = [];

  class FakeWorker {
    constructor() {
      this.index = instances.length;
      this.messages = [];
      this.terminated = false;
      this.onmessage = null;
      this.onerror = null;
      instances.push(this);
    }

    postMessage(message) {
      this.messages.push(message);
      queueMicrotask(() => {
        if (this.index === 0) {
          this.onmessage?.({
            data: {
              type: "status",
              phase: "loading-runtime",
              progress: 0,
              device: "webgpu",
            },
          });
          this.onmessage?.({
            data: { type: "error", message: "GPU adapter failed" },
          });
          return;
        }
        this.onmessage?.({
          data: {
            type: "status",
            phase: "transcribing",
            progress: 100,
            device: "wasm",
          },
        });
        this.onmessage?.({
          data: {
            type: "result",
            device: "wasm",
            segments: [{ start: 0, end: 1, text: "fala local" }],
          },
        });
      });
    }

    terminate() {
      this.terminated = true;
    }
  }

  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    writable: true,
    value: FakeWorker,
  });
  t.after(() => {
    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      writable: true,
      value: originalWorker,
    });
  });

  const controller = new AbortController();
  const progress = [];
  const session = createLocalTranscriptionSession(controller.signal);
  const first = await session.transcribe(new Float32Array([0.1, 0.2]), {
    targetLanguage: "original",
    onProgress: (value) => progress.push(value.phase),
  });
  const second = await session.transcribe(new Float32Array([0.3, 0.4]), {
    targetLanguage: "original",
  });
  session.dispose();

  assert.equal(first.device, "wasm");
  assert.equal(second.segments[0].text, "fala local");
  assert.deepEqual(progress, ["loading-runtime", "fallback-wasm", "transcribing"]);
  assert.equal(instances.length, 2);
  assert.equal(instances[0].messages[0].preferWebGpu, true);
  assert.equal(instances[1].messages[0].preferWebGpu, false);
  assert.equal(instances[1].messages.length, 2);
  assert.equal(instances[1].terminated, true);
});
