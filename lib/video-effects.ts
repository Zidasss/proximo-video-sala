/**
 * Portable visual-effect descriptions shared by the editor preview and canvas export.
 * No browser state or random values are stored here, so the same inputs always
 * produce the same frame.
 */

export const VISUAL_EFFECT_CATEGORIES = [
  { id: "movement", label: "Movimento" },
  { id: "color", label: "Cor" },
  { id: "social", label: "Social" },
  { id: "retro", label: "Retrô" },
] as const;

export type VisualEffectCategory =
  (typeof VISUAL_EFFECT_CATEGORIES)[number]["id"];

export type VisualEffectId =
  | "soft-zoom"
  | "pan-parallax"
  | "shake"
  | "cinema"
  | "vibrant"
  | "black-and-white"
  | "warm"
  | "flash"
  | "social-pop"
  | "glitch"
  | "vhs"
  | "film-dust";

export type VisualEffectOverlay =
  | { kind: "color"; color: string; opacity: number; blendMode: "screen" | "multiply" | "overlay" }
  | { kind: "scanlines"; opacity: number; spacing: number }
  | { kind: "noise"; opacity: number; seed: number; density: number }
  | { kind: "rgb-split"; opacity: number; offsetX: number; offsetY: number }
  | { kind: "vignette"; opacity: number }
  | { kind: "letterbox"; size: number; opacity: number };

export interface VisualEffectFrame {
  transform: {
    scale: number;
    translateX: number;
    translateY: number;
    rotationDeg: number;
  };
  color: {
    brightness: number;
    contrast: number;
    saturation: number;
    grayscale: number;
    sepia: number;
    hueRotateDeg: number;
  };
  opacity: number;
  overlays: readonly VisualEffectOverlay[];
}

export interface VisualEffectDefinition {
  id: VisualEffectId;
  name: string;
  category: VisualEffectCategory;
  description: string;
  durationMs: number;
  badge: string;
  /** Stable defaults persisted in an editor project and read by exporters. */
  exportParameters: Readonly<Record<string, number | string | boolean>>;
}

export interface VisualEffectApplication {
  schemaVersion: 1;
  effectId: VisualEffectId;
  durationMs: number;
  intensity: number;
  parameters: Readonly<Record<string, number | string | boolean>>;
}

export const VISUAL_EFFECTS: readonly VisualEffectDefinition[] = [
  {
    id: "soft-zoom",
    name: "Zoom suave",
    category: "movement",
    description: "Aproxima devagar e devolve profundidade ao quadro.",
    durationMs: 3200,
    badge: "ZOOM",
    exportParameters: { maxScale: 1.075, easing: "sine-in-out" },
  },
  {
    id: "pan-parallax",
    name: "Pan / parallax",
    category: "movement",
    description: "Desliza a cena com uma leve aproximação cinematográfica.",
    durationMs: 3800,
    badge: "PAN",
    exportParameters: { scale: 1.09, travelX: 0.075, travelY: 0.018 },
  },
  {
    id: "shake",
    name: "Tremor",
    category: "movement",
    description: "Cria impacto com movimento curto de câmera na mão.",
    durationMs: 760,
    badge: "SHAKE",
    exportParameters: { scale: 1.045, frequency: 18, amplitude: 0.012, seed: 731 },
  },
  {
    id: "cinema",
    name: "Cinema",
    category: "color",
    description: "Contraste elegante, cores contidas e barras sutis.",
    durationMs: 2400,
    badge: "CINE",
    exportParameters: { contrast: 1.14, saturation: 0.9, sepia: 0.08, letterbox: 0.055 },
  },
  {
    id: "vibrant",
    name: "Vibrante",
    category: "color",
    description: "Realça as cores mantendo tons de pele luminosos.",
    durationMs: 2200,
    badge: "VIVA",
    exportParameters: { saturation: 1.42, contrast: 1.06, brightness: 1.02 },
  },
  {
    id: "black-and-white",
    name: "P&B",
    category: "color",
    description: "Preto e branco nítido com contraste editorial.",
    durationMs: 2200,
    badge: "P&B",
    exportParameters: { grayscale: 1, contrast: 1.18, brightness: 1.01 },
  },
  {
    id: "warm",
    name: "Quente",
    category: "color",
    description: "Luz dourada acolhedora para beleza, moda e rotina.",
    durationMs: 2200,
    badge: "GLOW",
    exportParameters: { saturation: 1.15, sepia: 0.2, brightness: 1.04, overlay: "#ff9b55" },
  },
  {
    id: "flash",
    name: "Flash",
    category: "social",
    description: "Pulso branco rápido para marcar cortes e batidas.",
    durationMs: 1100,
    badge: "FLASH",
    exportParameters: { peakAt: 0.22, width: 0.12, opacity: 0.72 },
  },
  {
    id: "social-pop",
    name: "Pop",
    category: "social",
    description: "Entrada elástica para revelar produtos e chamadas.",
    durationMs: 1200,
    badge: "POP",
    exportParameters: { minScale: 0.92, overshoot: 1.055, settleAt: 0.62 },
  },
  {
    id: "glitch",
    name: "Glitch",
    category: "retro",
    description: "Saltos digitais com separação de canais de cor.",
    durationMs: 1450,
    badge: "GLITCH",
    exportParameters: { displacement: 0.018, rgbOffset: 0.008, frequency: 12, seed: 404 },
  },
  {
    id: "vhs",
    name: "VHS",
    category: "retro",
    description: "Fita analógica com scanlines, ruído e cor deslocada.",
    durationMs: 2100,
    badge: "VHS",
    exportParameters: { scanlineSpacing: 4, noiseDensity: 0.12, seed: 1987, hue: -5 },
  },
  {
    id: "film-dust",
    name: "Filme antigo",
    category: "retro",
    description: "Grão, vinheta e calor de película revelada.",
    durationMs: 2600,
    badge: "FILM",
    exportParameters: { noiseDensity: 0.18, sepia: 0.15, vignette: 0.42, seed: 35 },
  },
] as const;

