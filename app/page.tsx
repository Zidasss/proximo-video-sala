"use client";

import { useEffect, useRef, useState } from "react";
import Peer, { DataConnection, MediaConnection } from "peerjs";

type Quality = "720" | "1080";
type ExportFormat = "mp4" | "webm";
type ExportAspect = "original" | "vertical" | "landscape" | "square";
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
type TextEffect = "none" | "pop" | "slide" | "typewriter" | "zoom" | "bounce";
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
  role?: "overlay" | "scene";
};
type AudioTrack = {
  id: string;
  url: string;
  name: string;
  start: number;
  end: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
};
type VisualPreset = "clean" | "cinematic" | "vivid" | "mono" | "warm";
type TimedLayer = Pick<IllustrationLayer, "start" | "end" | "fadeIn" | "fadeOut">;
type ConnectionStats = {
  fps: number;
  bitrateKbps: number;
  packetLoss: number;
  jitterMs: number;
  rttMs: number;
};
const code = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const hostId = (room: string, pin: string) => `proximo-${room}-${pin}`;
const APP_VERSION = "v0.16.0";
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
  const [localStudio, setLocalStudio] = useState(false);
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
    [cameraOverlay, setCameraOverlay] = useState(""),
    [cameraOverlayOpacity, setCameraOverlayOpacity] = useState(0.85),
    [webcamText, setWebcamText] = useState(""),
    [webcamTextPosition, setWebcamTextPosition] = useState<"top" | "bottom">("top"),
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
    [connectionOpen, setConnectionOpen] = useState(false),
    [connectionStats, setConnectionStats] = useState<ConnectionStats>({
      fps: 0,
      bitrateKbps: 0,
      packetLoss: 0,
      jitterMs: 0,
      rttMs: 0,
    }),
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
    blurAmountRef = useRef(16),
    connectionSample = useRef({ bytes: 0, at: 0 });
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
    if (!inRoom || (backgroundMode === "none" && !webcamText.trim() && !cameraOverlay) || !local.current) return;
    let active = true,
      segmentationFrame = 0,
      renderFrame = 0,
      premiumInferenceTimer = 0,
      lastInferenceAt = 0,
      inferenceDuration = 24,
      attached = false,
      hasMask = false,
      lastAnimatedRenderAt = 0;
    // Fundo animado exige composição a cada quadro. Limitamos apenas essa
    // composição a 24 fps: a webcam continua em boa fluidez, mas sobra GPU e
    // banda para o WebRTC não congelar o vídeo visto pelo amigo.
    const animatedBackdrop =
      backgroundMode === "image" &&
      (Boolean(backgroundVideo) || /GIF animado/.test(backgroundLabel));
    const composedBackdrop = backgroundMode !== "none";
    const compositeRate = animatedBackdrop ? 20 : composedBackdrop ? 24 : 30;
    const shouldSkipAnimatedRender = () => {
      if (!composedBackdrop) return false;
      const now = performance.now();
      if (now - lastAnimatedRenderAt < 1000 / compositeRate) return true;
      lastAnimatedRenderAt = now;
      return false;
    };
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
      overlayImage = new Image(),
      backdropVideo = document.createElement("video");
    source.srcObject = local.current;
    source.muted = true;
    source.playsInline = true;
    image.src = background;
    overlayImage.src = cameraOverlay;
    backdropVideo.src = backgroundVideo;
    backdropVideo.muted = true;
    backdropVideo.loop = true;
    backdropVideo.playsInline = true;
    const run = async () => {
      await source.play();
      if (!active || !context || !maskContext || !inferenceContext || !foregroundContext) return;
      // Com GIF/MP4, uma composição Full HD disputa recursos com IA e WebRTC.
      // 720p/20 fps é mais suave que 1080p caindo para 9 fps.
      const sourceWidthForOutput = source.videoWidth || 1280;
      const sourceHeightForOutput = source.videoHeight || 720;
      const virtualOutputScale = animatedBackdrop
        ? Math.min(1, 1280 / Math.max(sourceWidthForOutput, sourceHeightForOutput))
        : 1;
      canvas.width = Math.max(2, Math.round(sourceWidthForOutput * virtualOutputScale));
      canvas.height = Math.max(2, Math.round(sourceHeightForOutput * virtualOutputScale));
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
      const output = canvas.captureStream(compositeRate);
      const attachOverlayOutput = () => {
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
      const drawWebcamText = () => {
        const text = webcamText.trim();
        if (!text || !context) return;
        const fontSize = Math.max(26, Math.round(canvas.width * 0.047));
        context.save();
        context.font = `800 ${fontSize}px Inter, Arial, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        const paddingX = fontSize * 0.58;
        const width = Math.min(canvas.width - 32, context.measureText(text).width + paddingX * 2);
        const height = fontSize * 1.72;
        const x = (canvas.width - width) / 2;
        const y = webcamTextPosition === "top" ? 24 : canvas.height - height - 24;
        context.fillStyle = "rgba(17,14,16,.74)";
        context.beginPath();
        context.roundRect(x, y, width, height, height / 2);
        context.fill();
        context.fillStyle = "#fff7f3";
        context.fillText(text, canvas.width / 2, y + height / 2, canvas.width - 56);
        context.restore();
      };
      const drawCameraOverlay = () => {
        if (!cameraOverlay || !overlayImage.complete || !overlayImage.naturalWidth) return;
        context.save();
        context.globalAlpha = cameraOverlayOpacity;
        context.drawImage(overlayImage, 0, 0, canvas.width, canvas.height);
        context.restore();
      };
      try {
        if (backgroundMode === "none") {
          const renderOverlay = () => {
            if (!active || !context) return;
            context.drawImage(source, 0, 0, canvas.width, canvas.height);
            drawWebcamText();
            drawCameraOverlay();
            attachOverlayOutput();
            renderFrame = requestAnimationFrame(renderOverlay);
          };
          renderOverlay();
          return () => {
            cancelAnimationFrame(renderFrame);
            output.getTracks().forEach((track) => track.stop());
            if (processedLocal.current === output) {
              processedLocal.current = null;
              if (local.current) replaceOutgoingVideo(local.current);
              setVirtualEpoch((epoch) => epoch + 1);
            }
          };
        }
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
          const inferenceScale = Math.min(1, 720 / Math.max(sourceWidth, sourceHeight));
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
            if (shouldSkipAnimatedRender()) {
              renderFrame = requestAnimationFrame(renderPremium);
              return;
            }
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
            drawWebcamText();
            drawCameraOverlay();
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
                const targetMaskInterval = animatedBackdrop
                  ? Math.max(125, inferenceDuration * 1.35)
                  : inferenceDuration > 85 ? 120 : 82;
                const pause = Math.min(180, Math.max(16, targetMaskInterval - inferenceDuration));
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
          if (shouldSkipAnimatedRender()) {
            renderFrame = requestAnimationFrame(render);
            return;
          }
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
            drawWebcamText();
            drawCameraOverlay();
          renderFrame = requestAnimationFrame(render);
        };
        const next = () => {
          if (!active) return;
          // O Worker recebe no máximo um frame por vez. Enquanto a IA analisa,
          // o render, os controles e o áudio permanecem livres a 30 fps.
          const now = performance.now();
          const minimumGap = animatedBackdrop
            ? Math.max(115, Math.min(180, inferenceDuration * 1.5))
            : Math.max(78, Math.min(140, inferenceDuration * 1.3));
          if (
            workerReady &&
            !workerBusy &&
            now - lastInferenceAt >= minimumGap
          ) {
            workerBusy = true;
            lastInferenceAt = now;
            const bitmapWidth = animatedBackdrop ? 512 : 640;
            const bitmapHeight = Math.max(
              2,
              Math.round(
                (bitmapWidth * (source.videoHeight || canvas.height)) /
                  (source.videoWidth || canvas.width),
              ),
            );
            void createImageBitmap(source, {
              resizeWidth: bitmapWidth,
              resizeHeight: bitmapHeight,
              resizeQuality: "low",
            })
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
    backgroundLabel,
    cameraOverlay,
    cameraOverlayOpacity,
    backgroundMode,
    webcamText,
    webcamTextPosition,
    mattingQuality,
    skinSmooth,
    cameraEpoch,
    inRoom,
  ]);
  const refreshConnectionStats = async () => {
    const calls = cameraCalls.current as Array<
      MediaConnection & { peerConnection?: RTCPeerConnection }
    >;
    const peerConnection = calls.find((call) => call.peerConnection)?.peerConnection;
    if (!peerConnection) {
      setConnectionStats({ fps: 0, bitrateKbps: 0, packetLoss: 0, jitterMs: 0, rttMs: 0 });
      return;
    }
    try {
      const report = await peerConnection.getStats();
      let fps = 0;
      let bytes = 0;
      let received = 0;
      let lost = 0;
      let jitterMs = 0;
      let rttMs = 0;
      report.forEach((raw) => {
        const item = raw as RTCStats & Record<string, unknown>;
        const kind = String(item.kind || item.mediaType || "");
        if ((item.type === "inbound-rtp" || item.type === "outbound-rtp") && kind === "video") {
          fps = Math.max(fps, Number(item.framesPerSecond || 0));
          bytes += Number(item.bytesReceived || item.bytesSent || 0);
          if (item.type === "inbound-rtp") {
            received += Number(item.packetsReceived || 0);
            lost += Math.max(0, Number(item.packetsLost || 0));
            jitterMs = Math.max(jitterMs, Number(item.jitter || 0) * 1000);
          }
        }
        if (
          item.type === "candidate-pair" &&
          (item.state === "succeeded" || item.nominated === true)
        ) {
          rttMs = Math.max(rttMs, Number(item.currentRoundTripTime || 0) * 1000);
        }
      });
      const now = performance.now();
      const prior = connectionSample.current;
      const bitrateKbps =
        prior.at && now > prior.at
          ? Math.max(0, ((bytes - prior.bytes) * 8) / (now - prior.at))
          : 0;
      connectionSample.current = { bytes, at: now };
      setConnectionStats({
        fps: Math.round(fps),
        bitrateKbps: Math.round(bitrateKbps),
        packetLoss: received + lost ? Number(((lost / (received + lost)) * 100).toFixed(2)) : 0,
        jitterMs: Math.round(jitterMs),
        rttMs: Math.round(rttMs),
      });
    } catch {
      setNotice("Não foi possível ler as estatísticas da chamada agora.");
    }
  };
  useEffect(() => {
    if (!connectionOpen || !inRoom) return;
    void refreshConnectionStats();
    const interval = window.setInterval(() => void refreshConnectionStats(), 2000);
    return () => window.clearInterval(interval);
  }, [connectionOpen, inRoom]);
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
      // Uma webcam 4K não deve obrigar o WebRTC a codificar 4K para uma
      // chamada configurada em Full HD. A câmera continua nítida, mas o
      // encoder envia no máximo 1080p e mantém a CPU/GPU disponíveis para a
      // composição e os overlays.
      const settings = sender.track?.getSettings();
      const width = settings?.width || 1920;
      const height = settings?.height || 1080;
      encoding.scaleResolutionDownBy =
        quality === "1080"
          ? Math.max(1, width / 1920, height / 1080)
          : Math.max(1, width / 1280, height / 720);
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
  function chooseCameraOverlay(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("A camada da webcam deve ser uma imagem, PNG, WebP ou GIF.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCameraOverlay(String(reader.result));
      setNotice("Moldura aplicada à sua câmera online e à gravação.");
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
  if (localStudio)
    return <OfflineStudio onBack={() => setLocalStudio(false)} />;
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
          <button className="open-editor" onClick={() => setLocalStudio(true)}>
            ◉ Estúdio offline
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
            className={connectionOpen ? "connection-open" : "connection-toggle"}
            onClick={() => {
              const next = !connectionOpen;
              setConnectionOpen(next);
              if (next) void refreshConnectionStats();
            }}
          >
            ◌ Status
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
                    <div className="webcam-text-layer">
                      <b>Camada na webcam</b>
                      <small>Texto no vídeo, para a chamada e a gravação.</small>
                      <input
                        value={webcamText}
                        maxLength={80}
                        onChange={(event) => setWebcamText(event.target.value)}
                        placeholder="Ex.: AO VIVO · Episódio 01"
                      />
                      <div>
                        <button className={webcamTextPosition === "top" ? "selected" : ""} onClick={() => setWebcamTextPosition("top")}>Em cima</button>
                        <button className={webcamTextPosition === "bottom" ? "selected" : ""} onClick={() => setWebcamTextPosition("bottom")}>Embaixo</button>
                        <button onClick={() => setWebcamText("")}>Limpar</button>
                      </div>
                      <label className="background-upload">
                        ▣ Subir moldura / overlay
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif,.gif"
                          onChange={(event) => chooseCameraOverlay(event.target.files?.[0])}
                        />
                      </label>
                      {cameraOverlay && (
                        <>
                          <small>Moldura ativa na câmera online</small>
                          <label className="menu-field">
                            Opacidade da moldura
                            <input
                              type="range"
                              min="0.1"
                              max="1"
                              step="0.05"
                              value={cameraOverlayOpacity}
                              onChange={(event) => setCameraOverlayOpacity(Number(event.target.value))}
                            />
                          </label>
                          <button className="format" onClick={() => setCameraOverlay("")}>Limpar moldura</button>
                        </>
                      )}
                    </div>
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
      <section className={"stage " + (resenhaMode ? `resenha-stage${screenActive ? " resenha-with-screen" : ""}` : screenActive ? "screen-on" : "")}>
        {screenActive && (
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
      {connectionOpen && (
        <aside className="connection-panel" aria-label="Status da conexão">
          <div className="connection-title">
            <div><b>Status da conexão</b><small>Atualiza a cada 2 segundos</small></div>
            <button onClick={() => setConnectionOpen(false)} aria-label="Fechar status">×</button>
          </div>
          <div className="connection-grid">
            <div><small>FPS do vídeo</small><b>{connectionStats.fps || "—"}<em> fps</em></b></div>
            <div><small>Bitrate</small><b>{connectionStats.bitrateKbps || "—"}<em> kb/s</em></b></div>
            <div><small>Perda de pacotes</small><b className={connectionStats.packetLoss > 2 ? "warning" : ""}>{connectionStats.packetLoss}<em>%</em></b></div>
            <div><small>Latência / jitter</small><b>{connectionStats.rttMs || "—"}<em> / {connectionStats.jitterMs} ms</em></b></div>
          </div>
          <p>Para fundo animado, até 24 fps é normal: assim a chamada preserva GPU e estabilidade.</p>
          <button className="refresh-connection" onClick={() => void refreshConnectionStats()}>↻ Atualizar agora</button>
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

function OfflineStudio({ onBack }: { onBack: () => void }) {
  type StudioBox = { x: number; y: number; w: number; h: number };
  const first = useRef<HTMLVideoElement>(null), second = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null), overlayImage = useRef<HTMLImageElement | null>(null);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]), [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [camA, setCamA] = useState(""), [camB, setCamB] = useState(""), [micA, setMicA] = useState(""), [micB, setMicB] = useState("");
  const [audioMode, setAudioMode] = useState<"mix" | "a" | "b">("mix"), [recording, setRecording] = useState(false), [notice, setNotice] = useState(""), [recordSeconds, setRecordSeconds] = useState(0);
  const [preset, setPreset] = useState<"landscape" | "vertical" | "square">("landscape"), [fps, setFps] = useState(30), [quality, setQuality] = useState<"balanced" | "max">("balanced"), [overlay, setOverlay] = useState<string | null>(null), [overlayOpacity, setOverlayOpacity] = useState(0.85);
  const [layout, setLayout] = useState<"side" | "stack" | "pip" | "focus">("side"), [boxA, setBoxA] = useState<StudioBox>({ x: 0, y: 0, w: 50, h: 100 }), [boxB, setBoxB] = useState<StudioBox>({ x: 50, y: 0, w: 50, h: 100 });
  const [effectA, setEffectA] = useState("none"), [effectB, setEffectB] = useState("none"), [micLevels, setMicLevels] = useState<[number, number]>([0, 0]);
  const streams = useRef<[MediaStream | null, MediaStream | null]>([null, null]);
  const recorder = useRef<MediaRecorder | null>(null), chunks = useRef<Blob[]>([]), frame = useRef(0), audioContext = useRef<AudioContext | null>(null), meterContext = useRef<AudioContext | null>(null), meterAnalyzers = useRef<[AnalyserNode | null, AnalyserNode | null]>([null, null]), meterFrame = useRef(0);
  const drag = useRef<{ index: 0 | 1; x: number; y: number; startX: number; startY: number } | null>(null);
  const studioTime = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  useEffect(() => { void navigator.mediaDevices.enumerateDevices().then((items) => { setCams(items.filter((item) => item.kind === "videoinput")); setMics(items.filter((item) => item.kind === "audioinput")); }); return () => { cancelAnimationFrame(frame.current); cancelAnimationFrame(meterFrame.current); audioContext.current?.close(); meterContext.current?.close(); streams.current.forEach((stream) => stream?.getTracks().forEach((track) => track.stop())); }; }, []);
  useEffect(() => { if (!recording) return; const interval = window.setInterval(() => setRecordSeconds((value) => value + 1), 1000); return () => window.clearInterval(interval); }, [recording]);
  async function openCamera(index: 0 | 1, deviceId: string, micId: string) {
    streams.current[index]?.getTracks().forEach((track) => track.stop());
    if (!deviceId) return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }, audio: micId ? { deviceId: { exact: micId }, echoCancellation: true, noiseSuppression: true } : false });
    streams.current[index] = stream;
    const video = index === 0 ? first.current : second.current;
    if (video) { video.srcObject = stream; await video.play().catch(() => undefined); }
    if (stream.getAudioTracks().length) {
      const context = meterContext.current || new AudioContext(); meterContext.current = context;
      const analyser = context.createAnalyser(); analyser.fftSize = 512; context.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(analyser); meterAnalyzers.current[index] = analyser;
      if (!meterFrame.current) { const updateMeters = () => { const levels = meterAnalyzers.current.map((node) => { if (!node) return 0; const samples = new Uint8Array(node.fftSize); node.getByteTimeDomainData(samples); const energy = samples.reduce((sum, sample) => sum + Math.abs(sample - 128), 0) / samples.length; return Math.min(100, Math.round(energy * 3.1)); }) as [number, number]; setMicLevels(levels); meterFrame.current = requestAnimationFrame(updateMeters); }; updateMeters(); }
    }
  }
  const filterFor = (effect: string) => effect === "noir" ? "grayscale(1) contrast(1.25)" : effect === "cinema" ? "contrast(1.15) saturate(1.28) sepia(.12)" : effect === "cool" ? "saturate(1.18) hue-rotate(175deg)" : effect === "warm" ? "sepia(.22) saturate(1.2)" : effect === "vhs" ? "contrast(1.28) saturate(1.45) hue-rotate(-12deg)" : "none";
  const canvasFilter = (effect: string) => effect === "noir" ? "grayscale(1) contrast(1.25)" : effect === "cinema" ? "contrast(1.15) saturate(1.28) sepia(.12)" : effect === "cool" ? "saturate(1.18) hue-rotate(175deg)" : effect === "warm" ? "sepia(.22) saturate(1.2)" : effect === "vhs" ? "contrast(1.28) saturate(1.45) hue-rotate(-12deg)" : "none";
  const updateBox = (index: 0 | 1, patch: Partial<StudioBox>) => { const apply = (box: StudioBox) => ({ ...box, ...patch }); index === 0 ? setBoxA(apply) : setBoxB(apply); };
  const applyLayout = (next: "side" | "stack" | "pip" | "focus") => { setLayout(next); if (next === "side") { setBoxA({ x: 0, y: 0, w: 50, h: 100 }); setBoxB({ x: 50, y: 0, w: 50, h: 100 }); } if (next === "stack") { setBoxA({ x: 0, y: 0, w: 100, h: 50 }); setBoxB({ x: 0, y: 50, w: 100, h: 50 }); } if (next === "pip") { setBoxA({ x: 0, y: 0, w: 100, h: 100 }); setBoxB({ x: 67, y: 65, w: 30, h: 30 }); } if (next === "focus") { setBoxA({ x: 0, y: 0, w: 70, h: 100 }); setBoxB({ x: 70, y: 0, w: 30, h: 100 }); } };
  function draw() {
    const target = canvas.current, a = first.current, b = second.current;
    if (!target || !a || !b) return;
    const context = target.getContext("2d"); if (!context) return;
    const dimensions = preset === "vertical" ? [1080, 1920] : preset === "square" ? [1080, 1080] : [1920, 1080]; target.width = dimensions[0]; target.height = dimensions[1]; context.fillStyle = "#0d0f0e"; context.fillRect(0, 0, target.width, target.height);
    const drawVideo = (video: HTMLVideoElement, box: StudioBox, effect: string) => { if (!video.videoWidth) return; const x = (box.x / 100) * target.width, y = (box.y / 100) * target.height, w = (box.w / 100) * target.width, h = (box.h / 100) * target.height; const scale = Math.max(w / video.videoWidth, h / video.videoHeight); const dw = video.videoWidth * scale, dh = video.videoHeight * scale; context.save(); context.beginPath(); context.rect(x, y, w, h); context.clip(); context.filter = canvasFilter(effect); context.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); context.restore(); };
    drawVideo(a, boxA, effectA); drawVideo(b, boxB, effectB);
    if (overlayImage.current?.complete && overlayImage.current.naturalWidth) { context.save(); context.globalAlpha = overlayOpacity; context.drawImage(overlayImage.current, 0, 0, target.width, target.height); context.restore(); }
    if (recording) frame.current = requestAnimationFrame(draw);
  }
  function startRecording() {
    if (!canvas.current) return;
    chunks.current = []; const output = canvas.current.captureStream(fps);
    const audio = new AudioContext(); audioContext.current = audio; const destination = audio.createMediaStreamDestination();
    streams.current.forEach((stream, index) => { if (audioMode === "a" && index !== 0 || audioMode === "b" && index !== 1) return; const track = stream?.getAudioTracks()[0]; if (track) audio.createMediaStreamSource(new MediaStream([track])).connect(destination); });
    destination.stream.getAudioTracks().forEach((track) => output.addTrack(track));
    const mime = mimeForExport("webm") || "video/webm"; const media = new MediaRecorder(output, { mimeType: mime, videoBitsPerSecond: quality === "max" ? 24_000_000 : 12_000_000, audioBitsPerSecond: 192_000 });
    media.ondataavailable = (event) => event.data.size && chunks.current.push(event.data); media.onstop = () => { const url = URL.createObjectURL(new Blob(chunks.current, { type: mime })); const link = document.createElement("a"); link.href = url; link.download = `klip-offline-${preset}-${Date.now()}.webm`; link.click(); window.setTimeout(() => { URL.revokeObjectURL(url); void audioContext.current?.close(); audioContext.current = null; }, 60000); setNotice("Gravação salva com câmeras, áudio e overlay."); };
    recorder.current = media; setRecordSeconds(0); setRecording(true); media.start(250); draw();
  }
  function stopRecording() { recorder.current?.stop(); setRecording(false); cancelAnimationFrame(frame.current); }
  const loadOverlay = (file: File) => { const url = URL.createObjectURL(file); setOverlay(url); const image = new Image(); image.src = url; overlayImage.current = image; };
  const beginDrag = (event: React.PointerEvent<HTMLDivElement>, index: 0 | 1) => { const box = index === 0 ? boxA : boxB; drag.current = { index, x: box.x, y: box.y, startX: event.clientX, startY: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => { const item = drag.current, stage = event.currentTarget.parentElement; if (!item || !stage) return; const bounds = stage.getBoundingClientRect(); updateBox(item.index, { x: Math.max(0, Math.min(100 - (item.index === 0 ? boxA.w : boxB.w), item.x + ((event.clientX - item.startX) / bounds.width) * 100)), y: Math.max(0, Math.min(100 - (item.index === 0 ? boxA.h : boxB.h), item.y + ((event.clientY - item.startY) / bounds.height) * 100)) }); };
  const cameraControl = (label: string, index: 0 | 1, box: StudioBox, effect: string, setEffect: (value: string) => void) => <div className="studio-camera-control"><b>{label}</b><label>Efeito<select value={effect} onChange={(event) => setEffect(event.target.value)}><option value="none">Natural</option><option value="cinema">Cinema</option><option value="warm">Quente</option><option value="cool">Frio</option><option value="noir">Noir</option><option value="vhs">VHS</option></select></label><label>Tamanho<input type="range" min="20" max="100" value={box.w} onChange={(event) => updateBox(index, { w: Number(event.target.value) })} /></label><label>Horizontal<input type="range" min="0" max={Math.max(0, 100 - box.w)} value={box.x} onChange={(event) => updateBox(index, { x: Number(event.target.value) })} /></label><label>Vertical<input type="range" min="0" max={Math.max(0, 100 - box.h)} value={box.y} onChange={(event) => updateBox(index, { y: Number(event.target.value) })} /></label></div>;
  return <main className="offline-studio"><header className="editor-header"><div className="brand">Klip <em>Estúdio offline</em></div><div className="studio-status"><span className={recording ? "live" : ""}>{recording ? "● GRAVANDO" : "● PRONTO"}</span><b>{studioTime(recordSeconds)}</b><small>{preset === "vertical" ? "1080×1920" : preset === "square" ? "1080×1080" : "1920×1080"} · {fps} FPS</small></div><button onClick={onBack}>← Voltar</button></header><section className="offline-grid offline-grid-pro"><aside className="offline-controls"><h2>Estúdio local</h2><p>Monte a composição e arraste as câmeras diretamente na prévia. O arquivo salvo será igual.</p><label>Câmera 1<select value={camA} onChange={(event) => { setCamA(event.target.value); void openCamera(0, event.target.value, micA); }}>{cams.map((item) => <option key={item.deviceId} value={item.deviceId}>{item.label || "Webcam"}</option>)}</select></label><label>Microfone 1<select value={micA} onChange={(event) => { setMicA(event.target.value); if (camA) void openCamera(0, camA, event.target.value); }}>{mics.map((item) => <option key={item.deviceId} value={item.deviceId}>{item.label || "Microfone"}</option>)}</select><meter min="0" max="100" value={micLevels[0]} /><small>Volume: {micLevels[0]}%</small></label><label>Câmera 2<select value={camB} onChange={(event) => { setCamB(event.target.value); void openCamera(1, event.target.value, micB); }}>{cams.map((item) => <option key={item.deviceId} value={item.deviceId}>{item.label || "Webcam"}</option>)}</select></label><label>Microfone 2<select value={micB} onChange={(event) => { setMicB(event.target.value); if (camB) void openCamera(1, camB, event.target.value); }}>{mics.map((item) => <option key={item.deviceId} value={item.deviceId}>{item.label || "Microfone"}</option>)}</select><meter min="0" max="100" value={micLevels[1]} /><small>Volume: {micLevels[1]}%</small></label><label>Formato de saída<select value={preset} onChange={(event) => setPreset(event.target.value as typeof preset)}><option value="landscape">YouTube / widescreen 16:9</option><option value="vertical">TikTok / Reels / Shorts 9:16</option><option value="square">Instagram quadrado 1:1</option></select></label><div className="studio-layouts"><b>Layout</b><div>{([['side','↔ Lado a lado'],['stack','↕ Empilhado'],['pip','▣ Picture in picture'],['focus','◧ Destaque']] as const).map(([key, label]) => <button key={key} className={layout === key ? "selected" : ""} onClick={() => applyLayout(key)}>{label}</button>)}</div></div>{cameraControl("Câmera 1", 0, boxA, effectA, setEffectA)}{cameraControl("Câmera 2", 1, boxB, effectB, setEffectB)}<label>FPS<select value={fps} onChange={(event) => setFps(Number(event.target.value))}><option value="24">24 FPS · econômico</option><option value="30">30 FPS · recomendado</option><option value="60">60 FPS · máximo</option></select></label><label>Qualidade<select value={quality} onChange={(event) => setQuality(event.target.value as typeof quality)}><option value="balanced">Equilibrada</option><option value="max">Máxima</option></select></label><label>Áudio da gravação<select value={audioMode} onChange={(event) => setAudioMode(event.target.value as "mix" | "a" | "b")}><option value="mix">Misturar os dois</option><option value="a">Somente microfone 1</option><option value="b">Somente microfone 2</option></select></label><label>Overlay / moldura<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; if (file) loadOverlay(file); }} /></label>{overlay && <label>Opacidade da moldura<input type="range" min="0.1" max="1" step="0.05" value={overlayOpacity} onChange={(event) => setOverlayOpacity(Number(event.target.value))} /></label>}<button className={recording ? "offline-stop" : "offline-record"} onClick={recording ? stopRecording : startRecording}>{recording ? "■ Parar e salvar" : "● Iniciar gravação"}</button>{notice && <small>{notice}</small>}</aside><section className="offline-preview"><div className={`offline-cameras offline-${preset} offline-composer`}><div className="offline-camera-tile" onPointerDown={(event) => beginDrag(event, 0)} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} style={{ left: `${boxA.x}%`, top: `${boxA.y}%`, width: `${boxA.w}%`, height: `${boxA.h}%` }}><video ref={first} muted playsInline style={{ filter: filterFor(effectA) }} /><b>Câmera 1 · arraste</b></div><div className="offline-camera-tile" onPointerDown={(event) => beginDrag(event, 1)} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} style={{ left: `${boxB.x}%`, top: `${boxB.y}%`, width: `${boxB.w}%`, height: `${boxB.h}%` }}><video ref={second} muted playsInline style={{ filter: filterFor(effectB) }} /><b>Câmera 2 · arraste</b></div>{overlay && <img className="offline-overlay-preview" src={overlay} alt="Moldura" style={{ opacity: overlayOpacity }} />}</div><canvas ref={canvas} /><p>Prévia local · mesma posição, tamanho, efeitos e moldura da gravação final.</p></section></section></main>;
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
    [isPlaying, setIsPlaying] = useState(false),
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
      <section className={`editor-workspace ${clip ? "" : "editor-workspace-empty"}`}>
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
    [isPlaying, setIsPlaying] = useState(false),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(0),
    [videoFadeIn, setVideoFadeIn] = useState(0),
    [videoFadeOut, setVideoFadeOut] = useState(0),
    [videoFadeInAt, setVideoFadeInAt] = useState(0),
    [videoFadeOutAt, setVideoFadeOutAt] = useState(0),
    [transitionColor, setTransitionColor] = useState<"black" | "white">("black"),
    [visualPreset, setVisualPreset] = useState<VisualPreset>("clean"),
    [videoTransform, setVideoTransform] = useState({ x: 0, y: 0, scale: 1 }),
    [exportAspect, setExportAspect] = useState<ExportAspect>("original"),
    [exportResolution, setExportResolution] = useState<"source" | "1080" | "720">("source"),
    [exportFps, setExportFps] = useState(30),
    [exportBitrate, setExportBitrate] = useState<"standard" | "high" | "ultra">("high"),
    [audioGain, setAudioGain] = useState(100),
    [audioEnhance, setAudioEnhance] = useState(true),
    [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]),
    [waveform, setWaveform] = useState<number[]>([]),
    [snapEnabled, setSnapEnabled] = useState(true),
    [markers, setMarkers] = useState<number[]>([]),
    [timelineZoom, setTimelineZoom] = useState(1),
    [safeGuides, setSafeGuides] = useState(true),
    [previewScale, setPreviewScale] = useState(1.2),
    [sourceAspect, setSourceAspect] = useState(9 / 16),
    [layers, setLayers] = useState<TextLayer[]>(() => [initialLayer()]),
    [illustrations, setIllustrations] = useState<IllustrationLayer[]>([]),
    [selectedId, setSelectedId] = useState(""),
    [selectedIllustrationId, setSelectedIllustrationId] = useState(""),
    [selectedAudioId, setSelectedAudioId] = useState(""),
    [exportFormat, setExportFormat] = useState<ExportFormat>("mp4"),
    [exporting, setExporting] = useState(false),
    [exportProgress, setExportProgress] = useState(0),
    [notice, setNotice] = useState(""),
    [snapGuide, setSnapGuide] = useState<number | null>(null),
    [contextMenu, setContextMenu] = useState<{ x: number; y: number; kind: "text" | "illustration" | "audio"; id: string } | null>(null);
  const history = useRef<Array<{ layers: TextLayer[]; illustrations: IllustrationLayer[]; audioTracks: AudioTrack[]; start: number; end: number; videoFadeIn: number; videoFadeOut: number; videoFadeInAt: number; videoFadeOutAt: number; transitionColor: "black" | "white" }>>([]);
  const future = useRef<Array<{ layers: TextLayer[]; illustrations: IllustrationLayer[]; audioTracks: AudioTrack[]; start: number; end: number; videoFadeIn: number; videoFadeOut: number; videoFadeInAt: number; videoFadeOutAt: number; transitionColor: "black" | "white" }>>([]);
  const editorRecorder = useRef<MediaRecorder | null>(null), cancelExport = useRef(false);
  const selected = layers.find((layer) => layer.id === selectedId);
  const selectedIllustration = illustrations.find((item) => item.id === selectedIllustrationId);
  const selectedAudio = audioTracks.find((track) => track.id === selectedAudioId);
  const illustrationElements = useRef<Map<string, HTMLImageElement | HTMLVideoElement>>(new Map());
  const audioElements = useRef<Map<string, HTMLAudioElement>>(new Map());
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
  const illustrationResize = useRef<{ id: string; size: number; startX: number } | null>(null);
  const timelineTrim = useRef<"start" | "end" | null>(null);
  const timelineItemDrag = useRef<{ kind: "text" | "illustration" | "audio"; id: string; edge: "move" | "start" | "end"; start: number; end: number; startX: number } | null>(null);
  const timelineFadeDrag = useRef<{ kind: "text" | "illustration" | "audio"; id: string; edge: "in" | "out"; initial: number; startX: number } | null>(null);
  const playheadDrag = useRef(false);
  const clipboard = useRef<{ kind: "text" | "illustration" | "audio"; item: TextLayer | IllustrationLayer | AudioTrack } | null>(null);
  const transitionResize = useRef<{ edge: "in" | "out"; initial: number; startX: number } | null>(null);
  const transitionMove = useRef<{ edge: "in" | "out"; initial: number; startX: number } | null>(null);
  const videoFrameDrag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const videoFrameResize = useRef<{ scale: number; startX: number; startY: number; axis: "horizontal" | "vertical" } | null>(null);

  useEffect(() => {
    if (!selectedId && !selectedIllustrationId && !selectedAudioId && layers[0]) setSelectedId(layers[0].id);
  }, [layers, selectedId, selectedIllustrationId, selectedAudioId]);

  useEffect(() => {
    const syncPlayback = () => setIsPlaying(Boolean(video.current && !video.current.paused && !video.current.ended));
    syncPlayback();
    const timer = window.setInterval(syncPlayback, 180);
    return () => window.clearInterval(timer);
  }, [clip]);

  useEffect(() => {
    audioTracks.forEach((track) => {
      const element = audioElements.current.get(track.id);
      if (!element) return;
      const active = current >= track.start && current < track.end;
      const desired = Math.max(0, current - track.start);
      if (Math.abs(element.currentTime - desired) > .38) element.currentTime = desired;
      const edge = track.fadeIn > 0 ? Math.min(1, Math.max(0, desired / track.fadeIn)) : 1;
      const remaining = Math.max(0, track.end - current);
      element.volume = Math.max(0, Math.min(1, (track.volume / 100) * edge * (track.fadeOut > 0 ? Math.min(1, remaining / track.fadeOut) : 1)));
      if (isPlaying && active && element.paused) void element.play().catch(() => undefined);
      if ((!isPlaying || !active) && !element.paused) element.pause();
    });
  }, [audioTracks, current, isPlaying]);

  useEffect(() => {
    if (!clip) { setWaveform([]); return; }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(clip.url);
        const buffer = await response.arrayBuffer();
        const context = new AudioContext();
        const decoded = await context.decodeAudioData(buffer);
        const data = decoded.getChannelData(0);
        const bars = 140;
        const block = Math.max(1, Math.floor(data.length / bars));
        const values = Array.from({ length: bars }, (_, index) => {
          let peak = 0;
          for (let point = index * block; point < Math.min(data.length, (index + 1) * block); point += 8) peak = Math.max(peak, Math.abs(data[point] || 0));
          return Math.max(.06, Math.min(1, Math.sqrt(peak)));
        });
        await context.close();
        if (!cancelled) setWaveform(values);
      } catch { if (!cancelled) setWaveform([]); }
    })();
    return () => { cancelled = true; };
  }, [clip]);

  useEffect(() => {
    const player = video.current;
    if (!player || !clip) return;
    let animation = 0;
    let callback = 0;
    const update = () => {
      if (!player.paused && Number.isFinite(player.currentTime)) setCurrent(player.currentTime);
      const framePlayer = player as HTMLVideoElement & { requestVideoFrameCallback?: (handler: () => void) => number; cancelVideoFrameCallback?: (id: number) => void };
      if (framePlayer.requestVideoFrameCallback) callback = framePlayer.requestVideoFrameCallback(update);
      else animation = requestAnimationFrame(update);
    };
    update();
    return () => {
      if (animation) cancelAnimationFrame(animation);
      const framePlayer = player as HTMLVideoElement & { cancelVideoFrameCallback?: (id: number) => void };
      if (callback) framePlayer.cancelVideoFrameCallback?.(callback);
    };
  }, [clip]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingText = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (editingText) return;
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
      if (meta && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
      if (meta && event.key.toLowerCase() === "c") { event.preventDefault(); copySelected(); return; }
      if (meta && event.key.toLowerCase() === "v") { event.preventDefault(); pasteSelected(); return; }
      if (meta && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSelected(); return; }
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelected(); return; }
      if (event.code === "Space") { event.preventDefault(); void togglePreviewPlayback(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, selectedIllustrationId, selectedAudioId, clip, layers, illustrations, audioTracks, start, end, videoFadeIn, videoFadeOut, videoFadeInAt, videoFadeOutAt]);

  const time = (value: number) => {
    const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
    const minutes = Math.floor(safe / 60);
    const seconds = Math.floor(safe % 60);
    const tenths = Math.floor((safe % 1) * 10);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
  };
  const snapshot = () => ({ layers, illustrations, audioTracks, start, end, videoFadeIn, videoFadeOut, videoFadeInAt, videoFadeOutAt, transitionColor });
  const remember = () => { history.current = [...history.current.slice(-40), snapshot()]; future.current = []; };
  const restoreSnapshot = (item: ReturnType<typeof snapshot>) => { setLayers(item.layers); setIllustrations(item.illustrations); setAudioTracks(item.audioTracks); setStart(item.start); setEnd(item.end); setVideoFadeIn(item.videoFadeIn); setVideoFadeOut(item.videoFadeOut); setVideoFadeInAt(item.videoFadeInAt); setVideoFadeOutAt(item.videoFadeOutAt); setTransitionColor(item.transitionColor); };
  const undo = () => { const previous = history.current.pop(); if (!previous) return; future.current.push(snapshot()); restoreSnapshot(previous); setNotice("Ação desfeita."); };
  const redo = () => { const next = future.current.pop(); if (!next) return; history.current.push(snapshot()); restoreSnapshot(next); setNotice("Ação refeita."); };
  const updateLayer = (id: string, patch: Partial<TextLayer>, record = true) => {
    if (record) remember();
    setLayers((items) =>
      items.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
    );
  };
  const updateIllustration = (id: string, patch: Partial<IllustrationLayer>, record = true) => {
    if (record) remember();
    setIllustrations((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };
  useEffect(() => {
    if (!clip) return;
    try { localStorage.setItem("klip-editor-draft", JSON.stringify({ name: clip.name, start, end, videoFadeIn, videoFadeOut, videoFadeInAt, videoFadeOutAt, videoTransform, exportAspect, exportResolution, layers, illustrations })); } catch { /* storage may be unavailable */ }
  }, [clip, start, end, videoFadeIn, videoFadeOut, videoFadeInAt, videoFadeOutAt, videoTransform, exportAspect, exportResolution, layers, illustrations]);
  const layerOpacity = (layer: TimedLayer, at: number) => {
    if (at < layer.start || at > layer.end) return 0;
    let opacity = 1;
    if (layer.fadeIn > 0)
      opacity = Math.min(opacity, (at - layer.start) / layer.fadeIn);
    if (layer.fadeOut > 0)
      opacity = Math.min(opacity, (layer.end - at) / layer.fadeOut);
    return Math.max(0, Math.min(1, opacity));
  };
  const videoTransitionOpacity = (at: number) => {
    if (at < start || at > end) return 1;
    let opacity = 0;
    if (videoFadeIn > 0 && at >= videoFadeInAt && at <= videoFadeInAt + videoFadeIn)
      opacity = Math.max(opacity, Math.pow(1 - Math.min(1, Math.max(0, (at - videoFadeInAt) / videoFadeIn)), 1.7));
    if (videoFadeOut > 0 && at >= videoFadeOutAt && at <= videoFadeOutAt + videoFadeOut)
      opacity = Math.max(opacity, Math.pow(Math.min(1, Math.max(0, (at - videoFadeOutAt) / videoFadeOut)), 1.7));
    return Math.max(0, Math.min(1, opacity));
  };
  const effectProgress = (layer: TextLayer, at: number) =>
    Math.max(0, Math.min(1, (at - layer.start) / 0.45));
  const visibleText = (layer: TextLayer, at: number) => {
    if (layer.effect !== "typewriter") return layer.text;
    const progress = Math.max(0, Math.min(1, (at - layer.start) / 1.6));
    return layer.text.slice(0, Math.ceil(layer.text.length * progress));
  };
  const visualFilter = visualPreset === "cinematic" ? "contrast(1.12) saturate(.84) brightness(.92)" : visualPreset === "vivid" ? "contrast(1.08) saturate(1.35)" : visualPreset === "mono" ? "grayscale(1) contrast(1.18)" : visualPreset === "warm" ? "sepia(.22) saturate(1.16) contrast(1.04)" : "none";
  function resetWithClip(nextClip: EditorClip, message: string) {
    if (clip?.url.startsWith("blob:")) URL.revokeObjectURL(clip.url);
    setClip(nextClip);
    setDuration(0);
    setCurrent(0);
    setStart(0);
    setEnd(0);
    setVideoFadeIn(0);
    setVideoFadeOut(0);
    setVideoFadeInAt(0);
    setVideoFadeOutAt(0);
    setVideoTransform({ x: 0, y: 0, scale: 1 });
    setMarkers([]);
    setLayers([initialLayer()]);
    setIllustrations([]);
    setSelectedId("");
    setSelectedIllustrationId("");
    setNotice(message);
  }
  async function turnPhotoIntoClip(file: File) {
    if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
      setNotice("Este navegador não consegue transformar fotos em vídeo. Use uma versão atual do Chrome.");
      return;
    }
    setNotice("Transformando sua foto em um clipe animado…");
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("image-load"));
        image.src = imageUrl;
      });
      const aspect = image.naturalWidth / image.naturalHeight || 16 / 9;
      const canvas = document.createElement("canvas");
      const width = aspect >= 1 ? 1280 : 720;
      const height = Math.max(2, Math.round(width / aspect / 2) * 2);
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas");
      const stream = canvas.captureStream(30);
      const mime = mimeForExport("webm") || "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
      const chunks: BlobPart[] = [];
      const seconds = 6;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => setNotice("Não foi possível gerar o clipe a partir desta foto.");
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        URL.revokeObjectURL(imageUrl);
        if (!chunks.length) return;
        setSourceAspect(aspect);
        resetWithClip(
          { url: URL.createObjectURL(new Blob(chunks, { type: mime })), name: `${file.name.replace(/\.[^.]+$/, "")} · foto animada` },
          "Foto transformada em clipe de 6 segundos. Arraste, corte, adicione áudio e exporte.",
        );
      };
      const draw = (progress: number) => {
        context.fillStyle = "#090909";
        context.fillRect(0, 0, width, height);
        const cover = Math.max(width / image.naturalWidth, height / image.naturalHeight);
        const zoom = 1 + progress * 0.075;
        const drawWidth = image.naturalWidth * cover * zoom;
        const drawHeight = image.naturalHeight * cover * zoom;
        const driftX = Math.sin(progress * Math.PI) * width * 0.018;
        context.drawImage(image, (width - drawWidth) / 2 + driftX, (height - drawHeight) / 2, drawWidth, drawHeight);
      };
      const started = performance.now();
      const render = () => {
        const progress = Math.min(1, (performance.now() - started) / (seconds * 1000));
        draw(progress);
        if (progress < 1) requestAnimationFrame(render);
        else recorder.stop();
      };
      recorder.start(250);
      render();
    } catch {
      URL.revokeObjectURL(imageUrl);
      setNotice("Não foi possível abrir esta foto. Tente JPG, PNG, WebP ou GIF.");
    }
  }
  async function selectFile(file?: File) {
    if (!file) return;
    if (file.type.startsWith("image/")) {
      if (clip) {
        addIllustration(file);
        setNotice("A foto principal foi mantida. Esta nova foto entrou como uma camada na timeline — arraste e redimensione como quiser.");
        return;
      }
      await turnPhotoIntoClip(file);
      return;
    }
    resetWithClip({
      url: URL.createObjectURL(file),
      name: file.name.replace(/\.[^.]+$/, ""),
    }, "Vídeo carregado. Agora monte as camadas na linha do tempo.");
  }
  function addSceneVideo(file?: File) {
    if (!file || !file.type.startsWith("video/")) return;
    const url = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = url;
    probe.onloadedmetadata = () => {
      const from = Math.max(start, Math.min(current, Math.max(start, end - .4)));
      const available = Math.max(.4, end - from);
      const clipLength = Number.isFinite(probe.duration) && probe.duration > 0 ? Math.min(probe.duration, available) : Math.min(6, available);
      const scene: IllustrationLayer = { id: crypto.randomUUID(), kind: "video", url, name: file.name.replace(/\.[^.]+$/, ""), x: 50, y: 50, size: 140, start: from, end: from + clipLength, fadeIn: .35, fadeOut: .35, fit: "cover", role: "scene" };
      const sceneAudio: AudioTrack = { id: crypto.randomUUID(), url, name: `Áudio · ${scene.name}`, start: scene.start, end: scene.end, volume: 100, fadeIn: scene.fadeIn, fadeOut: scene.fadeOut };
      remember();
      setIllustrations((items) => [...items, scene]);
      setAudioTracks((items) => [...items, sceneAudio]);
      setSelectedIllustrationId(scene.id); setSelectedId(""); setSelectedAudioId("");
      setNotice("Cena de vídeo adicionada. Arraste o clip na timeline e ajuste os fades nas duas pontas para criar a transição.");
    };
    probe.onerror = () => { URL.revokeObjectURL(url); setNotice("Não foi possível abrir este vídeo como cena."); };
  }
  function addAudioTrack(file?: File) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const probe = document.createElement("audio");
    probe.src = url;
    probe.onloadedmetadata = () => {
      const from = Math.max(start, current);
      const track: AudioTrack = { id: crypto.randomUUID(), url, name: file.name.replace(/\.[^.]+$/, ""), start: from, end: Math.min(end || duration || from + probe.duration, from + (Number.isFinite(probe.duration) ? probe.duration : 8)), volume: 85, fadeIn: .08, fadeOut: .12 };
      remember(); setAudioTracks((items) => [...items, track]); setSelectedAudioId(track.id); setSelectedId(""); setSelectedIllustrationId(""); setNotice("Faixa de áudio adicionada. Arraste e ajuste na timeline.");
    };
    probe.onerror = () => { URL.revokeObjectURL(url); setNotice("Não foi possível abrir este áudio."); };
  }
  function addBuiltInSound(kind: "pop" | "whoosh" | "ding") {
    const rate = 44100, seconds = kind === "whoosh" ? .52 : .24, samples = Math.floor(rate * seconds);
    const buffer = new ArrayBuffer(44 + samples * 2), view = new DataView(buffer);
    const write = (offset: number, text: string) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    write(0, "RIFF"); view.setUint32(4, 36 + samples * 2, true); write(8, "WAVEfmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, samples * 2, true);
    for (let index = 0; index < samples; index++) {
      const t = index / rate, envelope = Math.pow(1 - index / samples, kind === "whoosh" ? 1.2 : 2.8);
      const frequency = kind === "pop" ? 170 - t * 300 : kind === "ding" ? 880 + t * 170 : 260 + t * 1650;
      const wave = kind === "whoosh" ? (Math.random() * 2 - 1) : Math.sin(Math.PI * 2 * frequency * t);
      view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, wave * envelope * .52)) * 32767, true);
    }
    addAudioTrack(new File([buffer], `klip-${kind}.wav`, { type: "audio/wav" }));
  }
  function updateAudioTrack(id: string, patch: Partial<AudioTrack>, record = true) {
    if (record) remember();
    setAudioTracks((items) => items.map((track) => track.id === id ? { ...track, ...patch } : track));
  }
  function removeAudioTrack() {
    const track = audioTracks.find((item) => item.id === selectedAudioId);
    if (!track) return;
    remember();
    setAudioTracks((items) => items.filter((item) => item.id !== selectedAudioId));
    setSelectedAudioId("");
  }
  function applyTemplate(template: "podcast" | "react" | "gameplay" | "interview") {
    const length = Math.max(4, end || duration || 12);
    const base = initialLayer();
    const title: Record<typeof template, string> = { podcast: "🎙️ Corte do podcast", react: "MINHA REAÇÃO 👀", gameplay: "O CLUTCH MAIS INSANO 🔥", interview: "A pergunta que mudou tudo" };
    const subtitle: Record<typeof template, string> = { podcast: "Siga para mais episódios", react: "espera até o final", gameplay: "não pisca", interview: "assista até o fim" };
    const make = (text: string, y: number, size: number, effect: TextEffect): TextLayer => ({ ...base, id: crypto.randomUUID(), text, y, size, start, end: Math.max(start + .5, length), effect, background: true });
    remember();
    setLayers([make(title[template], 18, 72, "bounce"), make(subtitle[template], 80, 48, "pop")]);
    setIllustrations([]);
    setNotice(`Template ${template} aplicado. Ajuste os textos e as camadas como quiser.`);
  }
  async function detectSilence() {
    if (!clip) return;
    try {
      setNotice("Analisando o áudio para sugerir um corte…");
      const response = await fetch(clip.url);
      const buffer = await response.arrayBuffer();
      const context = new AudioContext();
      const decoded = await context.decodeAudioData(buffer);
      const data = decoded.getChannelData(0), block = Math.max(1, Math.floor(decoded.sampleRate * .25));
      const levels: number[] = [];
      for (let index = 0; index < data.length; index += block) { let sum = 0; for (let sample = index; sample < Math.min(data.length, index + block); sample++) sum += data[sample] * data[sample]; levels.push(Math.sqrt(sum / block)); }
      const threshold = Math.max(.012, Math.min(.08, levels.reduce((sum, value) => sum + value, 0) / Math.max(1, levels.length) * .42));
      const first = levels.findIndex((value) => value > threshold);
      const last = levels.length - 1 - [...levels].reverse().findIndex((value) => value > threshold);
      await context.close();
      if (first < 0 || last <= first) { setNotice("Não encontrei fala clara para sugerir um corte. Ajuste manualmente na timeline."); return; }
      remember();
      const from = Math.max(0, first * .25 - .15), to = Math.min(decoded.duration, (last + 1) * .25 + .25);
      setStart(from); setEnd(to); seek(from); setNotice(`Silêncios nas pontas removidos: ${time(from)} até ${time(to)}.`);
    } catch { setNotice("Não foi possível analisar este áudio no navegador. Você ainda pode cortar manualmente."); }
  }
  async function importSubtitles(file?: File) {
    if (!file) return;
    try {
      const raw = await file.text();
      const blocks = raw.replace(/\r/g, "").trim().split(/\n\s*\n/);
      const parseTime = (value: string) => { const match = value.trim().replace(",", ".").match(/(\d+):(\d+):(\d+(?:\.\d+)?)/); return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : 0; };
      const captions = blocks.map((block) => { const lines = block.split("\n").filter(Boolean); const timing = lines.find((line) => line.includes("-->")); if (!timing) return null; const [from, to] = timing.split("-->").map(parseTime); const text = lines.slice(lines.indexOf(timing) + 1).join(" ").replace(/<[^>]+>/g, "").trim(); return text ? { from, to, text } : null; }).filter((item): item is { from: number; to: number; text: string } => Boolean(item));
      if (!captions.length) { setNotice("Não encontrei legendas válidas neste arquivo SRT."); return; }
      remember();
      const made = captions.map((item, index): TextLayer => ({ ...initialLayer(), id: crypto.randomUUID(), text: item.text, start: Math.max(start, item.from), end: Math.min(end || duration || item.to, Math.max(item.from + .1, item.to)), y: 76, size: 56, effect: "pop", background: true, color: "#ffffff", x: 50, align: "center" }));
      setLayers((items) => [...items, ...made]); setSelectedId(made[0]?.id || ""); setNotice(`${made.length} legendas importadas para a timeline.`);
    } catch { setNotice("Não foi possível ler o arquivo de legenda."); }
  }
  function exportProject() {
    const project = { version: 2, clipName: clip?.name || "", start, end, videoFadeIn, videoFadeOut, videoFadeInAt, videoFadeOutAt, transitionColor, videoTransform, exportAspect, exportResolution, exportFps, exportBitrate, audioGain, audioEnhance, layers, createdAt: new Date().toISOString() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "klip-project.json"; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); setNotice("Projeto salvo. Ao abrir, importe também o vídeo original.");
  }
  async function importProject(file?: File) {
    if (!file) return;
    try { const project = JSON.parse(await file.text()); if (!Array.isArray(project.layers)) throw new Error("invalid"); const restoredStart = Number(project.start) || 0, restoredEnd = Number(project.end) || duration; const restoredIn = Number(project.videoFadeIn) || 0, restoredOut = Number(project.videoFadeOut) || 0; setStart(restoredStart); setEnd(restoredEnd); setVideoFadeIn(restoredIn); setVideoFadeOut(restoredOut); setVideoFadeInAt(Math.max(restoredStart, Number(project.videoFadeInAt) || restoredStart)); setVideoFadeOutAt(Math.max(restoredStart, Number(project.videoFadeOutAt) || Math.max(restoredStart, restoredEnd - restoredOut))); setTransitionColor(project.transitionColor === "white" ? "white" : "black"); setVideoTransform({ x: Number(project.videoTransform?.x) || 0, y: Number(project.videoTransform?.y) || 0, scale: Math.max(1, Math.min(2.5, Number(project.videoTransform?.scale) || 1)) }); setExportAspect(["original", "vertical", "landscape", "square"].includes(project.exportAspect) ? project.exportAspect : "vertical"); setExportResolution(["source", "1080", "720"].includes(project.exportResolution) ? project.exportResolution : "1080"); setExportFps([24, 30, 60].includes(project.exportFps) ? project.exportFps : 30); setExportBitrate(["standard", "high", "ultra"].includes(project.exportBitrate) ? project.exportBitrate : "high"); setAudioGain(Number(project.audioGain) || 100); setAudioEnhance(project.audioEnhance !== false); setLayers(project.layers); setSelectedId(project.layers[0]?.id || ""); setNotice("Projeto restaurado. Importe o vídeo original para terminar a edição."); } catch { setNotice("Arquivo de projeto inválido."); }
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
    remember();
    setIllustrations((items) => [...items, item]);
    setSelectedIllustrationId(item.id);
    setSelectedId("");
    setSelectedAudioId("");
    setNotice(`${kind === "image" ? "Imagem" : "Vídeo"} ilustrativo adicionado à linha do tempo.`);
  }
  function removeIllustration() {
    if (!selectedIllustration) return;
    remember();
    illustrationElements.current.delete(selectedIllustration.id);
    setIllustrations((items) => items.filter((item) => item.id !== selectedIllustration.id));
    setSelectedIllustrationId("");
  }
  function duplicateIllustration() {
    if (!selectedIllustration) return;
    remember();
    const copy: IllustrationLayer = {
      ...selectedIllustration,
      id: crypto.randomUUID(),
      x: Math.min(88, selectedIllustration.x + 6),
      y: Math.min(88, selectedIllustration.y + 6),
    };
    setIllustrations((items) => [...items, copy]);
    setSelectedIllustrationId(copy.id);
    setSelectedId("");
    setSelectedAudioId("");
    setNotice("Camada duplicada. Arraste, redimensione e escolha o período dela.");
  }
  function setVideoDuration(element: HTMLVideoElement) {
    const value = element.duration;
    if (element.videoWidth && element.videoHeight)
      setSourceAspect(element.videoWidth / element.videoHeight);
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
  function snapTime(value: number) {
    const safe = Math.max(0, Math.min(duration, value));
    if (!snapEnabled || !duration) return safe;
    const points = [0, duration, start, end, current, ...markers, ...layers.flatMap((layer) => [layer.start, layer.end]), ...illustrations.flatMap((item) => [item.start, item.end]), ...audioTracks.flatMap((track) => [track.start, track.end])];
    const threshold = Math.max(.08, duration / 280);
    const closest = points.reduce((best, point) => Math.abs(point - safe) < Math.abs(best - safe) ? point : best, safe);
    return Math.abs(closest - safe) <= threshold ? closest : safe;
  }
  function updateSnapGuide(value: number) {
    const snapped = snapTime(value);
    setSnapGuide(snapEnabled && Math.abs(snapped - value) > .001 ? snapped : null);
    return snapped;
  }
  function selectTimeFromTimeline(event: React.PointerEvent<HTMLDivElement>) {
    if (!duration) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    seek(ratio * duration);
  }
  function beginTimelineTrim(event: React.PointerEvent<HTMLButtonElement>, edge: "start" | "end") {
    if (!duration) return;
    event.preventDefault();
    event.stopPropagation();
    remember();
    timelineTrim.current = edge;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveTimelineTrim(event: React.PointerEvent<HTMLDivElement>) {
    const edge = timelineTrim.current;
    if (!edge || !duration) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const value = snapTime(Math.max(0, Math.min(duration, ((event.clientX - bounds.left) / bounds.width) * duration)));
    if (edge === "start") {
      const next = Math.min(value, end - 0.05);
      setStart(Math.max(0, next));
      seek(Math.max(0, next));
    } else {
      const next = Math.max(value, start + 0.05);
      setEnd(Math.min(duration, next));
      seek(Math.min(duration, next));
    }
  }
  function endTimelineTrim() {
    if (timelineTrim.current) setNotice("Corte atualizado na linha do tempo.");
    timelineTrim.current = null;
  }
  function beginTimelineItemDrag(event: React.PointerEvent<HTMLElement>, kind: "text" | "illustration" | "audio", id: string, edge: "move" | "start" | "end", itemStart: number, itemEnd: number) {
    if (!duration) return;
    event.preventDefault();
    event.stopPropagation();
    remember();
    timelineItemDrag.current = { kind, id, edge, start: itemStart, end: itemEnd, startX: event.clientX };
    if (kind === "text") { setSelectedId(id); setSelectedIllustrationId(""); setSelectedAudioId(""); }
    if (kind === "illustration") { setSelectedIllustrationId(id); setSelectedId(""); setSelectedAudioId(""); }
    if (kind === "audio") { setSelectedAudioId(id); setSelectedId(""); setSelectedIllustrationId(""); }
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveTimelineItemDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = timelineItemDrag.current;
    const track = event.currentTarget.parentElement;
    if (!drag || !track || !duration) return;
    const bounds = track.getBoundingClientRect();
    const delta = ((event.clientX - drag.startX) / bounds.width) * duration;
    const length = drag.end - drag.start;
    let patch: { start?: number; end?: number };
    if (drag.edge === "move") {
      const nextStart = updateSnapGuide(Math.max(start, Math.min(end - length, drag.start + delta)));
      patch = { start: nextStart, end: nextStart + length };
    } else if (drag.edge === "start") {
      patch = { start: updateSnapGuide(Math.max(start, Math.min(drag.end - .08, drag.start + delta))) };
    } else {
      patch = { end: updateSnapGuide(Math.max(drag.start + .08, Math.min(end, drag.end + delta))) };
    }
    if (drag.kind === "text") updateLayer(drag.id, patch, false);
    else if (drag.kind === "illustration") updateIllustration(drag.id, patch, false);
    else updateAudioTrack(drag.id, patch, false);
  }
  function endTimelineItemDrag() {
    if (timelineItemDrag.current) setNotice("Clip atualizado na timeline.");
    timelineItemDrag.current = null;
    setSnapGuide(null);
  }
  function beginTimelineFadeDrag(event: React.PointerEvent<HTMLElement>, kind: "text" | "illustration" | "audio", id: string, edge: "in" | "out", value: number) {
    if (!duration) return;
    event.preventDefault();
    event.stopPropagation();
    remember();
    timelineFadeDrag.current = { kind, id, edge, initial: value, startX: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveTimelineFadeDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = timelineFadeDrag.current;
    const track = event.currentTarget.parentElement?.parentElement;
    if (!drag || !track || !duration) return;
    const bounds = track.getBoundingClientRect();
    const delta = ((event.clientX - drag.startX) / bounds.width) * duration;
    const item = drag.kind === "text" ? layers.find((layer) => layer.id === drag.id) : drag.kind === "illustration" ? illustrations.find((layer) => layer.id === drag.id) : audioTracks.find((layer) => layer.id === drag.id);
    if (!item) return;
    const max = Math.max(0, (item.end - item.start) / 2);
    const value = Math.max(0, Math.min(max, drag.initial + (drag.edge === "in" ? delta : -delta)));
    const patch = drag.edge === "in" ? { fadeIn: value } : { fadeOut: value };
    if (drag.kind === "text") updateLayer(drag.id, patch, false);
    else if (drag.kind === "illustration") updateIllustration(drag.id, patch, false);
    else updateAudioTrack(drag.id, patch, false);
  }
  function endTimelineFadeDrag() {
    if (timelineFadeDrag.current) setNotice("Fade atualizado diretamente na timeline.");
    timelineFadeDrag.current = null;
  }
  function beginPlayheadDrag(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    playheadDrag.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function movePlayheadDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (!playheadDrag.current || !duration) return;
    const track = event.currentTarget.parentElement?.querySelector<HTMLElement>(".video-lane .lane-track");
    if (!track) return;
    const bounds = track.getBoundingClientRect();
    seek(Math.max(0, Math.min(duration, ((event.clientX - bounds.left) / bounds.width) * duration)));
  }
  function endPlayheadDrag() { playheadDrag.current = false; }
  function beginTransitionResize(event: React.PointerEvent<HTMLElement>, edge: "in" | "out") {
    if (!duration) return;
    event.preventDefault();
    event.stopPropagation();
    transitionResize.current = { edge, initial: edge === "in" ? videoFadeIn : videoFadeOut, startX: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveTransitionResize(event: React.PointerEvent<HTMLElement>) {
    const resize = transitionResize.current;
    const track = event.currentTarget.parentElement;
    if (!resize || !track || !duration) return;
    const bounds = track.getBoundingClientRect();
    const delta = ((event.clientX - resize.startX) / bounds.width) * duration;
    const max = Math.max(.1, end - start - .05);
    const next = Math.max(.1, Math.min(max, resize.initial + (resize.edge === "in" ? delta : -delta)));
    if (resize.edge === "in") setVideoFadeIn(next); else setVideoFadeOut(next);
  }
  function endTransitionResize() {
    if (transitionResize.current) setNotice("Duração do fade ajustada na timeline.");
    transitionResize.current = null;
  }
  function beginTransitionMove(event: React.PointerEvent<HTMLElement>, edge: "in" | "out") {
    if (!duration || (event.target as HTMLElement).closest(".transition-grip")) return;
    event.preventDefault();
    event.stopPropagation();
    transitionMove.current = { edge, initial: edge === "in" ? videoFadeInAt : videoFadeOutAt, startX: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveTransitionPosition(event: React.PointerEvent<HTMLElement>) {
    const moving = transitionMove.current;
    const track = event.currentTarget.parentElement;
    if (!moving || !track || !duration) return;
    const bounds = track.getBoundingClientRect();
    const fadeDuration = moving.edge === "in" ? videoFadeIn : videoFadeOut;
    const delta = ((event.clientX - moving.startX) / bounds.width) * duration;
    const next = Math.max(start, Math.min(Math.max(start, end - fadeDuration), moving.initial + delta));
    if (moving.edge === "in") setVideoFadeInAt(next); else setVideoFadeOutAt(next);
  }
  function endTransitionMove() {
    if (transitionMove.current) setNotice("Fade reposicionado na timeline.");
    transitionMove.current = null;
  }
  async function togglePreviewPlayback() {
    if (!video.current) return;
    if (video.current.paused) {
      try { await video.current.play(); } catch { setNotice("Clique na prévia para liberar a reprodução."); }
    } else video.current.pause();
  }
  function trimAtPlayhead() {
    if (!duration) return;
    remember();
    if (current <= (start + end) / 2) {
      const value = Math.min(current, end - 0.05);
      setStart(Math.max(0, value));
      setNotice(`Início do corte movido para ${time(Math.max(0, value))}.`);
    } else {
      const value = Math.max(current, start + 0.05);
      setEnd(Math.min(duration, value));
      setNotice(`Fim do corte movido para ${time(Math.min(duration, value))}.`);
    }
  }
  function addMarker() {
    if (!duration) return;
    const value = snapTime(current);
    setMarkers((items) => [...new Set([...items, value])].sort((a, b) => a - b));
    setNotice(`Marcador adicionado em ${time(value)}. Use-o como referência para corte e camadas.`);
  }
  function markCut(edge: "start" | "end") {
    if (!duration) return;
    remember();
    if (edge === "start") {
      const value = Math.min(snapTime(current), end - 0.05);
      setStart(Math.max(0, value));
      setNotice(`Corte inicial marcado em ${time(Math.max(0, value))}.`);
    } else {
      const value = Math.max(snapTime(current), start + 0.05);
      setEnd(Math.min(duration, value));
      setNotice(`Corte final marcado em ${time(Math.min(duration, value))}.`);
    }
  }
  function addLayer() {
    remember();
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
    setSelectedIllustrationId("");
    setSelectedAudioId("");
    setNotice("Nova camada adicionada. Arraste o texto diretamente na prévia.");
  }
  function duplicateLayer() {
    if (!selected) return;
    remember();
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
    remember();
    setLayers((items) => items.filter((layer) => layer.id !== selected.id));
    setSelectedId("");
  }
  function deleteSelected() {
    if (selectedIllustrationId) { removeIllustration(); return; }
    if (selectedAudioId) { removeAudioTrack(); return; }
    if (selectedId) removeLayer();
  }
  function duplicateSelected() {
    if (selectedIllustrationId) { duplicateIllustration(); return; }
    if (selectedAudioId) { copySelected(); pasteSelected(); return; }
    if (selectedId) duplicateLayer();
  }
  function openContextMenu(event: React.MouseEvent, kind: "text" | "illustration" | "audio", id: string) {
    event.preventDefault();
    if (kind === "text") { setSelectedId(id); setSelectedIllustrationId(""); setSelectedAudioId(""); }
    if (kind === "illustration") { setSelectedIllustrationId(id); setSelectedId(""); setSelectedAudioId(""); }
    if (kind === "audio") { setSelectedAudioId(id); setSelectedId(""); setSelectedIllustrationId(""); }
    setContextMenu({ x: event.clientX, y: event.clientY, kind, id });
  }
  function closeContextMenu() { setContextMenu(null); }
  function moveSelectedLayer(direction: "front" | "back") {
    if (selectedIllustration) {
      remember();
      setIllustrations((items) => {
        const rest = items.filter((item) => item.id !== selectedIllustration.id);
        return direction === "front" ? [...rest, selectedIllustration] : [selectedIllustration, ...rest];
      });
    } else if (selected) {
      remember();
      setLayers((items) => {
        const rest = items.filter((item) => item.id !== selected.id);
        return direction === "front" ? [...rest, selected] : [selected, ...rest];
      });
    }
    closeContextMenu();
  }
  function copySelected() {
    if (selectedIllustration) clipboard.current = { kind: "illustration", item: selectedIllustration };
    else if (selectedAudio) clipboard.current = { kind: "audio", item: selectedAudio };
    else if (selected) clipboard.current = { kind: "text", item: selected };
    else return;
    setNotice("Camada copiada. Use Ctrl V para colar no cursor.");
  }
  function pasteSelected() {
    const copied = clipboard.current;
    if (!copied) return;
    const from = Math.max(start, Math.min(current, Math.max(start, end - .15)));
    const makeRange = (item: TimedLayer) => {
      const length = Math.max(.15, Math.min(item.end - item.start, Math.max(.15, end - from)));
      return { start: from, end: Math.min(end, from + length) };
    };
    remember();
    if (copied.kind === "text") {
      const item = copied.item as TextLayer;
      const next = { ...item, ...makeRange(item), id: crypto.randomUUID(), text: `${item.text} cópia`, x: Math.min(92, item.x + 4), y: Math.min(92, item.y + 4) };
      setLayers((items) => [...items, next]); setSelectedId(next.id); setSelectedIllustrationId(""); setSelectedAudioId("");
    } else if (copied.kind === "illustration") {
      const item = copied.item as IllustrationLayer;
      const next = { ...item, ...makeRange(item), id: crypto.randomUUID(), x: Math.min(92, item.x + 4), y: Math.min(92, item.y + 4) };
      setIllustrations((items) => [...items, next]); setSelectedIllustrationId(next.id); setSelectedId(""); setSelectedAudioId("");
    } else {
      const item = copied.item as AudioTrack;
      const next = { ...item, ...makeRange(item), id: crypto.randomUUID(), name: `${item.name} cópia` };
      setAudioTracks((items) => [...items, next]); setSelectedAudioId(next.id); setSelectedId(""); setSelectedIllustrationId("");
    }
    setNotice("Camada colada no cursor.");
  }
  function beginLayerDrag(event: React.PointerEvent<HTMLDivElement>, layer: TextLayer) {
    remember();
    setSelectedId(layer.id);
    setSelectedIllustrationId("");
    setSelectedAudioId("");
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
    }, false);
  }
  function beginIllustrationDrag(event: React.PointerEvent<HTMLDivElement>, item: IllustrationLayer) {
    remember();
    setSelectedIllustrationId(item.id);
    setSelectedId("");
    setSelectedAudioId("");
    illustrationDrag.current = { id: item.id, x: item.x, y: item.y, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveIllustrationDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (illustrationResize.current) return;
    const drag = illustrationDrag.current;
    const stage = event.currentTarget.parentElement;
    if (!drag || !stage) return;
    const bounds = stage.getBoundingClientRect();
    updateIllustration(drag.id, {
      x: Math.max(8, Math.min(92, drag.x + ((event.clientX - drag.startX) / bounds.width) * 100)),
      y: Math.max(8, Math.min(92, drag.y + ((event.clientY - drag.startY) / bounds.height) * 100)),
    }, false);
  }
  function beginIllustrationResize(event: React.PointerEvent<HTMLDivElement>, item: IllustrationLayer) {
    event.stopPropagation();
    remember();
    setSelectedIllustrationId(item.id);
    illustrationResize.current = { id: item.id, size: item.size, startX: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveIllustrationResize(event: React.PointerEvent<HTMLDivElement>) {
    const resize = illustrationResize.current;
    const stage = event.currentTarget.parentElement?.parentElement;
    if (!resize || !stage) return;
    const bounds = stage.getBoundingClientRect();
    updateIllustration(resize.id, {
      size: Math.max(18, Math.min(90, resize.size + ((event.clientX - resize.startX) / bounds.width) * 100)),
    }, false);
  }
  function beginVideoFrameDrag(event: React.PointerEvent<HTMLVideoElement>) {
    if (!clip) return;
    videoFrameDrag.current = { x: videoTransform.x, y: videoTransform.y, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveVideoFrameDrag(event: React.PointerEvent<HTMLVideoElement>) {
    const drag = videoFrameDrag.current;
    const stage = event.currentTarget.parentElement;
    if (!drag || !stage) return;
    const bounds = stage.getBoundingClientRect();
    setVideoTransform((currentFrame) => ({
      ...currentFrame,
      x: Math.max(-45, Math.min(45, drag.x + ((event.clientX - drag.startX) / bounds.width) * 100)),
      y: Math.max(-45, Math.min(45, drag.y + ((event.clientY - drag.startY) / bounds.height) * 100)),
    }));
  }
  function beginVideoFrameResize(event: React.PointerEvent<HTMLDivElement>, axis: "horizontal" | "vertical" = "horizontal") {
    event.preventDefault();
    event.stopPropagation();
    videoFrameResize.current = { scale: videoTransform.scale, startX: event.clientX, startY: event.clientY, axis };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveVideoFrameResize(event: React.PointerEvent<HTMLDivElement>) {
    const resize = videoFrameResize.current;
    const stage = event.currentTarget.parentElement;
    if (!resize || !stage) return;
    const bounds = stage.getBoundingClientRect();
    const delta = resize.axis === "vertical" ? (event.clientY - resize.startY) / bounds.height : (event.clientX - resize.startX) / bounds.width;
    setVideoTransform((currentFrame) => ({ ...currentFrame, scale: Math.max(1, Math.min(2.5, resize.scale + delta * 2)) }));
  }
  function applyTransition(kind: "fade-black" | "fade-white" | "none", edge: "in" | "out") {
    const fadeDuration = kind === "none" ? 0 : 1;
    if (kind !== "none") setTransitionColor(kind === "fade-white" ? "white" : "black");
    if (edge === "in") { setVideoFadeIn(fadeDuration); setVideoFadeInAt(start); }
    else { setVideoFadeOut(fadeDuration); setVideoFadeOutAt(Math.max(start, end - fadeDuration)); }
    setNotice(kind === "none" ? `Transição de ${edge === "in" ? "entrada" : "saída"} removida.` : `${kind === "fade-white" ? "Fade branco" : "Fade preto"} aplicado na ${edge === "in" ? "entrada" : "saída"}.`);
  }
  function dropTransition(event: React.DragEvent<HTMLDivElement>, edge: "in" | "out") {
    event.preventDefault();
    const kind = event.dataTransfer.getData("application/x-klip-transition") as "fade-black" | "fade-white" | "none";
    if (kind) applyTransition(kind, edge);
  }
  function dropTransitionOnTimeline(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const kind = event.dataTransfer.getData("application/x-klip-transition") as "fade-black" | "fade-white" | "none";
    if (!kind || !duration) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    applyTransition(kind, (event.clientX - bounds.left) / bounds.width < .5 ? "in" : "out");
  }
  function previewStyle(layer: TextLayer): React.CSSProperties {
    const progress = effectProgress(layer, current);
    const scale = layer.effect === "pop" ? 0.68 + progress * 0.32 : layer.effect === "zoom" ? 1.42 - progress * .42 : layer.effect === "bounce" ? .75 + Math.sin(progress * Math.PI) * .22 : 1;
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
    setExportProgress(0);
    cancelExport.current = false;
    setNotice("Renderizando o reel com todas as camadas e efeitos…");
    const canvas = document.createElement("canvas"),
      context = canvas.getContext("2d");
    if (!context) {
      setExporting(false);
      return;
    }
    const sourceWidth = source.videoWidth || 1920;
    const sourceHeight = source.videoHeight || 1080;
    const aspect = exportAspect === "vertical" ? 9 / 16 : exportAspect === "landscape" ? 16 / 9 : 1;
    const original = exportAspect === "original";
    let outputWidth = original ? sourceWidth : aspect >= 1 ? 1920 : 1080;
    let outputHeight = original ? sourceHeight : Math.round(outputWidth / aspect);
    if (exportResolution !== "source") {
      const limit = Number(exportResolution);
      const scale = Math.min(1, limit / Math.max(outputWidth, outputHeight));
      outputWidth = Math.max(2, Math.round(outputWidth * scale));
      outputHeight = Math.max(2, Math.round(outputHeight * scale));
    }
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const output = canvas.captureStream(exportFps);
    const captured = (
      source as HTMLVideoElement & { captureStream?: () => MediaStream }
    ).captureStream?.();
    const exportAudio = new AudioContext(), audioDestination = exportAudio.createMediaStreamDestination();
    await exportAudio.resume();
    if (captured?.getAudioTracks().length) {
      const audioSource = exportAudio.createMediaStreamSource(new MediaStream(captured.getAudioTracks()));
      const gain = exportAudio.createGain(); gain.gain.value = audioGain / 100;
      if (audioEnhance) { const highPass = exportAudio.createBiquadFilter(); highPass.type = "highpass"; highPass.frequency.value = 80; const compressor = exportAudio.createDynamicsCompressor(); compressor.threshold.value = -22; compressor.ratio.value = 3; audioSource.connect(highPass).connect(compressor).connect(gain).connect(audioDestination); }
      else audioSource.connect(gain).connect(audioDestination);
    }
    const exportTrackElements: HTMLAudioElement[] = [];
    audioTracks.filter((track) => track.end > start && track.start < end).forEach((track) => {
      const element = new Audio(track.url);
      element.preload = "auto";
      element.volume = 0;
      const trackSource = exportAudio.createMediaElementSource(element);
      const trackGain = exportAudio.createGain();
      trackGain.gain.value = Math.max(0, Math.min(1.2, track.volume / 100));
      trackSource.connect(trackGain).connect(audioDestination);
      const delay = Math.max(0, track.start - start);
      window.setTimeout(() => { element.currentTime = Math.max(0, start - track.start); void element.play().catch(() => undefined); }, delay * 1000);
      window.setTimeout(() => element.pause(), Math.max(0, Math.min(end, track.end) - start) * 1000);
      exportTrackElements.push(element);
    });
    audioDestination.stream.getAudioTracks().forEach((track) => output.addTrack(track));
    const mime = mimeForExport(exportFormat) || mimeForExport("webm")!;
    if (exportFormat === "mp4" && !mime.startsWith("video/mp4"))
      setNotice("MP4 não é suportado neste navegador; exportando WebM verdadeiro.");
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(output, {
      mimeType: mime,
      videoBitsPerSecond: exportBitrate === "ultra" ? 20_000_000 : exportBitrate === "high" ? 10_000_000 : 5_000_000,
      audioBitsPerSecond: 192_000,
    });
    editorRecorder.current = recorder;
    let frame = 0;
    const draw = () => {
      if (cancelExport.current) { if (recorder.state !== "inactive") recorder.stop(); return; }
      setExportProgress(Math.min(100, Math.round(((source.currentTime - start) / Math.max(.01, end - start)) * 100)));
      const scale = Math.max(
        canvas.width / source.videoWidth,
        canvas.height / source.videoHeight,
      ) * Math.max(1, videoTransform.scale);
      const width = source.videoWidth * scale,
        height = source.videoHeight * scale;
      context.fillStyle = "#090909";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.filter = visualFilter;
      context.drawImage(
        source,
        (canvas.width - width) / 2 + (videoTransform.x / 100) * canvas.width,
        (canvas.height - height) / 2 + (videoTransform.y / 100) * canvas.height,
        width,
        height,
      );
      context.filter = "none";
      const videoTransition = videoTransitionOpacity(source.currentTime);
      if (videoTransition > 0) {
        context.fillStyle = transitionColor === "black" ? "#000000" : "#ffffff";
        context.globalAlpha = videoTransition;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.globalAlpha = 1;
      }
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
        const boxWidth = item.role === "scene" ? canvas.width : (item.size / 100) * canvas.width;
        const boxHeight = item.role === "scene" ? canvas.height : boxWidth * 0.72;
        const scale = item.fit === "cover"
          ? Math.max(boxWidth / mediaWidth, boxHeight / mediaHeight)
          : Math.min(boxWidth / mediaWidth, boxHeight / mediaHeight);
        const drawWidth = mediaWidth * scale;
        const drawHeight = mediaHeight * scale;
        const x = item.role === "scene" ? 0 : (item.x / 100) * canvas.width - boxWidth / 2;
        const y = item.role === "scene" ? 0 : (item.y / 100) * canvas.height - boxHeight / 2;
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
        const scaleEffect = layer.effect === "pop" ? 0.68 + progress * 0.32 : layer.effect === "zoom" ? 1.42 - progress * .42 : layer.effect === "bounce" ? .75 + Math.sin(progress * Math.PI) * .22 : 1;
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
      exportTrackElements.forEach((element) => element.pause());
      if (cancelExport.current) { void exportAudio.close(); editorRecorder.current = null; setExportProgress(0); setExporting(false); setNotice("Renderização cancelada."); return; }
      const url = URL.createObjectURL(new Blob(chunks, { type: mime }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `klip-reel-${Date.now()}.${mime.startsWith("video/mp4") ? "mp4" : "webm"}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      void exportAudio.close();
      editorRecorder.current = null;
      setExportProgress(100);
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
          <select className="export-format" aria-label="Formato do vídeo" value={exportAspect} onChange={(event) => setExportAspect(event.target.value as ExportAspect)}>
            <option value="original">Original (preservar)</option>
            <option value="vertical">Vertical 9:16</option>
            <option value="landscape">Horizontal 16:9</option>
            <option value="square">Quadrado 1:1</option>
          </select>
          <select className="export-format" aria-label="Resolução do vídeo" value={exportResolution} onChange={(event) => setExportResolution(event.target.value as "source" | "1080" | "720")}>
            <option value="source">Resolução original</option>
            <option value="1080">Até 1080p</option>
            <option value="720">Até 720p</option>
          </select>
          <select className="export-format" aria-label="Quadros por segundo" value={exportFps} onChange={(event) => setExportFps(Number(event.target.value))}>
            <option value="24">24 FPS</option><option value="30">30 FPS</option><option value="60">60 FPS</option>
          </select>
          <select className="export-format" aria-label="Bitrate" value={exportBitrate} onChange={(event) => setExportBitrate(event.target.value as "standard" | "high" | "ultra")}>
            <option value="standard">Bitrate padrão</option><option value="high">Alta qualidade</option><option value="ultra">Qualidade máxima</option>
          </select>
          <button className="editor-export" disabled={!clip || exporting} onClick={() => void exportReel()}>
            {exporting ? "Renderizando…" : `⇩ Exportar ${exportFormat.toUpperCase()}`}
          </button>
          {exporting && <button className="editor-cancel" onClick={() => { cancelExport.current = true; editorRecorder.current?.stop(); }}>Cancelar {exportProgress}%</button>}
        </div>
      </header>
      <nav className="mobile-editor-nav" aria-label="Atalhos do editor">
        <a href="#klip-preview">▣ Prévia</a>
        <a href="#klip-tools">☷ Ferramentas</a>
        <a href="#klip-timeline">▤ Linha do tempo</a>
        <button disabled={!clip || exporting} onClick={() => void exportReel()}>{exporting ? "Renderizando…" : "⇩ Exportar"}</button>
      </nav>
      <section className="editor-workspace">
        <aside className="editor-tools" id="klip-tools">
          <div className="tool-heading"><span>01</span><div><b>Mídia</b><small>Gravação, vídeo ou foto do computador</small></div></div>
          <label className="editor-upload">＋ Importar vídeo ou foto<input type="file" accept="video/*,image/*" onChange={(event) => void selectFile(event.target.files?.[0])} /></label>
          <small className="media-import-help">A primeira foto vira o clipe principal. As próximas entram como camadas, sem apagar as anteriores.</small>
          {clip && <label className="editor-upload editor-scene-upload">＋ Adicionar cena de vídeo<input type="file" accept="video/*" onChange={(event) => addSceneVideo(event.target.files?.[0])} /></label>}
          {clip && <p className="editor-file">● {clip.name}</p>}
          <div className="project-actions"><button onClick={exportProject}>⇩ Salvar projeto</button><label>↥ Abrir projeto<input type="file" accept="application/json,.json" onChange={(event) => void importProject(event.target.files?.[0])} /></label></div>
          {clip && <>
          <details className="tool-disclosure" open><summary>Templates e aparência</summary>
            <div className="template-grid"><button onClick={() => applyTemplate("podcast")}>🎙️ Podcast</button><button onClick={() => applyTemplate("react")}>👀 React</button><button onClick={() => applyTemplate("gameplay")}>🎮 Gameplay</button><button onClick={() => applyTemplate("interview")}>💬 Entrevista</button></div>
            {clip && <div className="visual-presets"><b>Cor e filtros</b><div>{([['clean','Limpo'],['cinematic','Cinema'],['vivid','Vibrante'],['mono','P&B'],['warm','Quente']] as const).map(([key, label]) => <button key={key} className={visualPreset === key ? "selected" : ""} onClick={() => setVisualPreset(key)}>{label}</button>)}</div></div>}
          </details>
          {clip && <details className="tool-disclosure"><summary>Áudio {audioTracks.length ? `· ${audioTracks.length} faixa${audioTracks.length > 1 ? "s" : ""}` : ""}</summary><div className="audio-editor-controls"><b>Áudio do vídeo</b><label>Volume · {audioGain}%<input type="range" min="0" max="160" value={audioGain} onChange={(event) => setAudioGain(Number(event.target.value))} /></label><label><input type="checkbox" checked={audioEnhance} onChange={(event) => setAudioEnhance(event.target.checked)} /> Limpar voz e nivelar volume</label><button onClick={() => void detectSilence()}>✂ Remover silêncios nas pontas</button></div><div className="audio-editor-controls audio-library"><label className="audio-import">＋ Adicionar áudio<input type="file" accept="audio/*" onChange={(event) => addAudioTrack(event.target.files?.[0])} /></label><div className="sound-fx-shelf"><button onClick={() => addBuiltInSound("pop")}>● Pop</button><button onClick={() => addBuiltInSound("whoosh")}>〰 Whoosh</button><button onClick={() => addBuiltInSound("ding")}>✦ Ding</button></div>{audioTracks.map((track) => <button key={track.id} className={selectedAudio?.id === track.id ? "selected" : ""} onClick={() => { setSelectedAudioId(track.id); setSelectedId(""); setSelectedIllustrationId(""); seek(Math.max(start, track.start)); }}>♫ {track.name}<span>{time(track.start)}–{time(track.end)}</span></button>)}{selectedAudio && <div className="audio-track-inspector"><div><b>Canal selecionado</b><button onClick={removeAudioTrack}>Excluir</button></div><label>Volume · {selectedAudio.volume}%<input type="range" min="0" max="120" value={selectedAudio.volume} onChange={(event) => updateAudioTrack(selectedAudio.id, { volume: Number(event.target.value) })} /></label><label>Fade in · {selectedAudio.fadeIn.toFixed(1)}s<input type="range" min="0" max="3" step="0.1" value={selectedAudio.fadeIn} onChange={(event) => updateAudioTrack(selectedAudio.id, { fadeIn: Number(event.target.value) })} /></label><label>Fade out · {selectedAudio.fadeOut.toFixed(1)}s<input type="range" min="0" max="3" step="0.1" value={selectedAudio.fadeOut} onChange={(event) => updateAudioTrack(selectedAudio.id, { fadeOut: Number(event.target.value) })} /></label></div>}</div></details>}
          {clip && <details className="tool-disclosure"><summary>Transições</summary><div className="video-transition-controls">
            <small>Arraste uma transição para entrada, saída ou para a faixa de vídeo.</small>
            <div className="transition-shelf">
              <button draggable onDragStart={(event) => event.dataTransfer.setData("application/x-klip-transition", "fade-black")} onClick={() => applyTransition("fade-black", "in")}>◐ Fade preto</button>
              <button draggable onDragStart={(event) => event.dataTransfer.setData("application/x-klip-transition", "fade-white")} onClick={() => applyTransition("fade-white", "in")}>◐ Fade branco</button>
              <button draggable onDragStart={(event) => event.dataTransfer.setData("application/x-klip-transition", "none")} onClick={() => applyTransition("none", "in")}>⊘ Sem transição</button>
            </div>
            <div className="transition-drops">
              <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropTransition(event, "in")}><b>Entrada</b><span>{videoFadeIn ? `${transitionColor === "white" ? "Fade branco" : "Fade preto"} · ${videoFadeIn.toFixed(1)}s` : "Solte aqui"}</span></div>
              <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropTransition(event, "out")}><b>Saída</b><span>{videoFadeOut ? `${transitionColor === "white" ? "Fade branco" : "Fade preto"} · ${videoFadeOut.toFixed(1)}s` : "Solte aqui"}</span></div>
            </div>
          </div></details>}

          <div className="tool-heading layer-heading"><span>02</span><div><b>Ilustrações</b><small>Imagem ou vídeo por cima da conversa</small></div></div>
          <label className="editor-upload editor-illustration-upload">＋ Imagem ou vídeo<input type="file" accept="image/*,video/*" onChange={(event) => addIllustration(event.target.files?.[0])} /></label>
          <small className="illustration-help">Use para contextualizar enquanto o vídeo principal continua falando.</small>
          {!!illustrations.length && <div className="layer-list illustration-list">
            {illustrations.map((item, index) => (
              <button key={item.id} className={selectedIllustration?.id === item.id ? "selected" : ""} onClick={() => { setSelectedIllustrationId(item.id); setSelectedId(""); setSelectedAudioId(""); seek(Math.max(start, item.start)); }}>
                <b>{item.role === "scene" ? "CENA" : item.kind === "image" ? "IMG" : "VID"}</b><span>{item.name || `Ilustração ${index + 1}`}</span><small>{time(item.start)}–{time(item.end)}</small>
              </button>
            ))}
          </div>}
          {selectedIllustration && <div className="layer-inspector illustration-inspector">
            <div className="inspector-title"><b>Ilustração selecionada</b><div className="inspector-actions"><button onClick={duplicateIllustration}>Duplicar</button><button onClick={removeIllustration}>Excluir</button></div></div>
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
            <label className="subtitle-import">▤ Importar SRT<input type="file" accept=".srt,text/plain" onChange={(event) => void importSubtitles(event.target.files?.[0])} /></label>
          </div>
          <div className="layer-list">
            {layers.map((layer, index) => (
              <button key={layer.id} className={selected?.id === layer.id ? "selected" : ""} onClick={() => { setSelectedId(layer.id); setSelectedIllustrationId(""); setSelectedAudioId(""); seek(Math.max(start, layer.start)); }}>
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
                <label>Efeito<select value={selected.effect} onChange={(event) => updateLayer(selected.id, { effect: event.target.value as TextEffect })}><option value="none">Sem efeito</option><option value="pop">Pop</option><option value="zoom">Zoom</option><option value="bounce">Bounce</option><option value="slide">Deslizar</option><option value="typewriter">Máquina de escrever</option></select></label>
                <label>Fade in<input type="number" min="0" max="3" step="0.1" value={selected.fadeIn} onChange={(event) => updateLayer(selected.id, { fadeIn: Math.max(0, Number(event.target.value)) })} /></label>
                <label>Fade out<input type="number" min="0" max="3" step="0.1" value={selected.fadeOut} onChange={(event) => updateLayer(selected.id, { fadeOut: Math.max(0, Number(event.target.value)) })} /></label>
              </div>
              <div className="emoji-row">{["🔥", "😂", "🎙️", "✨", "💥", "👀"].map((emoji) => <button key={emoji} onClick={() => updateLayer(selected.id, { text: `${selected.text} ${emoji}`.trim() })}>{emoji}</button>)}</div>
            </div>
          )}
          </>}
        </aside>

        <section className="editor-stage-wrap" id="klip-preview">
          {clip && <div className="stage-meta" style={{ width: `min(${Math.round(520 * previewScale)}px, 55vw)` }}><span>Prévia {exportAspect === "original" ? "original" : exportAspect === "vertical" ? "vertical · 9:16" : exportAspect === "landscape" ? "horizontal · 16:9" : "quadrada · 1:1"}</span><div><button onClick={() => setPreviewScale((value) => Math.max(.7, Number((value - .1).toFixed(1))))}>−</button><b>{Math.round(previewScale * 100)}%</b><button onClick={() => setPreviewScale((value) => Math.min(2, Number((value + .1).toFixed(1))))}>＋</button></div><b>{time(current)}</b></div>}
          <div className={`editor-stage preset-${visualPreset}`} style={{ width: `min(${Math.round(520 * previewScale)}px, 55vw)`, aspectRatio: exportAspect === "original" ? `${sourceAspect}` : exportAspect === "vertical" ? "9 / 16" : exportAspect === "landscape" ? "16 / 9" : "1 / 1" }}>
            {clip ? (
              <><video ref={video} className="transformable-video" src={clip.url} playsInline controls onPointerDown={beginVideoFrameDrag} onPointerMove={moveVideoFrameDrag} onPointerUp={() => { videoFrameDrag.current = null; }} onPointerCancel={() => { videoFrameDrag.current = null; }} style={{ transform: `translate(${videoTransform.x}%, ${videoTransform.y}%) scale(${Math.max(1, videoTransform.scale)})` }} onLoadedMetadata={(event) => setVideoDuration(event.currentTarget)} onDurationChange={(event) => { const value = event.currentTarget.duration; if (Number.isFinite(value) && value > 0) { setDuration(value); setEnd((old) => old || value); if (event.currentTarget.currentTime > value) event.currentTarget.currentTime = 0; } }} onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)} /><div className="video-layout-hint">Arraste o vídeo para enquadrar</div><div className="video-frame-resize vertical top" onPointerDown={(event) => beginVideoFrameResize(event, "vertical")} onPointerMove={moveVideoFrameResize} onPointerUp={() => { videoFrameResize.current = null; }} onPointerCancel={() => { videoFrameResize.current = null; }} title="Arraste para ajustar a altura do enquadramento">↕</div><div className="video-frame-resize vertical bottom" onPointerDown={(event) => beginVideoFrameResize(event, "vertical")} onPointerMove={moveVideoFrameResize} onPointerUp={() => { videoFrameResize.current = null; }} onPointerCancel={() => { videoFrameResize.current = null; }} title="Arraste para ajustar a altura do enquadramento">↕</div><div className="video-frame-resize" onPointerDown={beginVideoFrameResize} onPointerMove={moveVideoFrameResize} onPointerUp={() => { videoFrameResize.current = null; }} onPointerCancel={() => { videoFrameResize.current = null; }} title="Arraste para aumentar o zoom">↘</div><button className="reset-video-frame" onClick={() => setVideoTransform({ x: 0, y: 0, scale: 1 })}>↺ Enquadrar</button></>
            ) : (
              <div className="editor-empty"><small>Klip Studio</small><b>Comece pelo vídeo.</b><span>Importe uma gravação, vídeo ou foto para montar seu próximo reel.</span><label className="editor-empty-upload">＋ Importar mídia<input type="file" accept="video/*,image/*" onChange={(event) => void selectFile(event.target.files?.[0])} /></label><i>MP4, WebM, MOV, JPG, PNG e WebP</i></div>
            )}
            {audioTracks.map((track) => <audio key={track.id} ref={(element) => { if (element) audioElements.current.set(track.id, element); else audioElements.current.delete(track.id); }} src={track.url} preload="auto" />)}
            {clip && videoTransitionOpacity(current) > 0 && <div className="video-transition-overlay" style={{ opacity: videoTransitionOpacity(current), backgroundColor: transitionColor === "black" ? "#000" : "#fff" }} />}
            {clip && illustrations.map((item) => {
              if (layerOpacity(item, current) <= 0) return null;
              const common = {
                ref: (element: HTMLImageElement | HTMLVideoElement | null) => {
                  if (element) illustrationElements.current.set(item.id, element);
                  else illustrationElements.current.delete(item.id);
                },
              };
              return <div key={item.id} className={`illustration-overlay ${item.role === "scene" ? "scene-video-overlay" : ""} ${selectedIllustration?.id === item.id ? "selected-illustration" : ""}`} onPointerDown={(event) => beginIllustrationDrag(event, item)} onPointerMove={moveIllustrationDrag} onPointerUp={() => { illustrationDrag.current = null; illustrationResize.current = null; }} onPointerCancel={() => { illustrationDrag.current = null; illustrationResize.current = null; }} style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${item.size}%`, opacity: layerOpacity(item, current) }}>
                {item.kind === "image" ? <img {...common} src={item.url} alt="Ilustração" /> : <video {...common} src={item.url} muted autoPlay loop playsInline />}
                <small>{item.kind === "image" ? "Imagem" : "Vídeo"} · mover</small>
                {selectedIllustration?.id === item.id && <div className="illustration-resize-handle" onPointerDown={(event) => beginIllustrationResize(event, item)} onPointerMove={moveIllustrationResize} onPointerUp={() => { illustrationResize.current = null; }} onPointerCancel={() => { illustrationResize.current = null; }} aria-label="Redimensionar camada">↘</div>}
              </div>;
            })}
            {clip && layers.map((layer) => {
              const text = visibleText(layer, current);
              if (!text || layerOpacity(layer, current) <= 0) return null;
              return <div key={layer.id} className={`caption-overlay ${selected?.id === layer.id ? "selected-layer" : ""} ${layer.background ? "with-background" : ""}`} onPointerDown={(event) => beginLayerDrag(event, layer)} onPointerMove={moveLayerDrag} onPointerUp={() => { layerDrag.current = null; }} onPointerCancel={() => { layerDrag.current = null; }} style={previewStyle(layer)}><span>{text}</span><small>Arraste</small></div>;
            })}
            {safeGuides && exportAspect === "vertical" && <div className="safe-area-guides" aria-label="Área segura para TikTok, Reels e Shorts"><i /><span>Área segura</span></div>}
          </div>
          <p className="stage-help">Arraste o vídeo para reposicionar e use o canto ↘ para redimensionar. Textos e ilustrações também são arrastáveis. O resultado exportado segue esta prévia.</p>
          {notice && <p className="editor-notice">{notice}</p>}
        </section>
      </section>

      <section className={`timeline-panel multi-timeline ${clip ? "" : "empty-timeline"}`} id="klip-timeline">
        <div className="timeline-top">
          <div><b>Linha do tempo</b><span>{clip ? `Corte ${time(start)} — ${time(end)} · duração ${time(Math.max(0, end - start))}` : "Importe um vídeo ou foto para começar"}</span></div>
          <button disabled={!history.current.length} onClick={undo} title="Desfazer">↶ Desfazer</button>
          <button disabled={!future.current.length} onClick={redo} title="Refazer">↷ Refazer</button>
          <label className="timeline-zoom">Zoom {timelineZoom.toFixed(1)}×<input type="range" min="1" max="3" step="0.1" value={timelineZoom} onChange={(event) => setTimelineZoom(Number(event.target.value))} /></label>
          <button className="timeline-play-toggle" disabled={!clip} onClick={() => void togglePreviewPlayback()}>{isPlaying ? "Ⅱ Pausar" : "▶ Reproduzir"}</button>
          <button className={snapEnabled ? "selected" : ""} onClick={() => setSnapEnabled((value) => !value)} title="Encaixa o cursor nos cortes, camadas e marcadores">⌁ Ímã</button>
          <details className="timeline-more"><summary>••• Mais</summary><div><button className={safeGuides ? "selected" : ""} onClick={() => setSafeGuides((value) => !value)}>▣ Área segura</button><button disabled={!clip} onClick={addMarker} title="Adiciona um marcador no cursor">◆ Marcador</button><button disabled={!clip} onClick={trimAtPlayhead} title="Move a ponta mais próxima do corte para o cursor atual">✂ Cortar no cursor</button><button disabled={!clip} onClick={() => markCut("start")}>◀ Começar aqui</button><button disabled={!clip} onClick={() => markCut("end")}>Terminar aqui ▶</button><button disabled={!clip} onClick={() => seek(start)}>↶ Início</button></div></details>
        </div>
        {!clip && <p className="empty-timeline-message">A timeline aparece aqui assim que você importar a primeira mídia.</p>}
        <div className="timeline-ruler">{Array.from({ length: 9 }, (_, index) => <i key={index}>{duration ? time((duration / 8) * index) : "00:00"}</i>)}</div>
        <div className="timeline-lanes" style={{ width: `${timelineZoom * 100}%` }} onDragOver={(event) => event.preventDefault()} onDrop={dropTransitionOnTimeline}>
          <div className="timeline-lane video-lane"><b>VÍDEO</b><div className="lane-track timeline-scrubber" onPointerDown={selectTimeFromTimeline} onPointerMove={moveTimelineTrim} onPointerUp={endTimelineTrim} onPointerCancel={endTimelineTrim} title="Clique para mover o cursor. Arraste as alças vermelhas para cortar."><div className="timeline-selection" style={{ left: duration ? `${(start / duration) * 100}%` : "0%", width: duration ? `${((end - start) / duration) * 100}%` : "0%" }} />{videoFadeIn > 0 && <button className="timeline-transition in" type="button" style={{ left: duration ? `${(videoFadeInAt / duration) * 100}%` : "0%", width: duration ? `${Math.max(4, (videoFadeIn / duration) * 100)}%` : "8%" }} onPointerDown={(event) => beginTransitionMove(event, "in")} onPointerMove={(event) => { moveTransitionPosition(event); moveTransitionResize(event); }} onPointerUp={() => { endTransitionMove(); endTransitionResize(); }} onPointerCancel={() => { endTransitionMove(); endTransitionResize(); }} onDoubleClick={(event) => { event.stopPropagation(); applyTransition("none", "in"); }} title="Arraste o bloco para reposicionar. Arraste a alça no fim para mudar a duração. Clique duas vezes para remover.">↘ Fade {transitionColor === "white" ? "branco" : "preto"}<i className="transition-grip" onPointerDown={(event) => beginTransitionResize(event, "in")}>↔</i></button>}{videoFadeOut > 0 && <button className="timeline-transition out" type="button" style={{ left: duration ? `${(videoFadeOutAt / duration) * 100}%` : "92%", width: duration ? `${Math.max(4, (videoFadeOut / duration) * 100)}%` : "8%" }} onPointerDown={(event) => beginTransitionMove(event, "out")} onPointerMove={(event) => { moveTransitionPosition(event); moveTransitionResize(event); }} onPointerUp={() => { endTransitionMove(); endTransitionResize(); }} onPointerCancel={() => { endTransitionMove(); endTransitionResize(); }} onDoubleClick={(event) => { event.stopPropagation(); applyTransition("none", "out"); }} title="Arraste o bloco para reposicionar. Arraste a alça no fim para mudar a duração. Clique duas vezes para remover.">{transitionColor === "white" ? "Fade branco" : "Fade preto"}<i className="transition-grip" onPointerDown={(event) => beginTransitionResize(event, "out")}>↔</i></button>}<button type="button" className="cut-marker start-marker" aria-label="Arrastar início do corte" onPointerDown={(event) => beginTimelineTrim(event, "start")} style={{ left: duration ? `${(start / duration) * 100}%` : "0%" }}><span>{time(start)}</span></button><button type="button" className="cut-marker end-marker" aria-label="Arrastar fim do corte" onPointerDown={(event) => beginTimelineTrim(event, "end")} style={{ left: duration ? `${(end / duration) * 100}%` : "100%" }}><span>{time(end)}</span></button></div></div>
          <div className="timeline-lane audio-lane"><b>ÁUDIO</b><div className="lane-track waveform-track" onPointerDown={selectTimeFromTimeline} title="Forma de onda do áudio. Clique para posicionar o cursor.">{waveform.length ? waveform.map((value, index) => <i key={index} style={{ height: `${Math.max(12, value * 100)}%` }} />) : <span>Importe um vídeo com áudio para analisar a forma de onda</span>}{markers.map((marker) => <button type="button" key={marker} className="timeline-marker" style={{ left: duration ? `${(marker / duration) * 100}%` : "0%" }} onClick={(event) => { event.stopPropagation(); seek(marker); }} title={`Marcador ${time(marker)}`} />)}</div></div>
          {audioTracks.map((track, index) => (
            <div className={`timeline-lane audio-layer ${selectedAudio?.id === track.id ? "selected" : ""}`} key={track.id} onClick={() => { setSelectedAudioId(track.id); setSelectedId(""); setSelectedIllustrationId(""); seek(Math.max(start, track.start)); }} onContextMenu={(event) => openContextMenu(event, "audio", track.id)}>
              <b>♫ {index + 1}</b><div className="lane-track"><button className="audio-clip timeline-item-clip" style={{ left: duration ? `${(track.start / duration) * 100}%` : "0%", width: duration ? `${Math.max(2, ((track.end - track.start) / duration) * 100)}%` : "10%" }} onPointerDown={(event) => beginTimelineItemDrag(event, "audio", track.id, "move", track.start, track.end)} onPointerMove={moveTimelineItemDrag} onPointerUp={endTimelineItemDrag} onPointerCancel={endTimelineItemDrag}>
                <i className="timeline-clip-handle start" onPointerDown={(event) => beginTimelineItemDrag(event, "audio", track.id, "start", track.start, track.end)} /><i className="clip-fade-handle in" onPointerDown={(event) => beginTimelineFadeDrag(event, "audio", track.id, "in", track.fadeIn)} onPointerMove={moveTimelineFadeDrag} onPointerUp={endTimelineFadeDrag} onPointerCancel={endTimelineFadeDrag} />
                <span>{track.name}</span><i className="timeline-clip-meta">{track.volume}% · canal</i><i className="clip-fade-handle out" onPointerDown={(event) => beginTimelineFadeDrag(event, "audio", track.id, "out", track.fadeOut)} onPointerMove={moveTimelineFadeDrag} onPointerUp={endTimelineFadeDrag} onPointerCancel={endTimelineFadeDrag} /><i className="timeline-clip-handle end" onPointerDown={(event) => beginTimelineItemDrag(event, "audio", track.id, "end", track.start, track.end)} />
              </button></div>
            </div>
          ))}
          {illustrations.map((item, index) => (
            <div className={`timeline-lane illustration-lane ${selectedIllustration?.id === item.id ? "selected" : ""}`} key={item.id} onClick={() => { setSelectedIllustrationId(item.id); setSelectedId(""); setSelectedAudioId(""); seek(Math.max(start, item.start)); }} onContextMenu={(event) => openContextMenu(event, "illustration", item.id)}>
              <b>{item.role === "scene" ? `CENA ${index + 1}` : item.kind === "image" ? `IMG ${index + 1}` : `VID ${index + 1}`}</b><div className="lane-track"><button className="illustration-clip timeline-item-clip" style={{ left: duration ? `${(item.start / duration) * 100}%` : "0%", width: duration ? `${Math.max(1.5, ((item.end - item.start) / duration) * 100)}%` : "0%" }} onPointerDown={(event) => beginTimelineItemDrag(event, "illustration", item.id, "move", item.start, item.end)} onPointerMove={moveTimelineItemDrag} onPointerUp={endTimelineItemDrag} onPointerCancel={endTimelineItemDrag}><i className="timeline-clip-handle start" onPointerDown={(event) => beginTimelineItemDrag(event, "illustration", item.id, "start", item.start, item.end)} /><i className="clip-fade-handle in" onPointerDown={(event) => beginTimelineFadeDrag(event, "illustration", item.id, "in", item.fadeIn)} onPointerMove={moveTimelineFadeDrag} onPointerUp={endTimelineFadeDrag} onPointerCancel={endTimelineFadeDrag} /><span>{item.name || "Ilustração"}</span><i className="timeline-clip-meta">{item.role === "scene" ? "cena" : item.kind === "image" ? "imagem" : "vídeo"}</i><i className="clip-fade-handle out" onPointerDown={(event) => beginTimelineFadeDrag(event, "illustration", item.id, "out", item.fadeOut)} onPointerMove={moveTimelineFadeDrag} onPointerUp={endTimelineFadeDrag} onPointerCancel={endTimelineFadeDrag} /><i className="timeline-clip-handle end" onPointerDown={(event) => beginTimelineItemDrag(event, "illustration", item.id, "end", item.start, item.end)} /></button></div>
            </div>
          ))}
          {layers.map((layer, index) => (
            <div className={`timeline-lane ${selected?.id === layer.id ? "selected" : ""}`} key={layer.id} onClick={() => { setSelectedId(layer.id); setSelectedIllustrationId(""); setSelectedAudioId(""); seek(Math.max(start, layer.start)); }} onContextMenu={(event) => openContextMenu(event, "text", layer.id)}>
              <b>T{index + 1}</b><div className="lane-track"><button className="text-clip timeline-item-clip" style={{ left: duration ? `${(layer.start / duration) * 100}%` : "0%", width: duration ? `${Math.max(1.5, ((layer.end - layer.start) / duration) * 100)}%` : "0%" }} onPointerDown={(event) => beginTimelineItemDrag(event, "text", layer.id, "move", layer.start, layer.end)} onPointerMove={moveTimelineItemDrag} onPointerUp={endTimelineItemDrag} onPointerCancel={endTimelineItemDrag}><i className="timeline-clip-handle start" onPointerDown={(event) => beginTimelineItemDrag(event, "text", layer.id, "start", layer.start, layer.end)} /><i className="clip-fade-handle in" onPointerDown={(event) => beginTimelineFadeDrag(event, "text", layer.id, "in", layer.fadeIn)} onPointerMove={moveTimelineFadeDrag} onPointerUp={endTimelineFadeDrag} onPointerCancel={endTimelineFadeDrag} /><span>{layer.text || "Texto"}</span><i className="timeline-clip-meta">{layer.effect !== "none" ? layer.effect : "texto"}</i><i className="clip-fade-handle out" onPointerDown={(event) => beginTimelineFadeDrag(event, "text", layer.id, "out", layer.fadeOut)} onPointerMove={moveTimelineFadeDrag} onPointerUp={endTimelineFadeDrag} onPointerCancel={endTimelineFadeDrag} /><i className="timeline-clip-handle end" onPointerDown={(event) => beginTimelineItemDrag(event, "text", layer.id, "end", layer.start, layer.end)} /></button></div>
            </div>
          ))}
          <button type="button" className="global-playhead" aria-label={`Cursor em ${time(current)}`} style={{ left: duration ? `calc(74px + (100% - 74px) * ${current / duration})` : "74px" }} onPointerDown={beginPlayheadDrag} onPointerMove={movePlayheadDrag} onPointerUp={endPlayheadDrag} onPointerCancel={endPlayheadDrag} />
          {snapGuide !== null && <i className="timeline-snap-guide" style={{ left: `calc(74px + (100% - 74px) * ${snapGuide / Math.max(duration, .01)})` }}><span>{time(snapGuide)}</span></i>}
        </div>
        <div className="cut-controls editor-time-controls">
          <p className="timeline-trim-help"><b>{selected ? `T${layers.findIndex((layer) => layer.id === selected.id) + 1}` : selectedIllustration ? selectedIllustration.kind === "image" ? "Imagem" : "Vídeo" : selectedAudio ? "Áudio" : "Edição direta"}</b><span>{selected ? selected.text : selectedIllustration ? selectedIllustration.name : selectedAudio ? selectedAudio.name : "Selecione e arraste um clipe na linha do tempo."}</span></p>
          {(selected || selectedIllustration || selectedAudio) && <p className="timeline-shortcuts">Arraste o bloco para mover · arraste as pontas para cortar · <kbd>Del</kbd> remover · <kbd>Ctrl D</kbd> duplicar · <kbd>Espaço</kbd> reproduzir</p>}
        </div>
      </section>
      {contextMenu && <div className="timeline-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onMouseLeave={closeContextMenu}>
        <button onClick={() => { duplicateSelected(); closeContextMenu(); }}>⧉ Duplicar</button>
        <button onClick={() => { copySelected(); closeContextMenu(); }}>⌘ Copiar</button>
        {contextMenu.kind !== "audio" && <><button onClick={() => moveSelectedLayer("front")}>⇧ Trazer para frente</button><button onClick={() => moveSelectedLayer("back")}>⇩ Enviar para trás</button></>}
        <button className="danger" onClick={() => { deleteSelected(); closeContextMenu(); }}>⌫ Excluir</button>
      </div>}
    </main>
  );
}
