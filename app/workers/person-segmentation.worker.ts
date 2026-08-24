import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

type IncomingMessage =
  | { type: "init" }
  | { type: "segment"; bitmap: ImageBitmap; timestamp: number }
  | { type: "close" };

type WorkerScope = {
  onmessage: ((event: MessageEvent<IncomingMessage>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

const scope = globalThis as unknown as WorkerScope;
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";

let segmenter: ImageSegmenter | null = null;
let previousAlpha: Float32Array | null = null;
let coreConfidence: Float32Array | null = null;
let backgroundIndex = 0;
let accessoryIndex = -1;

async function initialize() {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  const gpuCanvas =
    typeof OffscreenCanvas === "undefined" ? undefined : new OffscreenCanvas(1, 1);
  const options = {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" as const },
    runningMode: "VIDEO" as const,
    outputConfidenceMasks: true,
    outputCategoryMask: false,
    canvas: gpuCanvas,
  };
  try {
    if (!gpuCanvas) throw new Error("GPU indisponível no Worker");
    segmenter = await ImageSegmenter.createFromOptions(vision, options);
  } catch {
    // WebGL em Worker não existe em todos os computadores. A CPU continua
    // isolada da interface e, portanto, não congela a chamada.
    segmenter = await ImageSegmenter.createFromOptions(vision, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "CPU" },
      canvas: undefined,
    });
  }
  const labels = segmenter.getLabels().map((label) => label.toLowerCase());
  backgroundIndex = Math.max(0, labels.indexOf("background"));
  accessoryIndex = labels.findIndex((label) => /other|accessor/.test(label));
  scope.postMessage({ type: "ready" });
}

function segment(bitmap: ImageBitmap, timestamp: number) {
  if (!segmenter) {
    bitmap.close();
    return;
  }
  const started = performance.now();
  try {
    segmenter.segmentForVideo(bitmap, timestamp, (results) => {
      const masks = results.confidenceMasks;
      if (!masks?.length) throw new Error("A máscara da pessoa não foi gerada.");
      const width = masks[0].width;
      const height = masks[0].height;
      const total = width * height;
      if (!previousAlpha || previousAlpha.length !== total) {
        previousAlpha = new Float32Array(total);
        coreConfidence = new Float32Array(total);
      }
      const background = masks[backgroundIndex].getAsFloat32Array();
      const resolvedAccessoryIndex =
        accessoryIndex >= 0 ? accessoryIndex : masks.length >= 6 ? 5 : -1;
      const accessory =
        resolvedAccessoryIndex >= 0
          ? masks[resolvedAccessoryIndex].getAsFloat32Array()
          : null;
      const core = coreConfidence!;
      for (let index = 0; index < total; index += 1) {
        let confidence = 1 - background[index];
        if (accessory)
          confidence = Math.max(0, confidence - accessory[index]);
        core[index] = confidence;
      }
      const alpha = new Uint8ClampedArray(total);
      const previous = previousAlpha!;
      for (let index = 0; index < total; index += 1) {
        let confidence = core[index];
        const accessoryConfidence = accessory?.[index] ?? 0;
        if (accessoryConfidence > 0.42) {
          const x = index % width;
          const nearPerson =
            core[Math.max(0, index - width * 5)] > 0.34 ||
            core[Math.min(total - 1, index + width * 5)] > 0.34 ||
            core[index - Math.min(5, x)] > 0.34 ||
            core[index + Math.min(5, width - x - 1)] > 0.34;
          if (nearPerson)
            confidence = Math.max(confidence, accessoryConfidence * 0.88);
        }
        const normalized = Math.max(
          0,
          Math.min(1, (confidence - 0.25) / 0.43),
        );
        const target = normalized * normalized * (3 - 2 * normalized);
        const stabilized =
          target < 0.055
            ? 0
            : target > previous[index]
              ? previous[index] * 0.12 + target * 0.88
              : previous[index] * 0.28 + target * 0.72;
        previous[index] = stabilized;
        alpha[index] = Math.round(stabilized * 255);
      }
      scope.postMessage(
        {
          type: "mask",
          alpha: alpha.buffer,
          width,
          height,
          inferenceMs: performance.now() - started,
        },
        [alpha.buffer],
      );
    });
  } catch (error) {
    scope.postMessage({
      type: "error",
      message:
        error instanceof Error ? error.message : "Falha ao analisar a pessoa.",
    });
  } finally {
    bitmap.close();
  }
}

scope.onmessage = (event) => {
  if (event.data.type === "init") {
    void initialize().catch((error) => {
      scope.postMessage({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Falha ao preparar o fundo virtual.",
      });
    });
  } else if (event.data.type === "segment") {
    segment(event.data.bitmap, event.data.timestamp);
  } else {
    segmenter?.close();
    segmenter = null;
  }
};
