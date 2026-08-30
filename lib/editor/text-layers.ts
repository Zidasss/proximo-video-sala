export type TextEffect =
  "none" | "pop" | "slide" | "typewriter" | "zoom" | "bounce";

export type TextLayer = {
  id: string;
  text: string;
  font: string;
  color: string;
  size: number;
  x: number;
  y: number;
  align: "left" | "center" | "right";
  start: number;
  end: number;
  fadeIn: number;
  fadeOut: number;
  effect: TextEffect;
  background: boolean;
  kind?: "text" | "caption";
  captionOrigin?: "generated" | "imported" | "manual";
  captionSpeaker?: "P1" | "P2";
};

const TEXT_EFFECTS = [
  "none",
  "pop",
  "slide",
  "typewriter",
  "zoom",
  "bounce",
] as const;
const TEXT_FONTS = [
  "Inter",
  "Arial Black",
  "Georgia",
  "Courier New",
  "Impact",
  "Trebuchet MS",
] as const;
const MAX_TEXT_LAYERS = 1_000;
const MAX_TEXT_LENGTH = 10_000;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const finiteNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const safeString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value.slice(0, MAX_TEXT_LENGTH) : fallback;

export function scaleTextLayerSize(
  layerSize: number,
  frameWidth: number,
  frameHeight: number,
) {
  const shortEdge = Math.max(1, Math.min(frameWidth, frameHeight));
  return Math.max(1, layerSize * (shortEdge / 1_080));
}

/**
 * Treats project files and IndexedDB recovery as untrusted input. React escapes
 * text, but malformed ranges/objects could still corrupt the editor or create a
 * huge render. This keeps the current project format backward-compatible while
 * establishing bounded domain values.
 */
export function sanitizeTextLayers(
  value: unknown,
  projectDuration: number,
  createId: () => string = () => crypto.randomUUID(),
): TextLayer[] {
  if (!Array.isArray(value)) return [];
  const duration = Math.max(0.1, finiteNumber(projectDuration, 0.1));

  return value.slice(0, MAX_TEXT_LAYERS).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Record<string, unknown>;
    const start = clamp(finiteNumber(item.start, 0), 0, duration - 0.05);
    const end = clamp(finiteNumber(item.end, duration), start + 0.05, duration);
    const rangeDuration = end - start;
    const effect = TEXT_EFFECTS.includes(item.effect as TextEffect)
      ? (item.effect as TextEffect)
      : "none";
    const font = TEXT_FONTS.includes(item.font as (typeof TEXT_FONTS)[number])
      ? (item.font as string)
      : "Inter";
    const color =
      typeof item.color === "string" && /^#[\da-f]{6}$/i.test(item.color)
        ? item.color
        : "#ffffff";
    const align = ["left", "center", "right"].includes(String(item.align))
      ? (item.align as TextLayer["align"])
      : "center";
    const kind = ["text", "caption"].includes(String(item.kind))
      ? (item.kind as TextLayer["kind"])
      : undefined;
    const captionOrigin = ["generated", "imported", "manual"].includes(
      String(item.captionOrigin),
    )
      ? (item.captionOrigin as TextLayer["captionOrigin"])
      : undefined;
    const captionSpeaker = ["P1", "P2"].includes(String(item.captionSpeaker))
      ? (item.captionSpeaker as TextLayer["captionSpeaker"])
      : undefined;

    return [
      {
        id:
          typeof item.id === "string" && item.id.trim()
            ? item.id.slice(0, 128)
            : createId(),
        text: safeString(item.text),
        font,
        color,
        size: clamp(finiteNumber(item.size, 48), 18, 140),
        x: clamp(finiteNumber(item.x, 50), 0, 100),
        y: clamp(finiteNumber(item.y, 82), 0, 100),
        align,
        start,
        end,
        fadeIn: clamp(finiteNumber(item.fadeIn, 0), 0, rangeDuration / 2),
        fadeOut: clamp(finiteNumber(item.fadeOut, 0), 0, rangeDuration / 2),
        effect,
        background: Boolean(item.background),
        ...(kind ? { kind } : {}),
        ...(captionOrigin ? { captionOrigin } : {}),
        ...(captionSpeaker ? { captionSpeaker } : {}),
      },
    ];
  });
}
