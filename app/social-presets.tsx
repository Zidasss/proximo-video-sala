"use client";

import { useId, useState, type CSSProperties } from "react";
import { ArrowRight, Check, Play } from "lucide-react";
import styles from "./social-presets.module.css";
import {
  getSocialPreset,
  SOCIAL_PRESETS,
  type SocialPreset,
  type SocialPresetId,
} from "./social-preset-data";

export {
  getSocialPreset,
  SAFE_AREA_PROFILES,
  SOCIAL_PRESETS,
} from "./social-preset-data";
export type {
  SafeAreaInset,
  SafeAreaProfile,
  SocialPreset,
  SocialPresetId,
} from "./social-preset-data";

export type QuickCreateProps = {
  selectedId?: SocialPresetId;
  defaultSelectedId?: SocialPresetId;
  onPresetSelect?: (preset: SocialPreset) => void;
  onCreate?: (preset: SocialPreset) => void;
  onCustomize?: (preset: SocialPreset) => void;
  className?: string;
  heading?: string;
  description?: string;
};

export function QuickCreate({
  selectedId,
  defaultSelectedId = "instagram-reels",
  onPresetSelect,
  onCreate,
  onCustomize,
  className,
  heading = "O que você quer criar?",
  description = "Escolha o destino. A KLIPAPP prepara o formato e a área segura.",
}: QuickCreateProps) {
  const [internalSelectedId, setInternalSelectedId] = useState(defaultSelectedId);
  const descriptionId = useId();
  const activeId = selectedId ?? internalSelectedId;
  const activePreset = getSocialPreset(activeId);

  const selectPreset = (preset: SocialPreset) => {
    if (selectedId === undefined) setInternalSelectedId(preset.id);
    onPresetSelect?.(preset);
  };

  const startCreation = () => {
    if (activePreset.customizable) {
      onCustomize?.(activePreset);
      return;
    }
    onCreate?.(activePreset);
  };

  return (
    <section className={[styles.quickCreate, className].filter(Boolean).join(" ")} aria-labelledby={`${descriptionId}-title`}>
      <div className={styles.headingRow}>
        <div>
          <span className={styles.kicker}>CRIAR RÁPIDO</span>
          <h2 id={`${descriptionId}-title`} className={styles.heading}>{heading}</h2>
          <p id={descriptionId} className={styles.description}>{description}</p>
        </div>
        <span className={styles.step} aria-label="Etapa 1 de 2">1 / 2</span>
      </div>

      <div className={styles.presetGrid} role="radiogroup" aria-describedby={descriptionId} aria-label="Formato de publicação">
        {SOCIAL_PRESETS.map((preset) => {
          const isSelected = preset.id === activeId;
          const previewStyle = {
            "--preset-accent": preset.accent,
            "--preview-ratio": `${preset.aspectRatio.width} / ${preset.aspectRatio.height}`,
          } as CSSProperties;

          return (
            <button
              key={preset.id}
              type="button"
              className={`${styles.presetCard} ${isSelected ? styles.selected : ""}`}
              style={previewStyle}
              role="radio"
              aria-checked={isSelected}
              aria-label={`${preset.title}, formato ${preset.aspectRatio.label}`}
              onClick={() => selectPreset(preset)}
            >
              <span className={styles.preview} aria-hidden="true">
                <span className={styles.previewSafeArea} />
                <span className={styles.previewPlay}><Play aria-hidden="true" size={14} fill="currentColor" /></span>
              </span>
              <span className={styles.cardCopy}>
                <span className={styles.eyebrow}>{preset.eyebrow}</span>
                <strong>{preset.title}</strong>
                <span className={styles.cardMeta}>
                  {preset.aspectRatio.label} · {preset.resolution.width}×{preset.resolution.height}
                </span>
                <span className={styles.duration}>{preset.recommendedDuration.label} · {preset.fps} fps</span>
              </span>
              <span className={styles.check} aria-hidden="true"><Check size={14} /></span>
            </button>
          );
        })}
      </div>

      <div className={styles.summary} aria-live="polite">
        <div className={styles.summaryCopy}>
          <span className={styles.summaryLabel}>Formato escolhido</span>
          <strong>{activePreset.title}</strong>
          <span>
            {activePreset.aspectRatio.label} · {activePreset.resolution.width}×{activePreset.resolution.height} · {activePreset.safeArea.label}
          </span>
        </div>
        <button type="button" className={styles.createButton} onClick={startCreation}>
          {activePreset.customizable ? "Definir formato" : "Criar neste formato"}
          <ArrowRight aria-hidden="true" size={16} />
        </button>
      </div>
    </section>
  );
}

export default QuickCreate;
