"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  FileAudio,
  Heart,
  Library,
  LoaderCircle,
  Music2,
  Pause,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  Volume2,
} from "lucide-react";
import {
  createTimelineAudioPayload,
  filterAudioAssets,
  formatAudioDuration,
  getAudioFileDuration,
  KLIP_AUDIO_CATALOG,
  KlipAudioAsset,
  synthesizeAudio,
  TimelineAudioPayload,
  USER_UPLOAD_LICENSE,
  type AudioLibraryCategory,
} from "@/lib/audio/audio-library";
import styles from "./AudioLibrary.module.css";

export interface AudioLibraryProps {
  onInsert: (audio: TimelineAudioPayload) => void | Promise<void>;
  className?: string;
  initialCategory?: AudioLibraryCategory;
  maxUploadSizeMb?: number;
}

const tabs: Array<{ id: AudioLibraryCategory; label: string; icon: typeof Music2 }> = [
  { id: "music", label: "Músicas", icon: Music2 },
  { id: "effects", label: "Efeitos", icon: Sparkles },
  { id: "uploads", label: "Meus arquivos", icon: FileAudio },
  { id: "favorites", label: "Favoritos", icon: Heart },
];

function assetIcon(asset: KlipAudioAsset) {
  if (asset.category === "music") return Music2;
  if (asset.category === "uploads") return FileAudio;
  return Volume2;
}