const EFFECT_BY_ID = new Map(VISUAL_EFFECTS.map((effect) => [effect.id, effect]));

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const loop = (value: number) => ((value % 1) + 1) % 1;
const sineEase = (value: number) => (1 - Math.cos(Math.PI * clamp(value))) / 2;

/** Stable pseudo-random value in the [0, 1) interval. */
const seededUnit = (seed: number) => {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
};

const baseFrame = (): VisualEffectFrame => ({
  transform: { scale: 1, translateX: 0, translateY: 0, rotationDeg: 0 },
  color: {
    brightness: 1,
    contrast: 1,
    saturation: 1,
    grayscale: 0,
    sepia: 0,
    hueRotateDeg: 0,
  },
  opacity: 1,
  overlays: [],
});

export function getVisualEffect(id: VisualEffectId): VisualEffectDefinition {
  const effect = EFFECT_BY_ID.get(id);
  if (!effect) throw new Error(`Efeito visual desconhecido: ${id as string}`);
  return effect;
}

export function createVisualEffectApplication(
  id: VisualEffectId,
  intensity = 1,
): VisualEffectApplication {
  const effect = getVisualEffect(id);
  return {
    schemaVersion: 1,
    effectId: id,
    durationMs: effect.durationMs,
    intensity: clamp(intensity, 0, 2),
    parameters: { ...effect.exportParameters },
  };
}

/**
 * Resolves a frame at normalized progress. Transforms use destination-relative
 * coordinates, e.g. translateX=.02 means two percent of the output width.
 */
