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
let backgroundIndex = 0;
let hairIndex = 1;
let bodySkinIndex = 2;
let faceSkinIndex = 3;
let clothesIndex = 4;
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
    segmenter = await ImageSegmenter.createFromOptions(vision, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "CPU" },
      canvas: undefined,
    });
  }
  const labels = segmenter.getLabels().map((label) => label.toLowerCase());
  backgroundIndex = Math.max(0, labels.indexOf("background"));
  hairIndex = Math.max(1, labels.indexOf("hair"));
  bodySkinIndex = Math.max(2, labels.indexOf("body-skin"));
  faceSkinIndex = Math.max(3, labels.indexOf("face-skin"));
  clothesIndex = Math.max(4, labels.indexOf("clothes"));
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
      }
      const resolvedAccessoryIndex =
        accessoryIndex >= 0 ? accessoryIndex : masks.length >= 6 ? 5 : -1;
      const background = masks[backgroundIndex].getAsFloat32Array();
      const hair = masks[hairIndex].getAsFloat32Array();
      const bodySkin = masks[bodySkinIndex].getAsFloat32Array();
      const faceSkin = masks[faceSkinIndex].getAsFloat32Array();
      const clothes = masks[clothesIndex].getAsFloat32Array();
      const accessories =
        resolvedAccessoryIndex >= 0
          ? masks[resolvedAccessoryIndex].getAsFloat32Array()
          : null;

      const softAlpha = new Uint8ClampedArray(total);
      const previous = previousAlpha!;

      // Algoritmo de Alta Precisão Anti-Pixelado & Preservação de Fones Pretos:
      for (let index = 0; index < total; index += 1) {
        const hairVal = hair[index];
        const bodySkinVal = bodySkin[index];
        const faceSkinVal = faceSkin[index];
        const clothesVal = clothes[index];
        const accVal = accessories ? accessories[index] : 0;
        const bgVal = background[index];

        // 1. Confiança semântica total com boost em acessórios/fones pretos
        const personFg =
          hairVal * 1.32 +
          faceSkinVal * 1.15 +
          bodySkinVal * 1.15 +
          clothesVal * 1.08 +
          accVal * 1.45;

        // 2. Razão direta contra fundo
        const relativeFg = personFg / (personFg + bgVal * 1.05 + 1e-4);

        // 3. Fones e óculos têm prioridade para nunca sumirem
        let confidence = Math.max(relativeFg, personFg * 0.95);
        if (accVal > 0.18) {
          confidence = Math.max(confidence, accVal * 1.25);
        }

        // 4. Curva de corte suave (0.36 a 0.72) para bordas sem pixelado e sem fumaça
        const normalized = Math.max(
          0,
          Math.min(1, (confidence - 0.36) / 0.36),
        );
        const target = normalized * normalized * (3 - 2 * normalized);

        // 5. Estabilização temporal de alta resposta
        const prev = previous[index];
        const stabilized =
          target > prev
            ? prev * 0.08 + target * 0.92
            : prev * 0.18 + target * 0.82;

        previous[index] = stabilized < 0.01 ? 0 : stabilized;
        softAlpha[index] = Math.round(previous[index] * 255);
      }

      scope.postMessage(
        {
          type: "mask",
          alpha: softAlpha.buffer,
          width,
          height,
          inferenceMs: performance.now() - started,
        },
        [softAlpha.buffer],
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
