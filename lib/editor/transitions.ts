export const TRANSITION_KINDS = [
  "fade-black",
  "fade-white",
  "flash",
  "noise",
  "wipe",
  "none",
] as const;

export type TransitionKind = (typeof TRANSITION_KINDS)[number];
export type AppliedTransitionKind = Exclude<TransitionKind, "none">;

export function normalizeTransitionKind(value: unknown): TransitionKind | null {
  // Projetos <= v6 chamavam este overlay pontilhado de `dissolve`, embora ele
  // nunca fizesse crossfade A/B. O valor antigo continua legível sem manter a
  // promessa incorreta na interface ou no formato atual.
  if (value === "dissolve") return "noise";
  return TRANSITION_KINDS.includes(value as TransitionKind)
    ? (value as TransitionKind)
    : null;
}

export function normalizeAppliedTransitionKind(
  value: unknown,
): AppliedTransitionKind {
  const normalized = normalizeTransitionKind(value);
  return normalized && normalized !== "none" ? normalized : "fade-black";
}

export function normalizeOptionalTransitionKind(
  value: unknown,
): AppliedTransitionKind | undefined {
  const normalized = normalizeTransitionKind(value);
  return normalized && normalized !== "none" ? normalized : undefined;
}

export function transitionLabel(kind: TransitionKind) {
  return {
    "fade-black": "Fade preto",
    "fade-white": "Fade branco",
    flash: "Flash",
    noise: "Ruído",
    wipe: "Cortina",
    none: "Sem transição",
  }[kind];
}

export function transitionDuration(kind: TransitionKind) {
  if (kind === "none") return 0;
  if (kind === "flash") return 0.42;
  if (kind === "noise") return 0.8;
  if (kind === "wipe") return 0.7;
  return 1;
}