export function getVisualEffectFrame(
  id: VisualEffectId,
  progress: number,
  intensity = 1,
): VisualEffectFrame {
  const p = loop(progress);
  const amount = clamp(intensity, 0, 2);
  const frame = baseFrame();

  switch (id) {
    case "soft-zoom": {
      const pulse = (1 - Math.cos(Math.PI * 2 * p)) / 2;
      frame.transform.scale = 1 + 0.075 * pulse * amount;
      break;
    }
    case "pan-parallax": {
      const travel = sineEase(p);
      frame.transform.scale = 1 + 0.09 * amount;
      frame.transform.translateX = (-0.0375 + 0.075 * travel) * amount;
      frame.transform.translateY = Math.sin(p * Math.PI) * -0.018 * amount;
      break;
    }
    case "shake": {
      const step = Math.floor(p * 18);
      frame.transform.scale = 1 + 0.045 * amount;
      frame.transform.translateX = (seededUnit(731 + step * 2) - 0.5) * 0.024 * amount;
      frame.transform.translateY = (seededUnit(732 + step * 2) - 0.5) * 0.021 * amount;
      frame.transform.rotationDeg = (seededUnit(733 + step) - 0.5) * 1.5 * amount;
      break;
    }
    case "cinema": {
      frame.color.contrast = 1 + 0.14 * amount;
      frame.color.saturation = 1 - 0.1 * amount;
      frame.color.sepia = 0.08 * amount;
      frame.overlays = [{ kind: "letterbox", size: 0.055 * amount, opacity: 0.9 }];
      break;
    }
    case "vibrant": {
      frame.color.saturation = 1 + 0.42 * amount;
      frame.color.contrast = 1 + 0.06 * amount;
      frame.color.brightness = 1 + 0.02 * amount;
      break;
    }
    case "black-and-white": {
      frame.color.grayscale = clamp(amount);
      frame.color.contrast = 1 + 0.18 * amount;
      frame.color.brightness = 1 + 0.01 * amount;
      break;
    }
    case "warm": {
      frame.color.saturation = 1 + 0.15 * amount;
      frame.color.sepia = 0.2 * amount;
      frame.color.brightness = 1 + 0.04 * amount;
      frame.overlays = [{ kind: "color", color: "#ff9b55", opacity: 0.07 * amount, blendMode: "overlay" }];
      break;
    }
    case "flash": {
      const distance = Math.abs(p - 0.22);
      const alpha = clamp(1 - distance / 0.12) * 0.72 * amount;
      frame.color.brightness = 1 + alpha * 0.22;
      frame.overlays = [{ kind: "color", color: "#ffffff", opacity: clamp(alpha), blendMode: "screen" }];
      break;
    }
    case "social-pop": {
      const entry = clamp(p / 0.62);
      const spring = 1 - Math.exp(-5.5 * entry) * Math.cos(entry * Math.PI * 3.1);
      frame.transform.scale = 1 + ((0.92 + spring * 0.08) - 1) * amount;
      frame.color.saturation = 1 + Math.sin(p * Math.PI) * 0.13 * amount;
      break;
    }
    case "glitch": {
      const step = Math.floor(p * 12);
      const active = seededUnit(404 + step) > 0.42 ? 1 : 0;
      const jump = (seededUnit(405 + step) - 0.5) * 0.036 * active * amount;
      frame.transform.scale = 1 + 0.022 * active * amount;
      frame.transform.translateX = jump;
      frame.color.contrast = 1 + 0.16 * active * amount;
      frame.color.saturation = 1 + 0.22 * active * amount;
      frame.overlays = [{
        kind: "rgb-split",
        opacity: 0.32 * active * amount,
        offsetX: (jump >= 0 ? 1 : -1) * 0.008 * amount,
        offsetY: 0.002 * amount,
      }];
      break;
    }
    case "vhs": {
      const step = Math.floor(p * 24);
      frame.transform.scale = 1.018;
      frame.transform.translateX = (seededUnit(1987 + step) - 0.5) * 0.006 * amount;
      frame.color.contrast = 1 + 0.13 * amount;
      frame.color.saturation = 1 + 0.2 * amount;
      frame.color.hueRotateDeg = -5 * amount;
      frame.overlays = [
        { kind: "scanlines", opacity: 0.19 * amount, spacing: 4 },
        { kind: "noise", opacity: 0.1 * amount, seed: 1987 + step, density: 0.12 },
        { kind: "rgb-split", opacity: 0.12 * amount, offsetX: 0.0035, offsetY: 0 },
      ];
      break;
    }
    case "film-dust": {
      const step = Math.floor(p * 16);
      frame.color.sepia = 0.15 * amount;
      frame.color.contrast = 1 + 0.08 * amount;
      frame.color.saturation = 1 - 0.08 * amount;
      frame.overlays = [
        { kind: "noise", opacity: 0.16 * amount, seed: 35 + step, density: 0.18 },
        { kind: "vignette", opacity: 0.42 * amount },
      ];
      break;
    }
    default: {
      const exhaustive: never = id;
      return exhaustive;
    }
  }

  return frame;
}

export function visualEffectFrameToCssFilter(frame: VisualEffectFrame): string {
  return [
    `brightness(${frame.color.brightness.toFixed(4)})`,
    `contrast(${frame.color.contrast.toFixed(4)})`,
    `saturate(${frame.color.saturation.toFixed(4)})`,
    `grayscale(${frame.color.grayscale.toFixed(4)})`,
    `sepia(${frame.color.sepia.toFixed(4)})`,
    `hue-rotate(${frame.color.hueRotateDeg.toFixed(3)}deg)`,
  ].join(" ");
}

export interface DrawVisualEffectOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fit?: "cover" | "contain";
  intensity?: number;
}

