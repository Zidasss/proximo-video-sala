"use client";

import {
  forwardRef,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";
import { LoaderCircle } from "lucide-react";
import styles from "./ui.module.css";
import { cx, type UIIntent, type UISize, type UIStatus } from "./utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: UIIntent;
  size?: UISize;
  loading?: boolean;
  loadingLabel?: string;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    loadingLabel = "Carregando",
    fullWidth = false,
    leadingIcon,
    trailingIcon,
    className,
    disabled,
    children,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        styles.button,
        styles[`variant_${variant}`],
        styles[`size_${size}`],
        fullWidth && styles.fullWidth,
        loading && styles.isLoading,
        className,
      )}
    >
      {loading ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : leadingIcon}
      <span className={styles.buttonLabel}>{loading ? loadingLabel : children}</span>
      {!loading && trailingIcon}
    </button>
  );
});

export interface IconButtonProps
  extends Omit<ButtonProps, "children" | "leadingIcon" | "trailingIcon" | "fullWidth"> {
  label: string;
  icon: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, className, loadingLabel = label, ...props },
  ref,
) {
  return (
    <Button
      {...props}
      ref={ref}
      aria-label={label}
      title={props.title ?? label}
      loadingLabel={loadingLabel}
      className={cx(styles.iconButton, className)}
    >
      <span aria-hidden="true" className={styles.iconButtonGlyph}>
        {icon}
      </span>
    </Button>
  );
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: UIStatus;
  size?: Exclude<UISize, "lg">;
  dot?: boolean;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = "neutral", size = "md", dot = false, className, children, ...props },
  ref,
) {
  return (
    <span
      {...props}
      ref={ref}
      className={cx(styles.badge, styles[`tone_${tone}`], styles[`badge_${size}`], className)}
    >
      {dot && <span className={styles.badgeDot} aria-hidden="true" />}
      {children}
    </span>
  );
});

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "outlined" | "interactive";
  padding?: "none" | UISize;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = "default", padding = "md", className, ...props },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      className={cx(styles.card, styles[`card_${variant}`], styles[`padding_${padding}`], className)}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return <div {...props} ref={ref} className={cx(styles.cardHeader, className)} />;
  },
);

export const CardBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardBody({ className, ...props }, ref) {
    return <div {...props} ref={ref} className={cx(styles.cardBody, className)} />;
  },
);

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return <div {...props} ref={ref} className={cx(styles.cardFooter, className)} />;
  },
);

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  width?: string | number;
  height?: string | number;
  circle?: boolean;
  lines?: number;
}

export function Skeleton({ width, height, circle = false, lines = 1, className, style, ...props }: SkeletonProps) {
  const skeletonStyle = { width, height, ...style };
  if (lines > 1) {
    return (
      <span {...props} className={cx(styles.skeletonGroup, className)} aria-hidden="true">
        {Array.from({ length: lines }, (_, index) => (
          <span
            key={index}
            className={styles.skeleton}
            style={{ ...skeletonStyle, width: index === lines - 1 ? "72%" : width }}
          />
        ))}
      </span>
    );
  }
  return (
    <span
      {...props}
      aria-hidden="true"
      className={cx(styles.skeleton, circle && styles.skeletonCircle, className)}
      style={skeletonStyle}
    />
  );
}

export interface StatusIndicatorProps extends HTMLAttributes<HTMLSpanElement> {
  status?: UIStatus;
  label: string;
  pulse?: boolean;
}

export const StatusIndicator = forwardRef<HTMLSpanElement, StatusIndicatorProps>(
  function StatusIndicator({ status = "neutral", label, pulse = false, className, ...props }, ref) {
    return (
      <span
        {...props}
        ref={ref}
        className={cx(styles.statusIndicator, styles[`tone_${status}`], className)}
      >
        <span className={cx(styles.statusDot, pulse && styles.statusPulse)} aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  },
);

export interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  src?: string | null;
  alt?: string;
  name: string;
  size?: UISize | "xl";
  status?: UIStatus;
  imageProps?: Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt">;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toLocaleUpperCase();
}

const statusLabels: Record<UIStatus, string> = {
  neutral: "neutro",
  info: "informativo",
  success: "disponível",
  warning: "atenção",
  danger: "indisponível",
};

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { src, alt, name, size = "md", status, imageProps, className, ...props },
  ref,
) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = Boolean(src && failedSrc === src);
  const fallback = useMemo(() => initials(name), [name]);
  const accessibleName = status
    ? `${alt ?? name}, status ${statusLabels[status]}`
    : alt ?? name;

  return (
    <span
      {...props}
      ref={ref}
      className={cx(styles.avatar, styles[`avatar_${size}`], className)}
      role="img"
      aria-label={accessibleName}
    >
      {src && !failed ? (
        // A user-provided avatar may be hosted outside Next Image's configured domains.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          {...imageProps}
          src={src}
          alt=""
          className={cx(styles.avatarImage, imageProps?.className)}
          onError={(event) => {
            setFailedSrc(src ?? null);
            imageProps?.onError?.(event);
          }}
        />
      ) : (
        <span className={styles.avatarFallback} aria-hidden="true">
          {fallback || "?"}
        </span>
      )}
      {status && (
        <span
          className={cx(styles.avatarStatus, styles[`status_${status}`])}
          aria-hidden="true"
        />
      )}
    </span>
  );
});
