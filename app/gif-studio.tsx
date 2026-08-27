"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Plus, Sparkles, Trash2 } from "lucide-react";

import { KlipAppLogo } from "../components/brand/KlipAppLogo";

type MotionFrame = {
  id: string;
  name: string;
  url: string;
  image: HTMLImageElement;
};
type MotionFormat = "landscape" | "vertical" | "square";
type ImageMotion = "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "float";
type CaptionMotion = "pulse" | "slide" | "typewriter" | "none";

const sizeFor = (format: MotionFormat) =>
  format === "vertical"
    ? { width: 270, height: 480 }
    : format === "square"
      ? { width: 420, height: 420 }
      : { width: 480, height: 270 };

function coverImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  motion: ImageMotion,
  progress: number,
  alpha = 1,
) {
  const base = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  let scale = 1.04,
    moveX = 0,
    moveY = 0;
  if (motion === "zoom-in") scale = 1.03 + progress * 0.13;
  if (motion === "zoom-out") scale = 1.16 - progress * 0.13;
  if (motion === "pan-left") {
    scale = 1.12;
    moveX = (0.5 - progress) * width * 0.12;
  }
  if (motion === "pan-right") {
    scale = 1.12;
    moveX = (progress - 0.5) * width * 0.12;
  }
  if (motion === "float") {
    scale = 1.08;
    moveY = Math.sin(progress * Math.PI * 2) * height * 0.025;
  }
  const drawWidth = image.naturalWidth * base * scale,
    drawHeight = image.naturalHeight * base * scale;
  context.save();
  context.globalAlpha = alpha;
  context.drawImage(
    image,
    (width - drawWidth) / 2 + moveX,
    (height - drawHeight) / 2 + moveY,
    drawWidth,
    drawHeight,
  );
  context.restore();
}

function wrappedLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.split(/\s+/).filter(Boolean),
    lines: string[] = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  });
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function paintMotionFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  frames: MotionFrame[],
  secondsPerImage: number,
  imageMotion: ImageMotion,
  caption: string,
  captionMotion: CaptionMotion,
  captionColor: string,
  captionSize: number,
  captionY: number,
) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#111414";
  context.fillRect(0, 0, width, height);
  if (!frames.length) return;
  const duration = Math.max(0.5, secondsPerImage),
    rawIndex = Math.floor(time / duration),
    index = rawIndex % frames.length,
    progress = (time % duration) / duration,
    transitionStart = Math.max(0.66, 1 - 0.32 / duration),
    blend = Math.max(0, (progress - transitionStart) / (1 - transitionStart));
  coverImage(context, frames[index].image, width, height, imageMotion, progress);
  if (frames.length > 1 && blend > 0) {
    coverImage(
      context,
      frames[(index + 1) % frames.length].image,
      width,
      height,
      imageMotion,
      0,
      Math.min(1, blend),
    );
  }
  const visibleCaption =
    captionMotion === "typewriter"
      ? caption.slice(0, Math.ceil(caption.length * Math.min(1, progress * 1.7)))
      : caption;
  if (!visibleCaption.trim()) return;
  const fontSize = Math.max(15, Math.round((captionSize / 100) * width)),
    pulse = captionMotion === "pulse" ? 1 + Math.sin(time * 5) * 0.045 : 1,
    slide = captionMotion === "slide" ? Math.max(0, 1 - progress * 4) * width * 0.16 : 0;
  context.save();
  context.translate(width / 2 + slide, height * (captionY / 100));
  context.scale(pulse, pulse);
  context.font = `900 ${fontSize}px Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const lines = wrappedLines(context, visibleCaption, width * 0.84),
    lineHeight = fontSize * 1.04,
    startY = -((lines.length - 1) * lineHeight) / 2;
  context.lineJoin = "round";
  context.strokeStyle = "rgba(0,0,0,.86)";
  context.lineWidth = Math.max(4, fontSize * 0.13);
  context.fillStyle = captionColor;
  lines.forEach((line, lineIndex) => {
    const y = startY + lineIndex * lineHeight;
    context.strokeText(line, 0, y);
    context.fillText(line, 0, y);
  });
  context.restore();
}

function pushWord(bytes: number[], value: number) {
  bytes.push(value & 255, (value >> 8) & 255);
}

function lzwPixels(indices: Uint8Array) {
  const clearCode = 256,
    endCode = 257,
    output: number[] = [];
  let dictionary = new Map<number, number>(),
    nextCode = 258,
    codeSize = 9,
    buffer = 0,
    bits = 0;
  const write = (code: number) => {
    buffer |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      output.push(buffer & 255);
      buffer >>>= 8;
      bits -= 8;
    }
  };
  const reset = () => {
    dictionary = new Map();
    nextCode = 258;
    codeSize = 9;
  };
  write(clearCode);
  let prefix = indices[0] ?? 0;
  for (let index = 1; index < indices.length; index += 1) {
    const value = indices[index],
      key = prefix * 256 + value,
      found = dictionary.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    write(prefix);
    if (nextCode < 4096) {
      dictionary.set(key, nextCode);
      nextCode += 1;
      // O decoder cria a mesma entrada um código depois do encoder. Trocar a
      // largura apenas no limite + 1 mantém a fronteira 9→10→11→12 alinhada.
      if (nextCode === (1 << codeSize) + 1 && codeSize < 12) codeSize += 1;
    } else {
      write(clearCode);
      reset();
    }
    prefix = value;
  }
  write(prefix);
  write(endCode);
  if (bits) output.push(buffer & 255);
  return output;
}

async function encodeGif(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frameCount: number,
  delay: number,
  render: (index: number) => void,
  progress: (value: number) => void,
) {
  const bytes: number[] = [];
  "GIF89a".split("").forEach((letter) => bytes.push(letter.charCodeAt(0)));
  pushWord(bytes, width);
  pushWord(bytes, height);
  bytes.push(0xf7, 0, 0);
  for (let index = 0; index < 256; index += 1) {
    bytes.push(
      Math.round((((index >> 5) & 7) * 255) / 7),
      Math.round((((index >> 2) & 7) * 255) / 7),
      Math.round(((index & 3) * 255) / 3),
    );
  }
  bytes.push(0x21, 0xff, 0x0b);
  "NETSCAPE2.0".split("").forEach((letter) => bytes.push(letter.charCodeAt(0)));
  bytes.push(3, 1, 0, 0, 0);
  for (let frame = 0; frame < frameCount; frame += 1) {
    render(frame);
    const rgba = context.getImageData(0, 0, width, height).data,
      indices = new Uint8Array(width * height);
    for (let pixel = 0, offset = 0; pixel < indices.length; pixel += 1, offset += 4)
      indices[pixel] =
        (rgba[offset] & 0xe0) |
        ((rgba[offset + 1] >> 3) & 0x1c) |
        (rgba[offset + 2] >> 6);
    bytes.push(0x21, 0xf9, 4, 4);
    pushWord(bytes, delay);
    bytes.push(0, 0, 0x2c);
    pushWord(bytes, 0);
    pushWord(bytes, 0);
    pushWord(bytes, width);
    pushWord(bytes, height);
    bytes.push(0, 8);
    const compressed = lzwPixels(indices);
    for (let offset = 0; offset < compressed.length; offset += 255) {
      const length = Math.min(255, compressed.length - offset);
      bytes.push(length);
      for (let item = 0; item < length; item += 1)
        bytes.push(compressed[offset + item]);
    }
    bytes.push(0);
    progress(Math.round(((frame + 1) / frameCount) * 100));
    if (frame % 2 === 1)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  bytes.push(0x3b);
  return new Uint8Array(bytes);
}

export default function GifStudio({
  onBack,
  onUseBackground,
}: {
  onBack: () => void;
  onUseBackground: (file: File) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    draggedFrame = useRef("");
  const [frames, setFrames] = useState<MotionFrame[]>([]),
    [selected, setSelected] = useState(""),
    [format, setFormat] = useState<MotionFormat>("landscape"),
    [imageMotion, setImageMotion] = useState<ImageMotion>("zoom-in"),
    [caption, setCaption] = useState("Seu letreiro animado"),
    [captionMotion, setCaptionMotion] = useState<CaptionMotion>("pulse"),
    [captionColor, setCaptionColor] = useState("#ffffff"),
    [captionSize, setCaptionSize] = useState(9),
    [captionY, setCaptionY] = useState(78),
    [secondsPerImage, setSecondsPerImage] = useState(1.6),
    [fps, setFps] = useState(10),
    [exporting, setExporting] = useState(false),
    [exportProgress, setExportProgress] = useState(0),
    [notice, setNotice] = useState("Adicione uma ou mais imagens para começar.");

  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const dimensions = sizeFor(format),
      context = target.getContext("2d");
    if (!context) return;
    target.width = dimensions.width;
    target.height = dimensions.height;
    let animationFrame = 0;
    const started = performance.now();
    const draw = (now: number) => {
      paintMotionFrame(
        context,
        dimensions.width,
        dimensions.height,
        (now - started) / 1000,
        frames,
        secondsPerImage,
        imageMotion,
        caption,
        captionMotion,
        captionColor,
        captionSize,
        captionY,
      );
      animationFrame = requestAnimationFrame(draw);
    };
    animationFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrame);
  }, [frames, format, secondsPerImage, imageMotion, caption, captionMotion, captionColor, captionSize, captionY]);

  async function addImages(files?: FileList | null) {
    if (!files?.length) return;
    const available = Math.max(0, 10 - frames.length),
      picked = Array.from(files).filter((file) => file.type.startsWith("image/")).slice(0, available),
      loaded = await Promise.all(
        picked.map(
          (file) =>
            new Promise<MotionFrame>((resolve, reject) => {
              const url = URL.createObjectURL(file),
                image = new Image();
              image.onload = () =>
                resolve({ id: crypto.randomUUID(), name: file.name, url, image });
              image.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error("Imagem inválida"));
              };
              image.src = url;
            }),
        ),
      ).catch(() => [] as MotionFrame[]);
    if (!loaded.length) {
      setNotice("Não consegui abrir essas imagens.");
      return;
    }
    setFrames((current) => [...current, ...loaded]);
    setSelected((current) => current || loaded[0].id);
    setNotice(`${loaded.length} imagem(ns) adicionada(s). Arraste para mudar a ordem.`);
  }

  function removeFrame(id: string) {
    setFrames((current) => {
      const removed = current.find((frame) => frame.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      const next = current.filter((frame) => frame.id !== id);
      setSelected(next[0]?.id || "");
      return next;
    });
  }

  function reorderFrame(targetId: string) {
    if (!draggedFrame.current || draggedFrame.current === targetId) return;
    setFrames((current) => {
      const from = current.findIndex((frame) => frame.id === draggedFrame.current),
        to = current.findIndex((frame) => frame.id === targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current],
        [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    draggedFrame.current = "";
  }

  async function makeGif(useAsBackground: boolean) {
    if (!frames.length || exporting) return;
    setExporting(true);
    setExportProgress(0);
    setNotice("Montando os quadros e o letreiro…");
    try {
      const dimensions = sizeFor(format),
        exportCanvas = document.createElement("canvas"),
        context = exportCanvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas indisponível");
      exportCanvas.width = dimensions.width;
      exportCanvas.height = dimensions.height;
      const duration = Math.max(0.5, secondsPerImage) * frames.length,
        frameCount = Math.max(2, Math.min(120, Math.ceil(duration * fps))),
        effectiveFps = frameCount / duration,
        bytes = await encodeGif(
          context,
          dimensions.width,
          dimensions.height,
          frameCount,
          Math.max(2, Math.round(100 / effectiveFps)),
          (frame) =>
            paintMotionFrame(
              context,
              dimensions.width,
              dimensions.height,
              frame / effectiveFps,
              frames,
              secondsPerImage,
              imageMotion,
              caption,
              captionMotion,
              captionColor,
              captionSize,
              captionY,
            ),
          setExportProgress,
        ),
        blob = new Blob([bytes], { type: "image/gif" }),
        file = new File([blob], `klip-motion-${Date.now()}.gif`, {
          type: "image/gif",
        });
      if (useAsBackground) {
        onUseBackground(file);
      } else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = file.name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 2_000);
        setNotice("GIF baixado. Ele já pode ser usado como fundo animado.");
      }
    } catch {
      setNotice("Não foi possível gerar o GIF neste navegador.");
    } finally {
      setExporting(false);
    }
  }

  const totalDuration = frames.length * secondsPerImage;
  return (
    <main className="motion-studio">
      <header className="motion-header">
        <div className="brand"><KlipAppLogo variant="full" width={136} height={28} /><em>Motion</em></div>
        <div><b>{frames.length} imagens</b><span>{totalDuration.toFixed(1)}s · GIF em loop</span></div>
        <button onClick={onBack}><ArrowLeft aria-hidden="true" /> Voltar</button>
      </header>
      <section className="motion-workspace">
        <aside className="motion-controls">
          <div className="motion-intro"><small>CRIADOR DE GIF</small><h1>Imagem vira movimento.</h1><p>Monte quadros, anime a cena e crie um letreiro para usar na câmera.</p></div>
          <label className="motion-upload"><Plus aria-hidden="true" /> Adicionar imagens<input type="file" accept="image/*" multiple onChange={(event) => void addImages(event.target.files)} /></label>
          <label>Formato<select value={format} onChange={(event) => setFormat(event.target.value as MotionFormat)}><option value="landscape">Fundo 16:9</option><option value="vertical">Stories / Reels 9:16</option><option value="square">Quadrado 1:1</option></select></label>
          <label>Movimento da imagem<select value={imageMotion} onChange={(event) => setImageMotion(event.target.value as ImageMotion)}><option value="zoom-in">Zoom suave</option><option value="zoom-out">Afastar</option><option value="pan-left">Passeio para esquerda</option><option value="pan-right">Passeio para direita</option><option value="float">Flutuar</option></select></label>
          <label>Tempo por imagem <b>{secondsPerImage.toFixed(1)}s</b><input type="range" min="0.6" max="3" step="0.1" value={secondsPerImage} onChange={(event) => setSecondsPerImage(Number(event.target.value))} /></label>
          <div className="motion-caption-box"><b>Letreiro animado</b><input value={caption} maxLength={80} placeholder="Escreva alguma coisa" onChange={(event) => setCaption(event.target.value)} /><div><label>Efeito<select value={captionMotion} onChange={(event) => setCaptionMotion(event.target.value as CaptionMotion)}><option value="pulse">Pulso</option><option value="slide">Entrada lateral</option><option value="typewriter">Digitando</option><option value="none">Sem efeito</option></select></label><label>Cor<input type="color" value={captionColor} onChange={(event) => setCaptionColor(event.target.value)} /></label></div><label>Tamanho<input type="range" min="5" max="16" value={captionSize} onChange={(event) => setCaptionSize(Number(event.target.value))} /></label><label>Posição<input type="range" min="12" max="88" value={captionY} onChange={(event) => setCaptionY(Number(event.target.value))} /></label></div>
          <label>Fluidez<select value={fps} onChange={(event) => setFps(Number(event.target.value))}><option value="8">8 FPS · arquivo menor</option><option value="10">10 FPS · recomendado</option><option value="12">12 FPS · mais fluido</option></select></label>
        </aside>
        <section className="motion-preview-area">
          <div className={`motion-canvas-shell motion-${format}`}><canvas ref={canvas} />{!frames.length && <div className="motion-empty"><b>Adicione suas imagens</b><span>A animação e o letreiro aparecerão aqui.</span></div>}</div>
          <div className="motion-actions"><button disabled={!frames.length || exporting} onClick={() => void makeGif(false)}><Download aria-hidden="true" /> Baixar GIF</button><button className="primary" disabled={!frames.length || exporting} onClick={() => void makeGif(true)}><Sparkles aria-hidden="true" /> Usar como fundo</button></div>
          <p>{notice}</p>
        </section>
      </section>
      <section className="motion-timeline">
        <div><b>Quadros</b><span>Arraste para reorganizar · o GIF repete automaticamente</span></div>
        <div className="motion-frame-list">
          {frames.map((frame, index) => (
            <div key={frame.id} role="button" tabIndex={0} draggable onDragStart={() => { draggedFrame.current = frame.id; }} onDragOver={(event) => event.preventDefault()} onDrop={() => reorderFrame(frame.id)} className={`motion-frame-card ${selected === frame.id ? "selected" : ""}`} onClick={() => setSelected(frame.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelected(frame.id); }}>
              <span>{index + 1}</span>
              {/* Object URLs are generated client-side for temporary previews and cannot benefit from Next/Image optimization. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={frame.url} alt="" />
              <small>{frame.name}</small>
              <button onClick={(event) => { event.stopPropagation(); removeFrame(frame.id); }} aria-label="Remover quadro"><Trash2 aria-hidden="true" /></button>
            </div>
          ))}
        </div>
      </section>
      {exporting && <div className="motion-exporting" role="status"><div><span>{exportProgress}%</span><b>Criando seu GIF…</b><i><em style={{ width: `${exportProgress}%` }} /></i><small>A KLIPAPP está animando os quadros e o letreiro.</small></div></div>}
    </main>
  );
}
