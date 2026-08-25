"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Share2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Tag,
  Eye,
  Send,
  Video,
} from "lucide-react";
import { SocialPlatform, PlatformPublishStatus } from "../lib/types/publishing";

const YouTubeIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoBlob?: Blob | null;
  videoUrl?: string;
  defaultTitle?: string;
}

export function PublishModal({
  isOpen,
  onClose,
  videoBlob,
  videoUrl: initialVideoUrl,
  defaultTitle = "Meu Novo Vídeo no Klip",
}: PublishModalProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [hashtags, setHashtags] = useState<string[]>(["Shorts", "Reels", "TikTok", "Viral"]);
  const [customTag, setCustomTag] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>([
    "youtube",
    "tiktok",
    "instagram",
  ]);
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">("public");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStep, setPublishStep] = useState<string>("");
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string>("");

  const [platformStatus, setPlatformStatus] = useState<Record<SocialPlatform, PlatformPublishStatus>>({
    youtube: { platform: "youtube", status: "idle", progress: 0 },
    tiktok: { platform: "tiktok", status: "idle", progress: 0 },
    instagram: { platform: "instagram", status: "idle", progress: 0 },
  });

  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    if (videoBlob) {
      const url = URL.createObjectURL(videoBlob);
      setVideoPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else if (initialVideoUrl) {
      setVideoPreviewUrl(initialVideoUrl);
    }
  }, [videoBlob, initialVideoUrl]);

  useEffect(() => {
    if (isOpen) {
      setIsCompleted(false);
      setPlatformStatus({
        youtube: { platform: "youtube", status: "idle", progress: 0 },
        tiktok: { platform: "tiktok", status: "idle", progress: 0 },
        instagram: { platform: "instagram", status: "idle", progress: 0 },
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const togglePlatform = (platform: SocialPlatform) => {
    if (selectedPlatforms.includes(platform)) {
      if (selectedPlatforms.length > 1) {
        setSelectedPlatforms(selectedPlatforms.filter((p) => p !== platform));
      }
    } else {
      setSelectedPlatforms([...selectedPlatforms, platform]);
    }
  };

  const addHashtag = (tag: string) => {
    const clean = tag.replace(/^#/, "").trim();
    if (clean && !hashtags.includes(clean)) {
      setHashtags([...hashtags, clean]);
    }
  };

  const removeHashtag = (tag: string) => {
    setHashtags(hashtags.filter((h) => h !== tag));
  };

  const handlePublish = async () => {
    if (!title.trim()) {
      alert("Por favor, informe um título para o vídeo.");
      return;
    }

    setIsPublishing(true);
    setIsCompleted(false);
    setPublishStep("Preparando e enviando vídeo para o servidor...");

    try {
      let finalVideoUrl = videoPreviewUrl;

      // 1. Upload video if Blob is present
      if (videoBlob) {
        const formData = new FormData();
        formData.append("video", videoBlob, "klip_video.mp4");

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          if (uploadData.videoUrl) {
            finalVideoUrl = uploadData.videoUrl;
          }
        }
      }

      setPublishStep("Publicando simultaneamente nas redes selecionadas...");

      // Update state to uploading
      setPlatformStatus((prev) => {
        const next = { ...prev };
        selectedPlatforms.forEach((p) => {
          next[p] = { platform: p, status: "uploading", progress: 40 };
        });
        return next;
      });

      // 2. Call unified publishing API
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          hashtags,
          platforms: selectedPlatforms,
          visibility,
          videoUrl: finalVideoUrl,
        }),
      });

      const data = await res.json();

      if (data.results) {
        setPlatformStatus((prev) => ({
          ...prev,
          ...data.results,
        }));
      }

      setIsCompleted(true);
      setPublishStep("Publicação finalizada com sucesso!");
    } catch (err: any) {
      console.error(err);
      setPublishStep("Ocorreu um erro durante a publicação.");
    } finally {
      setIsPublishing(false);
    }
  };

  const suggestedTags = ["Shorts", "Reels", "TikTok", "Viral", "FYP", "Trending", "Klip", "Dicas", "Humor"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shadow-lg">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Publicação Multi-Plataforma</h2>
              <p className="text-xs text-zinc-400">
                1 Clique para postar no YouTube Shorts, TikTok e Instagram Reels
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-2 rounded-xl hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Video Preview & Network Selection */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="relative aspect-[9/16] max-h-[380px] w-full bg-black rounded-xl overflow-hidden border border-zinc-800 flex items-center justify-center group shadow-inner">
              {videoPreviewUrl ? (
                <video
                  src={videoPreviewUrl}
                  controls
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-zinc-500">
                  <Video className="w-10 h-10" />
                  <span className="text-xs">Nenhum vídeo carregado</span>
                </div>
              )}
              <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 backdrop-blur rounded text-[10px] font-mono text-zinc-300">
                9:16 Vertical (Shorts/Reels)
              </div>
            </div>

            {/* Platform Selection Cards */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                Publicar em:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {/* YouTube */}
                <button
                  type="button"
                  onClick={() => togglePlatform("youtube")}
                  className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition ${
                    selectedPlatforms.includes("youtube")
                      ? "bg-red-500/10 border-red-500/50 text-red-400 shadow-sm"
                      : "bg-zinc-800/40 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <YouTubeIcon className="w-5 h-5" />
                  <span className="text-[11px] font-medium">YouTube</span>
                </button>

                {/* TikTok */}
                <button
                  type="button"
                  onClick={() => togglePlatform("tiktok")}
                  className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition ${
                    selectedPlatforms.includes("tiktok")
                      ? "bg-zinc-800 border-zinc-500 text-white shadow-sm"
                      : "bg-zinc-800/40 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.81 4.48 6.27 6.27 0 0 0 1.99-4.48V8.69a8.18 8.18 0 0 0 4.79 1.52V6.76c-.34-.02-.68-.05-1-.07z" />
                  </svg>
                  <span className="text-[11px] font-medium">TikTok</span>
                </button>

                {/* Instagram */}
                <button
                  type="button"
                  onClick={() => togglePlatform("instagram")}
                  className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition ${
                    selectedPlatforms.includes("instagram")
                      ? "bg-pink-500/10 border-pink-500/50 text-pink-400 shadow-sm"
                      : "bg-zinc-800/40 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                  <span className="text-[11px] font-medium">Instagram</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Video Details, Hashtags & Progress */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Título do Vídeo
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Como criar efeitos incríveis em 10 segundos!"
                className="w-full px-3.5 py-2.5 bg-zinc-800/80 border border-zinc-700 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Description / Caption */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Legenda / Descrição
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Conte mais sobre seu vídeo e engaje sua audiência..."
                className="w-full px-3.5 py-2 bg-zinc-800/80 border border-zinc-700 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            {/* Hashtags */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-indigo-400" />
                Hashtags Automáticas
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {hashtags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-medium"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => removeHashtag(tag)}
                      className="hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Suggestions */}
              <div className="flex flex-wrap gap-1 items-center">
                <span className="text-[11px] text-zinc-500 mr-1">Sugestões:</span>
                {suggestedTags
                  .filter((t) => !hashtags.includes(t))
                  .slice(0, 6)
                  .map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => addHashtag(tag)}
                      className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition"
                    >
                      +{tag}
                    </button>
                  ))}
              </div>
            </div>

            {/* Visibility */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-zinc-400" />
                  Visibilidade
                </label>
                <select
                  value={visibility}
                  onChange={(e: any) => setVisibility(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="public">Público (Todos podem ver)</option>
                  <option value="unlisted">Não Listado / Amigos</option>
                  <option value="private">Privado (Apenas você)</option>
                </select>
              </div>

              <div className="flex flex-col justify-end">
                <div className="p-2.5 rounded-xl bg-zinc-800/40 border border-zinc-800 text-[11px] text-zinc-400 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Tags de otimização de alcance incluídas automaticamente.</span>
                </div>
              </div>
            </div>

            {/* Live Progress Box during or after publishing */}
            {(isPublishing || isCompleted) && (
              <div className="mt-2 p-4 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-300">{publishStep}</span>
                  {isPublishing && <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />}
                </div>

                <div className="space-y-2">
                  {selectedPlatforms.map((p) => {
                    const st = platformStatus[p];
                    return (
                      <div
                        key={p}
                        className="flex items-center justify-between text-xs p-2 bg-zinc-900 rounded-lg border border-zinc-800"
                      >
                        <div className="flex items-center gap-2">
                          {p === "youtube" && <YouTubeIcon className="w-4 h-4 text-red-500" />}
                          {p === "tiktok" && <span className="font-bold text-white">TT</span>}
                          {p === "instagram" && <span className="font-bold text-pink-500">IG</span>}
                          <span className="capitalize font-medium">{p}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          {st.status === "uploading" && (
                            <span className="text-amber-400 text-[11px] flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Enviando...
                            </span>
                          )}
                          {st.status === "published" && (
                            <div className="flex items-center gap-2">
                              <span className="text-emerald-400 text-[11px] flex items-center gap-1 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Publicado
                              </span>
                              {st.postUrl && (
                                <a
                                  href={st.postUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-0.5"
                                >
                                  Ver <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          )}
                          {st.status === "failed" && (
                            <span className="text-rose-400 text-[11px] flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" /> {st.errorMessage || "Erro"}
                            </span>
                          )}
                          {st.status === "idle" && (
                            <span className="text-zinc-500 text-[11px]">Aguardando</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isPublishing}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handlePublish}
            disabled={isPublishing || selectedPlatforms.length === 0}
            className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:opacity-90 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/20 transition disabled:opacity-50 flex items-center gap-2"
          >
            {isPublishing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Publicando em Massa...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Publicar em Todas as Redes ({selectedPlatforms.length})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
