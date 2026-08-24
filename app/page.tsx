"use client";

import { useEffect, useRef, useState } from "react";
import Peer, { DataConnection, MediaConnection } from "peerjs";

type Quality = "720" | "1080";
type ExportFormat = "mp4" | "webm";
type Msg = { name: string; text: string };
type SavedCall = {
  room: string;
  pin: string;
  name: string;
  owner: string;
  mode: "host" | "guest";
  quality: Quality;
  deviceId: string;
  audioInputId?: string;
  startedAt: number;
};
type EditorClip = { url: string; name: string };
type TextEffect = "none" | "pop" | "slide" | "typewriter";
type TextLayer = {
  id: string;
  text: string;
  font: string;
  color: string;
  size: number;
  x: number;
  y: number;
  align: "left" | "center" | "right";
  start: number;
  end: number;
  fadeIn: number;
  fadeOut: number;
  effect: TextEffect;
  background: boolean;
};
type IllustrationLayer = {
  id: string;
  kind: "image" | "video";
  url: string;
  name: string;
  x: number;
  y: number;
  size: number;
  start: number;
  end: number;
  fadeIn: number;
  fadeOut: number;
  fit: "cover" | "contain";
};
type TimedLayer = Pick<IllustrationLayer, "start" | "end" | "fadeIn" | "fadeOut">;
const code = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const hostId = (room: string, pin: string) => `proximo-${room}-${pin}`;
const APP_VERSION = "v0.14.0";
const mimeForExport = (format: ExportFormat) => {
  if (typeof MediaRecorder === "undefined") return null;
  if (format === "mp4") {
    const mp4 = "video/mp4;codecs=avc1.42E01E,mp4a.40.2";
    return MediaRecorder.isTypeSupported(mp4)
      ? mp4
      : MediaRecorder.isTypeSupported("video/mp4")
        ? "video/mp4"
        : null;
  }
  const vp9 = "video/webm;codecs=vp9,opus";
  return MediaRecorder.isTypeSupported(vp9) ? vp9 : "video/webm";
};
const constraints = (
  quality: Quality,
  deviceId?: string,
  audioInputId?: string,
): MediaStreamConstraints => ({
  video: {
    width: { ideal: quality === "1080" ? 1920 : 1280 },
    height: { ideal: quality === "1080" ? 1080 : 720 },
    frameRate: { ideal: 30 },
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  },
  audio: {
    ...(audioInputId ? { deviceId: { exact: audioInputId } } : {}),
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
});

export default function Home() {
  const [inRoom, setInRoom] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false),
    [editorReturnToCall, setEditorReturnToCall] = useState(false),
    [editorClip, setEditorClip] = useState<EditorClip | null>(null);
  const [booting, setBooting] = useState(true);
  const [room, setRoom] = useState("------"),
    [pin, setPin] = useState("----");
  const [name, setName] = useState(""),
    [owner, setOwner] = useState("");
  const [mode, setMode] = useState<"host" | "guest">("host");
  const [quality, setQuality] = useState<Quality>("1080"),
    [deviceId, setDeviceId] = useState(""),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]),
    [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]),
    [audioInputId, setAudioInputId] = useState(""),
    [audioOutputId, setAudioOutputId] = useState("");
  const [mic, setMic] = useState(true),
    [noiseSuppression, setNoiseSuppression] = useState(true),
    [micSensitivity, setMicSensitivity] = useState(70),
    [micTesting, setMicTesting] = useState(false),
    [micLevel, setMicLevel] = useState(0),
    [cameraOn, setCameraOn] = useState(true),
    [sharing, setSharing] = useState(false),
    [remoteSharing, setRemoteSharing] = useState(false),
    [recording, setRecording] = useState(false),
    [recordSeconds, setRecordSeconds] = useState(0),
    [recordingFormat, setRecordingFormat] = useState<ExportFormat>("mp4"),
    [vertical, setVertical] = useState(false),
    [resenhaMode, setResenhaMode] = useState(false),
    [previewOpen, setPreviewOpen] = useState(false),
    [topOrder, setTopOrder] = useState<"mine-first" | "friend-first">(
      "mine-first",
    ),
    [screenPosition, setScreenPosition] = useState<"top" | "bottom">("bottom"),
    [tiktokTop, setTiktokTop] = useState(0.325),
    [dragging, setDragging] = useState(""),
    [background, setBackground] = useState(""),
    [backgroundVideo, setBackgroundVideo] = useState(""),
    [backgroundLabel, setBackgroundLabel] = useState(""),
    [backgroundMode, setBackgroundMode] = useState<
      "none" | "image" | "blur" | "remove"
    >(
      "none",
    ),
    [mattingQuality, setMattingQuality] = useState<"standard" | "premium">(
      "standard",
    ),
    [skinSmooth, setSkinSmooth] = useState(false),
    [blurAmount, setBlurAmount] = useState(16),
    [cameraEpoch, setCameraEpoch] = useState(0),
    [virtualEpoch, setVirtualEpoch] = useState(0);
  const [friend, setFriend] = useState(""),
    [friendRecording, setFriendRecording] = useState(false),
    [speaking, setSpeaking] = useState({ mine: false, friend: false }),
    [notice, setNotice] = useState(""),
    [chatOpen, setChatOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [settingsOffset, setSettingsOffset] = useState({ x: 0, y: 0 }),
    [settingsMinimized, setSettingsMinimized] = useState(false),
    [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 }),
    [previewMinimized, setPreviewMinimized] = useState(false),
    [callStartedAt, setCallStartedAt] = useState(0),
    [callSeconds, setCallSeconds] = useState(0),
    [restoreCall, setRestoreCall] = useState<SavedCall | null>(null),
    [draft, setDraft] = useState(""),
    [messages, setMessages] = useState<Msg[]>([]);
  const local = useRef<MediaStream | null>(null),
    remote = useRef<MediaStream | null>(null),
    displayed = useRef<MediaStream | null>(null),
    remoteDisplayed = useRef<MediaStream | null>(null),
    processedLocal = useRef<MediaStream | null>(null),
    processedAudio = useRef<MediaStream | null>(null),
    blurAmountRef = useRef(16);
  const peer = useRef<Peer | null>(null),
    connection = useRef<DataConnection | null>(null),
    remoteId = useRef(""),
    recorder = useRef<MediaRecorder | null>(null),
    recordChunks = useRef<Blob[]>([]),
    cutRequested = useRef(false),
    speakingRef = useRef({ mine: false, friend: false }),
    pipVideo = useRef<HTMLVideoElement | null>(null),
    pipFrame = useRef(0),
    peerRetry = useRef(0),
    peerConnectTimer = useRef(0),
    peerRetryTimer = useRef(0),
    peerConnected = useRef(false),
    cameraCalls = useRef<MediaConnection[]>([]),
    audioPipeline = useRef<{
      context: AudioContext;
      gain: GainNode;
      analyser: AnalyserNode;
      output: MediaStream;
    } | null>(null),
    micTestFrame = useRef(0),
    settingsDrag = useRef<{
      x: number;
      y: number;
      startX: number;
      startY: number;
    } | null>(null),
    previewDrag = useRef<{
      x: number;
      y: number;
      startX: number;
      startY: number;
    } | null>(null);
  const mine = useRef<HTMLVideoElement>(null),
    theirs = useRef<HTMLVideoElement>(null),
    screen = useRef<HTMLVideoElement>(null),
    remoteScreen = useRef<HTMLVideoElement>(null),
    previewMine = useRef<HTMLVideoElement>(null),
    previewFriend = useRef<HTMLVideoElement>(null),
    previewScreen = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    if (query.get("editor") === "1") {
      setEditorOpen(true);
      setBooting(false);
      return;
    }
    const invitedRoom = (query.get("sala") || "").replace(/\D/g, ""),
      invitedPin = (query.get("senha") || "").replace(/\D/g, "");
    if (invitedRoom.length === 6 && invitedPin.length === 4) {
      setRoom(invitedRoom);
      setPin(invitedPin);
      setOwner((query.get("anfitriao") || "Anfitrião").slice(0, 40));
      setMode("guest");
      setBooting(false);
    } else {
      try {
        const saved = JSON.parse(
          sessionStorage.getItem("klip-active-call") || "null",
        ) as SavedCall | null;
        if (
          saved?.room?.length === 6 &&
          saved.pin?.length === 4 &&
          saved.name
        ) {
          setRoom(saved.room);
          setPin(saved.pin);
          setName(saved.name);
          setOwner(saved.owner);
          setMode(saved.mode);
          setQuality(saved.quality);
          setDeviceId(saved.deviceId);
          setAudioInputId(saved.audioInputId || "");
          setRestoreCall(saved);
          setNotice("Restaurando sua chamada…");
        } else {
          setRoom(code(6));
          setPin(code(4));
          setBooting(false);
        }
      } catch {
        setRoom(code(6));
        setPin(code(4));
        setBooting(false);
      }
    }
  }, []);
  useEffect(() => {
    if (
      !restoreCall ||
      inRoom ||
      room !== restoreCall.room ||
      pin !== restoreCall.pin ||
      name !== restoreCall.name ||
      mode !== restoreCall.mode
    )
      return;
    void join(restoreCall.deviceId).finally(() => setBooting(false));
  }, [restoreCall, inRoom, room, pin, name, mode]);
  useEffect(() => {
    if (!inRoom || !callStartedAt) return;
    const tick = () =>
      setCallSeconds(
        Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000)),
      );
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [inRoom, callStartedAt]);
  useEffect(() => {
    if (!audioOutputId) return;
    [theirs.current, remoteScreen.current].forEach((player) => {
      if (player && "setSinkId" in player)
        void (player as HTMLVideoElement & { setSinkId: (id: string) => Promise<void> })
          .setSinkId(audioOutputId)
          .catch(() => undefined);
    });
  }, [audioOutputId, friend, remoteSharing]);
  useEffect(
    () => () => {
      peer.current?.destroy();
      local.current?.getTracks().forEach((track) => track.stop());
      displayed.current?.getTracks().forEach((track) => track.stop());
      window.clearTimeout(peerConnectTimer.current);
      window.clearTimeout(peerRetryTimer.current);
      void audioPipeline.current?.context.close();
    },
    [],
  );
  useEffect(() => {
    if (inRoom && mine.current && local.current) {
      mine.current.srcObject = processedLocal.current || local.current;
      void mine.current.play().catch(() => undefined);
    }
    if (friend && theirs.current && remote.current) {
      theirs.current.srcObject = remote.current;
      void theirs.current.play().catch(() => undefined);
    }
    if (sharing && screen.current && displayed.current) {
      screen.current.srcObject = displayed.current;
      void screen.current.play().catch(() => undefined);
    }
    if (remoteSharing && remoteScreen.current && remoteDisplayed.current) {
      remoteScreen.current.srcObject = remoteDisplayed.current;
      void remoteScreen.current.play().catch(() => undefined);
    }
    if (previewMine.current && local.current)
      previewMine.current.srcObject = processedLocal.current || local.current;
    if (previewFriend.current && remote.current)
      previewFriend.current.srcObject = remote.current;
    const shared = sharing
      ? displayed.current
      : remoteSharing
        ? remoteDisplayed.current
        : null;
    if (previewScreen.current && shared)
      previewScreen.current.srcObject = shared;
  }, [
    inRoom,
    friend,
    sharing,
    remoteSharing,
    previewOpen,
    previewMinimized,
    virtualEpoch,
  ]);
  useEffect(() => {
    if (!inRoom || backgroundMode === "none" || !local.current) return;
    let active = true,
      segmentationFrame = 0,
      renderFrame = 0,
      premiumInferenceTimer = 0,
      lastInferenceAt = 0,
      inferenceDuration = 24,
      attached = false,
      hasMask = false;
    const source = document.createElement("video"),
      canvas = document.createElement("canvas"),
      context = canvas.getContext("2d"),
      maskCanvas = document.createElement("canvas"),
      maskContext = maskCanvas.getContext("2d"),
      inferenceCanvas = document.createElement("canvas"),
      inferenceContext = inferenceCanvas.getContext("2d", { alpha: false }),
      foregroundCanvas = document.createElement("canvas"),
      foregroundContext = foregroundCanvas.getContext("2d"),
      image = new Image(),
      backdropVideo = document.createElement("video");
    source.srcObject = local.current;
    source.muted = true;
    source.playsInline = true;
    image.src = background;
    backdropVideo.src = backgroundVideo;
    backdropVideo.muted = true;
    backdropVideo.loop = true;
    backdropVideo.playsInline = true;
    const run = async () => {
      await source.play();
      if (!active || !context || !maskContext || !inferenceContext || !foregroundContext) return;
      canvas.width = source.videoWidth || 1280;
      canvas.height = source.videoHeight || 720;
      foregroundCanvas.width = canvas.width;
      foregroundCanvas.height = canvas.height;
      if (backgroundMode === "image" && backgroundVideo) {
        await new Promise<void>((resolve, reject) => {
          if (backdropVideo.readyState >= 2) return resolve();
          backdropVideo.onloadeddata = () => resolve();
          backdropVideo.onerror = () => reject(new Error("background video"));
        });
        await backdropVideo.play();
      } else if (backgroundMode === "image") {
        await new Promise<void>((resolve, reject) => {
          if (image.complete && image.naturalWidth) return resolve();
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("background image"));
        });
      }
      const drawImageBackground = (target: CanvasRenderingContext2D) => {
        const sourceBackground = backgroundVideo ? backdropVideo : image;
        const sourceWidth = backgroundVideo ? backdropVideo.videoWidth : image.naturalWidth;
        const sourceHeight = backgroundVideo ? backdropVideo.videoHeight : image.naturalHeight;
        const scale = Math.max(
          canvas.width / (sourceWidth || canvas.width),
          canvas.height / (sourceHeight || canvas.height),
        );
        const width = (sourceWidth || canvas.width) * scale;
        const height = (sourceHeight || canvas.height) * scale;
        target.drawImage(sourceBackground, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      };
      // A saída fica rápida; a máscara é atualizada em outra cadência abaixo.
      const output = canvas.captureStream(30);
      try {
        if (mattingQuality === "premium") {
          setNotice("Preparando IA Premium na GPU…");
          const tf = await import("@tensorflow/tfjs");
          try {
            await tf.setBackend("webgl");
          } catch {
            // O TensorFlow escolhe o melhor backend disponível como fallback.
          }
          await tf.ready();
          const model = await tf.loadGraphModel(
            "/rvm/rvm_mobilenetv3_tfjs_int8/model.json",
          );
          let r1i: any = tf.scalar(0),
            r2i: any = tf.scalar(0),
            r3i: any = tf.scalar(0),
            r4i: any = tf.scalar(0),
            downsampleRatio: any = tf.scalar(0.25),
            maskPixels: ImageData | null = null,
            inferenceBusy = false;
          // Perfil "reunião": a webcam continua saindo na resolução original,
          // mas a máscara é calculada em até 960 px. É a mesma separação de
          // trabalho usada por apps de chamada: vídeo fluido primeiro, IA em
          // segundo plano sem monopolizar CPU/GPU.
          const sourceWidth = source.videoWidth || canvas.width;
          const sourceHeight = source.videoHeight || canvas.height;
          const inferenceScale = Math.min(1, 960 / Math.max(sourceWidth, sourceHeight));
          inferenceCanvas.width = Math.max(2, Math.round((sourceWidth * inferenceScale) / 2) * 2);
          inferenceCanvas.height = Math.max(2, Math.round((sourceHeight * inferenceScale) / 2) * 2);
          const attachOutput = () => {
            if (attached) return;
            processedLocal.current = output;
            replaceOutgoingVideo(output);
            refreshCameraForPeer();
            if (mine.current) {
              mine.current.srcObject = output;
              void mine.current.play().catch(() => undefined);
            }
            setVirtualEpoch((epoch) => epoch + 1);
            attached = true;
          };
          const renderPremium = () => {
            if (!active || !context) return;
            context.clearRect(0, 0, canvas.width, canvas.height);
            if (backgroundMode === "blur") {
              const strength = blurAmountRef.current;
              context.filter = `blur(${strength}px) brightness(.9) saturate(.93)`;
              context.drawImage(source, -strength, -strength, canvas.width + strength * 2, canvas.height + strength * 2);
              context.filter = "none";
            } else if (backgroundMode === "image") {
              drawImageBackground(context);
            }
            if (hasMask) {
              foregroundContext.clearRect(0, 0, foregroundCanvas.width, foregroundCanvas.height);
              foregroundContext.save();
              foregroundContext.imageSmoothingEnabled = true;
              foregroundContext.imageSmoothingQuality = "high";
              foregroundContext.filter = "blur(.6px)";
              foregroundContext.drawImage(maskCanvas, 0, 0, foregroundCanvas.width, foregroundCanvas.height);
              foregroundContext.globalCompositeOperation = "source-in";
              foregroundContext.filter = skinSmooth ? "blur(.22px) brightness(1.012) contrast(.992) saturate(.985)" : "none";
              foregroundContext.drawImage(source, 0, 0, foregroundCanvas.width, foregroundCanvas.height);
              foregroundContext.restore();
              context.drawImage(foregroundCanvas, 0, 0, canvas.width, canvas.height);
            } else {
              // Nunca congelar/escurecer o vídeo enquanto a primeira máscara
              // premium ainda está sendo preparada.
              context.drawImage(source, 0, 0, canvas.width, canvas.height);
            }
            renderFrame = requestAnimationFrame(renderPremium);
          };
          const inferPremium = async () => {
            if (!active || inferenceBusy) return;
            inferenceBusy = true;
            const started = performance.now();
            try {
              inferenceContext.drawImage(
                source,
                0,
                0,
                inferenceCanvas.width,
                inferenceCanvas.height,
              );
              const pixels = tf.browser.fromPixels(inferenceCanvas);
              const src = tf.tidy(() => pixels.toFloat().div(255).expandDims(0));
              pixels.dispose();
              const outputs = (await model.executeAsync(
                { src, r1i, r2i, r3i, r4i, downsample_ratio: downsampleRatio },
                ["fgr", "pha", "r1o", "r2o", "r3o", "r4o"],
              )) as unknown as any[];
              const [fgr, pha, r1o, r2o, r3o, r4o] = outputs;
              const alpha = (await pha.data()) as Float32Array;
              // O modelo preserva a resolução de entrada; usar o shape evita
              // redimensionar a máscara por suposição caso uma webcam mude de modo.
              const width = Number(pha.shape[2]) || source.videoWidth || canvas.width,
                height = Number(pha.shape[1]) || source.videoHeight || canvas.height;
              if (!maskPixels || maskPixels.width !== width || maskPixels.height !== height) {
                maskCanvas.width = width;
                maskCanvas.height = height;
                maskPixels = maskContext.createImageData(width, height);
                for (let offset = 0; offset < maskPixels.data.length; offset += 4) {
                  maskPixels.data[offset] = 255;
                  maskPixels.data[offset + 1] = 255;
                  maskPixels.data[offset + 2] = 255;
                }
              }
              for (let index = 0; index < alpha.length; index += 1)
                maskPixels.data[index * 4 + 3] = Math.round(Math.max(0, Math.min(1, alpha[index])) * 255);
              maskContext.putImageData(maskPixels, 0, 0);
              hasMask = true;
              attachOutput();
              src.dispose();
              fgr.dispose();
              pha.dispose();
              r1i.dispose(); r2i.dispose(); r3i.dispose(); r4i.dispose();
              r1i = r1o; r2i = r2o; r3i = r3o; r4i = r4o;
              inferenceDuration = performance.now() - started;
              if (inferenceDuration < 100)
                setNotice("IA Premium ativa · vídeo fluido e recorte temporal na GPU");
            } catch {
              setNotice("A IA Premium não iniciou. Voltamos para o recorte leve.");
              setMattingQuality("standard");
            } finally {
              inferenceBusy = false;
              if (active) {
                // A máscara não precisa competir com o vídeo em 30 fps. Um teto
                // de 13 fps mantém o RVM temporal estável, evita uso contínuo de
                // GPU e deixa espaço para codificar/enviar a chamada. Se a máquina
                // já estiver ocupada, reduz ainda mais a pressão automaticamente.
                const targetMaskInterval = inferenceDuration > 85 ? 120 : 76;
                const pause = Math.min(160, Math.max(12, targetMaskInterval - inferenceDuration));
                premiumInferenceTimer = window.setTimeout(() => void inferPremium(), pause);
              }
            }
          };
          renderPremium();
          void inferPremium();
          return () => {
            cancelAnimationFrame(segmentationFrame);
            cancelAnimationFrame(renderFrame);
            window.clearTimeout(premiumInferenceTimer);
            model.dispose();
            r1i.dispose(); r2i.dispose(); r3i.dispose(); r4i.dispose(); downsampleRatio.dispose();
            output.getTracks().forEach((track) => track.stop());
            if (processedLocal.current === output) {
              processedLocal.current = null;
              if (local.current) replaceOutgoingVideo(local.current);
              setVirtualEpoch((epoch) => epoch + 1);
            }
          };
        }
        const worker = new Worker(
          new URL("./workers/person-segmentation.worker.ts", import.meta.url),
          { type: "module", name: "klip-person-segmentation" },
        );
        let workerReady = false,
          workerBusy = false,
          maskPixels: ImageData | null = null;
        worker.onmessage = (
          event: MessageEvent<
            | { type: "ready" }
            | {
                type: "mask";
                alpha: ArrayBuffer;
                width: number;
                height: number;
                inferenceMs: number;
              }
            | { type: "error"; message: string }
          >,
        ) => {
          if (!active) return;
          if (event.data.type === "ready") {
            workerReady = true;
            return;
          }
          workerBusy = false;
          if (event.data.type === "error") {
            setNotice(
              "Não foi possível aplicar o recorte por IA. A câmera continua normal.",
            );
            return;
          }
          inferenceDuration = event.data.inferenceMs;
          const { width, height } = event.data;
          if (
            !maskPixels ||
            maskPixels.width !== width ||
            maskPixels.height !== height
          ) {
            maskCanvas.width = width;
            maskCanvas.height = height;
            maskPixels = maskContext.createImageData(width, height);
            for (let offset = 0; offset < maskPixels.data.length; offset += 4) {
              maskPixels.data[offset] = 255;
              maskPixels.data[offset + 1] = 255;
              maskPixels.data[offset + 2] = 255;
            }
          }
          const receivedAlpha = new Uint8ClampedArray(event.data.alpha);
          for (let index = 0; index < receivedAlpha.length; index += 1) {
            const offset = index * 4;
            maskPixels.data[offset + 3] = receivedAlpha[index];
          }
          maskContext.putImageData(maskPixels, 0, 0);
          hasMask = true;
          if (!attached) {
            processedLocal.current = output;
            replaceOutgoingVideo(output);
            refreshCameraForPeer();
            if (mine.current) {
              mine.current.srcObject = output;
              void mine.current.play().catch(() => undefined);
            }
            setVirtualEpoch((epoch) => epoch + 1);
            attached = true;
          }
        };
        worker.onerror = () => {
          workerBusy = false;
          setNotice(
            "Não foi possível aplicar o recorte por IA. A câmera continua normal.",
          );
        };
        worker.postMessage({ type: "init" });
        const render = () => {
          if (!active || !context) return;
          context.clearRect(0, 0, canvas.width, canvas.height);
          if (backgroundMode === "blur") {
            const strength = blurAmountRef.current;
            context.filter = `blur(${strength}px) brightness(.9) saturate(.93)`;
            context.drawImage(
              source,
              -strength,
              -strength,
              canvas.width + strength * 2,
              canvas.height + strength * 2,
            );
            context.filter = "none";
          } else if (backgroundMode === "image") {
            drawImageBackground(context);
          }
          if (hasMask) {
            // A máscara fica em uma camada separada. Aplicá-la direto sobre
            // canvas opaco faria source-in cobrir o fundo inteiro.
            foregroundContext.clearRect(
              0,
              0,
              foregroundCanvas.width,
              foregroundCanvas.height,
            );
            foregroundContext.save();
            foregroundContext.imageSmoothingEnabled = true;
            foregroundContext.imageSmoothingQuality = "high";
            foregroundContext.filter = "blur(1.15px)";
            foregroundContext.drawImage(
              maskCanvas,
              0,
              0,
              foregroundCanvas.width,
              foregroundCanvas.height,
            );
            foregroundContext.globalCompositeOperation = "source-in";
            foregroundContext.filter = skinSmooth
              ? "blur(.22px) brightness(1.012) contrast(.992) saturate(.985)"
              : "none";
            foregroundContext.drawImage(
              source,
              0,
              0,
              foregroundCanvas.width,
              foregroundCanvas.height,
            );
            foregroundContext.restore();
            context.drawImage(foregroundCanvas, 0, 0, canvas.width, canvas.height);
          }
          renderFrame = requestAnimationFrame(render);
        };
        const next = () => {
          if (!active) return;
          // O Worker recebe no máximo um frame por vez. Enquanto a IA analisa,
          // o render, os controles e o áudio permanecem livres a 30 fps.
          const now = performance.now();
          const minimumGap = Math.max(
            46,
            Math.min(120, inferenceDuration * 1.25),
          );
          if (
            workerReady &&
            !workerBusy &&
            now - lastInferenceAt >= minimumGap
          ) {
            workerBusy = true;
            lastInferenceAt = now;
            void createImageBitmap(source)
              .then((bitmap) => {
                if (!active) {
                  bitmap.close();
                  return;
                }
                worker.postMessage(
                  { type: "segment", bitmap, timestamp: now },
                  [bitmap],
                );
              })
              .catch(() => {
                workerBusy = false;
              });
          }
          segmentationFrame = requestAnimationFrame(next);
        };
        render();
        next();
        return () => {
          cancelAnimationFrame(segmentationFrame);
          cancelAnimationFrame(renderFrame);
          worker.postMessage({ type: "close" });
          worker.terminate();
          output.getTracks().forEach((track) => track.stop());
          if (processedLocal.current === output) {
            processedLocal.current = null;
            if (local.current) replaceOutgoingVideo(local.current);
            setVirtualEpoch((epoch) => epoch + 1);
          }
        };
      } catch {
        setNotice(
          "Não foi possível aplicar o fundo virtual. A câmera continua normal.",
        );
        output.getTracks().forEach((track) => track.stop());
      }
    };
    let stop: (() => void) | undefined;
    void run().then((cleanup) => {
      if (!active) cleanup?.();
      else stop = cleanup;
    });
    return () => {
      active = false;
      stop?.();
    };
  }, [
    background,
    backgroundVideo,
    backgroundMode,
    mattingQuality,
    skinSmooth,
    cameraEpoch,
    inRoom,
  ]);
  useEffect(() => {
    if (mode === "host" && connection.current?.open)
      connection.current.send({
        kind: "layout",
        topOrder,
        screenPosition,
        tiktokTop,
        resenhaMode,
      });
  }, [mode, topOrder, screenPosition, tiktokTop, resenhaMode]);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(
      () => setRecordSeconds((seconds) => seconds + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [recording]);
  useEffect(() => {
    if (!inRoom || !("mediaSession" in navigator)) return;
    const action = "enterpictureinpicture" as MediaSessionAction;
    try {
      navigator.mediaSession.setActionHandler(
        action,
        () => void openPictureInPicture(),
      );
      return () => navigator.mediaSession.setActionHandler(action, null);
    } catch {
      return;
    }
  }, [inRoom, vertical, topOrder, tiktokTop, sharing, remoteSharing]);
  useEffect(() => {
    if (!inRoom) return;
    const audio = new AudioContext(),
      analysers: {
        who: "mine" | "friend";
        analyser: AnalyserNode;
        bytes: Uint8Array<ArrayBuffer>;
      }[] = [];
    const add = (stream: MediaStream | null, who: "mine" | "friend") => {
      if (!stream?.getAudioTracks().length) return;
      const analyser = audio.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      audio.createMediaStreamSource(stream).connect(analyser);
      analysers.push({
        who,
        analyser,
        bytes: new Uint8Array(analyser.fftSize),
      });
    };
    add(local.current, "mine");
    add(remote.current, "friend");
    const tick = () => {
      const next = { mine: false, friend: false };
      analysers.forEach(({ who, analyser, bytes }) => {
        analyser.getByteTimeDomainData(bytes);
        let energy = 0;
        bytes.forEach((value) => {
          const sample = (value - 128) / 128;
          energy += sample * sample;
        });
        next[who] = Math.sqrt(energy / bytes.length) > 0.028;
      });
      speakingRef.current = next;
      setSpeaking((previous) =>
        previous.mine === next.mine && previous.friend === next.friend
          ? previous
          : next,
      );
    };
    const timer = window.setInterval(tick, 120);
    tick();
    return () => {
      window.clearInterval(timer);
      void audio.close();
      speakingRef.current = { mine: false, friend: false };
    };
  // Trocar microfone recria local.current; a análise precisa acompanhar o
  // stream novo para a moldura de quem fala não desaparecer.
  }, [inRoom, friend, cameraEpoch]);

  async function devicesList() {
    const list = await navigator.mediaDevices.enumerateDevices();
    setDevices(list.filter((item) => item.kind === "videoinput"));
    setAudioInputs(list.filter((item) => item.kind === "audioinput"));
    setAudioOutputs(list.filter((item) => item.kind === "audiooutput"));
  }
  function showRemote(stream: MediaStream, remoteName: string) {
    peerConnected.current = true;
    peerRetry.current = 0;
    window.clearTimeout(peerConnectTimer.current);
    window.clearTimeout(peerRetryTimer.current);
    remote.current = stream;
    if (theirs.current) {
      theirs.current.srcObject = stream;
      if (audioOutputId && "setSinkId" in theirs.current)
        void (theirs.current as HTMLVideoElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(audioOutputId).catch(() => undefined);
      void theirs.current.play().catch(() => undefined);
    }
    setFriend(remoteName || "Seu amigo");
    setNotice("Conectado com seu amigo.");
  }
  function callStream(stream: MediaStream) {
    const video =
      processedLocal.current?.getVideoTracks()[0] || stream.getVideoTracks()[0];
    return new MediaStream([
      ...(video ? [video] : []),
      ...(processedAudio.current?.getAudioTracks() || stream.getAudioTracks()),
    ]);
  }
  function replaceOutgoingVideo(stream: MediaStream) {
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    track.contentHint = "motion";
    cameraCalls.current.forEach((call) =>
      call.peerConnection
        ?.getSenders()
        .filter((sender) => sender.track?.kind === "video")
        .forEach((sender) => {
          void sender.replaceTrack(track).then(() => tuneVideoSender(sender));
        }),
    );
  }
  function tuneVideoSender(sender: RTCRtpSender) {
    if (!sender.track || sender.track.kind !== "video") return;
    sender.track.contentHint = "motion";
    const parameters = sender.getParameters();
    if (!parameters.encodings?.length) parameters.encodings = [{}];
    parameters.encodings.forEach((encoding) => {
      encoding.maxBitrate = quality === "1080" ? 8_000_000 : 4_500_000;
      encoding.maxFramerate = 30;
      encoding.scaleResolutionDownBy = 1;
    });
    parameters.degradationPreference = "balanced";
    void sender.setParameters(parameters).catch(() => undefined);
  }
  function tuneCameraCall(call: MediaConnection) {
    [0, 500, 1_500].forEach((delay) =>
      window.setTimeout(() => {
        call.peerConnection
          ?.getSenders()
          .filter((sender) => sender.track?.kind === "video")
          .forEach(tuneVideoSender);
      }, delay),
    );
  }
  function replaceOutgoingAudio(stream: MediaStream) {
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    cameraCalls.current.forEach((call) =>
      call.peerConnection
        ?.getSenders()
        .filter((sender) => sender.track?.kind === "audio")
        .forEach((sender) => void sender.replaceTrack(track)),
    );
  }
  function setupMicrophoneProcessing(stream: MediaStream, sensitivity: number) {
    void audioPipeline.current?.context.close();
    audioPipeline.current = null;
    processedAudio.current = null;
    if (!stream.getAudioTracks().length) return;
    try {
      const context = new AudioContext();
      const source = context.createMediaStreamSource(
        new MediaStream(stream.getAudioTracks()),
      );
      const gain = context.createGain();
      const analyser = context.createAnalyser();
      const output = context.createMediaStreamDestination();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      gain.gain.value = Math.max(0.2, sensitivity / 70);
      source.connect(analyser);
      source.connect(gain).connect(output);
      audioPipeline.current = { context, gain, analyser, output: output.stream };
      processedAudio.current = output.stream;
      void context.resume();
    } catch {
      processedAudio.current = null;
    }
  }
  function changeMicSensitivity(value: number) {
    setMicSensitivity(value);
    const pipeline = audioPipeline.current;
    if (pipeline) {
      pipeline.gain.gain.setTargetAtTime(
        Math.max(0.2, value / 70),
        pipeline.context.currentTime,
        0.04,
      );
      replaceOutgoingAudio(pipeline.output);
    }
  }
  function testMicrophone() {
    const pipeline = audioPipeline.current;
    if (!pipeline) {
      setNotice("Entre na sala para testar o microfone escolhido.");
      return;
    }
    setMicTesting(true);
    void pipeline.context.resume();
    const bytes = new Uint8Array(pipeline.analyser.fftSize);
    const started = performance.now();
    const read = () => {
      pipeline.analyser.getByteTimeDomainData(bytes);
      let energy = 0;
      bytes.forEach((value) => {
        const sample = (value - 128) / 128;
        energy += sample * sample;
      });
      setMicLevel(Math.min(100, Math.round(Math.sqrt(energy / bytes.length) * 850)));
      if (performance.now() - started < 5_000) {
        micTestFrame.current = requestAnimationFrame(read);
      } else {
        setMicTesting(false);
        setMicLevel(0);
      }
    };
    cancelAnimationFrame(micTestFrame.current);
    read();
  }
  function refreshCameraForPeer() {
    const client = peer.current;
    if (!client || !remoteId.current || !local.current) return;
    const updatedCall = client.call(
      remoteId.current,
      callStream(local.current),
      { metadata: { name, kind: "camera", refresh: true } },
    );
    useCall(updatedCall, friend || "Seu amigo");
  }
  function useCall(call: MediaConnection, fallback: string) {
    remoteId.current = call.peer;
    if (!cameraCalls.current.includes(call)) cameraCalls.current.push(call);
    tuneCameraCall(call);
    // Em uma chamada PeerJS, `metadata` pertence a quem iniciou a chamada.
    // A faixa que chega ao convidado é a resposta do anfitrião, portanto usar
    // metadata aqui fazia o convidado ver o próprio nome nas duas câmeras.
    call.on("stream", (stream) => showRemote(stream, fallback));
    call.on("error", () =>
      setNotice(
        "A chamada caiu. Atualize os dois navegadores e tente novamente.",
      ),
    );
    call.on("close", () => {
      cameraCalls.current = cameraCalls.current.filter((item) => item !== call);
    });
  }
  function useData(conn: DataConnection) {
    connection.current = conn;
    conn.on("open", () => {
      if (connection.current !== conn) return;
      peerConnected.current = true;
      peerRetry.current = 0;
      window.clearTimeout(peerConnectTimer.current);
      window.clearTimeout(peerRetryTimer.current);
      conn.send({ kind: "name", name });
      if (mode === "host")
        conn.send({ kind: "layout", topOrder, screenPosition, tiktokTop, resenhaMode });
    });
    conn.on("data", (item) => {
      const data = item as {
        kind?: string;
        name?: string;
        text?: string;
        active?: boolean;
        topOrder?: string;
        screenPosition?: string;
        tiktokTop?: number;
        resenhaMode?: boolean;
      };
      if (data.kind === "name" && data.name) setFriend(data.name);
      if (data.kind === "recording") {
        setFriendRecording(Boolean(data.active));
        return;
      }
      if (
        data.kind === "layout" &&
        data.topOrder &&
        data.screenPosition &&
        typeof data.tiktokTop === "number"
      ) {
        setTopOrder(
          mode === "guest"
            ? data.topOrder === "mine-first"
              ? "friend-first"
              : "mine-first"
            : (data.topOrder as "mine-first" | "friend-first"),
        );
        setScreenPosition(data.screenPosition as "top" | "bottom");
        setTiktokTop(data.tiktokTop);
        setResenhaMode(Boolean(data.resenhaMode));
        if (data.resenhaMode) setVertical(true);
        return;
      }
      if (data.kind === "chat" && data.name && data.text)
        setMessages((old) => [...old, { name: data.name!, text: data.text! }]);
    });
  }
  function startPeer(stream: MediaStream) {
    window.clearTimeout(peerConnectTimer.current);
    window.clearTimeout(peerRetryTimer.current);
    const previousPeer = peer.current;
    peer.current = null;
    previousPeer?.destroy();
    const isHost = mode === "host";
    const client = isHost ? new Peer(hostId(room, pin)) : new Peer();
    let retryScheduled = false;
    peerConnected.current = false;
    peer.current = client;
    const retryConnection = () => {
      if (retryScheduled || peer.current !== client || peerConnected.current)
        return;
      retryScheduled = true;
      window.clearTimeout(peerConnectTimer.current);
      if (peerRetry.current >= 4) {
        setNotice(
          isHost
            ? "Não foi possível reabrir esta sala. Feche outras abas com a chamada e tente novamente."
            : "Não encontramos o anfitrião nesta sala. Confirme o link e peça para ele manter a sala aberta.",
        );
        return;
      }
      peerRetry.current += 1;
      setNotice(
        `Reconectando à sala… tentativa ${peerRetry.current} de 4`,
      );
      peerRetryTimer.current = window.setTimeout(() => {
        if (peer.current === client && !peerConnected.current) startPeer(stream);
      }, 1_500);
    };
    client.on("connection", useData);
    client.on("call", (call) => {
      if (call.metadata?.kind === "screen") {
        call.answer();
        let received: MediaStream | null = null;
        call.on("stream", (shared) => {
          // Só uma pessoa apresenta por vez: uma nova apresentação encerra a anterior.
          if (displayed.current) {
            displayed.current.getTracks().forEach((track) => track.stop());
            displayed.current = null;
            if (screen.current) screen.current.srcObject = null;
            setSharing(false);
          }
          received = shared;
          remoteDisplayed.current = shared;
          if (remoteScreen.current) {
            remoteScreen.current.srcObject = shared;
            void remoteScreen.current.play().catch(() => undefined);
          }
          setRemoteSharing(true);
          setNotice(
            `${String(call.metadata?.name || "Seu amigo")} assumiu o compartilhamento.`,
          );
        });
        call.on("close", () => {
          if (remoteDisplayed.current === received) {
            remoteDisplayed.current = null;
            setRemoteSharing(false);
          }
        });
        return;
      }
      call.answer(callStream(stream));
      useCall(call, String(call.metadata?.name || "Seu amigo"));
    });
    client.on("open", () => {
      if (isHost) {
        peerConnected.current = true;
        peerRetry.current = 0;
        setNotice("Sala pronta. Copie o convite e mantenha esta aba aberta.");
        return;
      }
      const call = client.call(hostId(room, pin), callStream(stream), {
        metadata: { name, kind: "camera" },
      });
      useCall(call, owner || "Anfitrião");
      useData(client.connect(hostId(room, pin)));
      setNotice("Conectando à sala…");
      peerConnectTimer.current = window.setTimeout(retryConnection, 7_000);
    });
    client.on("error", (error) => {
      if (
        (error.type === "peer-unavailable" ||
          error.type === "unavailable-id")
      ) {
        retryConnection();
      } else {
        window.clearTimeout(peerConnectTimer.current);
        setNotice(
          "Não foi possível conectar. Atualize a página e tente novamente.",
        );
      }
    });
    client.on("disconnected", () => {
      if (!peerConnected.current) retryConnection();
    });
  }
  async function join(chosen = deviceId, chosenAudio = audioInputId) {
    if (!name.trim()) {
      setNotice("Informe seu nome antes de entrar na sala.");
      return;
    }
    if (!inRoom) setBooting(true);
    try {
      peerRetry.current = 0;
      peerConnected.current = false;
      window.clearTimeout(peerConnectTimer.current);
      window.clearTimeout(peerRetryTimer.current);
      local.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia(
        constraints(quality, chosen || undefined, chosenAudio || undefined),
      );
      local.current = stream;
      setupMicrophoneProcessing(stream, micSensitivity);
      setCameraEpoch((value) => value + 1);
      if (mine.current) {
        mine.current.srcObject = stream;
        await mine.current.play().catch(() => undefined);
      }
      if (mode === "host") setOwner(name.trim() || "Anfitrião");
      const startedAt =
        restoreCall?.room === room && restoreCall.pin === pin
          ? restoreCall.startedAt
          : Date.now();
      const saved: SavedCall = {
        room,
        pin,
        name: name.trim(),
        owner: mode === "host" ? name.trim() : owner,
        mode,
        quality,
        deviceId: chosen || "",
        audioInputId: chosenAudio || "",
        startedAt,
      };
      sessionStorage.setItem("klip-active-call", JSON.stringify(saved));
      setCallStartedAt(startedAt);
      setInRoom(true);
      await devicesList();
      startPeer(stream);
      setBooting(false);
    } catch {
      setBooting(false);
      setNotice(
        "Permita câmera e microfone. Feche outros aplicativos que possam estar usando a webcam.",
      );
    }
  }
  async function selectCamera(id: string) {
    setDeviceId(id);
    await join(id);
  }
  async function selectAudioInput(id: string) {
    setAudioInputId(id);
    await join(deviceId, id);
  }
  async function selectAudioOutput(id: string) {
    setAudioOutputId(id);
    const players = [theirs.current, remoteScreen.current];
    try {
      await Promise.all(
        players.map((player) => {
          if (!player || !("setSinkId" in player)) return Promise.resolve();
          return (player as HTMLVideoElement & { setSinkId: (sink: string) => Promise<void> }).setSinkId(id);
        }),
      );
      setNotice("Saída de áudio atualizada.");
    } catch {
      setNotice("Este navegador não permite escolher a saída de áudio.");
    }
  }
  function toggle(kind: "audio" | "video", value: boolean) {
    local.current
      ?.getTracks()
      .filter((track) => track.kind === kind)
      .forEach((track) => {
        track.enabled = value;
      });
  }
  async function toggleNoiseSuppression(enabled: boolean) {
    setNoiseSuppression(enabled);
    const track = local.current?.getAudioTracks()[0];
    try {
      await track?.applyConstraints({
        echoCancellation: true,
        noiseSuppression: enabled,
        autoGainControl: true,
      });
      setNotice(enabled ? "Supressão de ruído ativada." : "Supressão de ruído desativada.");
    } catch {
      setNotice("Este microfone não permite alterar a supressão de ruído em tempo real.");
    }
  }
  async function share() {
    if (resenhaMode) {
      setNotice("O Modo Resenha é só para câmeras. Desative-o para compartilhar a tela.");
      return;
    }
    if (sharing) {
      displayed.current?.getTracks().forEach((track) => track.stop());
      displayed.current = null;
      setSharing(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60 },
        },
        audio: true,
      });
      // Ao iniciar sua apresentação, a tela que estava vindo do amigo deixa de ser exibida.
      remoteDisplayed.current = null;
      if (remoteScreen.current) remoteScreen.current.srcObject = null;
      setRemoteSharing(false);
      displayed.current = stream;
      if (screen.current) {
        screen.current.srcObject = stream;
        await screen.current.play().catch(() => undefined);
      }
      stream.getVideoTracks()[0].onended = () => setSharing(false);
      setSharing(true);
      if (peer.current && remoteId.current)
        peer.current.call(remoteId.current, stream, {
          metadata: { kind: "screen", name },
        });
    } catch {
      setNotice("O compartilhamento de tela foi cancelado.");
    }
  }
  async function invite() {
    const url = new URL(location.href);
    url.search = "";
    url.searchParams.set("sala", room);
    url.searchParams.set("senha", pin);
    url.searchParams.set("anfitriao", owner || name || "Anfitrião");
    await navigator.clipboard.writeText(url.toString());
    setNotice("Link copiado. Seu amigo entrará nesta mesma sala.");
  }
  function send() {
    const text = draft.trim();
    if (!text) return;
    const message = { name, text };
    setMessages((old) => [...old, message]);
    connection.current?.send({ kind: "chat", ...message });
    setDraft("");
  }
  function chooseBackground(file?: File) {
    if (!file) return;
    const video = file.type === "video/mp4" || /\.mp4$/i.test(file.name);
    const animated = file.type === "image/gif" || /\.gif$/i.test(file.name);
    if (!file.type.startsWith("image/") && !video) {
      setNotice("Escolha uma imagem, GIF ou MP4 para o fundo da câmera.");
      return;
    }
    if (video) {
      setBackgroundVideo(URL.createObjectURL(file));
      setBackground("");
      setBackgroundLabel(`Vídeo animado · ${file.name}`);
      setBackgroundMode("image");
      setNotice("Vídeo MP4 aplicado como fundo animado, sem precisar converter para GIF.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setBackground(String(reader.result));
      setBackgroundVideo("");
      setBackgroundLabel(`${animated ? "GIF animado" : "Imagem"} · ${file.name}`);
      setBackgroundMode("image");
      setNotice(
        animated
          ? "GIF animado aplicado. Ele aparece atrás da câmera e também na gravação."
          : "Imagem de fundo aplicada à câmera.",
      );
    };
    reader.readAsDataURL(file);
  }
  function toggleBlur() {
    const next = backgroundMode === "blur" ? "none" : "blur";
    setBackgroundMode(next);
    if (next === "none" && mine.current && local.current) {
      mine.current.srcObject = local.current;
      void mine.current.play().catch(() => undefined);
    }
  }
  function toggleBackgroundRemoval() {
    const next = backgroundMode === "remove" ? "none" : "remove";
    setBackgroundMode(next);
    if (next === "none" && mine.current && local.current) {
      mine.current.srcObject = local.current;
      void mine.current.play().catch(() => undefined);
    }
  }
  function togglePremiumMatting() {
    const next = mattingQuality === "premium" ? "standard" : "premium";
    setMattingQuality(next);
    setNotice(
      next === "premium"
        ? "IA Premium selecionada. O modelo será preparado ao ligar um fundo."
        : "IA Premium desativada. Usando o recorte leve.",
    );
  }
  function toggleResenhaMode() {
    if (mode === "guest") return;
    const next = !resenhaMode;
    setResenhaMode(next);
    if (next) {
      setVertical(true);
      setPreviewOpen(true);
      setNotice("Modo Resenha ativo: duas câmeras empilhadas em 9:16.");
    } else {
      setNotice("Modo Resenha desativado.");
    }
  }
  const timeLabel = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const callTimeLabel = (seconds: number) =>
    `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  function downloadRecording(chunks: Blob[], mime: string, label: string) {
    if (!chunks.length) return;
    const link = document.createElement("a"),
      url = URL.createObjectURL(new Blob(chunks, { type: mime }));
    setEditorClip({ url, name: `Gravação ${label}` });
    link.href = url;
    link.download = `proximo-${label}-${Date.now()}.${mime.startsWith("video/mp4") ? "mp4" : "webm"}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  function openEditor() {
    const url = new URL(location.href);
    url.search = "";
    url.searchParams.set("editor", "1");
    window.open(url.toString(), "klip-studio");
  }
  function saveClip() {
    if (!recording || !recorder.current) return;
    cutRequested.current = true;
    recorder.current.requestData();
  }
  function record() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    const canvas = document.createElement("canvas"),
      context = canvas.getContext("2d");
    if (!context || !local.current) return;
    canvas.width = vertical ? 1080 : quality === "1080" ? 1920 : 1280;
    canvas.height = vertical ? 1920 : quality === "1080" ? 1080 : 720;
    const cover = (
      video: HTMLVideoElement | null,
      x: number,
      y: number,
      width: number,
      height: number,
    ) => {
      if (!video?.videoWidth) return;
      const scale = Math.max(
          width / video.videoWidth,
          height / video.videoHeight,
        ),
        drawWidth = video.videoWidth * scale,
        drawHeight = video.videoHeight * scale;
      context.save();
      context.beginPath();
      context.rect(x, y, width, height);
      context.clip();
      context.drawImage(
        video,
        x + (width - drawWidth) / 2,
        y + (height - drawHeight) / 2,
        drawWidth,
        drawHeight,
      );
      context.restore();
    };
    const bezel = (
      x: number,
      y: number,
      width: number,
      height: number,
      active: boolean,
    ) => {
      if (!active) return;
      context.save();
      context.strokeStyle = "#ff6b5c";
      context.lineWidth = 10;
      context.shadowColor = "#ff6b5c";
      context.shadowBlur = 18;
      context.strokeRect(x + 5, y + 5, width - 10, height - 10);
      context.restore();
    };
    const draw = () => {
      if (!recorder.current || recorder.current.state === "inactive") return;
      context.fillStyle = "#101210";
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (vertical && resenhaMode) {
        const gap = 12,
          cameraHeight = (canvas.height - gap) / 2,
          first = topOrder === "mine-first" ? mine.current : theirs.current,
          second = topOrder === "mine-first" ? theirs.current : mine.current,
          firstTalking = topOrder === "mine-first" ? speakingRef.current.mine : speakingRef.current.friend,
          secondTalking = topOrder === "mine-first" ? speakingRef.current.friend : speakingRef.current.mine;
        cover(first, 0, 0, canvas.width, cameraHeight);
        cover(second, 0, cameraHeight + gap, canvas.width, cameraHeight);
        bezel(0, 0, canvas.width, cameraHeight, firstTalking);
        bezel(0, cameraHeight + gap, canvas.width, cameraHeight, secondTalking);
      } else if (vertical) {
        const cameraHeight = canvas.height * tiktokTop,
          gap = 12,
          screenHeight = canvas.height - cameraHeight - gap,
          half = (canvas.width - gap) / 2,
          first = topOrder === "mine-first" ? mine.current : theirs.current,
          second = topOrder === "mine-first" ? theirs.current : mine.current,
          screenVideo = sharing ? screen.current : remoteScreen.current,
          cameraY = screenPosition === "top" ? screenHeight + gap : 0,
          screenY = screenPosition === "top" ? 0 : cameraHeight + gap,
          firstTalking =
            topOrder === "mine-first"
              ? speakingRef.current.mine
              : speakingRef.current.friend,
          secondTalking =
            topOrder === "mine-first"
              ? speakingRef.current.friend
              : speakingRef.current.mine;
        cover(first, 0, cameraY, half, cameraHeight);
        cover(second, half + gap, cameraY, half, cameraHeight);
        bezel(0, cameraY, half, cameraHeight, firstTalking);
        bezel(half + gap, cameraY, half, cameraHeight, secondTalking);
        cover(screenVideo, 0, screenY, canvas.width, screenHeight);
      } else {
        cover(
          sharing
            ? screen.current
            : remoteSharing
              ? remoteScreen.current
              : mine.current,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        cover(
          mine.current,
          canvas.width * 0.72,
          canvas.height * 0.68,
          canvas.width * 0.25,
          canvas.height * 0.28,
        );
        cover(
          theirs.current,
          24,
          canvas.height * 0.72,
          canvas.width * 0.2,
          canvas.height * 0.23,
        );
        bezel(
          canvas.width * 0.72,
          canvas.height * 0.68,
          canvas.width * 0.25,
          canvas.height * 0.28,
          speakingRef.current.mine,
        );
        bezel(
          24,
          canvas.height * 0.72,
          canvas.width * 0.2,
          canvas.height * 0.23,
          speakingRef.current.friend,
        );
      }
      requestAnimationFrame(draw);
    };
    const output = canvas.captureStream(30);
    // O canvas contém a imagem final; este destino mistura todos os áudios da chamada.
    // Assim o arquivo salvo preserva microfone, voz do amigo e áudio da tela compartilhada.
    let recordingAudio: AudioContext | null = null;
    try {
      recordingAudio = new AudioContext();
      const destination = recordingAudio.createMediaStreamDestination();
      [
        local.current,
        remote.current,
        displayed.current,
        remoteDisplayed.current,
      ].forEach((stream) => {
        if (!stream?.getAudioTracks().length) return;
        recordingAudio!
          .createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
          .connect(destination);
      });
      const mixedTrack = destination.stream.getAudioTracks()[0];
      if (mixedTrack) output.addTrack(mixedTrack);
      void recordingAudio.resume();
    } catch {
      recordingAudio = null;
      setNotice(
        "O vídeo será gravado; o navegador não liberou a mixagem de áudio.",
      );
    }
    const mime = mimeForExport(recordingFormat) || mimeForExport("webm")!;
    if (recordingFormat === "mp4" && !mime.startsWith("video/mp4"))
      setNotice("MP4 não é suportado neste navegador; a gravação sairá em WebM.");
    const rec = new MediaRecorder(output, {
      mimeType: mime,
      videoBitsPerSecond: quality === "1080" ? 12_000_000 : 6_000_000,
      audioBitsPerSecond: 192_000,
    });
    recorder.current = rec;
    recordChunks.current = [];
    cutRequested.current = false;
    setRecordSeconds(0);
    rec.ondataavailable = (event) => {
      if (!event.data.size) return;
      recordChunks.current.push(event.data);
      if (cutRequested.current) {
        downloadRecording(
          recordChunks.current,
          mime,
          `trecho-${timeLabel(recordSeconds).replace(":", "-")}`,
        );
        recordChunks.current = [];
        cutRequested.current = false;
        setNotice("Trecho salvo. A gravação continua.");
      }
    };
    rec.onstop = () => {
      downloadRecording(recordChunks.current, mime, "reel");
      recordChunks.current = [];
      cutRequested.current = false;
      setRecording(false);
      setRecordSeconds(0);
      void recordingAudio?.close();
      connection.current?.send({ kind: "recording", active: false });
    };
    rec.start(1000);
    setRecording(true);
    connection.current?.send({ kind: "recording", active: true });
    setNotice("● Gravando localmente com áudio. Seu amigo foi avisado.");
    draw();
  }
  function leave() {
    peer.current?.destroy();
    peer.current = null;
    connection.current = null;
    local.current?.getTracks().forEach((track) => track.stop());
    cancelAnimationFrame(micTestFrame.current);
    void audioPipeline.current?.context.close();
    audioPipeline.current = null;
    processedAudio.current = null;
    displayed.current?.getTracks().forEach((track) => track.stop());
    local.current = null;
    displayed.current = null;
    remote.current = null;
    remoteId.current = "";
    setFriend("");
    setSharing(false);
    setRemoteSharing(false);
    sessionStorage.removeItem("klip-active-call");
    setCallStartedAt(0);
    setCallSeconds(0);
    setRestoreCall(null);
    setInRoom(false);
  }
  function startSettingsDrag(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    settingsDrag.current = {
      x: settingsOffset.x,
      y: settingsOffset.y,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveSettingsDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = settingsDrag.current;
    if (!drag) return;
    setSettingsOffset({
      x: drag.x + event.clientX - drag.startX,
      y: drag.y + event.clientY - drag.startY,
    });
  }
  function endSettingsDrag() {
    settingsDrag.current = null;
  }
  function startPreviewDrag(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    previewDrag.current = {
      x: previewOffset.x,
      y: previewOffset.y,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function movePreviewDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = previewDrag.current;
    if (!drag) return;
    setPreviewOffset({
      x: drag.x + event.clientX - drag.startX,
      y: drag.y + event.clientY - drag.startY,
    });
  }
  function endPreviewDrag() {
    previewDrag.current = null;
  }
  async function openPictureInPicture() {
    if (!document.pictureInPictureEnabled) {
      setNotice("Picture-in-Picture não está disponível neste navegador.");
      return;
    }
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return;
    }
    const canvas = document.createElement("canvas"),
      context = canvas.getContext("2d");
    if (!context) return;
    canvas.width = vertical ? 540 : 960;
    canvas.height = vertical ? 960 : 540;
    const cover = (
      video: HTMLVideoElement | null,
      x: number,
      y: number,
      width: number,
      height: number,
    ) => {
      if (!video?.videoWidth) return;
      const scale = Math.max(
          width / video.videoWidth,
          height / video.videoHeight,
        ),
        drawWidth = video.videoWidth * scale,
        drawHeight = video.videoHeight * scale;
      context.save();
      context.beginPath();
      context.rect(x, y, width, height);
      context.clip();
      context.drawImage(
        video,
        x + (width - drawWidth) / 2,
        y + (height - drawHeight) / 2,
        drawWidth,
        drawHeight,
      );
      context.restore();
    };
    const draw = () => {
      context.fillStyle = "#151616";
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (vertical && resenhaMode) {
        const gap = 6,
          cameraHeight = (canvas.height - gap) / 2,
          first = topOrder === "mine-first" ? mine.current : theirs.current,
          second = topOrder === "mine-first" ? theirs.current : mine.current;
        cover(first, 0, 0, canvas.width, cameraHeight);
        cover(second, 0, cameraHeight + gap, canvas.width, cameraHeight);
      } else if (vertical) {
        const topHeight = canvas.height * tiktokTop,
          gap = 6,
          half = (canvas.width - gap) / 2,
          first = topOrder === "mine-first" ? mine.current : theirs.current,
          second = topOrder === "mine-first" ? theirs.current : mine.current,
          screenVideo = sharing ? screen.current : remoteScreen.current;
        cover(first, 0, 0, half, topHeight);
        cover(second, half + gap, 0, half, topHeight);
        cover(
          screenVideo,
          0,
          topHeight + gap,
          canvas.width,
          canvas.height - topHeight - gap,
        );
      } else {
        cover(
          sharing
            ? screen.current
            : remoteSharing
              ? remoteScreen.current
              : mine.current,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        cover(
          mine.current,
          canvas.width * 0.7,
          canvas.height * 0.65,
          canvas.width * 0.28,
          canvas.height * 0.3,
        );
        cover(
          theirs.current,
          18,
          canvas.height * 0.71,
          canvas.width * 0.24,
          canvas.height * 0.26,
        );
      }
      pipFrame.current = requestAnimationFrame(draw);
    };
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = canvas.captureStream(30);
    video.style.cssText = "position:fixed;left:-9999px;width:1px;height:1px";
    document.body.append(video);
    pipVideo.current = video;
    video.addEventListener(
      "leavepictureinpicture",
      () => {
        cancelAnimationFrame(pipFrame.current);
        video.remove();
        if (pipVideo.current === video) pipVideo.current = null;
      },
      { once: true },
    );
    draw();
    try {
      await video.play();
      await video.requestPictureInPicture();
      setNotice("Prévia aberta em Picture-in-Picture.");
    } catch {
      cancelAnimationFrame(pipFrame.current);
      video.remove();
      pipVideo.current = null;
      setNotice(
        "Não foi possível abrir o Picture-in-Picture. Tente pelo Chrome.",
      );
    }
  }
  if (editorOpen)
    return (
      <ClipEditorV2
        initialClip={editorClip}
        onBack={() => {
          if (editorReturnToCall) {
            setEditorOpen(false);
            setEditorReturnToCall(false);
            return;
          }
          if (window.opener && !window.opener.closed) {
            window.close();
            return;
          }
          location.assign(location.origin + location.pathname);
        }}
      />
    );
  if (booting)
    return (
      <main className="loading-screen">
        <div className="loading-mark">
          <i />
          <i />
        </div>
        <h1>Klip</h1>
        <p>Recuperando sua sala…</p>
        <span />
      </main>
    );
  if (!inRoom)
    return (
      <main className="landing">
        <nav>
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <i />
              <i />
            </span>
            Klip
          </div>
          <button className="open-editor" onClick={openEditor}>
            ✦ Editor de clipes
          </button>
        </nav>
        <section className="hero">
          <div className="eyebrow">vídeo privado em tempo real</div>
          <h1>
            {mode === "host" ? (
              <>
                Crie sua
                <br />
                <em>sala.</em>
              </>
            ) : (
              <>
                Entre na
                <br />
                <em>sala.</em>
              </>
            )}
          </h1>
          <p>
            {mode === "host"
              ? "Informe seu nome, entre e envie o convite. Mantenha a aba aberta."
              : `Você vai entrar na sala de ${owner || "seu amigo"}.`}
          </p>
          <div className="entry-tabs">
            <button
              className={mode === "host" ? "selected" : ""}
              onClick={() => setMode("host")}
            >
              Criar nova sala
            </button>
            <button
              className={mode === "guest" ? "selected" : ""}
              onClick={() => setMode("guest")}
            >
              Entrar em sessão
            </button>
          </div>
          <div className="join">
            <label>
              SEU NOME
              <input
                value={name}
                placeholder="Digite seu nome"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              QUALIDADE
              <select
                value={quality}
                onChange={(event) => setQuality(event.target.value as Quality)}
              >
                <option value="1080">Full HD · 1080p</option>
                <option value="720">HD · 720p</option>
              </select>
            </label>
            <label>
              SALA (6 NÚMEROS)
              <input
                value={room}
                inputMode="numeric"
                maxLength={6}
                onChange={(event) =>
                  setRoom(event.target.value.replace(/\D/g, ""))
                }
              />
            </label>
            <label>
              SENHA DE CONFIRMAÇÃO
              <input
                value={pin}
                inputMode="numeric"
                maxLength={4}
                onChange={(event) =>
                  setPin(event.target.value.replace(/\D/g, ""))
                }
              />
            </label>
            {mode === "host" && (
              <button
                className="secondary"
                onClick={() => {
                  setRoom(code(6));
                  setPin(code(4));
                }}
              >
                Gerar nova sala e senha
              </button>
            )}
            <button onClick={() => void join()}>
              {mode === "host" ? "Criar e entrar na sala" : "Entrar na sessão"}{" "}
              <b>→</b>
            </button>
            {notice && <p>{notice}</p>}
          </div>
        </section>
        <div className="orb one" />
        <div className="orb two" />
      </main>
    );
  const screenActive = sharing || remoteSharing;
  return (
    <main className="call">
      <header>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
          </span>
          Klip
        </div>
        <div className="room">
          <i /> sala {room} ·{" "}
          <span className="call-timer">⏱ {callTimeLabel(callSeconds)}</span>
        </div>
        <div className="header-actions">
          <button className="open-editor" onClick={openEditor}>
            ✦ Editor
          </button>
          <button className="invite" onClick={() => void invite()}>
            ⌁ Convidar
          </button>
          <button
            className="chat-toggle"
            onClick={() => setChatOpen(!chatOpen)}
          >
            ▤ Chat
          </button>
          <button
            className={settingsOpen ? "settings-open" : "settings"}
            onClick={() => {
              const next = !settingsOpen;
              setSettingsOpen(next);
            }}
          >
            ⚙ Ajustes
          </button>
        </div>
      </header>
      {settingsOpen && (
        <aside
          className={"settings-panel " + (settingsMinimized ? "minimized" : "")}
          style={{
            transform: `translate(${settingsOffset.x}px, ${settingsOffset.y}px)`,
          }}
        >
          <div
            className="settings-title"
            onPointerDown={startSettingsDrag}
            onPointerMove={moveSettingsDrag}
            onPointerUp={endSettingsDrag}
            onPointerCancel={endSettingsDrag}
          >
            <div>
              <b>Ajustes da sessão</b>
              <small>
                Arraste esta barra para mover. Personalize a câmera e o vídeo
                que será salvo.
              </small>
            </div>
            <div className="window-actions">
              <button
                onClick={() => {
                  const next = !settingsMinimized;
                  setSettingsMinimized(next);
                }}
                aria-label={
                  settingsMinimized ? "Expandir ajustes" : "Minimizar ajustes"
                }
              >
                —
              </button>
              <button
                onClick={() => setSettingsOpen(false)}
                aria-label="Fechar ajustes"
              >
                ×
              </button>
            </div>
          </div>
          {!settingsMinimized && (
            <>
              <div className="settings-menu">
                <details open>
                  <summary>
                    <span>▣</span>
                    <div>
                      <b>Câmera e fundo</b>
                      <small>Webcam, imagem e desfoque</small>
                    </div>
                  </summary>
                  <div className="menu-content">
                    <label className="menu-field">
                      Webcam
                      <select
                        value={deviceId}
                        onChange={(event) =>
                          void selectCamera(event.target.value)
                        }
                        aria-label="Escolher webcam"
                      >
                        <option value="">Webcam padrão</option>
                        {devices.map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label || "Webcam"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="menu-field">
                      Microfone
                      <select
                        value={audioInputId}
                        onChange={(event) =>
                          void selectAudioInput(event.target.value)
                        }
                      >
                        <option value="">Microfone padrão</option>
                        {audioInputs.map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label || "Microfone"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="menu-field">
                      Saída de áudio
                      <select
                        value={audioOutputId}
                        onChange={(event) =>
                          void selectAudioOutput(event.target.value)
                        }
                      >
                        <option value="">Saída padrão do sistema</option>
                        {audioOutputs.map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label || "Fone / alto-falante"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="setting-actions">
                      <label className="background-upload">
                        ▧ Escolher imagem
                        <input
                          type="file"
                          accept="image/*,video/mp4,.mp4"
                          onChange={(event) =>
                            chooseBackground(event.target.files?.[0])
                          }
                        />
                      </label>
                      <label className="background-upload animated-background-upload">
                        ✦ Subir GIF ou MP4 animado
                        <input
                          type="file"
                          accept="image/gif,.gif,video/mp4,.mp4"
                          onChange={(event) =>
                            chooseBackground(event.target.files?.[0])
                          }
                        />
                      </label>
                      <button
                        className={
                          backgroundMode === "blur" ? "format on" : "format"
                        }
                        onClick={toggleBlur}
                      >
                        ◌ Desfocar
                      </button>
                      <button
                        className={
                          backgroundMode === "remove" ? "format on" : "format"
                        }
                        onClick={toggleBackgroundRemoval}
                      >
                        ◒ Remover fundo
                      </button>
                      <button
                        className={
                          mattingQuality === "premium" ? "format on premium" : "format premium"
                        }
                        onClick={togglePremiumMatting}
                      >
                        ✦ IA Premium
                      </button>
                    </div>
                    <p className="matting-note">
                      {mattingQuality === "premium"
                        ? "IA Premium: recorte temporal de alta qualidade · ideal para GPUs fortes"
                        : "Recorte leve: mais rápido, indicado para computadores comuns"}
                    </p>
                    {backgroundLabel && <p className="background-file-note">● {backgroundLabel}{/(GIF animado|Vídeo animado)/.test(backgroundLabel) ? " · animação incluída na gravação" : ""}</p>}
                    {backgroundMode === "blur" && (
                      <label className="menu-field blur-control">
                        Intensidade do desfoque: {blurAmount}px
                        <input
                          type="range"
                          min="6"
                          max="26"
                          value={blurAmount}
                          onChange={(event) => {
                            const amount = Number(event.target.value);
                            blurAmountRef.current = amount;
                            setBlurAmount(amount);
                          }}
                        />
                      </label>
                    )}
                    <label className="menu-switch">
                      <input
                        type="checkbox"
                        checked={skinSmooth}
                        onChange={(event) =>
                          setSkinSmooth(event.target.checked)
                        }
                      />
                      <span>Suavizar pele (leve)</span>
                    </label>
                    <label className="menu-switch">
                      <input
                        type="checkbox"
                        checked={noiseSuppression}
                        onChange={(event) =>
                          void toggleNoiseSuppression(event.target.checked)
                        }
                      />
                      <span>Supressão de ruído</span>
                    </label>
                    <div className="mic-tuning">
                      <label className="menu-field">
                        Sensibilidade do microfone: {micSensitivity}%
                        <input
                          type="range"
                          min="20"
                          max="130"
                          value={micSensitivity}
                          onChange={(event) =>
                            changeMicSensitivity(Number(event.target.value))
                          }
                        />
                      </label>
                      <div className="mic-meter" aria-label="Nível do microfone">
                        <i style={{ width: `${micLevel}%` }} />
                      </div>
                      <button
                        className={micTesting ? "format on" : "format"}
                        onClick={testMicrophone}
                      >
                        {micTesting ? "● Testando…" : "▷ Testar microfone"}
                      </button>
                      <small>
                        Fale por 5 segundos. Mantenha o indicador no meio para
                        evitar vazamento e distorção.
                      </small>
                    </div>
                  </div>
                </details>
                <details>
                  <summary>
                    <span>▯</span>
                    <div>
                      <b>Reels e prévia</b>
                      <small>Formato para salvar e edição visual</small>
                    </div>
                  </summary>
                  <div className="menu-content">
                    <button
                      className={resenhaMode ? "open-preview active-resenha" : "open-preview"}
                      onClick={toggleResenhaMode}
                      disabled={mode === "guest"}
                    >
                      {resenhaMode ? "● Modo Resenha ativo" : "◉ Ativar Modo Resenha"}
                    </button>
                    <small className="resenha-note">
                      Duas câmeras empilhadas em 9:16, sem tela compartilhada — ideal para só bater papo e gravar.
                    </small>
                    <label className="menu-switch">
                      <input
                        type="checkbox"
                        checked={vertical}
                        onChange={(event) => {
                          setVertical(event.target.checked);
                          if (event.target.checked) setPreviewOpen(true);
                        }}
                      />
                      <span>Usar formato vertical 9:16</span>
                    </label>
                    <label className="menu-field">
                      Formato da gravação
                      <select
                        value={recordingFormat}
                        onChange={(event) => setRecordingFormat(event.target.value as ExportFormat)}
                      >
                        <option value="mp4">MP4 · melhor para redes sociais</option>
                        <option value="webm">WebM · alta qualidade web</option>
                      </select>
                    </label>
                    <small className="resenha-note">O formato é escolhido antes de iniciar a gravação. Se o Chrome não liberar MP4, o Klip avisa e usa WebM de verdade.</small>
                    <button
                      className="open-preview"
                      onClick={() => {
                        setVertical(true);
                        setPreviewOpen(!previewOpen);
                      }}
                    >
                      ▣ {previewOpen ? "Fechar prévia" : "Abrir prévia"}
                    </button>
                  </div>
                </details>
                <details>
                  <summary>
                    <span>⇄</span>
                    <div>
                      <b>Layout vertical</b>
                      <small>Defina a ordem das câmeras e da tela</small>
                    </div>
                  </summary>
                  <div className="menu-content layout-selects">
                    <label>
                      Ordem das câmeras
                      <select
                        value={topOrder}
                        disabled={mode === "guest"}
                        onChange={(event) =>
                          setTopOrder(
                            event.target.value as "mine-first" | "friend-first",
                          )
                        }
                      >
                        <option value="mine-first">
                          Minha câmera à esquerda
                        </option>
                        <option value="friend-first">Amigo à esquerda</option>
                      </select>
                    </label>
                    <label>
                      Posição da tela
                      <select
                        value={screenPosition}
                        disabled={mode === "guest"}
                        onChange={(event) =>
                          setScreenPosition(
                            event.target.value as "top" | "bottom",
                          )
                        }
                      >
                        <option value="bottom">Tela embaixo</option>
                        <option value="top">Tela em cima</option>
                      </select>
                    </label>
                  </div>
                </details>
              </div>
              <button
                className="session-refresh"
                onClick={() => location.reload()}
              >
                ↻ Recarregar sessão
              </button>
              <p className="app-version">Klip {APP_VERSION} · produção</p>
            </>
          )}
        </aside>
      )}
      <section className={"stage " + (resenhaMode ? "resenha-stage" : screenActive ? "screen-on" : "")}>
        {screenActive && !resenhaMode && (
          <div className="tile shared">
            <video ref={sharing ? screen : remoteScreen} autoPlay playsInline />
            <label>
              {sharing
                ? "Sua tela"
                : `${friend || "Seu amigo"} está compartilhando`}{" "}
              <b>Compartilhando</b>
            </label>
          </div>
        )}
        <div className={"tile mine " + (speaking.mine ? "speaking" : "")}>
          <video
            ref={mine}
            autoPlay
            muted
            playsInline
            className={cameraOn ? "" : "hidden"}
          />
          {!cameraOn && <div className="avatar">V</div>}
          <label>
            {name} (você) <b>{mic ? "●" : "microfone desligado"}</b>
          </label>
        </div>
        <div className={"tile waiting " + (speaking.friend ? "speaking" : "")}>
          {friend ? (
            <>
              <video ref={theirs} autoPlay playsInline />
              <label>
                {friend} <b>{friendRecording ? "● gravando" : "● conectado"}</b>
              </label>
            </>
          ) : (
            <>
              <div className="avatar">?</div>
              <label>Aguardando seu amigo</label>
              <p>Envie o convite para ele entrar nesta sala</p>
            </>
          )}
        </div>
      </section>
      {previewOpen && (
        <aside
          className={"tiktok-preview " + (previewMinimized ? "minimized" : "")}
          style={{
            transform: `translate(${previewOffset.x}px, ${previewOffset.y}px)`,
          }}
        >
          <div
            className="preview-title"
            onPointerDown={startPreviewDrag}
            onPointerMove={movePreviewDrag}
            onPointerUp={endPreviewDrag}
            onPointerCancel={endPreviewDrag}
          >
            <span>Prévia para salvar · 9:16</span>
            <div className="window-actions">
              <button
                onClick={() => setPreviewMinimized(!previewMinimized)}
                aria-label={
                  previewMinimized ? "Expandir prévia" : "Minimizar prévia"
                }
              >
                —
              </button>
              <button
                onClick={() => setPreviewOpen(false)}
                aria-label="Fechar prévia"
              >
                ×
              </button>
            </div>
          </div>
          {previewMinimized ? (
            <button
              className="mini-preview"
              onClick={() => setPreviewMinimized(false)}
              aria-label="Expandir prévia"
            >
              <div>
                <video ref={previewMine} autoPlay muted playsInline />
                <video ref={previewFriend} autoPlay playsInline />
              </div>
              <span>Prévia 9:16 · clique para expandir</span>
            </button>
          ) : (
            <>
              <div className={"preview-canvas " + (resenhaMode ? "resenha-preview" : "screen-" + screenPosition)}>
                <div
                  className={(resenhaMode ? "resenha-cameras " : "preview-top ") + topOrder}
                  style={{ height: resenhaMode ? "100%" : `${tiktokTop * 100}%` }}
                >
                  <video
                    draggable
                    onDragStart={() => setDragging("mine")}
                    onDragEnd={() => setDragging("")}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (mode === "host" && dragging === "friend")
                        setTopOrder(
                          topOrder === "mine-first"
                            ? "friend-first"
                            : "mine-first",
                        );
                    }}
                    ref={previewMine}
                    autoPlay
                    muted
                    playsInline
                  />
                  <video
                    draggable
                    onDragStart={() => setDragging("friend")}
                    onDragEnd={() => setDragging("")}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (mode === "host" && dragging === "mine")
                        setTopOrder(
                          topOrder === "mine-first"
                            ? "friend-first"
                            : "mine-first",
                        );
                    }}
                    ref={previewFriend}
                    autoPlay
                    playsInline
                  />
                </div>
                {!resenhaMode && (
                  <div
                    className="preview-screen"
                    style={{ height: `${(1 - tiktokTop) * 100}%` }}
                  >
                    {sharing || remoteSharing ? (
                      <video ref={previewScreen} autoPlay playsInline />
                    ) : (
                      <span>A tela compartilhada aparecerá aqui</span>
                    )}
                  </div>
                )}
              </div>
              {!resenhaMode && <label className="preview-slider">
                Tamanho das câmeras
                <input
                  type="range"
                  min="0.2"
                  max="0.5"
                  step="0.01"
                  value={tiktokTop}
                  disabled={mode === "guest"}
                  onChange={(event) => setTiktokTop(Number(event.target.value))}
                />
              </label>}
              <small>
                {resenhaMode
                  ? "Arraste uma câmera sobre a outra para decidir quem fica em cima. Este layout será usado na gravação."
                  : "Arraste uma câmera sobre a outra para trocar de lado. O tamanho da prévia será usado na gravação."}
              </small>
            </>
          )}
        </aside>
      )}
      {chatOpen && (
        <aside className="chat-panel">
          <div className="chat-title">
            Chat da sala <button onClick={() => setChatOpen(false)}>×</button>
          </div>
          <div className="chat-messages">
            {messages.length ? (
              messages.map((message, index) => (
                <p key={index}>
                  <b>{message.name}</b>
                  {message.text}
                </p>
              ))
            ) : (
              <span>Sem mensagens ainda.</span>
            )}
          </div>
          <div className="chat-compose">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && send()}
              placeholder="Digite uma mensagem…"
            />
            <button onClick={send}>Enviar</button>
          </div>
        </aside>
      )}
      {notice && (
        <div className="toast">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}
      <footer>
        <button
          className={!mic ? "off" : ""}
          onClick={() => {
            toggle("audio", !mic);
            setMic(!mic);
          }}
        >
          <b>{mic ? "◉" : "◌"}</b>
          <small>{mic ? "Microfone" : "Silenciado"}</small>
        </button>
        <button
          className={!cameraOn ? "off" : ""}
          onClick={() => {
            toggle("video", !cameraOn);
            setCameraOn(!cameraOn);
          }}
        >
          <b>{cameraOn ? "◉" : "◌"}</b>
          <small>{cameraOn ? "Câmera" : "Câmera off"}</small>
        </button>
        <button
          className={sharing ? "active" : ""}
          onClick={() => void share()}
        >
          <b>▣</b>
          <small>{sharing ? "Parar tela" : "Compartilhar tela"}</small>
        </button>
        <button className={recording ? "recording" : ""} onClick={record}>
          <b>{recording ? `● ${timeLabel(recordSeconds)}` : "●"}</b>
          <small>{recording ? "Parar e salvar" : "Gravar local"}</small>
        </button>
        {editorClip && !recording && (
          <button className="edit-recording" onClick={() => {
            setEditorReturnToCall(true);
            setEditorOpen(true);
          }}>
            <b>✦</b>
            <small>Editar gravação</small>
          </button>
        )}
        {recording && (
          <button className="clip" onClick={saveClip}>
            <b>✂</b>
            <small>Salvar trecho</small>
          </button>
        )}
        <i />
        <button className="leave" onClick={leave}>
          <b>⌕</b>
          <small>Sair</small>
        </button>
      </footer>
    </main>
  );
}

function ClipEditor({
  initialClip,
  onBack,
}: {
  initialClip: EditorClip | null;
  onBack: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [clip, setClip] = useState<EditorClip | null>(initialClip),
    [duration, setDuration] = useState(0),
    [current, setCurrent] = useState(0),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(0),
    [caption, setCaption] = useState("Seu melhor momento começa aqui ✦"),
    [font, setFont] = useState("Inter"),
    [captionColor, setCaptionColor] = useState("#ffffff"),
    [captionSize, setCaptionSize] = useState(58),
    [captionX, setCaptionX] = useState(50),
    [captionY, setCaptionY] = useState(76),
    [captionAlign, setCaptionAlign] = useState<"left" | "center" | "right">(
      "center",
    ),
    [exporting, setExporting] = useState(false),
    [notice, setNotice] = useState("");
  const captionDrag = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const time = (value: number) => {
    const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(
      Math.floor(safe % 60),
    ).padStart(2, "0")}`;
  };
  function selectFile(file?: File) {
    if (!file) return;
    if (clip?.url.startsWith("blob:")) URL.revokeObjectURL(clip.url);
    const url = URL.createObjectURL(file);
    setClip({ url, name: file.name.replace(/\.[^.]+$/, "") });
    setDuration(0);
    setCurrent(0);
    setStart(0);
    setEnd(0);
    setNotice("Vídeo carregado. Marque o início e o fim do corte.");
  }
  function seek(value: number) {
    if (!video.current) return;
    video.current.currentTime = value;
    setCurrent(value);
  }
  function setVideoDuration(element: HTMLVideoElement) {
    const value = element.duration;
    if (Number.isFinite(value) && value > 0) {
      setDuration(value);
      setEnd(value);
      return;
    }
    // Gravações WebM frequentemente chegam sem duração no metadata. Este seek
    // faz o navegador calcular a duração real antes de montar a linha do tempo.
    element.currentTime = 1e101;
  }
  function startCaptionDrag(event: React.PointerEvent<HTMLDivElement>) {
    const stage = event.currentTarget.parentElement;
    if (!stage) return;
    captionDrag.current = {
      x: captionX,
      y: captionY,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveCaptionDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = captionDrag.current;
    const stage = event.currentTarget.parentElement;
    if (!drag || !stage) return;
    const bounds = stage.getBoundingClientRect();
    setCaptionX(Math.max(8, Math.min(92, drag.x + ((event.clientX - drag.startX) / bounds.width) * 100)));
    setCaptionY(Math.max(6, Math.min(94, drag.y + ((event.clientY - drag.startY) / bounds.height) * 100)));
  }
  async function exportReel() {
    const source = video.current;
    if (!source || !clip || end <= start) return;
    setExporting(true);
    setNotice("Renderizando seu reel localmente…");
    const canvas = document.createElement("canvas"),
      context = canvas.getContext("2d");
    if (!context) return;
    canvas.width = 1080;
    canvas.height = 1920;
    const output = canvas.captureStream(30);
    const captured = (
      source as HTMLVideoElement & { captureStream?: () => MediaStream }
    ).captureStream?.();
    captured?.getAudioTracks().forEach((track) => output.addTrack(track));
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(output, {
      mimeType: mime,
      videoBitsPerSecond: 10_000_000,
      audioBitsPerSecond: 192_000,
    });
    let frame = 0;
    const draw = () => {
      const scale = Math.max(canvas.width / source.videoWidth, canvas.height / source.videoHeight);
      const width = source.videoWidth * scale,
        height = source.videoHeight * scale;
      context.fillStyle = "#090909";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      if (caption.trim()) {
        context.save();
        context.font = `800 ${captionSize}px ${font}`;
        context.fillStyle = captionColor;
        context.textAlign = captionAlign;
        context.textBaseline = "middle";
        context.lineWidth = Math.max(4, captionSize / 11);
        context.strokeStyle = "rgba(0,0,0,.72)";
        const x = (captionX / 100) * canvas.width;
        const y = (captionY / 100) * canvas.height;
        context.strokeText(caption, x, y, 930);
        context.fillText(caption, x, y, 930);
        context.restore();
      }
      if (source.currentTime < end && !source.paused) {
        frame = requestAnimationFrame(draw);
      } else if (recorder.state !== "inactive") {
        recorder.stop();
      }
    };
    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    recorder.onstop = () => {
      cancelAnimationFrame(frame);
      const url = URL.createObjectURL(new Blob(chunks, { type: mime }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `klip-reel-${Date.now()}.webm`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setExporting(false);
      setNotice("Reel exportado com o corte e a legenda.");
    };
    source.currentTime = start;
    await new Promise<void>((resolve) => source.addEventListener("seeked", () => resolve(), { once: true }));
    recorder.start();
    await source.play();
    draw();
  }
  return (
    <main className="clip-editor">
      <header className="editor-header">
        <div className="brand"><span className="brand-mark"><i /><i /></span>Klip <em>Studio</em></div>
        <div className="editor-header-actions">
          <button onClick={onBack}>← Voltar para sala</button>
          <button className="editor-export" disabled={!clip || exporting} onClick={() => void exportReel()}>
            {exporting ? "Renderizando…" : "⇩ Exportar reel"}
          </button>
        </div>
      </header>
      <section className="editor-workspace">
        <aside className="editor-tools">
          <div className="tool-heading"><span>01</span><div><b>Mídia</b><small>Suba ou use uma gravação</small></div></div>
          <label className="editor-upload">＋ Importar vídeo<input type="file" accept="video/*" onChange={(event) => selectFile(event.target.files?.[0])} /></label>
          {clip && <p className="editor-file">● {clip.name}</p>}
          <div className="tool-heading"><span>02</span><div><b>Legenda</b><small>Texto, fonte e posição</small></div></div>
          <textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Escreva sua legenda…" />
          <div className="caption-controls">
            <select value={font} onChange={(event) => setFont(event.target.value)}><option>Inter</option><option>Arial Black</option><option>Georgia</option><option>Courier New</option></select>
            <input aria-label="Cor da legenda" type="color" value={captionColor} onChange={(event) => setCaptionColor(event.target.value)} />
          </div>
          <label className="range-label">Tamanho <input type="range" min="28" max="100" value={captionSize} onChange={(event) => setCaptionSize(Number(event.target.value))} /></label>
          <label className="range-label">Posição vertical <input type="range" min="8" max="90" value={captionY} onChange={(event) => setCaptionY(Number(event.target.value))} /></label>
          <div className="align-buttons"><button className={captionAlign === "left" ? "selected" : ""} onClick={() => setCaptionAlign("left")}>≡</button><button className={captionAlign === "center" ? "selected" : ""} onClick={() => setCaptionAlign("center")}>☰</button><button className={captionAlign === "right" ? "selected" : ""} onClick={() => setCaptionAlign("right")}>≡</button></div>
          <div className="emoji-row">{["🔥", "😂", "🎙️", "✨", "💥", "👀"].map((emoji) => <button key={emoji} onClick={() => setCaption((value) => `${value} ${emoji}`)}>{emoji}</button>)}</div>
        </aside>
        <section className="editor-stage-wrap">
          <div className="editor-stage">
            {clip ? <video ref={video} src={clip.url} playsInline controls onLoadedMetadata={(event) => setVideoDuration(event.currentTarget)} onDurationChange={(event) => { if (Number.isFinite(event.currentTarget.duration) && event.currentTarget.duration > 0) { setDuration(event.currentTarget.duration); setEnd(event.currentTarget.duration); if (event.currentTarget.currentTime > event.currentTarget.duration) event.currentTarget.currentTime = 0; } }} onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)} /> : <div className="editor-empty"><b>Arraste sua história para cá.</b><span>Envie uma gravação, entrevista ou gameplay.</span></div>}
            {clip && caption && <div className="caption-overlay" onPointerDown={startCaptionDrag} onPointerMove={moveCaptionDrag} onPointerUp={() => { captionDrag.current = null; }} onPointerCancel={() => { captionDrag.current = null; }} style={{ fontFamily: font, color: captionColor, fontSize: `${Math.round(captionSize / 2.25)}px`, left: `${captionX}%`, top: `${captionY}%`, textAlign: captionAlign }}><span>{caption}</span><small>Arraste</small></div>}
          </div>
          {notice && <p className="editor-notice">{notice}</p>}
        </section>
      </section>
      <section className="timeline-panel">
        <div className="timeline-top"><div><b>Linha do tempo</b><span>{clip ? `${time(start)} — ${time(end)} · ${time(Math.max(0, end - start))}` : "Importe um vídeo para começar"}</span></div><button disabled={!clip} onClick={() => seek(start)}>↶ Ir ao início</button><button disabled={!clip} onClick={() => seek(end)}>↷ Ir ao fim</button></div>
        <div className="timeline"><div className="timeline-ruler">{Array.from({ length: 10 }, (_, index) => <i key={index}>{duration ? time((duration / 9) * index) : "00:00"}</i>)}</div><div className="timeline-track"><div className="timeline-selection" style={{ left: duration ? `${(start / duration) * 100}%` : "0%", width: duration ? `${((end - start) / duration) * 100}%` : "0%" }} /><div className="timeline-playhead" style={{ left: duration ? `${(current / duration) * 100}%` : "0%" }} /></div></div>
        <div className="cut-controls"><label>Início <input type="range" min="0" max={Math.max(duration, 0)} step="0.05" value={start} onChange={(event) => { const value = Math.min(Number(event.target.value), end - .05); setStart(value); seek(value); }} /></label><label>Fim <input type="range" min="0" max={Math.max(duration, 0)} step="0.05" value={end} onChange={(event) => { const value = Math.max(Number(event.target.value), start + .05); setEnd(value); seek(value); }} /></label></div>
      </section>
    </main>
  );
}

function ClipEditorV2({
  initialClip,
  onBack,
}: {
  initialClip: EditorClip | null;
  onBack: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const initialLayer = (): TextLayer => ({
    id: crypto.randomUUID(),
    text: "Seu melhor momento começa aqui ✦",
    font: "Inter",
    color: "#ffffff",
    size: 58,
    x: 50,
    y: 76,
    align: "center",
    start: 0,
    end: 6,
    fadeIn: 0.25,
    fadeOut: 0.25,
    effect: "pop",
    background: false,
  });
  const [clip, setClip] = useState<EditorClip | null>(initialClip),
    [duration, setDuration] = useState(0),
    [current, setCurrent] = useState(0),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(0),
    [layers, setLayers] = useState<TextLayer[]>(() => [initialLayer()]),
    [illustrations, setIllustrations] = useState<IllustrationLayer[]>([]),
    [selectedId, setSelectedId] = useState(""),
    [selectedIllustrationId, setSelectedIllustrationId] = useState(""),
    [exportFormat, setExportFormat] = useState<ExportFormat>("mp4"),
    [exporting, setExporting] = useState(false),
    [notice, setNotice] = useState("");
  const selected = layers.find((layer) => layer.id === selectedId) || layers[0];
  const selectedIllustration = illustrations.find((item) => item.id === selectedIllustrationId);
  const illustrationElements = useRef<Map<string, HTMLImageElement | HTMLVideoElement>>(new Map());
  const layerDrag = useRef<{
    id: string;
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const illustrationDrag = useRef<{
    id: string;
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);

  useEffect(() => {
    if (!selectedId && layers[0]) setSelectedId(layers[0].id);
  }, [layers, selectedId]);

  const time = (value: number) => {
    const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
    const minutes = Math.floor(safe / 60);
    const seconds = Math.floor(safe % 60);
    const tenths = Math.floor((safe % 1) * 10);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
  };
  const updateLayer = (id: string, patch: Partial<TextLayer>) =>
    setLayers((items) =>
      items.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
    );
  const updateIllustration = (id: string, patch: Partial<IllustrationLayer>) =>
    setIllustrations((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  const layerOpacity = (layer: TimedLayer, at: number) => {
    if (at < layer.start || at > layer.end) return 0;
    let opacity = 1;
    if (layer.fadeIn > 0)
      opacity = Math.min(opacity, (at - layer.start) / layer.fadeIn);
    if (layer.fadeOut > 0)
      opacity = Math.min(opacity, (layer.end - at) / layer.fadeOut);
    return Math.max(0, Math.min(1, opacity));
  };
  const effectProgress = (layer: TextLayer, at: number) =>
    Math.max(0, Math.min(1, (at - layer.start) / 0.45));
  const visibleText = (layer: TextLayer, at: number) => {
    if (layer.effect !== "typewriter") return layer.text;
    const progress = Math.max(0, Math.min(1, (at - layer.start) / 1.6));
    return layer.text.slice(0, Math.ceil(layer.text.length * progress));
  };
  function selectFile(file?: File) {
    if (!file) return;
    if (clip?.url.startsWith("blob:")) URL.revokeObjectURL(clip.url);
    setClip({
      url: URL.createObjectURL(file),
      name: file.name.replace(/\.[^.]+$/, ""),
    });
    setDuration(0);
    setCurrent(0);
    setStart(0);
    setEnd(0);
    setLayers([initialLayer()]);
    setIllustrations([]);
    setSelectedId("");
    setSelectedIllustrationId("");
    setNotice("Vídeo carregado. Agora monte as camadas na linha do tempo.");
  }
  function addIllustration(file?: File) {
    if (!file) return;
    const kind = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
        ? "video"
        : null;
    if (!kind) {
      setNotice("Escolha uma imagem ou um vídeo para a ilustração.");
      return;
    }
    const from = Math.max(start, Math.min(current, Math.max(start, end - 0.4)));
    const item: IllustrationLayer = {
      id: crypto.randomUUID(),
      kind,
      url: URL.createObjectURL(file),
      name: file.name.replace(/\.[^.]+$/, ""),
      x: 72,
      y: 30,
      size: 38,
      start: from,
      end: Math.max(from + 0.4, Math.min(end || duration || from + 4, from + 4)),
      fadeIn: 0.2,
      fadeOut: 0.2,
      fit: "cover",
    };
    setIllustrations((items) => [...items, item]);
    setSelectedIllustrationId(item.id);
    setNotice(`${kind === "image" ? "Imagem" : "Vídeo"} ilustrativo adicionado à linha do tempo.`);
  }
  function removeIllustration() {
    if (!selectedIllustration) return;
    URL.revokeObjectURL(selectedIllustration.url);
    illustrationElements.current.delete(selectedIllustration.id);
    setIllustrations((items) => items.filter((item) => item.id !== selectedIllustration.id));
    setSelectedIllustrationId("");
  }
  function setVideoDuration(element: HTMLVideoElement) {
    const value = element.duration;
    if (Number.isFinite(value) && value > 0) {
      setDuration(value);
      setEnd(value);
      setLayers((items) =>
        items.map((layer, index) =>
          index === 0 && layer.end === 6 ? { ...layer, end: value } : layer,
        ),
      );
      return;
    }
    element.currentTime = 1e101;
  }
  function seek(value: number) {
    if (!video.current) return;
    video.current.currentTime = value;
    setCurrent(value);
  }
  function addLayer() {
    const from = Math.max(start, Math.min(current, Math.max(start, end - 0.4)));
    const layer: TextLayer = {
      ...initialLayer(),
      id: crypto.randomUUID(),
      text: "Novo texto",
      y: Math.max(18, 70 - layers.length * 9),
      start: from,
      end: Math.max(from + 0.4, Math.min(end || duration || from + 4, from + 4)),
      effect: "none",
    };
    setLayers((items) => [...items, layer]);
    setSelectedId(layer.id);
    setNotice("Nova camada adicionada. Arraste o texto diretamente na prévia.");
  }
  function duplicateLayer() {
    if (!selected) return;
    const layer = {
      ...selected,
      id: crypto.randomUUID(),
      text: `${selected.text} cópia`,
      x: Math.min(90, selected.x + 4),
      y: Math.min(92, selected.y + 4),
    };
    setLayers((items) => [...items, layer]);
    setSelectedId(layer.id);
  }
  function removeLayer() {
    if (!selected) return;
    setLayers((items) => items.filter((layer) => layer.id !== selected.id));
    setSelectedId("");
  }
  function beginLayerDrag(event: React.PointerEvent<HTMLDivElement>, layer: TextLayer) {
    setSelectedId(layer.id);
    layerDrag.current = {
      id: layer.id,
      x: layer.x,
      y: layer.y,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveLayerDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = layerDrag.current;
    const stage = event.currentTarget.parentElement;
    if (!drag || !stage) return;
    const bounds = stage.getBoundingClientRect();
    updateLayer(drag.id, {
      x: Math.max(7, Math.min(93, drag.x + ((event.clientX - drag.startX) / bounds.width) * 100)),
      y: Math.max(5, Math.min(95, drag.y + ((event.clientY - drag.startY) / bounds.height) * 100)),
    });
  }
  function beginIllustrationDrag(event: React.PointerEvent<HTMLDivElement>, item: IllustrationLayer) {
    setSelectedIllustrationId(item.id);
    illustrationDrag.current = { id: item.id, x: item.x, y: item.y, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveIllustrationDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = illustrationDrag.current;
    const stage = event.currentTarget.parentElement;
    if (!drag || !stage) return;
    const bounds = stage.getBoundingClientRect();
    updateIllustration(drag.id, {
      x: Math.max(8, Math.min(92, drag.x + ((event.clientX - drag.startX) / bounds.width) * 100)),
      y: Math.max(8, Math.min(92, drag.y + ((event.clientY - drag.startY) / bounds.height) * 100)),
    });
  }
  function previewStyle(layer: TextLayer): React.CSSProperties {
    const progress = effectProgress(layer, current);
    const scale = layer.effect === "pop" ? 0.68 + progress * 0.32 : 1;
    const slide = layer.effect === "slide" ? (1 - progress) * 70 : 0;
    return {
      fontFamily: layer.font,
      color: layer.color,
      fontSize: `${Math.round(layer.size / 2.25)}px`,
      left: `${layer.x}%`,
      top: `${layer.y}%`,
      textAlign: layer.align,
      opacity: layerOpacity(layer, current),
      transform: `translate(calc(-50% + ${slide}px), -50%) scale(${scale})`,
    };
  }
  function wrapCanvasText(
    context: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ) {
    const lines: string[] = [];
    text.split("\n").forEach((paragraph) => {
      const words = paragraph.split(/\s+/);
      let line = "";
      words.forEach((word) => {
        const attempt = line ? `${line} ${word}` : word;
        if (line && context.measureText(attempt).width > maxWidth) {
          lines.push(line);
          line = word;
        } else line = attempt;
      });
      lines.push(line);
    });
    return lines;
  }
  async function exportReel() {
    const source = video.current;
    if (!source || !clip || end <= start) return;
    setExporting(true);
    setNotice("Renderizando o reel com todas as camadas e efeitos…");
    const canvas = document.createElement("canvas"),
      context = canvas.getContext("2d");
    if (!context) {
      setExporting(false);
      return;
    }
    canvas.width = 1080;
    canvas.height = 1920;
    const output = canvas.captureStream(30);
    const captured = (
      source as HTMLVideoElement & { captureStream?: () => MediaStream }
    ).captureStream?.();
    captured?.getAudioTracks().forEach((track) => output.addTrack(track));
    const mime = mimeForExport(exportFormat) || mimeForExport("webm")!;
    if (exportFormat === "mp4" && !mime.startsWith("video/mp4"))
      setNotice("MP4 não é suportado neste navegador; exportando WebM verdadeiro.");
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(output, {
      mimeType: mime,
      videoBitsPerSecond: 10_000_000,
      audioBitsPerSecond: 192_000,
    });
    let frame = 0;
    const draw = () => {
      const scale = Math.max(
        canvas.width / source.videoWidth,
        canvas.height / source.videoHeight,
      );
      const width = source.videoWidth * scale,
        height = source.videoHeight * scale;
      context.fillStyle = "#090909";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        source,
        (canvas.width - width) / 2,
        (canvas.height - height) / 2,
        width,
        height,
      );
      illustrations.forEach((item) => {
        const alpha = layerOpacity(item, source.currentTime);
        const media = illustrationElements.current.get(item.id);
        if (alpha <= 0 || !media) return;
        const mediaWidth = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
        const mediaHeight = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
        if (!mediaWidth || !mediaHeight) return;
        if (media instanceof HTMLVideoElement && media.duration) {
          const mediaTime = Math.max(0, Math.min(media.duration - 0.04, source.currentTime - item.start));
          if (Math.abs(media.currentTime - mediaTime) > 0.18) media.currentTime = mediaTime;
        }
        const boxWidth = (item.size / 100) * canvas.width;
        const boxHeight = boxWidth * 0.72;
        const scale = item.fit === "cover"
          ? Math.max(boxWidth / mediaWidth, boxHeight / mediaHeight)
          : Math.min(boxWidth / mediaWidth, boxHeight / mediaHeight);
        const drawWidth = mediaWidth * scale;
        const drawHeight = mediaHeight * scale;
        const x = (item.x / 100) * canvas.width - boxWidth / 2;
        const y = (item.y / 100) * canvas.height - boxHeight / 2;
        context.save();
        context.globalAlpha = alpha;
        context.beginPath();
        context.roundRect(x, y, boxWidth, boxHeight, 22);
        context.clip();
        context.fillStyle = "#0b0b0b";
        context.fill();
        context.drawImage(media, x + (boxWidth - drawWidth) / 2, y + (boxHeight - drawHeight) / 2, drawWidth, drawHeight);
        context.restore();
      });
      layers.forEach((layer) => {
        const alpha = layerOpacity(layer, source.currentTime);
        if (!layer.text.trim() || alpha <= 0) return;
        const progress = effectProgress(layer, source.currentTime);
        const scaleEffect = layer.effect === "pop" ? 0.68 + progress * 0.32 : 1;
        const slide = layer.effect === "slide" ? (1 - progress) * 180 : 0;
        const text = visibleText(layer, source.currentTime);
        context.save();
        context.globalAlpha = alpha;
        context.font = `800 ${layer.size}px ${layer.font}`;
        context.textAlign = layer.align;
        context.textBaseline = "middle";
        const x = (layer.x / 100) * canvas.width + slide,
          y = (layer.y / 100) * canvas.height;
        context.translate(x, y);
        context.scale(scaleEffect, scaleEffect);
        const lines = wrapCanvasText(context, text, 930);
        const lineHeight = layer.size * 1.12;
        const yOffset = -((lines.length - 1) * lineHeight) / 2;
        lines.forEach((line, index) => {
          const lineY = yOffset + index * lineHeight;
          if (layer.background) {
            const metrics = context.measureText(line);
            const left =
              layer.align === "center"
                ? -metrics.width / 2
                : layer.align === "right"
                  ? -metrics.width
                  : 0;
            context.fillStyle = "rgba(0,0,0,.72)";
            context.fillRect(
              left - 18,
              lineY - layer.size * 0.58,
              metrics.width + 36,
              layer.size * 1.16,
            );
          }
          context.lineWidth = Math.max(4, layer.size / 11);
          context.strokeStyle = "rgba(0,0,0,.76)";
          context.fillStyle = layer.color;
          context.strokeText(line, 0, lineY, 930);
          context.fillText(line, 0, lineY, 930);
        });
        context.restore();
      });
      if (source.currentTime < end && !source.paused)
        frame = requestAnimationFrame(draw);
      else if (recorder.state !== "inactive") recorder.stop();
    };
    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    recorder.onstop = () => {
      cancelAnimationFrame(frame);
      const url = URL.createObjectURL(new Blob(chunks, { type: mime }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `klip-reel-${Date.now()}.${mime.startsWith("video/mp4") ? "mp4" : "webm"}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setExporting(false);
      setNotice("Reel exportado com corte, áudio, textos e efeitos.");
    };
    source.currentTime = start;
    await new Promise<void>((resolve) =>
      source.addEventListener("seeked", () => resolve(), { once: true }),
    );
    recorder.start();
    await source.play();
    draw();
  }

  return (
    <main className="clip-editor clip-editor-v2">
      <header className="editor-header">
        <div className="brand">
          <span className="brand-mark"><i /><i /></span>Klip <em>Studio</em>
        </div>
        <div className="editor-header-actions">
          <span className="autosave-note">Projeto local · nada é enviado</span>
          <button onClick={onBack}>← Voltar para sala</button>
          <select className="export-format" aria-label="Formato de saída" value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)}>
            <option value="mp4">MP4</option>
            <option value="webm">WebM</option>
          </select>
          <button className="editor-export" disabled={!clip || exporting} onClick={() => void exportReel()}>
            {exporting ? "Renderizando…" : `⇩ Exportar ${exportFormat.toUpperCase()}`}
          </button>
        </div>
      </header>
      <section className="editor-workspace">
        <aside className="editor-tools">
          <div className="tool-heading"><span>01</span><div><b>Mídia</b><small>Gravação ou vídeo do computador</small></div></div>
          <label className="editor-upload">＋ Importar vídeo<input type="file" accept="video/*" onChange={(event) => selectFile(event.target.files?.[0])} /></label>
          {clip && <p className="editor-file">● {clip.name}</p>}

          <div className="tool-heading layer-heading"><span>02</span><div><b>Ilustrações</b><small>Imagem ou vídeo por cima da conversa</small></div></div>
          <label className="editor-upload editor-illustration-upload">＋ Imagem ou vídeo<input type="file" accept="image/*,video/*" onChange={(event) => addIllustration(event.target.files?.[0])} /></label>
          <small className="illustration-help">Use para contextualizar enquanto o vídeo principal continua falando.</small>
          {!!illustrations.length && <div className="layer-list illustration-list">
            {illustrations.map((item, index) => (
              <button key={item.id} className={selectedIllustration?.id === item.id ? "selected" : ""} onClick={() => { setSelectedIllustrationId(item.id); seek(Math.max(start, item.start)); }}>
                <b>{item.kind === "image" ? "IMG" : "VID"}</b><span>{item.name || `Ilustração ${index + 1}`}</span><small>{time(item.start)}–{time(item.end)}</small>
              </button>
            ))}
          </div>}
          {selectedIllustration && <div className="layer-inspector illustration-inspector">
            <div className="inspector-title"><b>Ilustração selecionada</b><button onClick={removeIllustration}>Excluir</button></div>
            <label className="range-label">Tamanho · {selectedIllustration.size}%<input type="range" min="18" max="86" value={selectedIllustration.size} onChange={(event) => updateIllustration(selectedIllustration.id, { size: Number(event.target.value) })} /></label>
            <div className="effect-grid">
              <label>Encaixe<select value={selectedIllustration.fit} onChange={(event) => updateIllustration(selectedIllustration.id, { fit: event.target.value as "cover" | "contain" })}><option value="cover">Preencher</option><option value="contain">Mostrar tudo</option></select></label>
              <label>Fade in<input type="number" min="0" max="3" step="0.1" value={selectedIllustration.fadeIn} onChange={(event) => updateIllustration(selectedIllustration.id, { fadeIn: Math.max(0, Number(event.target.value)) })} /></label>
              <label>Fade out<input type="number" min="0" max="3" step="0.1" value={selectedIllustration.fadeOut} onChange={(event) => updateIllustration(selectedIllustration.id, { fadeOut: Math.max(0, Number(event.target.value)) })} /></label>
            </div>
          </div>}

          <div className="tool-heading layer-heading"><span>03</span><div><b>Camadas de texto</b><small>Cada texto tem seu próprio tempo</small></div></div>
          <div className="layer-actions">
            <button onClick={addLayer}>＋ Texto</button>
            <button disabled={!selected} onClick={duplicateLayer}>⧉ Duplicar</button>
          </div>
          <div className="layer-list">
            {layers.map((layer, index) => (
              <button key={layer.id} className={selected?.id === layer.id ? "selected" : ""} onClick={() => { setSelectedId(layer.id); seek(Math.max(start, layer.start)); }}>
                <b>T{index + 1}</b><span>{layer.text || "Texto vazio"}</span><small>{time(layer.start)}–{time(layer.end)}</small>
              </button>
            ))}
          </div>

          {selected && (
            <div className="layer-inspector">
              <div className="inspector-title"><b>Editar camada</b><button onClick={removeLayer} aria-label="Excluir camada">Excluir</button></div>
              <textarea value={selected.text} onChange={(event) => updateLayer(selected.id, { text: event.target.value })} placeholder="Escreva o texto…" />
              <div className="caption-controls">
                <select value={selected.font} onChange={(event) => updateLayer(selected.id, { font: event.target.value })}>
                  <option>Inter</option><option>Arial Black</option><option>Georgia</option><option>Courier New</option><option>Impact</option><option>Trebuchet MS</option>
                </select>
                <input aria-label="Cor do texto" type="color" value={selected.color} onChange={(event) => updateLayer(selected.id, { color: event.target.value })} />
              </div>
              <label className="range-label">Tamanho · {selected.size}px<input type="range" min="28" max="112" value={selected.size} onChange={(event) => updateLayer(selected.id, { size: Number(event.target.value) })} /></label>
              <div className="align-buttons">
                <button className={selected.align === "left" ? "selected" : ""} onClick={() => updateLayer(selected.id, { align: "left" })}>≡</button>
                <button className={selected.align === "center" ? "selected" : ""} onClick={() => updateLayer(selected.id, { align: "center" })}>☰</button>
                <button className={selected.align === "right" ? "selected" : ""} onClick={() => updateLayer(selected.id, { align: "right" })}>≡</button>
                <label className="text-bg-toggle"><input type="checkbox" checked={selected.background} onChange={(event) => updateLayer(selected.id, { background: event.target.checked })} /> Fundo</label>
              </div>
              <div className="effect-grid">
                <label>Efeito<select value={selected.effect} onChange={(event) => updateLayer(selected.id, { effect: event.target.value as TextEffect })}><option value="none">Sem efeito</option><option value="pop">Pop</option><option value="slide">Deslizar</option><option value="typewriter">Máquina de escrever</option></select></label>
                <label>Fade in<input type="number" min="0" max="3" step="0.1" value={selected.fadeIn} onChange={(event) => updateLayer(selected.id, { fadeIn: Math.max(0, Number(event.target.value)) })} /></label>
                <label>Fade out<input type="number" min="0" max="3" step="0.1" value={selected.fadeOut} onChange={(event) => updateLayer(selected.id, { fadeOut: Math.max(0, Number(event.target.value)) })} /></label>
              </div>
              <div className="emoji-row">{["🔥", "😂", "🎙️", "✨", "💥", "👀"].map((emoji) => <button key={emoji} onClick={() => updateLayer(selected.id, { text: `${selected.text} ${emoji}`.trim() })}>{emoji}</button>)}</div>
            </div>
          )}
        </aside>

        <section className="editor-stage-wrap">
          <div className="stage-meta"><span>Prévia vertical · 1080 × 1920</span><b>{time(current)}</b></div>
          <div className="editor-stage">
            {clip ? (
              <video ref={video} src={clip.url} playsInline controls onLoadedMetadata={(event) => setVideoDuration(event.currentTarget)} onDurationChange={(event) => { const value = event.currentTarget.duration; if (Number.isFinite(value) && value > 0) { setDuration(value); setEnd((old) => old || value); if (event.currentTarget.currentTime > value) event.currentTarget.currentTime = 0; } }} onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)} />
            ) : (
              <div className="editor-empty"><b>Monte seu próximo reel.</b><span>Importe um vídeo para editar corte, textos e efeitos.</span></div>
            )}
            {clip && illustrations.map((item) => {
              if (layerOpacity(item, current) <= 0) return null;
              const common = {
                ref: (element: HTMLImageElement | HTMLVideoElement | null) => {
                  if (element) illustrationElements.current.set(item.id, element);
                  else illustrationElements.current.delete(item.id);
                },
              };
              return <div key={item.id} className={`illustration-overlay ${selectedIllustration?.id === item.id ? "selected-illustration" : ""}`} onPointerDown={(event) => beginIllustrationDrag(event, item)} onPointerMove={moveIllustrationDrag} onPointerUp={() => { illustrationDrag.current = null; }} onPointerCancel={() => { illustrationDrag.current = null; }} style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${item.size}%`, opacity: layerOpacity(item, current) }}>
                {item.kind === "image" ? <img {...common} src={item.url} alt="Ilustração" /> : <video {...common} src={item.url} muted autoPlay loop playsInline />}
                <small>{item.kind === "image" ? "Imagem" : "Vídeo"} · arraste</small>
              </div>;
            })}
            {clip && layers.map((layer) => {
              const text = visibleText(layer, current);
              if (!text || layerOpacity(layer, current) <= 0) return null;
              return <div key={layer.id} className={`caption-overlay ${selected?.id === layer.id ? "selected-layer" : ""} ${layer.background ? "with-background" : ""}`} onPointerDown={(event) => beginLayerDrag(event, layer)} onPointerMove={moveLayerDrag} onPointerUp={() => { layerDrag.current = null; }} onPointerCancel={() => { layerDrag.current = null; }} style={previewStyle(layer)}><span>{text}</span><small>Arraste</small></div>;
            })}
          </div>
          <p className="stage-help">Clique em um texto para selecionar. Arraste para posicionar. O resultado exportado segue esta prévia.</p>
          {notice && <p className="editor-notice">{notice}</p>}
        </section>
      </section>

      <section className="timeline-panel multi-timeline">
        <div className="timeline-top">
          <div><b>Linha do tempo</b><span>{clip ? `Corte ${time(start)} — ${time(end)} · duração ${time(Math.max(0, end - start))}` : "Importe um vídeo para começar"}</span></div>
          <button disabled={!clip} onClick={() => video.current?.paused ? void video.current?.play() : video.current?.pause()}>{video.current?.paused === false ? "Ⅱ Pausar" : "▶ Reproduzir"}</button>
          <button disabled={!clip} onClick={() => seek(start)}>↶ Início</button>
        </div>
        <div className="timeline-ruler">{Array.from({ length: 9 }, (_, index) => <i key={index}>{duration ? time((duration / 8) * index) : "00:00"}</i>)}</div>
        <div className="timeline-lanes">
          <div className="timeline-lane video-lane"><b>VÍDEO</b><div className="lane-track"><div className="timeline-selection" style={{ left: duration ? `${(start / duration) * 100}%` : "0%", width: duration ? `${((end - start) / duration) * 100}%` : "0%" }} /></div></div>
          {illustrations.map((item, index) => (
            <div className={`timeline-lane illustration-lane ${selectedIllustration?.id === item.id ? "selected" : ""}`} key={item.id} onClick={() => { setSelectedIllustrationId(item.id); seek(Math.max(start, item.start)); }}>
              <b>{item.kind === "image" ? `IMG ${index + 1}` : `VID ${index + 1}`}</b><div className="lane-track"><button className="illustration-clip" style={{ left: duration ? `${(item.start / duration) * 100}%` : "0%", width: duration ? `${Math.max(1.5, ((item.end - item.start) / duration) * 100)}%` : "0%" }}><span>{item.name || "Ilustração"}</span><i>{item.kind === "image" ? "imagem" : "vídeo"}</i></button></div>
            </div>
          ))}
          {layers.map((layer, index) => (
            <div className={`timeline-lane ${selected?.id === layer.id ? "selected" : ""}`} key={layer.id} onClick={() => { setSelectedId(layer.id); seek(Math.max(start, layer.start)); }}>
              <b>T{index + 1}</b><div className="lane-track"><button className="text-clip" style={{ left: duration ? `${(layer.start / duration) * 100}%` : "0%", width: duration ? `${Math.max(1.5, ((layer.end - layer.start) / duration) * 100)}%` : "0%" }}><span>{layer.text || "Texto"}</span><i>{layer.effect !== "none" ? layer.effect : "texto"}</i></button></div>
            </div>
          ))}
          <div className="global-playhead" style={{ left: duration ? `calc(74px + (100% - 74px) * ${current / duration})` : "74px" }} />
        </div>
        <div className="cut-controls editor-time-controls">
          <label>Corte inicial <span>{time(start)}</span><input type="range" min="0" max={Math.max(duration, 0)} step="0.05" value={start} onChange={(event) => { const value = Math.min(Number(event.target.value), end - 0.05); setStart(value); seek(value); }} /></label>
          <label>Corte final <span>{time(end)}</span><input type="range" min="0" max={Math.max(duration, 0)} step="0.05" value={end} onChange={(event) => { const value = Math.max(Number(event.target.value), start + 0.05); setEnd(value); seek(value); }} /></label>
          {selected && <><label>Texto entra <span>{time(selected.start)}</span><input type="range" min={start} max={Math.max(start, end)} step="0.05" value={selected.start} onChange={(event) => { const value = Math.min(Number(event.target.value), selected.end - 0.05); updateLayer(selected.id, { start: value }); seek(value); }} /></label><label>Texto sai <span>{time(selected.end)}</span><input type="range" min={start} max={Math.max(start, end)} step="0.05" value={selected.end} onChange={(event) => { const value = Math.max(Number(event.target.value), selected.start + 0.05); updateLayer(selected.id, { end: value }); seek(Math.max(selected.start, value - 0.05)); }} /></label></>}
          {selectedIllustration && <><label>Ilustração entra <span>{time(selectedIllustration.start)}</span><input type="range" min={start} max={Math.max(start, end)} step="0.05" value={selectedIllustration.start} onChange={(event) => { const value = Math.min(Number(event.target.value), selectedIllustration.end - 0.05); updateIllustration(selectedIllustration.id, { start: value }); seek(value); }} /></label><label>Ilustração sai <span>{time(selectedIllustration.end)}</span><input type="range" min={start} max={Math.max(start, end)} step="0.05" value={selectedIllustration.end} onChange={(event) => { const value = Math.max(Number(event.target.value), selectedIllustration.start + 0.05); updateIllustration(selectedIllustration.id, { end: value }); seek(Math.max(selectedIllustration.start, value - 0.05)); }} /></label></>}
        </div>
      </section>
    </main>
  );
}
