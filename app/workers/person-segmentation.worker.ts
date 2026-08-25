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
const neighbors = new Int32Array(4);

let segmenter: ImageSegmenter | null = null;
let previousAlpha: Float32Array | null = null;
let backgroundIndex = 0;
let coreConfidence: Float32Array | null = null;
let candidateMask: Uint8Array | null = null;
let retainedMask: Uint8Array | null = null;
let accessoryMask: Uint8Array | null = null;
let queue: Int32Array | null = null;
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
        coreConfidence = new Float32Array(total);
        candidateMask = new Uint8Array(total);
        retainedMask = new Uint8Array(total);
        accessoryMask = new Uint8Array(total);
        queue = new Int32Array(total);
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

      // Fusão multi-sinal otimizada para pessoa de frente e de perfil lateral:
      // Quando a pessoa vira de lado, a detecção facial frontal diminui, mas a silhueta
      // (1 - background), pele do pescoço/orelha (bodySkin/faceSkin), cabelo e ombros sustentam o recorte.
      const softAlpha = new Uint8ClampedArray(total);
      const previous = previousAlpha!;
      for (let index = 0; index < total; index += 1) {
        const bgConfidence = background[index];
        const personSilhouette = Math.max(0, 1 - bgConfidence);
        const detail = Math.max(
          hair[index] * 1.34,
          bodySkin[index] * 1.25,
          faceSkin[index] * 1.18,
          clothes[index] * 1.20,
        );
        // Combina silhueta do corpo inteiro com partes detalhadas
        let confidence = Math.max(personSilhouette, detail);
        if (detail > 0.06) {
          confidence = Math.max(confidence, personSilhouette * 0.82 + detail * 0.48);
        }
        if (accessories && (detail > 0.04 || personSilhouette > 0.32)) {
          confidence = Math.max(confidence, accessories[index] * 0.80);
        }
        // Limiar suave adaptativo (0.11) para não morder as bordas do perfil da cabeça, nariz, orelhas e ombros
        const normalized = Math.max(
          0,
          Math.min(1, (confidence - 0.11) / 0.42),
        );
        const target = normalized * normalized * (3 - 2 * normalized);
        const stabilized =
          target > previous[index]
            ? previous[index] * 0.18 + target * 0.82
            : previous[index] * 0.38 + target * 0.62;
        previous[index] = stabilized < 0.015 ? 0 : stabilized;
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
      return;
      const core = coreConfidence!;
      const acceptedAccessories = accessoryMask!;
      const candidates = candidateMask!;
      const retained = retainedMask!;
      const workQueue = queue!;
      acceptedAccessories.fill(0);
      candidates.fill(0);
      retained.fill(0);

      // Cabelo escuro e fios finos têm confiança menor que pele/roupa. O peso
      // próprio evita o efeito de "careca", sem tornar objetos do cenário em
      // pessoa porque a conectividade é filtrada logo abaixo.
      for (let index = 0; index < total; index += 1) {
        core[index] = Math.min(
          1,
          hair[index] * 1.72 +
            bodySkin[index] * 1.08 +
            faceSkin[index] * 1.08 +
            clothes[index],
        );
      }

      // "Others" significa acessórios no cartão oficial do modelo. Semeamos
      // somente acessórios próximos de cabelo/rosto/pele e então seguimos o
      // componente conectado (armação, haste, headset e fio), sem aceitar um
      // objeto isolado da estante.
      let queueHead = 0;
      let queueTail = 0;
      if (accessories) {
        const acceptedAccessoryConfidence = accessories as Float32Array;
        for (let index = 0; index < total; index += 1) {
          if (acceptedAccessoryConfidence[index] < 0.3) continue;
          const x = index % width;
          const nearHead =
            hair[index] > 0.07 ||
            faceSkin[index] > 0.1 ||
            bodySkin[index] > 0.24 ||
            hair[Math.max(0, index - width * 9)] > 0.09 ||
            hair[Math.min(total - 1, index + width * 9)] > 0.09 ||
            faceSkin[index - Math.min(9, x)] > 0.12 ||
            faceSkin[index + Math.min(9, width - x - 1)] > 0.12;
          if (nearHead) {
            acceptedAccessories[index] = 1;
            workQueue[queueTail++] = index;
          }
        }
        while (queueHead < queueTail) {
          const index = workQueue[queueHead++];
          const x = index % width;
          neighbors[0] = index - width;
          neighbors[1] = index + width;
          neighbors[2] = index - 1;
          neighbors[3] = index + 1;
          for (let side = 0; side < 4; side += 1) {
            const neighbor = neighbors[side];
            if (
              neighbor >= 0 &&
              neighbor < total &&
              (side < 2 || (side === 2 ? x > 0 : x + 1 < width)) &&
              !acceptedAccessories[neighbor] &&
              acceptedAccessoryConfidence[neighbor] >= 0.24
            ) {
              acceptedAccessories[neighbor] = 1;
              workQueue[queueTail++] = neighbor;
            }
          }
        }
      }

      // Mantém apenas regiões ligadas a cabelo ou pele. Isso remove cadeiras,
      // estantes e manchas de roupa previstas longe da pessoa.
      queueHead = 0;
      queueTail = 0;
      for (let index = 0; index < total; index += 1) {
        const accessoryConfidence = accessories?.[index] ?? 0;
        const confidence = Math.max(
          core[index],
          acceptedAccessories[index] ? accessoryConfidence * 0.96 : 0,
        );
        core[index] = confidence;
        candidates[index] = confidence > 0.105 ? 1 : 0;
        if (
          candidates[index] &&
          (faceSkin[index] > 0.115 || bodySkin[index] > 0.19)
        ) {
          retained[index] = 1;
          workQueue[queueTail++] = index;
        }
      }
      while (queueHead < queueTail) {
        const index = workQueue[queueHead++];
        const x = index % width;
        neighbors[0] = index - width;
        neighbors[1] = index + width;
        neighbors[2] = index - 1;
        neighbors[3] = index + 1;
        for (let side = 0; side < 4; side += 1) {
          const neighbor = neighbors[side];
          if (
            neighbor >= 0 &&
            neighbor < total &&
            (side < 2 || (side === 2 ? x > 0 : x + 1 < width)) &&
            candidates[neighbor] &&
            !retained[neighbor]
          ) {
            retained[neighbor] = 1;
            workQueue[queueTail++] = neighbor;
          }
        }
      }

      const alpha = new Uint8ClampedArray(total);
      const previousLegacy = previousAlpha!;
      for (let index = 0; index < total; index += 1) {
        const confidence = retained[index] ? core[index] : 0;
        const normalized = Math.max(
          0,
          Math.min(1, (confidence - 0.1) / 0.5),
        );
        const target = normalized * normalized * (3 - 2 * normalized);
        const stabilized =
          target < 0.055
            ? 0
            : target > previousLegacy[index]
              ? previousLegacy[index] * 0.12 + target * 0.88
              : previousLegacy[index] * 0.28 + target * 0.72;
        previousLegacy[index] = stabilized;
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