export function AudioLibrary({
  onInsert,
  className = "",
  initialCategory = "music",
  maxUploadSizeMb = 50,
}: AudioLibraryProps) {
  const [category, setCategory] = useState<AudioLibraryCategory>(initialCategory);
  const [query, setQuery] = useState("");
  const [uploads, setUploads] = useState<KlipAudioAsset[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrls = useRef(new Map<string, string>());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const restoreFavorites = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem("klip-audio-favorites") ?? "[]") as string[];
        setFavorites(new Set(saved));
      } catch {
        setFavorites(new Set());
      }
    }, 0);
    return () => window.clearTimeout(restoreFavorites);
  }, []);

  useEffect(() => () => {
    audioRef.current?.pause();
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const allAssets = useMemo(() => [...KLIP_AUDIO_CATALOG, ...uploads], [uploads]);
  const visibleAssets = useMemo(() => {
    const byCategory = category === "favorites"
      ? allAssets.filter((asset) => favorites.has(asset.id))
      : allAssets.filter((asset) => asset.category === category);
    return filterAudioAssets(byCategory, query);
  }, [allAssets, category, favorites, query]);

  const getBlob = (asset: KlipAudioAsset) => asset.file ?? synthesizeAudio(asset);

  const getPreviewUrl = (asset: KlipAudioAsset) => {
    const cached = previewUrls.current.get(asset.id);
    if (cached) return cached;
    const url = URL.createObjectURL(getBlob(asset));
    previewUrls.current.set(asset.id, url);
    return url;
  };

  const togglePreview = (asset: KlipAudioAsset) => {
    if (playingId === asset.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(getPreviewUrl(asset));
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => {
      setPlayingId(null);
      setMessage("Não foi possível reproduzir este áudio.");
    };
    setPlayingId(asset.id);
    void audio.play().catch(() => {
      setPlayingId(null);
      setMessage("O navegador bloqueou a prévia. Toque em reproduzir novamente.");
    });
  };

  const toggleFavorite = (id: string) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem("klip-audio-favorites", JSON.stringify([...next]));
      return next;
    });
  };

  const insertAsset = async (asset: KlipAudioAsset) => {
    setBusyId(asset.id);
    setMessage("");
    try {
      const payload = createTimelineAudioPayload(asset, getBlob(asset));
      await onInsert(payload);
      setMessage(`${asset.title} foi adicionado à timeline.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível adicionar o áudio.");
    } finally {
      setBusyId(null);
    }
  };

  const importFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setMessage("");
    const next: KlipAudioAsset[] = [];
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith("audio/")) {
        setMessage(`${file.name} não é um arquivo de áudio.`);
        continue;
      }
      if (file.size > maxUploadSizeMb * 1024 * 1024) {
        setMessage(`${file.name} excede o limite de ${maxUploadSizeMb} MB.`);
        continue;
      }
      try {
        const duration = await getAudioFileDuration(file);
        next.push({
          id: `upload-${Date.now()}-${crypto.randomUUID()}`,
          title: file.name.replace(/\.[^.]+$/, ""),
          category: "uploads",
          duration,
          tags: ["importado", "meu arquivo"],
          license: USER_UPLOAD_LICENSE,
          file,
        });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : `Não foi possível importar ${file.name}.`);
      }
    }
    if (next.length) {
      setUploads((current) => [...next, ...current]);
      setCategory("uploads");
      setMessage(`${next.length} ${next.length === 1 ? "arquivo importado" : "arquivos importados"}.`);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <section className={`${styles.library} ${className}`} aria-label="Biblioteca de áudio">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}><Library size={14} /> Biblioteca de áudio</span>
          <h2>Encontre o som certo</h2>
          <p>Sons originais gerados no seu navegador, seguros para uso comercial.</p>
        </div>
        <button className={styles.uploadButton} type="button" onClick={() => fileInputRef.current?.click()}>
          <Upload size={17} /> Importar áudio
        </button>
        <input
          ref={fileInputRef}
          className={styles.hiddenInput}
          type="file"
          accept="audio/*"
          multiple
          onChange={(event) => void importFiles(event.target.files)}
          aria-label="Escolher arquivos de áudio"
        />
      </header>

      <div className={styles.toolbar}>
        <nav className={styles.tabs} aria-label="Categorias de áudio">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={category === id ? styles.activeTab : styles.tab}
              onClick={() => setCategory(id)}
              aria-current={category === id ? "page" : undefined}
            >
              <Icon size={16} fill={id === "favorites" && category === id ? "currentColor" : "none"} />
              {label}
            </button>
          ))}
        </nav>
        <label className={styles.search}>
          <Search size={17} aria-hidden="true" />
          <span className={styles.srOnly}>Buscar áudio</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar som, clima ou uso…" />
        </label>
      </div>

      <div className={styles.notice}>
        <ShieldCheck size={17} />
        <span><strong>Klip Original:</strong> uso comercial liberado, sem atribuição e sem arquivos de terceiros.</span>
      </div>

      {visibleAssets.length ? (
        <ul className={styles.grid} aria-label="Resultados de áudio">
          {visibleAssets.map((asset) => {
            const Icon = assetIcon(asset);
            const isPlaying = playingId === asset.id;
            const isFavorite = favorites.has(asset.id);
            return (
              <li className={styles.card} key={asset.id}>
                <button
                  type="button"
                  className={`${styles.preview} ${isPlaying ? styles.previewPlaying : ""}`}
                  onClick={() => togglePreview(asset)}
                  aria-label={`${isPlaying ? "Pausar" : "Ouvir"} ${asset.title}`}
                >
                  <span className={styles.wave} aria-hidden="true">
                    {[34, 58, 82, 46, 70, 38, 64, 88, 52, 74, 42, 60].map((height, index) => (
                      <i key={index} style={{ height: `${height}%` }} />
                    ))}
                  </span>
                  <span className={styles.playIcon}>{isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</span>
                  <Icon className={styles.assetIcon} size={38} aria-hidden="true" />
                </button>
                <div className={styles.cardBody}>
                  <div className={styles.titleRow}>
                    <div>
                      <h3>{asset.title}</h3>
                      <p>{asset.mood ?? (asset.category === "uploads" ? "Importado" : "Efeito sonoro")} · {formatAudioDuration(asset.duration)}</p>
                    </div>
                    <button
                      type="button"
                      className={`${styles.favorite} ${isFavorite ? styles.favoriteActive : ""}`}
                      onClick={() => toggleFavorite(asset.id)}
                      aria-label={`${isFavorite ? "Remover dos" : "Adicionar aos"} favoritos`}
                      aria-pressed={isFavorite}
                    >
                      <Heart size={17} fill={isFavorite ? "currentColor" : "none"} />
                    </button>
                  </div>
                  <div className={asset.license.commercialUse ? styles.licenseSafe : styles.licenseUser} title={asset.license.summary}>
                    {asset.license.commercialUse ? <Check size={13} /> : <FileAudio size={13} />}
                    {asset.license.name}
                  </div>
                  <button className={styles.addButton} type="button" disabled={busyId === asset.id} onClick={() => void insertAsset(asset)}>
                    {busyId === asset.id ? <LoaderCircle className={styles.spinner} size={16} /> : <Plus size={16} />}
                    Adicionar à timeline
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className={styles.empty}>
          <FileAudio size={26} />
          <h3>{category === "uploads" ? "Importe seu primeiro áudio" : "Nenhum áudio encontrado"}</h3>
          <p>{category === "uploads" ? "MP3, WAV, M4A e outros formatos aceitos pelo navegador." : "Tente buscar outro termo ou marque sons como favoritos."}</p>
          {category === "uploads" && <button type="button" onClick={() => fileInputRef.current?.click()}><Upload size={16} /> Escolher arquivos</button>}
        </div>
      )}
      <p className={styles.liveMessage} role="status" aria-live="polite">{message}</p>
    </section>
  );
}
