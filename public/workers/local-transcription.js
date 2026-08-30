const TRANSFORMERS_MODULE_URL = new URL(
  "/_klip-ai/runtime",
  self.location.origin,
).href;
const MODEL_HOST = "https://huggingface.co/";
const ONNX_WASM_PATH = new URL("/_klip-ai/ort/", self.location.origin).href;
const MODEL_ID = "onnx-community/whisper-tiny";
const SAMPLE_RATE = 16_000;

let runtimePromise;
let transcriberPromise;
let transcriberDevice;

function send(message) {
  self.postMessage(message);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Erro desconhecido");
}

function normalizeProgress(value) {
  const progress = Number(value);
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, progress <= 1 ? progress * 100 : progress));
}

async function getRuntime() {
  runtimePromise ??= import(TRANSFORMERS_MODULE_URL);
  return runtimePromise;
}

async function createTranscriber(device) {
  const { env, pipeline } = await getRuntime();
  env.allowLocalModels = false;
  env.remoteHost = MODEL_HOST;
  env.remotePathTemplate = "{model}/resolve/{revision}/";
  env.useBrowserCache = true;
  env.logLevel = "error";
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.wasmPaths = ONNX_WASM_PATH;
    env.backends.onnx.wasm.numThreads = self.crossOriginIsolated
      ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1))
      : 1;
  }

  let lastProgress = -1;
  return pipeline("automatic-speech-recognition", MODEL_ID, {
    device,
    dtype:
      device === "webgpu"
        ? { encoder_model: "fp32", decoder_model_merged: "q4" }
        : "fp32",
    progress_callback: (event) => {
      if (event?.status !== "progress" && event?.status !== "progress_total") return;
      const nextProgress = Math.min(99, normalizeProgress(event.progress));
      if (
        nextProgress <= lastProgress ||
        (lastProgress >= 0 && nextProgress - lastProgress < 1)
      )
        return;
      lastProgress = nextProgress;
      send({
        type: "status",
        phase: "loading-model",
        progress: lastProgress,
        device,
      });
    },
  });
}

async function getTranscriber(device) {
  if (transcriberPromise && transcriberDevice !== device)
    throw new Error("O backend local mudou durante a transcrição.");
  if (!transcriberPromise) {
    transcriberDevice = device;
    transcriberPromise = createTranscriber(device).catch((error) => {
      transcriberPromise = undefined;
      transcriberDevice = undefined;
      throw error;
    });
  }
  return transcriberPromise;
}

function normalizeOutput(output, audioDuration) {
  const chunks = Array.isArray(output?.chunks) ? output.chunks : [];
  const segments = chunks
    .map((chunk) => {
      const text = String(chunk?.text || "").trim();
      const start = Number(chunk?.timestamp?.[0]);
      const rawEnd = Number(chunk?.timestamp?.[1]);
      const end = Number.isFinite(rawEnd) ? rawEnd : audioDuration;
      return {
        start: Number.isFinite(start) ? Math.max(0, start) : 0,
        end: Math.max(0, Math.min(audioDuration, end)),
        text,
      };
    })
    .filter((segment) => segment.text && segment.end > segment.start);

  if (segments.length) return segments;
  const text = String(output?.text || "").trim();
  return text && audioDuration > 0
    ? [{ start: 0, end: audioDuration, text }]
    : [];
}

async function transcribe(message) {
  const audio =
    message.audio instanceof Float32Array
      ? message.audio
      : new Float32Array(message.audio);
  if (!audio.length) throw new Error("O trecho de áudio local está vazio.");

  let device = transcriberDevice || "wasm";
  if (
    !transcriberPromise &&
    message.preferWebGpu !== false &&
    typeof navigator !== "undefined" &&
    "gpu" in navigator
  ) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) device = "webgpu";
    } catch {
      // CPU/WASM remains available when a browser only advertises WebGPU.
    }
  }

  let transcriber;
  try {
    send({ type: "status", phase: "loading-runtime", progress: 0, device });
    transcriber = await getTranscriber(device);
    send({ type: "status", phase: "transcribing", progress: 100, device });
    const output = await transcriber(audio, {
      return_timestamps: true,
      chunk_length_s: 28,
      stride_length_s: 4,
      task: message.targetLanguage === "en" ? "translate" : "transcribe",
    });
    const segments = normalizeOutput(output, audio.length / SAMPLE_RATE);
    send({ type: "result", segments, device });
  } catch (error) {
    try {
      await transcriber?.dispose?.();
    } catch {
      // The main thread terminates this worker after the error.
    }
    transcriberPromise = undefined;
    transcriberDevice = undefined;
    throw error;
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "transcribe") return;
  void transcribe(event.data).catch((error) => {
    send({ type: "error", message: errorMessage(error) });
  });
});
