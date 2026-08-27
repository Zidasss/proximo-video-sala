import type { SVGProps } from "react";

import styles from "./KlipAppLogo.module.css";

export type KlipAppLogoVariant = "full" | "symbol" | "wordmark";
export type KlipAppLogoTone = "auto" | "dark" | "light" | "monochrome";

export type KlipAppLogoProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  decorative?: boolean;
  label?: string;
  tone?: KlipAppLogoTone;
  variant?: KlipAppLogoVariant;
};

function SymbolMark() {
  return (
    <>
      <path
        className={styles.primary}
        d="M16 6C9.373 6 4 11.373 4 18v28c0 6.627 5.373 12 12 12 4.152 0 8.008-2.147 10.196-5.676l9.079-14.644a10.65 10.65 0 0 0-.123-11.445L26.08 11.449A11.999 11.999 0 0 0 16 6Z"
      />
      <path
        className={styles.secondary}
        d="M48 6c6.627 0 12 5.373 12 12v28c0 6.627-5.373 12-12 12a12 12 0 0 1-9.225-4.331L23.871 35.742a5.81 5.81 0 0 1 0-7.484L38.775 10.33A12 12 0 0 1 48 6Z"
      />
      <path
        className={styles.cut}
        d="m27.085 29.74 3.755-4.517 6.121 6.918a2.8 2.8 0 0 1 .031 3.672l-5.996 7.028-3.911-4.704 4.05-4.804a1.8 1.8 0 0 0-.02-2.352l-4.03-4.558v3.317Z"
      />
    </>
  );
}

export function KlipAppLogo({
  className,
  decorative = false,
  height,
  label = "KLIPAPP",
  tone = "auto",
  variant = "full",
  width,
  ...props
}: KlipAppLogoProps) {
  const isSymbol = variant === "symbol";
  const isWordmark = variant === "wordmark";
  const viewBox = isSymbol ? "0 0 64 64" : isWordmark ? "0 0 176 64" : "0 0 242 64";
  const defaultWidth = isSymbol ? 32 : isWordmark ? 104 : 128;
  const defaultHeight = isSymbol ? 32 : 30;
  const toneClass = tone === "auto" ? "" : styles[tone];

  return (
    <svg
      {...props}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : label}
      className={[styles.logo, toneClass, className].filter(Boolean).join(" ")}
      focusable="false"
      height={height ?? defaultHeight}
      role={decorative ? undefined : "img"}
      viewBox={viewBox}
      width={width ?? defaultWidth}
      xmlns="http://www.w3.org/2000/svg"
    >
      {!isWordmark && (
        <g transform={isSymbol ? undefined : "translate(4 4) scale(.86)"}>
          <SymbolMark />
        </g>
      )}
      {!isSymbol && (
        <text
          className={styles.wordmark}
          x={isWordmark ? 2 : 70}
          y="41"
        >
          KLIPAPP
        </text>
      )}
    </svg>
  );
}

export default KlipAppLogo;