function sourceDimensions(source: CanvasImageSource) {
  const candidate = source as CanvasImageSource & {
    videoWidth?: number;
    videoHeight?: number;
    naturalWidth?: number;
    naturalHeight?: number;
    width?: number;
    height?: number;
  };
  return {
    width: candidate.videoWidth || candidate.naturalWidth || candidate.width || 1,
    height: candidate.videoHeight || candidate.naturalHeight || candidate.height || 1,
  };
}

/** Draws one export-ready frame using the same parameters returned to the editor. */
export function drawVisualEffectFrame(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  id: VisualEffectId,
  progress: number,
  options: DrawVisualEffectOptions = {},
): VisualEffectFrame {
  const x = options.x ?? 0;
  const y = options.y ?? 0;
  const width = options.width ?? context.canvas.width;
  const height = options.height ?? context.canvas.height;
  const frame = getVisualEffectFrame(id, progress, options.intensity);
  const dimensions = sourceDimensions(source);
  const fitScale = (options.fit ?? "cover") === "cover"
    ? Math.max(width / dimensions.width, height / dimensions.height)
    : Math.min(width / dimensions.width, height / dimensions.height);
  const drawnWidth = dimensions.width * fitScale;
  const drawnHeight = dimensions.height * fitScale;
  const centerX = x + width / 2 + frame.transform.translateX * width;
  const centerY = y + height / 2 + frame.transform.translateY * height;

  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.translate(centerX, centerY);
  context.rotate((frame.transform.rotationDeg * Math.PI) / 180);
  context.scale(frame.transform.scale, frame.transform.scale);
  context.globalAlpha = frame.opacity;
  context.filter = visualEffectFrameToCssFilter(frame);
  context.drawImage(source, -drawnWidth / 2, -drawnHeight / 2, drawnWidth, drawnHeight);
  context.restore();

  for (const overlay of frame.overlays) {
    drawOverlay(context, source, overlay, { x, y, width, height, drawnWidth, drawnHeight });
  }
  return frame;
}

function drawOverlay(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  overlay: VisualEffectOverlay,
  box: { x: number; y: number; width: number; height: number; drawnWidth: number; drawnHeight: number },
) {
  const { x, y, width, height, drawnWidth, drawnHeight } = box;
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.globalAlpha = clamp(overlay.opacity);

  if (overlay.kind === "color") {
    context.globalCompositeOperation = overlay.blendMode;
    context.fillStyle = overlay.color;
    context.fillRect(x, y, width, height);
  } else if (overlay.kind === "scanlines") {
    context.fillStyle = "#050505";
    const spacing = Math.max(2, Math.round(overlay.spacing));
    for (let lineY = y; lineY < y + height; lineY += spacing) {
      context.fillRect(x, lineY, width, 1);
    }
  } else if (overlay.kind === "noise") {
    const cells = Math.max(18, Math.round(220 * overlay.density));
    const cellWidth = width / cells;
    const cellHeight = height / Math.max(12, Math.round(cells * height / width));
    context.fillStyle = "#ffffff";
    for (let index = 0; index < cells * 3; index += 1) {
      const noiseX = seededUnit(overlay.seed + index * 2);
      const noiseY = seededUnit(overlay.seed + index * 2 + 1);
      context.fillRect(x + noiseX * width, y + noiseY * height, cellWidth, cellHeight);
    }
  } else if (overlay.kind === "rgb-split") {
    context.globalCompositeOperation = "screen";
    context.filter = "saturate(2.2) hue-rotate(125deg)";
    context.drawImage(
      source,
      x + (width - drawnWidth) / 2 + overlay.offsetX * width,
      y + (height - drawnHeight) / 2 + overlay.offsetY * height,
      drawnWidth,
      drawnHeight,
    );
  } else if (overlay.kind === "vignette") {
    const gradient = context.createRadialGradient(
      x + width / 2,
      y + height / 2,
      Math.min(width, height) * 0.2,
      x + width / 2,
      y + height / 2,
      Math.max(width, height) * 0.7,
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,1)");
    context.fillStyle = gradient;
    context.fillRect(x, y, width, height);
  } else if (overlay.kind === "letterbox") {
    const barHeight = height * clamp(overlay.size, 0, 0.25);
    context.fillStyle = "#050505";
    context.fillRect(x, y, width, barHeight);
    context.fillRect(x, y + height - barHeight, width, barHeight);
  }

  context.restore();
}
