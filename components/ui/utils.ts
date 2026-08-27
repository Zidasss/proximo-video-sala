import type { CSSProperties } from "react";

export type UIIntent = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type UISize = "sm" | "md" | "lg";
export type UIStatus = "neutral" | "info" | "success" | "warning" | "danger";

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
export function cssVars(
  values: Record<`--${string}`, string | number | undefined>,
  style?: CSSProperties,
): CSSProperties {
  return { ...values, ...style } as CSSProperties;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
