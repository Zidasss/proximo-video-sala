"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileVideo,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  Tag,
  UploadCloud,
  X,
} from "lucide-react";
import { Badge, Button, Input, Modal, Select, Textarea } from "./ui";
import { SocialPlatform, PlatformPublishStatus } from "../lib/types/publishing";
import {
  cleanupPublishingUpload,
  uploadVideoForPublishing,
} from "../lib/publishing/direct-upload";
import { validatePublishVideoMetadata } from "../lib/publishing/upload-policy";
import styles from "./SocialPublishing.module.css";

const YouTubeIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z" />
  </svg>
);

const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.81 4.48 6.27 6.27 0 0 0 1.99-4.48V8.69a8.18 8.18 0 0 0 4.79 1.52V6.76c-.34-.02-.68-.05-1-.07Z" />
  </svg>
);

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072c-4.358.2-6.78 2.618-6.98 6.98C.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98C23.986 15.668 24 15.259 24 12c0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838A6.162 6.162 0 1 0 12 18.163 6.162 6.162 0 0 0 12 5.838Zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88Z" />
  </svg>
);

const platformOptions: Array<{ id: SocialPlatform; name: string; icon: React.ReactNode }> = [
  { id: "youtube", name: "YouTube", icon: <YouTubeIcon /> },
  { id: "tiktok", name: "TikTok", icon: <TikTokIcon /> },
  { id: "instagram", name: "Instagram", icon: <InstagramIcon /> },
];

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoBlob?: Blob | null;
  videoUrl?: string;
  defaultTitle?: string;
}

const emptyStatus = (): Record<SocialPlatform, PlatformPublishStatus> => ({
  youtube: { platform: "youtube", status: "idle", progress: 0 },
  tiktok: { platform: "tiktok", status: "idle", progress: 0 },
  instagram: { platform: "instagram", status: "idle", progress: 0 },
});

