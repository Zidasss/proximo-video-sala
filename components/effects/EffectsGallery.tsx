"use client";

import Image from "next/image";
import React, { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  createVisualEffectApplication,
  getVisualEffectFrame,
  VISUAL_EFFECT_CATEGORIES,
  VISUAL_EFFECTS,
  visualEffectFrameToCssFilter,
  type VisualEffectApplication,
  type VisualEffectCategory,
  type VisualEffectDefinition,
  type VisualEffectId,
} from "../../lib/video-effects";
import styles from "./EffectsGallery.module.css";

export interface EffectPreviewMedia {
  src: string;
  type: "image" | "video";
  poster?: string;
  /** The preview is decorative when omitted because the card already names the effect. */
  alt?: string;
}

export interface EffectsGalleryProps {
  media: EffectPreviewMedia | null;
  selectedEffectId?: VisualEffectId | null;
  intensity?: number;
  disabled?: boolean;
  className?: string;
  onApply: (
    effect: VisualEffectDefinition,
    application: VisualEffectApplication,
  ) => void;
  onPreview?: (
    effect: VisualEffectDefinition | null,
    application: VisualEffectApplication | null,
  ) => void;
}

type PreviewStyle = React.CSSProperties & {
  "--effect-duration": string;
  "--preview-filter": string;
};

function EffectMedia({ media }: { media: EffectPreviewMedia | null }) {
  if (!media) {
    return (
      <span className={styles.emptyMedia} aria-hidden="true">
        <span />
        <small>Prévia</small>
      </span>
    );
  }

  if (media.type === "video") {
    return (
      <video
        className={styles.media}
        src={media.src}
        poster={media.poster}
        muted
        loop
        autoPlay
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
    );
  }

  return (
    <Image
      className={styles.media}
      src={media.src}
      alt={media.alt ?? ""}
      fill
      sizes="(max-width: 560px) 44vw, 180px"
      unoptimized
    />
  );
}

function EffectPreview({
  effect,
  media,
  intensity,
}: {
  effect: VisualEffectDefinition;
  media: EffectPreviewMedia | null;
  intensity: number;
}) {
  const sampleFrame = getVisualEffectFrame(effect.id, 0.36, intensity);
  const previewStyle: PreviewStyle = {
    "--effect-duration": `${effect.durationMs}ms`,
    "--preview-filter": visualEffectFrameToCssFilter(sampleFrame),
  };

  return (
    <span
      className={styles.preview}
      data-effect={effect.id}
      style={previewStyle}
      aria-hidden="true"
    >
      <span className={styles.mediaMotion}>
        <EffectMedia media={media} />
      </span>
      <span className={styles.rgbGhost} />
      <span className={styles.scanlines} />
      <span className={styles.noise} />
      <span className={styles.flash} />
      <span className={styles.vignette} />
      <span className={styles.letterbox} />
      <span className={styles.previewBadge}>{effect.badge}</span>
      <span className={styles.playHint}>Segure para ver</span>
    </span>
  );
}

export function EffectsGallery({
  media,
  selectedEffectId,
  intensity = 1,
  disabled = false,
  className,
  onApply,
  onPreview,
}: EffectsGalleryProps) {
  const [activeCategory, setActiveCategory] =
    useState<VisualEffectCategory>("movement");
  const [localSelection, setLocalSelection] = useState<VisualEffectId | null>(
    selectedEffectId ?? null,
  );
  const [announcement, setAnnouncement] = useState("");

  const visibleEffects = useMemo(
    () => VISUAL_EFFECTS.filter((effect) => effect.category === activeCategory),
    [activeCategory],
  );
  const effectiveSelection = selectedEffectId === undefined
    ? localSelection
    : selectedEffectId;

  const applicationFor = (effect: VisualEffectDefinition) =>
    createVisualEffectApplication(effect.id, intensity);

  const handleApply = (effect: VisualEffectDefinition) => {
    if (disabled) return;
    setLocalSelection(effect.id);
    setAnnouncement(`${effect.name} aplicado à mídia atual.`);
    onApply(effect, applicationFor(effect));
  };

  const handlePreview = (effect: VisualEffectDefinition | null) => {
    if (disabled || !onPreview) return;
    onPreview(effect, effect ? applicationFor(effect) : null);
  };

  const handleTabKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let target = index;
    if (event.key === "ArrowLeft") target = (index - 1 + VISUAL_EFFECT_CATEGORIES.length) % VISUAL_EFFECT_CATEGORIES.length;
    if (event.key === "ArrowRight") target = (index + 1) % VISUAL_EFFECT_CATEGORIES.length;
    if (event.key === "Home") target = 0;
    if (event.key === "End") target = VISUAL_EFFECT_CATEGORIES.length - 1;
    const category = VISUAL_EFFECT_CATEGORIES[target];
    setActiveCategory(category.id);
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']");
    tabs?.[target]?.focus();
  };

  const rootClassName = [styles.gallery, className].filter(Boolean).join(" ");
  const panelId = `effects-panel-${activeCategory}`;

  return (
    <section className={rootClassName} aria-labelledby="effects-gallery-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>EFEITOS VISUAIS</p>
          <h2 id="effects-gallery-title">Dê movimento ao seu clipe</h2>
          <p>Veja o resultado na sua própria mídia antes de aplicar.</p>
        </div>
        <span className={styles.mediaState} data-ready={Boolean(media)}>
          <i aria-hidden="true" />
          {media ? "Prévia ao vivo" : "Adicione uma mídia"}
        </span>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Categorias de efeitos">
        {VISUAL_EFFECT_CATEGORIES.map((category, index) => {
          const selected = category.id === activeCategory;
          return (
            <button
              key={category.id}
              id={`effects-tab-${category.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={selected ? panelId : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveCategory(category.id)}
              onKeyDown={(event) => handleTabKey(event, index)}
            >
              {category.label}
            </button>
          );
        })}
      </div>

      <div
        id={panelId}
        className={styles.grid}
        role="tabpanel"
        aria-labelledby={`effects-tab-${activeCategory}`}
      >
        {visibleEffects.map((effect) => {
          const selected = effectiveSelection === effect.id;
          return (
            <button
              key={effect.id}
              type="button"
              className={styles.card}
              data-selected={selected}
              aria-pressed={selected}
              aria-label={`${effect.name}. ${effect.description} Aplicar efeito.`}
              disabled={disabled}
              onClick={() => handleApply(effect)}
              onFocus={() => handlePreview(effect)}
              onBlur={() => handlePreview(null)}
              onPointerEnter={() => handlePreview(effect)}
              onPointerLeave={() => handlePreview(null)}
            >
              <EffectPreview effect={effect} media={media} intensity={intensity} />
              <span className={styles.cardCopy}>
                <strong>{effect.name}</strong>
                <small>{effect.description}</small>
                <span className={styles.applyLabel}>
                  {selected ? "Aplicado" : "Aplicar"}
                  <i aria-hidden="true"><ArrowRight size={14} /></i>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className={styles.srOnly} role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}

export default EffectsGallery;