export function PublishModal({
  isOpen,
  onClose,
  videoBlob: initialVideoBlob,
  videoUrl: initialVideoUrl,
  defaultTitle = "Novo vídeo no KLIPAPP",
}: PublishModalProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [hashtags, setHashtags] = useState(["Shorts", "Reels", "TikTok", "Viral"]);
  const [customTag, setCustomTag] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>(["youtube", "tiktok", "instagram"]);
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">("public");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStep, setPublishStep] = useState("");
  const [formError, setFormError] = useState("");
  const [activeBlob, setActiveBlob] = useState<Blob | null>(initialVideoBlob || null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(initialVideoUrl || "");
  const [videoFileName, setVideoFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [platformStatus, setPlatformStatus] = useState(emptyStatus);
  const [isCompleted, setIsCompleted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const publishAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (initialVideoBlob) setActiveBlob(initialVideoBlob);
      else if (initialVideoUrl) setVideoPreviewUrl(initialVideoUrl);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialVideoBlob, initialVideoUrl]);

  useEffect(() => {
    if (!activeBlob) return;
    const objectUrl = URL.createObjectURL(activeBlob);
    const timer = window.setTimeout(() => setVideoPreviewUrl(objectUrl), 0);
    return () => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(objectUrl);
    };
  }, [activeBlob]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      setIsCompleted(false);
      setFormError("");
      setPublishStep("");
      setPlatformStatus(emptyStatus());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const handleProcessFile = (file: File) => {
    const validation = validatePublishVideoMetadata({
      size: file.size,
      contentType: file.type,
      fileName: file.name,
    });
    if (!validation.ok) {
      setFormError(validation.error);
      return;
    }
    setFormError("");
    setActiveBlob(file);
    setVideoFileName(file.name);
    if (!title || ["Novo Vídeo Klip", "Meu Novo Vídeo no Klip", "Novo vídeo no KLIPAPP"].includes(title)) {
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
    }
  };

  const togglePlatform = (platform: SocialPlatform) => {
    setSelectedPlatforms((current) => {
      if (!current.includes(platform)) return [...current, platform];
      return current.length === 1 ? current : current.filter((item) => item !== platform);
    });
  };

  const addHashtag = (tag: string) => {
    const clean = tag.replace(/^#/, "").trim();
    if (!clean) return;
    setHashtags((current) => (current.includes(clean) ? current : [...current, clean]));
    setCustomTag("");
  };

  const handlePublish = async () => {
    if (!videoPreviewUrl && !activeBlob) {
      setFormError("Adicione um vídeo antes de publicar.");
      return;
    }
    if (!title.trim()) {
      setFormError("Informe um título para o vídeo.");
      return;
    }

    setFormError("");
    setIsPublishing(true);
    setIsCompleted(false);
    setPublishStep("Preparando o vídeo…");
    const abortController = new AbortController();
    publishAbortRef.current?.abort();
    publishAbortRef.current = abortController;
    let uploadedPath = "";
    let publishRequested = false;

    try {
      let finalVideoUrl = videoPreviewUrl;
      let videoContentType = activeBlob?.type || "";
      if (activeBlob) {
        const uploadFile =
          activeBlob instanceof File
            ? activeBlob
            : new File(
                [activeBlob],
                videoFileName ||
                  (activeBlob.type.includes("webm")
                    ? "klipapp-video.webm"
                    : "klipapp-video.mp4"),
                { type: activeBlob.type },
              );
        const ticket = await uploadVideoForPublishing(uploadFile, {
          signal: abortController.signal,
          onProgress: (progress) =>
            setPublishStep(`Enviando vídeo com segurança… ${progress}%`),
        });
        uploadedPath = ticket.mock ? "" : ticket.path;
        finalVideoUrl = ticket.videoUrl;
        videoContentType = ticket.contentType || uploadFile.type;
      }

      setPublishStep("Publicando nas redes selecionadas…");
      setPlatformStatus((current) => {
        const next = { ...current };
        selectedPlatforms.forEach((platform) => {
          next[platform] = { platform, status: "uploading", progress: 40 };
        });
        return next;
      });

      publishRequested = true;
      const response = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          title: title.trim(),
          description,
          hashtags,
          platforms: selectedPlatforms,
          visibility,
          videoUrl: finalVideoUrl,
          videoContentType,
          uploadPath: uploadedPath || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "A publicação não pôde ser concluída.");
      if (data.results) setPlatformStatus((current) => ({ ...current, ...data.results }));
      setIsCompleted(true);
      setPublishStep("Publicação concluída.");
    } catch (error) {
      if (uploadedPath && !publishRequested)
        await cleanupPublishingUpload(uploadedPath);
      if (!(error instanceof DOMException && error.name === "AbortError"))
        console.error(error);
      setFormError(
        error instanceof DOMException && error.name === "AbortError"
          ? "Publicação cancelada com segurança."
          : error instanceof Error
            ? error.message
            : "Ocorreu um erro durante a publicação.",
      );
      setPublishStep("");
    } finally {
      if (publishAbortRef.current === abortController)
        publishAbortRef.current = null;
      setIsPublishing(false);
    }
  };

  const handleClose = () => {
    if (isPublishing) {
      publishAbortRef.current?.abort();
      setPublishStep("Cancelando envio…");
      return;
    }
    onClose();
  };

  const suggestedTags = ["Shorts", "Reels", "TikTok", "Viral", "FYP", "Trending", "KLIPAPP", "Dicas", "Humor"];

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      size="xl"
      className={`${styles.modalTheme} ${styles.publishModal}`}
      title={<span className={styles.titleWithIcon}><Share2 aria-hidden="true" /> Publicar</span>}
      description="Prepare uma vez e distribua nas redes conectadas."
      closeLabel="Fechar publicação"
      footer={
        <div className={styles.footerActions}>
          <Button variant="ghost" size="lg" onClick={handleClose}>
            {isPublishing ? "Cancelar envio" : "Cancelar"}
          </Button>
          <Button
            size="lg"
            onClick={handlePublish}
            disabled={!selectedPlatforms.length}
            loading={isPublishing}
            loadingLabel="Publicando…"
            leadingIcon={<Send aria-hidden="true" />}
          >
            Publicar em {selectedPlatforms.length} {selectedPlatforms.length === 1 ? "rede" : "redes"}
          </Button>
        </div>
      }
    >
      <input
        ref={fileInputRef}
        className={styles.visuallyHidden}
        type="file"
        accept="video/*,.mp4,.mov,.webm"
        aria-label="Escolher vídeo"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleProcessFile(file);
          event.currentTarget.value = "";
        }}
      />

      <div className={styles.publishGrid}>
        <section className={styles.mediaColumn} aria-label="Vídeo e redes">
          <div
            className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ""}`}
            role={videoPreviewUrl ? undefined : "button"}
            tabIndex={videoPreviewUrl ? undefined : 0}
            aria-label={videoPreviewUrl ? undefined : "Adicionar vídeo"}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) handleProcessFile(file);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onClick={() => !videoPreviewUrl && fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (!videoPreviewUrl && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            {videoPreviewUrl ? (
              <>
                {/* Uploaded previews do not necessarily include an external caption track. */}
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video className={styles.video} src={videoPreviewUrl} controls playsInline />
                <div className={styles.videoActions}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    leadingIcon={<RefreshCw aria-hidden="true" />}
                  >
                    Trocar vídeo
                  </Button>
                  {videoFileName && <span className={styles.fileName} title={videoFileName}>{videoFileName}</span>}
                </div>
              </>
            ) : (
              <div className={styles.dropPrompt}>
                <span className={styles.dropPromptIcon}>{isDragging ? <UploadCloud aria-hidden="true" /> : <FileVideo aria-hidden="true" />}</span>
                <strong>{isDragging ? "Solte o vídeo aqui" : "Adicionar vídeo"}</strong>
                <span>Arraste um arquivo ou pressione Enter para escolher.</span>
              </div>
            )}
            <span className={styles.formatHint}>9:16</span>
          </div>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Redes</legend>
            <div className={styles.platformGrid}>
              {platformOptions.map((platform) => {
                const selected = selectedPlatforms.includes(platform.id);
                return (
                  <button
                    key={platform.id}
                    type="button"
                    aria-pressed={selected}
                    className={`${styles.platformButton} ${selected ? styles.platformSelected : ""}`}
                    onClick={() => togglePlatform(platform.id)}
                  >
                    {platform.icon}
                    <span>{platform.name}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </section>

        <section className={styles.detailsColumn} aria-label="Detalhes da publicação">
          <Input label="Título" value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} placeholder="Dê um título ao vídeo" />
          <Textarea
            label="Legenda"
            optional
            rows={4}
            resize="vertical"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Escreva uma legenda para sua audiência"
          />

          <div className={styles.tagSection}>
            <span className={styles.tagHeading}><Tag aria-hidden="true" /> Hashtags</span>
            {hashtags.length > 0 && (
              <div className={styles.tagList} aria-label="Hashtags adicionadas">
                {hashtags.map((tag) => (
                  <span key={tag} className={styles.tag}>
                    #{tag}
                    <button type="button" aria-label={`Remover #${tag}`} onClick={() => setHashtags((current) => current.filter((item) => item !== tag))}>
                      <X aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className={styles.tagComposer}>
              <Input
                aria-label="Nova hashtag"
                value={customTag}
                onChange={(event) => setCustomTag(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addHashtag(customTag);
                  }
                }}
                placeholder="Adicionar hashtag"
              />
              <Button variant="outline" aria-label="Adicionar hashtag" leadingIcon={<Plus aria-hidden="true" />} onClick={() => addHashtag(customTag)}>Adicionar</Button>
            </div>
            <div className={styles.suggestions} aria-label="Sugestões de hashtags">
              {suggestedTags.filter((tag) => !hashtags.includes(tag)).slice(0, 6).map((tag) => (
                <button key={tag} type="button" className={styles.suggestion} onClick={() => addHashtag(tag)}>+ {tag}</button>
              ))}
            </div>
          </div>

          <div className={styles.metaRow}>
            <Select
              label="Visibilidade"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as typeof visibility)}
              options={[
                { value: "public", label: "Público" },
                { value: "unlisted", label: "Não listado" },
                { value: "private", label: "Privado" },
              ]}
            />
            <div className={styles.optimizationNote}><Sparkles aria-hidden="true" /><span>Metadados otimizados para vídeo curto.</span></div>
          </div>

          {formError && <div className={`${styles.inlineMessage} ${styles.messageError}`} role="alert"><AlertCircle aria-hidden="true" /><span>{formError}</span></div>}

          {(isPublishing || isCompleted) && (
            <div className={styles.progressPanel} aria-live="polite" aria-busy={isPublishing || undefined}>
              <div className={styles.progressHeader}>
                <span>{publishStep}</span>
                {isPublishing && <Loader2 className={styles.spinner} aria-hidden="true" />}
              </div>
              <div className={styles.statusList}>
                {selectedPlatforms.map((platform) => {
                  const status = platformStatus[platform];
                  const option = platformOptions.find((item) => item.id === platform);
                  return (
                    <div key={platform} className={styles.platformStatus}>
                      <span className={styles.platformIdentity}>{option?.icon}<span>{option?.name}</span></span>
                      <span className={`${styles.statusValue} ${status.status === "uploading" ? styles.statusUploading : status.status === "published" ? styles.statusPublished : status.status === "failed" ? styles.statusFailed : ""}`}>
                        {status.status === "uploading" && <><Loader2 className={styles.spinner} aria-hidden="true" /> Enviando</>}
                        {status.status === "published" && <><CheckCircle2 aria-hidden="true" /> Publicado</>}
                        {status.status === "failed" && <><AlertCircle aria-hidden="true" /> {status.errorMessage || "Falhou"}</>}
                        {status.status === "idle" && "Aguardando"}
                        {status.postUrl && <a className={styles.externalLink} href={status.postUrl} target="_blank" rel="noopener noreferrer">Abrir <ExternalLink aria-hidden="true" /></a>}
                      </span>
                    </div>
                  );
                })}
              </div>
              {isCompleted && <Badge tone="success" dot>Concluído</Badge>}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
