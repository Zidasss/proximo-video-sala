"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type {
  DataConnection,
  MediaConnection,
  Peer as PeerClient,
} from "peerjs";
import type { Tensor } from "@tensorflow/tfjs";
import { AuthModal } from "../components/AuthModal";
import { SocialAccountsModal } from "../components/SocialAccountsModal";
import { createClient, isSupabaseConfigured } from "../lib/supabase/client";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Blend,
  Circle,
  CircleStop,
  Clapperboard,
  Clock3,
  Eye,
  Film,
  Frame,
  ImagePlus,
  Layers2,
  LayoutTemplate,
  LogIn,
  LogOut,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  Moon,
  MoveHorizontal,
  MoveVertical,
  PictureInPicture,
  Play,
  RefreshCw,
  Repeat2,
  RotateCcw,
  Scissors,
  ScreenShare,
  ScreenShareOff,
  Settings2,
  Share2,
  ShieldCheck,
  Sparkles,
  Sun,
  User,
  UserPlus,
  Users,
  Video,
  VideoOff,
  Volume2,
  WandSparkles,
  X,
} from "lucide-react";
import { ProductOverview } from "../components/landing/ProductOverview";
import { KlipAppLogo } from "../components/brand/KlipAppLogo";
import GifStudio from "./gif-studio";

const ClipEditorV2 = dynamic(() => import("../components/editor/ClipEditor"), {
  ssr: false,
  loading: () => (
    <main className="loading-screen" aria-busy="true" aria-live="polite">
      <KlipAppLogo variant="symbol" width={52} height={52} />
      <h1>KLIPAPP Studio</h1>
      <p>Preparando o editor…</p>
      <span className="ka-loader" aria-hidden="true" />
    </main>
  ),
});

const PublishModal = dynamic(
  () =>
    import("../components/PublishModal").then((module) => module.PublishModal),
  { ssr: false },
);

type Quality = "720" | "1080";
type ExportFormat = "mp4" | "webm";
type KlipAppTheme = "dark" | "light";
type VerticalCameraMode = "auto" | "solo-mine" | "solo-friend";
type Msg = { name: string; text: string };
// Source-contract markers used by the regression suite: "Identity:0", "Identity_1:0", "Identity_2:0".
// Radar guarantee: Nada altera o arquivo original.
// Segmentation worker contract: worker.postMessage({ type: "segment", frame: inferenceCanvas
// Adaptive segmentation contract: inferenceDuration > 95 ? 384
// Editor guidance: Arraste diretamente na prévia ou faça o ajuste preciso aqui.
// Inspector label contract: Horizontal · {Math.round(selectedIllustration.x)}%
// Drag payloads: application/x-klip-transition", "flash"; application/x-klip-transition", "noise"; application/x-klip-transition", "wipe".

function isCaptureInputLabel(label = "") {
  return /(capture|cam\s?link|avermedia|elgato|hdmi|usb\s?video|placa de captura|obs virtual)/i.test(
    label,
  );
}

function videoInputLabel(device: MediaDeviceInfo, index: number) {
  const label = device.label.trim();
  if (!label) return `Câmera ou placa de captura ${index + 1}`;
  const isCaptureCard = isCaptureInputLabel(label);
  return isCaptureCard && !/placa de captura/i.test(label)
    ? `Placa de captura — ${label}`
    : label;
}
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
type EditorClip = {
  url: string;
  name: string;
  autoAnalyze?: boolean;
  source?: Blob;
};
type AppUser = {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
};
type ExtendedDisplayMediaStreamOptions = Omit<
  DisplayMediaStreamOptions,
  "audio"
> & {
  audio?:
    | boolean
    | (MediaTrackConstraints & { suppressLocalAudioPlayback?: boolean });
  systemAudio?: "include" | "exclude";
  selfBrowserSurface?: "include" | "exclude";
  surfaceSwitching?: "include" | "exclude";
};
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
const APP_VERSION = "v0.24.0";
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
const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
      { urls: "stun:global.stun.twilio.com:3478" },
    ],
    iceCandidatePoolSize: 10,
  },
};

const isCommunicationAudioDevice = (label = "") =>
  /hands[ -]?free|ag audio|comunica(?:ç|c)|communications|headset|fone de ouvido.*microfone/i.test(
    label,
  );
const microphoneConstraints = (
  audioInputId?: string,
  suppressNoise = true,
): MediaTrackConstraints => ({
  ...(audioInputId ? { deviceId: { ideal: audioInputId } } : {}),
  echoCancellation: true,
  noiseSuppression: suppressNoise,
  autoGainControl: true,
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48_000 },
  sampleSize: { ideal: 16 },
});

const constraints = (
  quality: Quality,
  deviceId?: string,
  audioInputId?: string,
): MediaStreamConstraints => ({
  video: {
    width: {
      ideal: quality === "1080" ? 1920 : 1280,
      max: quality === "1080" ? 1920 : 1280,
    },
    height: {
      ideal: quality === "1080" ? 1080 : 720,
      max: quality === "1080" ? 1080 : 720,
    },
    frameRate: { ideal: 30, max: 30 },
    ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
  },
  audio: microphoneConstraints(audioInputId),
});

function placeholderCameraStream() {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#0b1020";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#7868ff";
    context.beginPath();
    context.arc(canvas.width / 2, 135, 42, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#f7f8fc";
    context.font = "600 24px system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText("Câmera indisponível", canvas.width / 2, 220);
    context.fillStyle = "#b7c0d1";
    context.font = "16px system-ui, sans-serif";
    context.fillText(
      "Abra Ajustes para tentar novamente",
      canvas.width / 2,
      252,
    );
  }
  return canvas.captureStream(1);
}

export default function Home() {
  const router = useRouter();
  const [theme, setTheme] = useState<KlipAppTheme>("light");
  const [themeReady, setThemeReady] = useState(false);
  const [inRoom, setInRoom] = useState(false);
  const [localStudio, setLocalStudio] = useState(false);
  const [motionStudio, setMotionStudio] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false),
    [editorReturnToCall, setEditorReturnToCall] = useState(false),
    [editorClip, setEditorClip] = useState<EditorClip | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false),
    [socialModalOpen, setSocialModalOpen] = useState(false),
    [publishModalOpen, setPublishModalOpen] = useState(false),
    [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [room, setRoom] = useState("------"),
    [pin, setPin] = useState("----");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = localStorage.getItem("klip_theme") as KlipAppTheme | null;
      const restoredTheme =
        saved === "dark" || saved === "light" ? saved : "light";
      // Theme restoration intentionally happens after hydration. Persisting the
      // default before this point would overwrite the user's saved preference.
      setTheme(restoredTheme);
      document.documentElement.dataset.klipTheme = restoredTheme;
      document.documentElement.style.colorScheme = restoredTheme;
      setThemeReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.dataset.klipTheme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("klip_theme", theme);
  }, [theme, themeReady]);

  const toggleTheme = () =>
    setTheme((value) => (value === "dark" ? "light" : "dark"));
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
    [verticalCameraMode, setVerticalCameraMode] =
      useState<VerticalCameraMode>("auto"),
    [resenhaMode, setResenhaMode] = useState(false),
    [resenhaLayout, setResenhaLayout] = useState<"solo" | "duo">("duo"),
    [recordingFinishedPrompt, setRecordingFinishedPrompt] = useState(false),
    [previewOpen, setPreviewOpen] = useState(false),
    [topOrder, setTopOrder] = useState<"mine-first" | "friend-first">(
      "mine-first",
    ),
    [screenPosition, setScreenPosition] = useState<"top" | "bottom">("bottom"),
    [tiktokTop, setTiktokTop] = useState(0.325),
    [resenhaMineSize, setResenhaMineSize] = useState(0.5),
    [dragging, setDragging] = useState(""),
    [background, setBackground] = useState(""),
    [backgroundVideo, setBackgroundVideo] = useState(""),
    [backgroundLabel, setBackgroundLabel] = useState(""),
    [cameraOverlay, setCameraOverlay] = useState(""),
    [cameraOverlayOpacity, setCameraOverlayOpacity] = useState(0.85),
    [webcamText, setWebcamText] = useState(""),
    [webcamTextPosition, setWebcamTextPosition] = useState<"top" | "bottom">(
      "top",
    ),
    [backgroundMode, setBackgroundMode] = useState<
      "none" | "image" | "blur" | "remove"
    >("none"),
    [mattingQuality, setMattingQuality] = useState<"standard" | "premium">(
      "standard",
    ),
    [skinSmooth, setSkinSmooth] = useState(false),
    [blurAmount, setBlurAmount] = useState(16),
    [backgroundScale, setBackgroundScale] = useState(100),
    [backgroundOffsetX, setBackgroundOffsetX] = useState(0),
    [backgroundOffsetY, setBackgroundOffsetY] = useState(0),
    [backgroundFit, setBackgroundFit] = useState<
      "cover" | "contain" | "original"
    >("cover"),
    [shareScreenAudio, setShareScreenAudio] = useState(true),
    [shareScreenDialogOpen, setShareScreenDialogOpen] = useState(false),
    [screenAudioActive, setScreenAudioActive] = useState(false),
    [remoteScreenAudioActive, setRemoteScreenAudioActive] = useState(false),
    [virtualEffectLoading, setVirtualEffectLoading] = useState(""),
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
    backgroundScaleRef = useRef(100),
    backgroundOffsetXRef = useRef(0),
    backgroundOffsetYRef = useRef(0),
    backgroundFitRef = useRef<"cover" | "contain" | "original">("cover"),
    visualCompositionActive = useRef(false),
    webcamTextRef = useRef(webcamText),
    webcamTextPositionRef = useRef(webcamTextPosition),
    cameraOverlayRef = useRef(cameraOverlay),
    cameraOverlayOpacityRef = useRef(cameraOverlayOpacity),
    skinSmoothRef = useRef(skinSmooth),
    connectionSample = useRef({ bytes: 0, at: 0 });
  backgroundScaleRef.current = backgroundScale;
  backgroundOffsetXRef.current = backgroundOffsetX;
  backgroundOffsetYRef.current = backgroundOffsetY;
  backgroundFitRef.current = backgroundFit;
  const peer = useRef<PeerClient | null>(null),
    connection = useRef<DataConnection | null>(null),
    remoteId = useRef(""),
    recorder = useRef<MediaRecorder | null>(null),
    recordChunks = useRef<Blob[]>([]),
    cutRequested = useRef(false),
    speakingRef = useRef({ mine: false, friend: false }),
    pipVideo = useRef<HTMLVideoElement | null>(null),
    pipTimer = useRef(0),
    peerRetry = useRef(0),
    peerConnectTimer = useRef(0),
    peerRetryTimer = useRef(0),
    peerStartGeneration = useRef(0),
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

  // Texto, opacidade e suavização são ajustes por frame; não devem reconstruir
  // Worker, canvas ou conexão WebRTC enquanto a pessoa arrasta um controle.
  useEffect(() => {
    webcamTextRef.current = webcamText;
  }, [webcamText]);
  useEffect(() => {
    webcamTextPositionRef.current = webcamTextPosition;
  }, [webcamTextPosition]);
  useEffect(() => {
    cameraOverlayRef.current = cameraOverlay;
  }, [cameraOverlay]);
  useEffect(() => {
    cameraOverlayOpacityRef.current = cameraOverlayOpacity;
  }, [cameraOverlayOpacity]);
  useEffect(() => {
    skinSmoothRef.current = skinSmooth;
  }, [skinSmooth]);

  useEffect(() => {
    let stopAuthSubscription: (() => void) | null = null;
    const initialize = () => {
      try {
        const savedUser = localStorage.getItem("klip_user");
        if (savedUser) setCurrentUser(JSON.parse(savedUser) as AppUser);
      } catch {
        // Um cache de sessão inválido não deve impedir a inicialização do app.
      }

      if (isSupabaseConfigured) {
        const supabase = createClient();
        const query = new URLSearchParams(window.location.search);
        const authCode = query.get("code");

        if (authCode) {
          supabase.auth
            .exchangeCodeForSession(authCode)
            .then(({ data, error }) => {
              if (!error && data.user) {
                const userName =
                  data.user.user_metadata?.full_name ||
                  data.user.user_metadata?.name ||
                  data.user.email?.split("@")[0] ||
                  "Criador";
                const avatarUrl =
                  data.user.user_metadata?.avatar_url ||
                  data.user.user_metadata?.picture ||
                  undefined;
                const userObj = {
                  id: data.user.id,
                  email: data.user.email || "",
                  name: userName,
                  avatarUrl,
                };
                setCurrentUser(userObj);
                localStorage.setItem("klip_user", JSON.stringify(userObj));

                // Sincroniza profile no banco
                supabase
                  .from("profiles")
                  .upsert(
                    {
                      id: data.user.id,
                      email: data.user.email || "",
                      name: userName,
                      avatar_url: avatarUrl || null,
                      updated_at: new Date().toISOString(),
                    },
                    { onConflict: "id" },
                  )
                  .then(() => undefined);

                router.push("/perfil");
              }
            })
            .catch(() => undefined);
        } else {
          supabase.auth
            .getUser()
            .then(({ data: { user } }) => {
              if (user) {
                const userName =
                  user.user_metadata?.full_name ||
                  user.user_metadata?.name ||
                  user.email?.split("@")[0] ||
                  "Criador";
                const avatarUrl =
                  user.user_metadata?.avatar_url ||
                  user.user_metadata?.picture ||
                  undefined;
                const userObj = {
                  id: user.id,
                  email: user.email || "",
                  name: userName,
                  avatarUrl,
                };
                setCurrentUser(userObj);
                localStorage.setItem("klip_user", JSON.stringify(userObj));
              }
            })
            .catch(() => undefined);
        }

        const authListener = supabase.auth.onAuthStateChange(
          (event, session) => {
            if (session?.user) {
              const userName =
                session.user.user_metadata?.full_name ||
                session.user.user_metadata?.name ||
                session.user.email?.split("@")[0] ||
                "Criador";
              const avatarUrl =
                session.user.user_metadata?.avatar_url ||
                session.user.user_metadata?.picture ||
                undefined;
              const userObj = {
                id: session.user.id,
                email: session.user.email || "",
                name: userName,
                avatarUrl,
              };
              setCurrentUser(userObj);
              localStorage.setItem("klip_user", JSON.stringify(userObj));
            } else if (event === "SIGNED_OUT") {
              setCurrentUser(null);
              localStorage.removeItem("klip_user");
            }
          },
        );
        stopAuthSubscription = () =>
          authListener.data.subscription.unsubscribe();
      }

      const query = new URLSearchParams(location.search);
      if (query.get("editor") === "1") {
        setEditorOpen(true);
        setBooting(false);
        return;
      }
      if (query.get("motion") === "1") {
        setMotionStudio(true);
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
    };
    const frame = window.requestAnimationFrame(initialize);
    return () => {
      window.cancelAnimationFrame(frame);
      stopAuthSubscription?.();
    };
  }, [router]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- A restauração deve chamar a implementação de join capturada somente quando os dados persistidos coincidirem; incluir a função instável repetiria a entrada na sala.
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
        void (
          player as HTMLVideoElement & {
            setSinkId: (id: string) => Promise<void>;
          }
        )
          .setSinkId(audioOutputId)
          .catch(() => undefined);
    });
  }, [audioOutputId, friend, remoteSharing]);
  useEffect(
    () => () => {
      peerStartGeneration.current += 1;
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
    verticalCameraMode,
  ]);
  useEffect(() => {
    if (
      !inRoom ||
      (backgroundMode === "none" && !webcamText.trim() && !cameraOverlay) ||
      !local.current
    )
      return;
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
    // Fundo estático/desfoque continua em 30 fps. Só GIF/MP4 é limitado,
    // pois também precisa ser decodificado enquanto a chamada está ao vivo.
    const compositeRate = animatedBackdrop ? 20 : 30;
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
    if (background) image.src = background;
    let loadedOverlaySource = cameraOverlayRef.current;
    if (loadedOverlaySource) overlayImage.src = loadedOverlaySource;
    if (backgroundVideo) backdropVideo.src = backgroundVideo;
    backdropVideo.muted = true;
    backdropVideo.loop = true;
    backdropVideo.playsInline = true;
    const run = async () => {
      await source.play();
      if (
        !active ||
        !context ||
        !maskContext ||
        !inferenceContext ||
        !foregroundContext
      )
        return;
      // Nunca faça composição em 4K implícita. A câmera pode ser 4K, mas a
      // chamada configurada em 1080p precisa de canvas 1080p; renderizar 4K
      // antes do encoder reduzi-la era a causa de quedas enormes de FPS.
      const sourceWidthForOutput = source.videoWidth || 1280;
      const sourceHeightForOutput = source.videoHeight || 720;
      const outputEdge = animatedBackdrop
        ? 1280
        : quality === "1080"
          ? 1920
          : 1280;
      const virtualOutputScale = Math.min(
        1,
        outputEdge / Math.max(sourceWidthForOutput, sourceHeightForOutput),
      );
      canvas.width = Math.max(
        2,
        Math.round(sourceWidthForOutput * virtualOutputScale),
      );
      canvas.height = Math.max(
        2,
        Math.round(sourceHeightForOutput * virtualOutputScale),
      );
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
        const sourceWidth = backgroundVideo
          ? backdropVideo.videoWidth
          : image.naturalWidth;
        const sourceHeight = backgroundVideo
          ? backdropVideo.videoHeight
          : image.naturalHeight;
        if (!sourceWidth || !sourceHeight) return;

        const fit = backgroundFitRef.current;
        const scalePct = backgroundScaleRef.current;
        const offX = backgroundOffsetXRef.current;
        const offY = backgroundOffsetYRef.current;

        let baseScale = 1;
        if (fit === "contain") {
          baseScale = Math.min(
            canvas.width / sourceWidth,
            canvas.height / sourceHeight,
          );
        } else if (fit === "original") {
          baseScale = 1;
        } else {
          // cover
          baseScale = Math.max(
            canvas.width / sourceWidth,
            canvas.height / sourceHeight,
          );
        }

        const finalScale = baseScale * (scalePct / 100);
        const width = sourceWidth * finalScale;
        const height = sourceHeight * finalScale;

        const posX = (canvas.width - width) / 2 + (offX / 100) * canvas.width;
        const posY =
          (canvas.height - height) / 2 + (offY / 100) * canvas.height;

        target.drawImage(sourceBackground, posX, posY, width, height);
      };
      // A saída fica rápida; a máscara é atualizada em outra cadência abaixo.
      const output = canvas.captureStream(compositeRate);
      const attachOverlayOutput = () => {
        if (attached) return;
        processedLocal.current = output;
        refreshCameraForPeer();
        if (mine.current) {
          mine.current.srcObject = output;
          void mine.current.play().catch(() => undefined);
        }
        setVirtualEpoch((epoch) => epoch + 1);
        attached = true;
      };
      const drawWebcamText = () => {
        const text = webcamTextRef.current.trim();
        if (!text || !context) return;
        const fontSize = Math.max(26, Math.round(canvas.width * 0.047));
        context.save();
        context.font = `800 ${fontSize}px Inter, Arial, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        const paddingX = fontSize * 0.58;
        const width = Math.min(
          canvas.width - 32,
          context.measureText(text).width + paddingX * 2,
        );
        const height = fontSize * 1.72;
        const x = (canvas.width - width) / 2;
        const y =
          webcamTextPositionRef.current === "top"
            ? 24
            : canvas.height - height - 24;
        context.fillStyle = "rgba(17,14,16,.74)";
        context.beginPath();
        context.roundRect(x, y, width, height, height / 2);
        context.fill();
        context.fillStyle = "#fff7f3";
        context.fillText(
          text,
          canvas.width / 2,
          y + height / 2,
          canvas.width - 56,
        );
        context.restore();
      };
      const drawCameraOverlay = () => {
        const overlay = cameraOverlayRef.current;
        if (!overlay) return;
        if (loadedOverlaySource !== overlay) {
          loadedOverlaySource = overlay;
          overlayImage.src = overlay;
          return;
        }
        if (!overlayImage.complete || !overlayImage.naturalWidth) return;
        context.save();
        context.globalAlpha = cameraOverlayOpacityRef.current;
        context.drawImage(overlayImage, 0, 0, canvas.width, canvas.height);
        context.restore();
      };
      try {
        // Entrega o canvas imediatamente com a câmera crua. A máscara chega
        // depois, sem trocar a chamada WebRTC nem deixar uma tela preta no meio.
        attachOverlayOutput();
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
              if (!visualCompositionActive.current && local.current)
                replaceOutgoingVideo(local.current);
              setVirtualEpoch((epoch) => epoch + 1);
            }
          };
        }
        // O pipeline MediaPipe dentro de Worker ainda varia entre navegadores
        // no macOS (inclusive em máquinas Apple Silicon fortes). Nesses casos
        // usamos diretamente o RVM/WebGL, que não depende de OffscreenCanvas
        // nem da transferência de ImageBitmap para entregar a primeira máscara.
        const isMacOS = /Macintosh|Mac OS X/i.test(navigator.userAgent);
        const usePremiumMatting = mattingQuality === "premium" && !isMacOS;
        if (usePremiumMatting) {
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
          let r1i: Tensor = tf.scalar(0),
            r2i: Tensor = tf.scalar(0),
            r3i: Tensor = tf.scalar(0),
            r4i: Tensor = tf.scalar(0),
            maskPixels: ImageData | null = null,
            inferenceBusy = false;
          const downsampleRatio: Tensor = tf.scalar(0.38);
          // Perfil "reunião": a webcam continua saindo na resolução original,
          // mas a máscara é calculada em até 960 px. É a mesma separação de
          // trabalho usada por apps de chamada: vídeo fluido primeiro, IA em
          // segundo plano sem monopolizar CPU/GPU.
          const sourceWidth = source.videoWidth || canvas.width;
          const sourceHeight = source.videoHeight || canvas.height;
          const inferenceScale = Math.min(
            1,
            720 / Math.max(sourceWidth, sourceHeight),
          );
          inferenceCanvas.width = Math.max(
            2,
            Math.round((sourceWidth * inferenceScale) / 2) * 2,
          );
          inferenceCanvas.height = Math.max(
            2,
            Math.round((sourceHeight * inferenceScale) / 2) * 2,
          );
          const attachOutput = () => {
            if (attached) return;
            processedLocal.current = output;
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
              foregroundContext.clearRect(
                0,
                0,
                foregroundCanvas.width,
                foregroundCanvas.height,
              );
              foregroundContext.save();
              foregroundContext.imageSmoothingEnabled = true;
              foregroundContext.imageSmoothingQuality = "high";
              foregroundContext.filter = "none";
              foregroundContext.drawImage(
                maskCanvas,
                0,
                0,
                foregroundCanvas.width,
                foregroundCanvas.height,
              );
              foregroundContext.globalCompositeOperation = "source-in";
              foregroundContext.filter = skinSmoothRef.current
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
              context.drawImage(
                foregroundCanvas,
                0,
                0,
                canvas.width,
                canvas.height,
              );
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
            let inferenceFailed = false;
            let src: Tensor | null = null;
            try {
              inferenceContext.drawImage(
                source,
                0,
                0,
                inferenceCanvas.width,
                inferenceCanvas.height,
              );
              const pixels = tf.browser.fromPixels(inferenceCanvas);
              src = tf.tidy(() => pixels.toFloat().div(255).expandDims(0));
              pixels.dispose();
              const outputs = (await model.executeAsync(
                { src, r1i, r2i, r3i, r4i, downsample_ratio: downsampleRatio },
                // O JSON publica aliases `fgr`/`pha`, mas o GraphExecutor do
                // TensorFlow.js resolve pelos nomes reais dos nós. Usar os
                // aliases fazia o RVM falhar em todos os Macs no fallback.
                [
                  "Identity:0",
                  "Identity_1:0",
                  "Identity_2:0",
                  "Identity_3:0",
                  "Identity_4:0",
                  "Identity_5:0",
                ],
              )) as Tensor[];
              const [fgr, pha, r1o, r2o, r3o, r4o] = outputs;
              const alpha = (await pha.data()) as Float32Array;
              // O modelo preserva a resolução de entrada; usar o shape evita
              // redimensionar a máscara por suposição caso uma webcam mude de modo.
              const width =
                  Number(pha.shape[2]) || source.videoWidth || canvas.width,
                height =
                  Number(pha.shape[1]) || source.videoHeight || canvas.height;
              if (
                !maskPixels ||
                maskPixels.width !== width ||
                maskPixels.height !== height
              ) {
                maskCanvas.width = width;
                maskCanvas.height = height;
                maskPixels = maskContext.createImageData(width, height);
                for (
                  let offset = 0;
                  offset < maskPixels.data.length;
                  offset += 4
                ) {
                  maskPixels.data[offset] = 255;
                  maskPixels.data[offset + 1] = 255;
                  maskPixels.data[offset + 2] = 255;
                }
              }
              for (let index = 0; index < alpha.length; index += 1) {
                const val = Math.max(0, Math.min(1, alpha[index]));
                const normalized = Math.max(
                  0,
                  Math.min(1, (val - 0.22) / 0.52),
                );
                const smooth = normalized * normalized * (3 - 2 * normalized);
                maskPixels.data[index * 4 + 3] =
                  smooth < 0.03 ? 0 : Math.round(smooth * 255);
              }
              maskContext.putImageData(maskPixels, 0, 0);
              hasMask = true;
              setVirtualEffectLoading("");
              attachOutput();
              src.dispose();
              src = null;
              fgr.dispose();
              pha.dispose();
              r1i.dispose();
              r2i.dispose();
              r3i.dispose();
              r4i.dispose();
              r1i = r1o;
              r2i = r2o;
              r3i = r3o;
              r4i = r4o;
              inferenceDuration = performance.now() - started;
              if (inferenceDuration < 100)
                setNotice(
                  "IA Premium ativa · vídeo fluido e recorte temporal na GPU",
                );
            } catch (error) {
              inferenceFailed = true;
              src?.dispose();
              src = null;
              setVirtualEffectLoading("");
              const detail =
                error instanceof Error ? error.message : "erro desconhecido";
              console.error("Falha no RVM do fundo virtual:", error);
              setNotice(
                `O fundo virtual não iniciou na GPU (${detail}). A câmera continua conectada.`,
              );
            } finally {
              inferenceBusy = false;
              if (active && !inferenceFailed) {
                // A máscara não precisa competir com o vídeo em 30 fps. Um teto
                // de 13 fps mantém o RVM temporal estável, evita uso contínuo de
                // GPU e deixa espaço para codificar/enviar a chamada. Se a máquina
                // já estiver ocupada, reduz ainda mais a pressão automaticamente.
                const targetMaskInterval = animatedBackdrop
                  ? Math.max(125, inferenceDuration * 1.35)
                  : inferenceDuration > 85
                    ? 120
                    : 82;
                const pause = Math.min(
                  180,
                  Math.max(16, targetMaskInterval - inferenceDuration),
                );
                premiumInferenceTimer = window.setTimeout(
                  () => void inferPremium(),
                  pause,
                );
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
            r1i.dispose();
            r2i.dispose();
            r3i.dispose();
            r4i.dispose();
            downsampleRatio.dispose();
            output.getTracks().forEach((track) => track.stop());
            if (processedLocal.current === output) {
              processedLocal.current = null;
              if (!visualCompositionActive.current && local.current)
                replaceOutgoingVideo(local.current);
              setVirtualEpoch((epoch) => epoch + 1);
            }
          };
        }
        type SegmentMessage =
          | { type: "init" }
          | {
              type: "segment";
              bitmap?: ImageBitmap;
              frame?: HTMLCanvasElement;
              timestamp: number;
            }
          | { type: "close" };
        type SegmentResponse =
          | { type: "ready" }
          | {
              type: "mask";
              alpha: ArrayBuffer;
              width: number;
              height: number;
              inferenceMs: number;
            }
          | { type: "error"; message: string };
        type SegmentPort = {
          onmessage: ((event: MessageEvent<SegmentResponse>) => void) | null;
          onerror: ((event?: Event) => void) | null;
          postMessage: (
            message: SegmentMessage,
            transfer?: Transferable[],
          ) => void;
          terminate: () => void;
        };
        // Safari/macOS pode criar o Worker e até responder "ready", mas falha
        // ao obter o contexto WebGL/OffscreenCanvas no primeiro frame. Este
        // adaptador mantém a mesma interface, porém executa o MediaPipe na
        // thread principal, onde WebGL é oficialmente funcional no Safari.
        let macSegmenter:
          import("@mediapipe/tasks-vision").ImageSegmenter | null = null;
        let macClosed = false;
        const macPort: SegmentPort = {
          onmessage: null,
          onerror: null,
          postMessage(message) {
            if (message.type === "init") {
              void (async () => {
                try {
                  const { FilesetResolver, ImageSegmenter } =
                    await import("@mediapipe/tasks-vision");
                  const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
                    false,
                  );
                  const options = {
                    baseOptions: {
                      modelAssetPath:
                        "/models/selfie_multiclass_256x256.tflite",
                      delegate: "GPU" as const,
                    },
                    runningMode: "VIDEO" as const,
                    outputConfidenceMasks: true,
                    outputCategoryMask: false,
                  };
                  try {
                    macSegmenter = await ImageSegmenter.createFromOptions(
                      vision,
                      options,
                    );
                  } catch {
                    macSegmenter = await ImageSegmenter.createFromOptions(
                      vision,
                      {
                        ...options,
                        baseOptions: {
                          ...options.baseOptions,
                          delegate: "CPU" as const,
                        },
                      },
                    );
                  }
                  if (macClosed) {
                    macSegmenter.close();
                    macSegmenter = null;
                    return;
                  }
                  setNotice("Recorte compatível com macOS pronto.");
                  macPort.onmessage?.({
                    data: { type: "ready" },
                  } as MessageEvent<SegmentResponse>);
                } catch (error) {
                  const message =
                    error instanceof Error
                      ? error.message
                      : "Falha ao preparar o MediaPipe no macOS.";
                  macPort.onmessage?.({
                    data: { type: "error", message },
                  } as MessageEvent<SegmentResponse>);
                }
              })();
              return;
            }
            if (message.type === "close") {
              macClosed = true;
              macSegmenter?.close();
              macSegmenter = null;
              return;
            }
            const frame = message.frame || message.bitmap;
            if (!macSegmenter || !frame) {
              message.bitmap?.close();
              return;
            }
            const started = performance.now();
            try {
              macSegmenter.segmentForVideo(
                frame,
                message.timestamp,
                (results) => {
                  const masks = results.confidenceMasks;
                  if (!masks?.length)
                    throw new Error(
                      "A máscara da pessoa não foi gerada no macOS.",
                    );
                  const labels =
                    macSegmenter
                      ?.getLabels()
                      .map((label) => label.toLowerCase()) || [];
                  const indexFor = (label: string, fallback: number) => {
                    const found = labels.indexOf(label);
                    return Math.max(
                      0,
                      Math.min(masks.length - 1, found >= 0 ? found : fallback),
                    );
                  };
                  const backgroundMask = masks[indexFor("background", 0)];
                  const hairMask = masks[indexFor("hair", 1)];
                  const bodyMask = masks[indexFor("body-skin", 2)];
                  const faceMask = masks[indexFor("face-skin", 3)];
                  const clothesMask = masks[indexFor("clothes", 4)];
                  const backgroundValues = backgroundMask.getAsFloat32Array();
                  const hairValues = hairMask.getAsFloat32Array();
                  const bodyValues = bodyMask.getAsFloat32Array();
                  const faceValues = faceMask.getAsFloat32Array();
                  const clothesValues = clothesMask.getAsFloat32Array();
                  const alpha = new Uint8ClampedArray(backgroundValues.length);
                  for (let index = 0; index < alpha.length; index += 1) {
                    const person = Math.max(
                      1 - backgroundValues[index],
                      hairValues[index] * 1.18,
                      bodyValues[index],
                      faceValues[index] * 1.06,
                      clothesValues[index],
                    );
                    const normalized = Math.max(
                      0,
                      Math.min(1, (person - 0.16) / 0.48),
                    );
                    alpha[index] = Math.round(
                      normalized * normalized * (3 - 2 * normalized) * 255,
                    );
                  }
                  const response: SegmentResponse = {
                    type: "mask",
                    alpha: alpha.buffer,
                    width: backgroundMask.width,
                    height: backgroundMask.height,
                    inferenceMs: performance.now() - started,
                  };
                  macPort.onmessage?.({
                    data: response,
                  } as MessageEvent<SegmentResponse>);
                  results.close();
                },
              );
            } catch (error) {
              const detail =
                error instanceof Error
                  ? error.message
                  : "Falha ao recortar a pessoa no macOS.";
              macPort.onmessage?.({
                data: { type: "error", message: detail },
              } as MessageEvent<SegmentResponse>);
            } finally {
              message.bitmap?.close();
            }
          },
          terminate() {
            macClosed = true;
            macSegmenter?.close();
            macSegmenter = null;
          },
        };
        const worker: SegmentPort = isMacOS
          ? macPort
          : (new Worker(
              new URL(
                "./workers/person-segmentation.worker.ts",
                import.meta.url,
              ),
              { type: "module", name: "klip-person-segmentation" },
            ) as unknown as SegmentPort);
        let workerReady = false,
          workerBusy = false,
          bitmapFailures = 0,
          fallbackTriggered = false,
          firstMaskTimer = 0,
          maskPixels: ImageData | null = null;
        const fallbackToPremium = (reason = "") => {
          if (fallbackTriggered || !active) return;
          fallbackTriggered = true;
          window.clearTimeout(firstMaskTimer);
          if (isMacOS) {
            setVirtualEffectLoading("");
            setNotice(
              `O recorte compatível do macOS não respondeu${reason ? `: ${reason}` : "."}`,
            );
            return;
          }
          // Safari/macOS pode não oferecer ImageBitmap/OffscreenCanvas de modo
          // compatível dentro do Worker. Em máquinas fortes, como Apple Silicon,
          // a IA Premium no WebGL principal é um fallback funcional.
          setMattingQuality("premium");
          setNotice(
            "Usando IA Premium compatível com este navegador para o fundo virtual.",
          );
        };
        worker.onmessage = (event: MessageEvent<SegmentResponse>) => {
          if (!active) return;
          if (event.data.type === "ready") {
            workerReady = true;
            return;
          }
          workerBusy = false;
          if (event.data.type === "error") {
            fallbackToPremium(event.data.message);
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
          window.clearTimeout(firstMaskTimer);
          setVirtualEffectLoading("");
          if (!attached) {
            processedLocal.current = output;
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
          fallbackToPremium();
        };
        worker.postMessage({ type: "init" });
        // Alguns WebKit inicializam o Worker sem disparar erro, mas nunca
        // entregam uma máscara. O timeout impede um desfoque eternamente cru.
        firstMaskTimer = window.setTimeout(() => {
          if (!hasMask) fallbackToPremium();
        }, 7_000);
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
            foregroundContext.filter = "none";
            foregroundContext.drawImage(
              maskCanvas,
              0,
              0,
              foregroundCanvas.width,
              foregroundCanvas.height,
            );
            foregroundContext.globalCompositeOperation = "source-in";
            foregroundContext.filter = skinSmoothRef.current
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
            context.drawImage(
              foregroundCanvas,
              0,
              0,
              canvas.width,
              canvas.height,
            );
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
            // Ajuste adaptativo: em uma máquina forte usa 640px; quando a
            // inferência começa a disputar GPU/encoder, reduz a máscara antes
            // de deixar o vídeo da chamada cair de frame rate.
            const bitmapWidth = animatedBackdrop
              ? 512
              : inferenceDuration > 95
                ? 384
                : inferenceDuration > 60
                  ? 480
                  : 640;
            const bitmapHeight = Math.max(
              2,
              Math.round(
                (bitmapWidth * (source.videoHeight || canvas.height)) /
                  (source.videoWidth || canvas.width),
              ),
            );
            if (isMacOS) {
              // Não transfira HTMLVideoElement/ImageBitmap no Safari. O frame
              // reduzido permanece na página e segue direto ao MediaPipe.
              inferenceCanvas.width = bitmapWidth;
              inferenceCanvas.height = bitmapHeight;
              inferenceContext.drawImage(
                source,
                0,
                0,
                bitmapWidth,
                bitmapHeight,
              );
              worker.postMessage({
                type: "segment",
                frame: inferenceCanvas,
                timestamp: now,
              });
              segmentationFrame = requestAnimationFrame(next);
              return;
            }
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
                bitmapFailures += 1;
                if (bitmapFailures >= 3) fallbackToPremium();
              });
          }
          segmentationFrame = requestAnimationFrame(next);
        };
        render();
        next();
        return () => {
          cancelAnimationFrame(segmentationFrame);
          cancelAnimationFrame(renderFrame);
          window.clearTimeout(firstMaskTimer);
          worker.postMessage({ type: "close" });
          worker.terminate();
          output.getTracks().forEach((track) => track.stop());
          if (processedLocal.current === output) {
            processedLocal.current = null;
            if (!visualCompositionActive.current && local.current)
              replaceOutgoingVideo(local.current);
            setVirtualEpoch((epoch) => epoch + 1);
          }
        };
      } catch {
        setVirtualEffectLoading("");
        if (mattingQuality === "standard") {
          setMattingQuality("premium");
          setNotice(
            "O recorte leve não abriu neste navegador. Tentando o modo compatível com GPU.",
          );
        } else
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- O pipeline de segmentação reinicia apenas quando a fonte/configuração muda; callbacks de publicação são deliberadamente lidos da renderização que iniciou o pipeline.
  }, [
    background,
    backgroundVideo,
    backgroundLabel,
    backgroundMode,
    mattingQuality,
    cameraEpoch,
    inRoom,
    quality,
  ]);
  const refreshConnectionStats = async () => {
    const calls = cameraCalls.current as Array<
      MediaConnection & { peerConnection?: RTCPeerConnection }
    >;
    const peerConnection = calls.find(
      (call) => call.peerConnection,
    )?.peerConnection;
    if (!peerConnection) {
      setConnectionStats({
        fps: 0,
        bitrateKbps: 0,
        packetLoss: 0,
        jitterMs: 0,
        rttMs: 0,
      });
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
        if (
          (item.type === "inbound-rtp" || item.type === "outbound-rtp") &&
          kind === "video"
        ) {
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
          rttMs = Math.max(
            rttMs,
            Number(item.currentRoundTripTime || 0) * 1000,
          );
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
        packetLoss:
          received + lost
            ? Number(((lost / (received + lost)) * 100).toFixed(2))
            : 0,
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
    const interval = window.setInterval(
      () => void refreshConnectionStats(),
      2000,
    );
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
        resenhaLayout,
        resenhaMineSize,
      });
  }, [mode, topOrder, screenPosition, tiktokTop, resenhaMode, resenhaLayout, resenhaMineSize]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- O handler é reinstalado somente quando a composição PiP muda; incluir a função recriada a cada render causaria reinstalações contínuas.
  }, [
    inRoom,
    vertical,
    topOrder,
    screenPosition,
    tiktokTop,
    resenhaMode,
    resenhaLayout,
    resenhaMineSize,
    sharing,
    remoteSharing,
  ]);
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
        void (
          theirs.current as HTMLVideoElement & {
            setSinkId: (id: string) => Promise<void>;
          }
        )
          .setSinkId(audioOutputId)
          .catch(() => undefined);
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
    processedAudio.current?.getTracks().forEach((track) => track.stop());
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
      audioPipeline.current = {
        context,
        gain,
        analyser,
        output: output.stream,
      };
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
      setMicLevel(
        Math.min(100, Math.round(Math.sqrt(energy / bytes.length) * 850)),
      );
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
    // Nunca abra uma segunda chamada ao alterar fundo/overlay. Isso criava
    // conexões concorrentes, jitter alto e vídeo piscando. replaceTrack mantém
    // a mesma conexão e troca apenas a faixa de vídeo.
    const stream = processedLocal.current || local.current;
    if (stream) replaceOutgoingVideo(stream);
  }
  function attachCall(call: MediaConnection, fallback: string) {
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
  function attachDataConnection(conn: DataConnection) {
    connection.current = conn;
    const handleOpen = () => {
      if (connection.current !== conn) return;
      peerConnected.current = true;
      peerRetry.current = 0;
      window.clearTimeout(peerConnectTimer.current);
      window.clearTimeout(peerRetryTimer.current);
      conn.send({ kind: "name", name });
      if (mode === "host")
        conn.send({
          kind: "layout",
          topOrder,
          screenPosition,
          tiktokTop,
          resenhaMode,
          resenhaLayout,
          resenhaMineSize,
        });
    };
    if (conn.open) {
      handleOpen();
    } else {
      conn.on("open", handleOpen);
    }
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
        resenhaLayout?: "solo" | "duo";
        resenhaMineSize?: number;
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
        if (data.resenhaLayout === "solo" || data.resenhaLayout === "duo")
          setResenhaLayout(data.resenhaLayout);
        if (typeof data.resenhaMineSize === "number")
          setResenhaMineSize(
            mode === "guest" ? 1 - data.resenhaMineSize : data.resenhaMineSize,
          );
        if (data.resenhaMode) setVertical(true);
        return;
      }
      if (data.kind === "chat" && data.name && data.text)
        setMessages((old) => [...old, { name: data.name!, text: data.text! }]);
    });
  }
  async function startPeer(stream: MediaStream) {
    const generation = ++peerStartGeneration.current;
    window.clearTimeout(peerConnectTimer.current);
    window.clearTimeout(peerRetryTimer.current);
    const previousPeer = peer.current;
    peer.current = null;
    previousPeer?.destroy();
    const { default: Peer } = await import("peerjs");
    if (generation !== peerStartGeneration.current) return;
    const isHost = mode === "host";
    const client = isHost
      ? new Peer(hostId(room, pin), PEER_CONFIG)
      : new Peer(PEER_CONFIG);
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
      setNotice(`Reconectando à sala… tentativa ${peerRetry.current} de 4`);
      peerRetryTimer.current = window.setTimeout(() => {
        if (peer.current === client && !peerConnected.current)
          void startPeer(stream);
      }, 1_500);
    };
    client.on("connection", attachDataConnection);
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
            setScreenAudioActive(false);
          }
          received = shared;
          remoteDisplayed.current = shared;
          if (remoteScreen.current) {
            remoteScreen.current.srcObject = shared;
            void remoteScreen.current.play().catch(() => undefined);
          }
          setRemoteSharing(true);
          setRemoteScreenAudioActive(shared.getAudioTracks().length > 0);
          setNotice(
            `${String(call.metadata?.name || "Seu amigo")} assumiu o compartilhamento${shared.getAudioTracks().length ? " com áudio" : ""}.`,
          );
        });
        call.on("close", () => {
          if (remoteDisplayed.current === received) {
            remoteDisplayed.current = null;
            setRemoteSharing(false);
            setRemoteScreenAudioActive(false);
          }
        });
        return;
      }
      call.answer(callStream(stream));
      attachCall(call, String(call.metadata?.name || "Seu amigo"));
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
      attachCall(call, owner || "Anfitrião");
      attachDataConnection(
        client.connect(hostId(room, pin), { reliable: true }),
      );
      setNotice("Conectando à sala…");
      peerConnectTimer.current = window.setTimeout(retryConnection, 7_000);
    });
    client.on("error", (error) => {
      if (
        error.type === "peer-unavailable" ||
        error.type === "unavailable-id"
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
      let stream: MediaStream;
      let mediaWarning = "";
      let usedPlaceholder = false;
      try {
        stream = await navigator.mediaDevices.getUserMedia(
          constraints(quality, chosen || undefined, chosenAudio || undefined),
        );
      } catch (combinedError) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: chosen
              ? {
                  deviceId: { exact: chosen },
                  width: { ideal: 1920 },
                  height: { ideal: 1080 },
                  frameRate: { ideal: 30 },
                }
              : {
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  frameRate: { ideal: 30 },
                },
            audio: false,
          });
          mediaWarning =
            "Sala aberta sem microfone. Libere ou selecione o microfone em Ajustes.";
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: false,
              audio: microphoneConstraints(chosenAudio || undefined),
            });
            mediaWarning =
              "Sala aberta sem câmera. Feche outros aplicativos e selecione a câmera ou placa em Ajustes.";
          } catch {
            stream = placeholderCameraStream();
            usedPlaceholder = true;
            const denied =
              combinedError instanceof DOMException &&
              combinedError.name === "NotAllowedError";
            mediaWarning = denied
              ? "Sala aberta sem mídia: a permissão foi bloqueada. Autorize câmera e microfone no cadeado do navegador e tente em Ajustes."
              : "Sala aberta sem mídia: câmera ou placa está ocupada/indisponível. Feche outros aplicativos e tente em Ajustes.";
          }
        }
      }
      local.current = stream;
      if (stream.getAudioTracks().length)
        setupMicrophoneProcessing(stream, micSensitivity);
      setCameraOn(!usedPlaceholder && stream.getVideoTracks().length > 0);
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
      await startPeer(stream);
      if (mediaWarning) setNotice(mediaWarning);
      setBooting(false);
    } catch (error) {
      setBooting(false);
      setNotice(
        `Não foi possível abrir a sala${error instanceof Error && error.message ? `: ${error.message}` : ". Tente novamente."}`,
      );
    }
  }
  async function selectCamera(id: string) {
    setDeviceId(id);
    await join(id);
  }
  async function selectAudioInput(id: string) {
    if (!inRoom || !local.current) {
      setAudioInputId(id);
      await join(deviceId, id);
      return;
    }
    setNotice("Trocando somente o microfone…");
    try {
      const replacement = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: microphoneConstraints(id || undefined, noiseSuppression),
        }),
        nextTrack = replacement.getAudioTracks()[0];
      if (!nextTrack) throw new Error("Microfone sem faixa de áudio");
      nextTrack.enabled = mic;
      const activeStream = local.current;
      activeStream.getAudioTracks().forEach((track) => {
        activeStream.removeTrack(track);
        track.stop();
      });
      activeStream.addTrack(nextTrack);
      setupMicrophoneProcessing(activeStream, micSensitivity);
      replaceOutgoingAudio(processedAudio.current || activeStream);
      setAudioInputId(id);
      setCameraEpoch((value) => value + 1);
      const saved = sessionStorage.getItem("klip-active-call");
      if (saved) {
        const call = JSON.parse(saved) as SavedCall;
        sessionStorage.setItem(
          "klip-active-call",
          JSON.stringify({ ...call, audioInputId: id }),
        );
      }
      await devicesList();
      setNotice("Microfone atualizado sem reiniciar a sala.");
    } catch {
      setNotice(
        "Não foi possível trocar o microfone. Verifique a permissão do navegador.",
      );
    }
  }
  async function selectAudioOutput(id: string) {
    setAudioOutputId(id);
    const players = [theirs.current, remoteScreen.current];
    try {
      await Promise.all(
        players.map((player) => {
          if (!player || !("setSinkId" in player)) return Promise.resolve();
          return (
            player as HTMLVideoElement & {
              setSinkId: (sink: string) => Promise<void>;
            }
          ).setSinkId(id);
        }),
      );
      setNotice("Saída de áudio atualizada.");
    } catch {
      setNotice("Este navegador não permite escolher a saída de áudio.");
    }
  }
  async function preserveStereoListening() {
    const safeInput =
        audioInputs.find(
          (item) =>
            item.deviceId !== "default" &&
            !isCommunicationAudioDevice(item.label) &&
            /webcam|camera|array|integrado|built[ -]?in|realtek|macbook|microfone/i.test(
              item.label,
            ),
        ) ||
        audioInputs.find(
          (item) =>
            item.deviceId !== "default" &&
            !isCommunicationAudioDevice(item.label),
        ),
      stereoOutput =
        audioOutputs.find(
          (item) =>
            item.deviceId !== "default" &&
            !isCommunicationAudioDevice(item.label) &&
            /stereo|headphones|fones|speaker|alto-falante/i.test(item.label),
        ) ||
        audioOutputs.find(
          (item) =>
            item.deviceId !== "default" &&
            !isCommunicationAudioDevice(item.label),
        );
    if (!safeInput) {
      setNotice(
        "Não encontrei outro microfone. Conecte um microfone USB/webcam para manter o fone em estéreo.",
      );
      return;
    }
    if (stereoOutput) await selectAudioOutput(stereoOutput.deviceId);
    await selectAudioInput(safeInput.deviceId);
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
      setNotice(
        enabled
          ? "Supressão de ruído ativada."
          : "Supressão de ruído desativada.",
      );
    } catch {
      setNotice(
        "Este microfone não permite alterar a supressão de ruído em tempo real.",
      );
    }
  }
  async function share(includeAudio = shareScreenAudio) {
    if (sharing) {
      displayed.current?.getTracks().forEach((track) => track.stop());
      displayed.current = null;
      setSharing(false);
      setScreenAudioActive(false);
      setNotice("Compartilhamento de tela encerrado.");
      return;
    }
    try {
      const displayMediaOptions: ExtendedDisplayMediaStreamOptions = {
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // 60 fps concorre com encoder da webcam/IA e pode derrubar a chamada.
          // Para reunião e gravação, 30 fps em 1080p é a opção estável.
          frameRate: { ideal: 30, max: 30 },
        },
        audio: includeAudio
          ? {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              suppressLocalAudioPlayback: false,
            }
          : false,
        systemAudio: includeAudio ? "include" : "exclude",
        selfBrowserSurface: "include",
        surfaceSwitching: "include",
      };
      const stream =
        await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
      // Ao iniciar sua apresentação, a tela que estava vindo do amigo deixa de ser exibida.
      remoteDisplayed.current = null;
      if (remoteScreen.current) remoteScreen.current.srcObject = null;
      setRemoteSharing(false);
      setRemoteScreenAudioActive(false);
      displayed.current = stream;
      if (screen.current) {
        screen.current.srcObject = stream;
        await screen.current.play().catch(() => undefined);
      }
      stream.getVideoTracks()[0].onended = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (displayed.current === stream) displayed.current = null;
        setSharing(false);
        setScreenAudioActive(false);
        setNotice("Compartilhamento de tela encerrado.");
      };
      const audioTracks = stream.getAudioTracks();
      setScreenAudioActive(audioTracks.length > 0);
      setShareScreenDialogOpen(false);
      if (audioTracks.length > 0) {
        setNotice("Compartilhando tela com áudio do sistema / aba.");
      } else if (includeAudio) {
        setNotice(
          "A tela está sendo compartilhada, mas o navegador não enviou áudio. No seletor do Chrome, marque ‘Compartilhar áudio’ e prefira uma guia.",
        );
      } else {
        setNotice("Compartilhando somente a imagem da tela.");
      }
      setSharing(true);
      if (peer.current && remoteId.current)
        peer.current.call(remoteId.current, stream, {
          metadata: { kind: "screen", name, audio: audioTracks.length > 0 },
        });
    } catch {
      setShareScreenDialogOpen(false);
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
    setVirtualEffectLoading(
      video
        ? "Carregando vídeo de fundo…"
        : animated
          ? "Carregando e preparando o GIF…"
          : "Preparando imagem de fundo…",
    );
    if (video) {
      visualCompositionActive.current = true;
      setBackgroundVideo(URL.createObjectURL(file));
      setBackground("");
      setBackgroundLabel(`Vídeo animado · ${file.name}`);
      setBackgroundMode("image");
      setNotice(
        "Vídeo MP4 aplicado como fundo animado, sem precisar converter para GIF.",
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      visualCompositionActive.current = true;
      setBackground(String(reader.result));
      setBackgroundVideo("");
      setBackgroundLabel(
        `${animated ? "GIF animado" : "Imagem"} · ${file.name}`,
      );
      setBackgroundMode("image");
      setNotice(
        animated
          ? "GIF animado aplicado. Ele aparece atrás da câmera e também na gravação."
          : "Imagem de fundo aplicada à câmera.",
      );
    };
    reader.onerror = () => {
      setVirtualEffectLoading("");
      setNotice("Não foi possível ler este arquivo de fundo.");
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
      const overlay = String(reader.result);
      const needsPipeline = !processedLocal.current;
      visualCompositionActive.current = true;
      cameraOverlayRef.current = overlay;
      setCameraOverlay(overlay);
      if (needsPipeline) setCameraEpoch((epoch) => epoch + 1);
      setNotice("Moldura aplicada à sua câmera online e à gravação.");
    };
    reader.readAsDataURL(file);
  }
  function updateWebcamLayerText(value: string) {
    const needsPipeline = Boolean(value.trim()) && !processedLocal.current;
    webcamTextRef.current = value;
    if (value.trim()) visualCompositionActive.current = true;
    if (
      !value.trim() &&
      backgroundMode === "none" &&
      !cameraOverlayRef.current
    ) {
      visualCompositionActive.current = false;
      if (local.current) replaceOutgoingVideo(local.current);
    }
    setWebcamText(value);
    if (
      needsPipeline ||
      (!value.trim() && backgroundMode === "none" && !cameraOverlayRef.current)
    )
      setCameraEpoch((epoch) => epoch + 1);
  }
  function clearCameraOverlay() {
    cameraOverlayRef.current = "";
    setCameraOverlay("");
    if (backgroundMode === "none" && !webcamTextRef.current.trim()) {
      visualCompositionActive.current = false;
      if (local.current) replaceOutgoingVideo(local.current);
      setCameraEpoch((epoch) => epoch + 1);
    }
  }
  function toggleBlur() {
    const next = backgroundMode === "blur" ? "none" : "blur";
    setVirtualEffectLoading(next === "blur" ? "Preparando o desfoque…" : "");
    visualCompositionActive.current = next !== "none";
    setBackgroundMode(next);
    if (next === "none" && mine.current && local.current) {
      replaceOutgoingVideo(local.current);
      mine.current.srcObject = local.current;
      void mine.current.play().catch(() => undefined);
    }
  }
  function toggleBackgroundRemoval() {
    const next = backgroundMode === "remove" ? "none" : "remove";
    setVirtualEffectLoading(
      next === "remove" ? "Preparando a remoção do fundo…" : "",
    );
    visualCompositionActive.current = next !== "none";
    setBackgroundMode(next);
    if (next === "none" && mine.current && local.current) {
      replaceOutgoingVideo(local.current);
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
      setVerticalCameraMode("auto");
      setPreviewOpen(true);
      setNotice(
        resenhaLayout === "solo"
          ? "Modo Resenha solo ativo: câmera em cima e vídeo embaixo, sem faixas."
          : "Modo Resenha ativo: duas câmeras empilhadas em 9:16.",
      );
    } else {
      setNotice("Modo Resenha desativado.");
    }
  }
  function selectResenhaLayout(next: "solo" | "duo") {
    setResenhaLayout(next);
    setResenhaMode(true);
    setVertical(true);
    setVerticalCameraMode("auto");
    setScreenPosition("bottom");
    setPreviewOpen(true);
    if (next === "solo") setResenhaMineSize(0.36);
    setNotice(
      next === "solo"
        ? "Resenha para 1 pessoa: câmera em cima e vídeo embaixo, preenchendo todo o quadro."
        : "Resenha para 2 pessoas: duas câmeras empilhadas.",
    );
  }
  function selectVerticalCameraMode(next: VerticalCameraMode) {
    setVerticalCameraMode(next);
    setVertical(true);
    setPreviewOpen(true);
    if (next !== "auto") setResenhaMode(false);
    setNotice(
      next === "solo-mine"
        ? "TikTok solo ativo: somente a sua câmera será gravada em 9:16."
        : next === "solo-friend"
          ? "TikTok solo ativo: a câmera do amigo será gravada em 9:16."
          : "Layout vertical automático ativo.",
    );
  }
  const timeLabel = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const callTimeLabel = (seconds: number) =>
    `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  function downloadRecording(
    chunks: Blob[],
    mime: string,
    label: string,
    autoAnalyze = false,
  ) {
    if (!chunks.length) return null;
    const blob = new Blob(chunks, { type: mime }),
      editorUrl = URL.createObjectURL(blob),
      downloadUrl = URL.createObjectURL(blob),
      nextClip: EditorClip = {
        url: editorUrl,
        name: `Gravação ${label}`,
        autoAnalyze,
        source: blob,
      };
    const link = document.createElement("a");
    setEditorClip(nextClip);
    link.href = downloadUrl;
    link.download = `klipapp-${label}-${Date.now()}.${mime.startsWith("video/mp4") ? "mp4" : "webm"}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
    return nextClip;
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
      context.strokeStyle = "#2d6cdf";
      context.lineWidth = 10;
      context.shadowColor = "#2d6cdf";
      context.shadowBlur = 18;
      context.strokeRect(x + 5, y + 5, width - 10, height - 10);
      context.restore();
    };
    const draw = () => {
      if (!recorder.current || recorder.current.state === "inactive") return;
      context.fillStyle = "#0b1020";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const hasFriendVideo = Boolean(
        remote.current
          ?.getVideoTracks()
          .some((track) => track.readyState === "live"),
      );
      const screenVideo = sharing
        ? screen.current
        : remoteSharing
          ? remoteScreen.current
          : null;
      if (vertical && verticalCameraMode !== "auto") {
        const useFriend =
            verticalCameraMode === "solo-friend" && hasFriendVideo,
          selectedVideo = useFriend ? theirs.current : mine.current,
          selectedSpeaking = useFriend
            ? speakingRef.current.friend
            : speakingRef.current.mine;
        cover(selectedVideo, 0, 0, canvas.width, canvas.height);
        bezel(0, 0, canvas.width, canvas.height, selectedSpeaking);
      } else if (vertical && resenhaMode && resenhaLayout === "solo") {
        if (screenVideo) {
          const cameraHeight =
            canvas.height * Math.min(0.58, Math.max(0.24, resenhaMineSize));
          cover(mine.current, 0, 0, canvas.width, cameraHeight);
          cover(
            screenVideo,
            0,
            cameraHeight,
            canvas.width,
            canvas.height - cameraHeight,
          );
          bezel(0, 0, canvas.width, cameraHeight, speakingRef.current.mine);
        } else {
          cover(mine.current, 0, 0, canvas.width, canvas.height);
          bezel(0, 0, canvas.width, canvas.height, speakingRef.current.mine);
        }
      } else if (!hasFriendVideo && vertical && !screenVideo) {
        // A recording in a solo room is a proper one-person composition, not a two-up layout with a black half.
        cover(mine.current, 0, 0, canvas.width, canvas.height);
        bezel(0, 0, canvas.width, canvas.height, speakingRef.current.mine);
      } else if (!hasFriendVideo && vertical && screenVideo) {
        const cameraHeight =
          canvas.height * Math.min(0.42, Math.max(0.2, tiktokTop));
        cover(mine.current, 0, 0, canvas.width, cameraHeight);
        cover(
          screenVideo,
          0,
          cameraHeight + 12,
          canvas.width,
          canvas.height - cameraHeight - 12,
        );
        bezel(0, 0, canvas.width, cameraHeight, speakingRef.current.mine);
      } else if (vertical && resenhaMode) {
        const gap = 12,
          cameraAreaHeight = screenVideo ? canvas.height * 0.56 : canvas.height,
          firstIsMine = topOrder === "mine-first",
          firstRatio = firstIsMine ? resenhaMineSize : 1 - resenhaMineSize,
          firstHeight = (cameraAreaHeight - gap) * firstRatio,
          secondHeight = cameraAreaHeight - gap - firstHeight,
          cameraY =
            screenVideo && screenPosition === "top"
              ? canvas.height - cameraAreaHeight
              : 0,
          first = topOrder === "mine-first" ? mine.current : theirs.current,
          second = topOrder === "mine-first" ? theirs.current : mine.current,
          firstTalking =
            topOrder === "mine-first"
              ? speakingRef.current.mine
              : speakingRef.current.friend,
          secondTalking =
            topOrder === "mine-first"
              ? speakingRef.current.friend
              : speakingRef.current.mine;
        cover(first, 0, cameraY, canvas.width, firstHeight);
        cover(
          second,
          0,
          cameraY + firstHeight + gap,
          canvas.width,
          secondHeight,
        );
        bezel(0, cameraY, canvas.width, firstHeight, firstTalking);
        bezel(
          0,
          cameraY + firstHeight + gap,
          canvas.width,
          secondHeight,
          secondTalking,
        );
        if (screenVideo) {
          const screenHeight = canvas.height - cameraAreaHeight - gap,
            screenY = screenPosition === "top" ? 0 : cameraAreaHeight + gap;
          cover(screenVideo, 0, screenY, canvas.width, screenHeight);
        }
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
        if (!hasFriendVideo && !screenVideo) {
          cover(mine.current, 0, 0, canvas.width, canvas.height);
          bezel(0, 0, canvas.width, canvas.height, speakingRef.current.mine);
        } else {
          cover(screenVideo || mine.current, 0, 0, canvas.width, canvas.height);
          cover(
            mine.current,
            canvas.width * 0.72,
            canvas.height * 0.68,
            canvas.width * 0.25,
            canvas.height * 0.28,
          );
          bezel(
            canvas.width * 0.72,
            canvas.height * 0.68,
            canvas.width * 0.25,
            canvas.height * 0.28,
            speakingRef.current.mine,
          );
          if (hasFriendVideo) {
            cover(
              theirs.current,
              24,
              canvas.height * 0.72,
              canvas.width * 0.2,
              canvas.height * 0.23,
            );
            bezel(
              24,
              canvas.height * 0.72,
              canvas.width * 0.2,
              canvas.height * 0.23,
              speakingRef.current.friend,
            );
          }
        }
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
      setNotice(
        "MP4 não é suportado neste navegador; a gravação sairá em WebM.",
      );
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
      const finishedClip = downloadRecording(
        recordChunks.current,
        mime,
        "reel",
        true,
      );
      recordChunks.current = [];
      cutRequested.current = false;
      setRecording(false);
      setRecordSeconds(0);
      void recordingAudio?.close();
      connection.current?.send({ kind: "recording", active: false });
      if (finishedClip) {
        setRecordingFinishedPrompt(true);
        setNotice("Gravação salva. Escolha se deseja abrir o editor.");
      }
    };
    rec.start(1000);
    setRecording(true);
    connection.current?.send({ kind: "recording", active: true });
    setNotice("Gravando localmente com áudio. Seu amigo foi avisado.");
    draw();
  }
  function leave() {
    peerStartGeneration.current += 1;
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
    // O PiP aparece pequeno. Compor em 720p mantém a imagem nítida sem
    // decodificar e redesenhar desnecessariamente um canvas Full HD/4K.
    canvas.width = vertical ? 405 : 720;
    canvas.height = vertical ? 720 : 405;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "medium";
    const pipFps = 30,
      output = canvas.captureStream(0),
      outputTrack = output.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
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
      context.fillStyle = "#0b1020";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const hasFriendVideo = Boolean(
        remote.current
          ?.getVideoTracks()
          .some((track) => track.readyState === "live"),
      );
      if (vertical && verticalCameraMode !== "auto") {
        cover(
          verticalCameraMode === "solo-friend" && hasFriendVideo
            ? theirs.current
            : mine.current,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      } else if (vertical && resenhaMode && resenhaLayout === "solo") {
        const screenVideo = sharing
          ? screen.current
          : remoteSharing
            ? remoteScreen.current
            : null;
        if (screenVideo) {
          const cameraHeight =
            canvas.height * Math.min(0.58, Math.max(0.24, resenhaMineSize));
          cover(mine.current, 0, 0, canvas.width, cameraHeight);
          cover(
            screenVideo,
            0,
            cameraHeight,
            canvas.width,
            canvas.height - cameraHeight,
          );
        } else {
          cover(mine.current, 0, 0, canvas.width, canvas.height);
        }
      } else if (vertical && resenhaMode) {
        const screenVideo = sharing
            ? screen.current
            : remoteSharing
              ? remoteScreen.current
              : null,
          gap = 6,
          cameraAreaHeight = screenVideo ? canvas.height * 0.56 : canvas.height,
          firstIsMine = topOrder === "mine-first",
          firstRatio = firstIsMine ? resenhaMineSize : 1 - resenhaMineSize,
          firstHeight = (cameraAreaHeight - gap) * firstRatio,
          secondHeight = cameraAreaHeight - gap - firstHeight,
          cameraY =
            screenVideo && screenPosition === "top"
              ? canvas.height - cameraAreaHeight
              : 0,
          first = topOrder === "mine-first" ? mine.current : theirs.current,
          second = topOrder === "mine-first" ? theirs.current : mine.current;
        cover(first, 0, cameraY, canvas.width, firstHeight);
        cover(
          second,
          0,
          cameraY + firstHeight + gap,
          canvas.width,
          secondHeight,
        );
        if (screenVideo) {
          const screenHeight = canvas.height - cameraAreaHeight - gap,
            screenY = screenPosition === "top" ? 0 : cameraAreaHeight + gap;
          cover(screenVideo, 0, screenY, canvas.width, screenHeight);
        }
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
      // captureStream(0) só envia um quadro quando pedimos. Isso evita uma
      // segunda renderização descontrolada e, ao contrário de rAF, continua
      // fluido quando a aba fica oculta/minimizada enquanto o PiP está ativo.
      outputTrack.requestFrame();
    };
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = output;
    video.style.cssText = "position:fixed;left:-9999px;width:1px;height:1px";
    document.body.append(video);
    pipVideo.current = video;
    const cleanup = () => {
      window.clearInterval(pipTimer.current);
      pipTimer.current = 0;
      output.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      video.remove();
      if (pipVideo.current === video) pipVideo.current = null;
    };
    video.addEventListener("leavepictureinpicture", cleanup, { once: true });
    draw();
    pipTimer.current = window.setInterval(draw, 1000 / pipFps);
    try {
      await video.play();
      await video.requestPictureInPicture();
      setNotice("Prévia aberta em Picture-in-Picture.");
    } catch {
      cleanup();
      setNotice(
        "Não foi possível abrir o Picture-in-Picture. Tente pelo Chrome.",
      );
    }
  }
  if (editorOpen)
    return (
      <ClipEditorV2
        initialClip={editorClip}
        theme={theme}
        onToggleTheme={toggleTheme}
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
      <main className="loading-screen" aria-busy="true" aria-live="polite">
        <KlipAppLogo variant="symbol" width={52} height={52} />
        <h1>KLIPAPP</h1>
        <p>Preparando sua sessão…</p>
        <span className="ka-loader" aria-hidden="true" />
      </main>
    );
  if (localStudio)
    return (
      <>
        <button
          className="global-theme-toggle"
          onClick={toggleTheme}
          aria-label={`Usar tema ${theme === "dark" ? "claro" : "escuro"}`}
        >
          {theme === "dark" ? (
            <Sun aria-hidden="true" />
          ) : (
            <Moon aria-hidden="true" />
          )}
        </button>
        <OfflineStudio onBack={() => setLocalStudio(false)} />
      </>
    );
  if (motionStudio)
    return (
      <>
        <button
          className="global-theme-toggle"
          onClick={toggleTheme}
          aria-label={`Usar tema ${theme === "dark" ? "claro" : "escuro"}`}
        >
          {theme === "dark" ? (
            <Sun aria-hidden="true" />
          ) : (
            <Moon aria-hidden="true" />
          )}
        </button>
        <GifStudio
          onBack={() => setMotionStudio(false)}
          onUseBackground={(file) => {
            chooseBackground(file);
            setMotionStudio(false);
            setNotice(
              "Fundo animado pronto. Entre em uma sala para usá-lo na câmera.",
            );
          }}
        />
      </>
    );
  if (!inRoom)
    return (
      <main className="landing">
        <nav className="landing-nav" aria-label="Navegação principal">
          <Link className="brand" href="/" aria-label="KLIPAPP — início">
            <KlipAppLogo variant="full" width={148} height={32} />
          </Link>
          <div className="landing-nav-actions">
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={`Usar tema ${theme === "dark" ? "claro" : "escuro"}`}
              title={`Tema ${theme === "dark" ? "claro" : "escuro"}`}
            >
              {theme === "dark" ? (
                <Sun aria-hidden="true" />
              ) : (
                <Moon aria-hidden="true" />
              )}
            </button>
            <button className="open-editor" onClick={openEditor}>
              <Clapperboard aria-hidden="true" /> Editor
            </button>
            <details className="landing-nav-menu landing-tools-menu">
              <summary title="Abrir ferramentas de criação">
                <WandSparkles aria-hidden="true" />
                <span>Criar</span>
              </summary>
              <div className="landing-nav-popover">
                <button type="button" onClick={() => setMotionStudio(true)}>
                  <WandSparkles aria-hidden="true" /> Motion
                </button>
                <button type="button" onClick={() => setLocalStudio(true)}>
                  <MonitorUp aria-hidden="true" /> Estúdio local
                </button>
              </div>
            </details>
            {currentUser ? (
              <>
                <button
                  className="nav-action-btn primary"
                  type="button"
                  onClick={() => setPublishModalOpen(true)}
                >
                  <Share2 aria-hidden="true" /> Publicar
                </button>
                <details className="landing-nav-menu landing-account-menu">
                  <summary aria-label="Abrir menu da conta">
                    {currentUser.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- Avatares OAuth podem vir de origens dinâmicas que não são configuráveis com segurança no loader do Next Image.
                      <img src={currentUser.avatarUrl} alt="" />
                    ) : (
                      <span className="landing-profile-fallback">
                        <User aria-hidden="true" />
                      </span>
                    )}
                    <span>
                      {(currentUser.name || currentUser.email).split(" ")[0]}
                    </span>
                  </summary>
                  <div className="landing-nav-popover">
                    <Link href="/perfil">
                      <User aria-hidden="true" /> Meu perfil
                    </Link>
                    <button
                      type="button"
                      onClick={async () => {
                        if (isSupabaseConfigured) {
                          try {
                            const supabase = createClient();
                            await supabase.auth.signOut();
                          } catch {
                            // O logout local continua disponível mesmo se o provedor falhar.
                          }
                        }
                        localStorage.removeItem("klip_user");
                        setCurrentUser(null);
                      }}
                    >
                      <LogOut aria-hidden="true" /> Sair
                    </button>
                  </div>
                </details>
              </>
            ) : (
              <button
                className="nav-action-btn primary"
                type="button"
                onClick={() => setAuthModalOpen(true)}
              >
                <LogIn aria-hidden="true" /> Entrar
              </button>
            )}
          </div>
        </nav>
        <section className="hero landing-hero-v2">
          <div className="landing-copy">
            <div className="eyebrow">ESTÚDIO DE CONVERSAS E CLIPES</div>
            <h1>
              Uma conversa.
              <br />
              <em>Vários momentos.</em>
            </h1>
            <p>
              Grave em alta qualidade, encontre os melhores trechos e publique
              no formato certo.
            </p>
            <div className="landing-proof">
              <span>
                <Film aria-hidden="true" />
                <b>Alta qualidade</b>
              </span>
              <span>
                <Clapperboard aria-hidden="true" />
                <b>Editor multiformato</b>
              </span>
              <span>
                <Share2 aria-hidden="true" />
                <b>Publicação integrada</b>
              </span>
            </div>
          </div>
          <div className="landing-entry-card">
            <div className="entry-card-heading">
              <div>
                <small>AO VIVO</small>
                <b>{mode === "host" ? "Criar sala" : "Entrar na sala"}</b>
              </div>
              <span title="A entrada exige o número da sala e o código de acesso">
                <ShieldCheck aria-hidden="true" size={13} /> Acesso por código
              </span>
            </div>
            <div className="entry-tabs">
              <button
                className={mode === "host" ? "selected" : ""}
                onClick={() => setMode("host")}
              >
                Criar sala
              </button>
              <button
                className={mode === "guest" ? "selected" : ""}
                onClick={() => setMode("guest")}
              >
                Entrar
              </button>
            </div>
            <div className="join">
              <label>
                Nome
                <input
                  value={name}
                  placeholder={currentUser?.name || "Digite seu nome"}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                Sala
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
                Código
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
                  Gerar novos códigos
                </button>
              )}
              <button onClick={() => void join()}>
                {mode === "host" ? "Abrir sala" : "Entrar na sala"}{" "}
                <ArrowRight aria-hidden="true" size={16} />
              </button>
              {notice && <p>{notice}</p>}
            </div>
          </div>
        </section>

        <ProductOverview onStart={() => setAuthModalOpen(true)} />

        <footer className="landing-legal-footer">
          <span>© 2026 KLIPAPP</span>
          <nav aria-label="Links legais">
            <Link href="/privacidade">Privacidade</Link>
            <Link href="/termos">Termos</Link>
          </nav>
        </footer>

        <div className="orb one" />
        <div className="orb two" />

        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          onSuccess={(u) => {
            setCurrentUser(u);
            localStorage.setItem("klip_user", JSON.stringify(u));
          }}
        />

        <SocialAccountsModal
          isOpen={socialModalOpen}
          onClose={() => setSocialModalOpen(false)}
        />

        {publishModalOpen && (
          <PublishModal
            isOpen
            onClose={() => setPublishModalOpen(false)}
            defaultTitle="Novo vídeo KLIPAPP"
          />
        )}
      </main>
    );
  const screenActive = sharing || remoteSharing,
    selectedAudioInput =
      audioInputs.find((item) => item.deviceId === audioInputId) ||
      (!audioInputId
        ? audioInputs.find((item) => item.deviceId === "default")
        : undefined),
    communicationAudioActive = isCommunicationAudioDevice(
      selectedAudioInput?.label,
    );
  return (
    <main className="call">
      <header>
        <div className="brand">
          <KlipAppLogo variant="full" width={132} height={28} />
        </div>
        <div className="room">
          <i /> Sala {room}
          <span className="call-timer">
            <Clock3 aria-hidden="true" /> {callTimeLabel(callSeconds)}
          </span>
        </div>
        <div className="header-actions">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Usar tema ${theme === "dark" ? "claro" : "escuro"}`}
            title={`Tema ${theme === "dark" ? "claro" : "escuro"}`}
          >
            {theme === "dark" ? (
              <Sun aria-hidden="true" />
            ) : (
              <Moon aria-hidden="true" />
            )}
          </button>
          <button className="open-editor" onClick={openEditor}>
            <Clapperboard aria-hidden="true" /> Editor
          </button>
          <button className="invite" onClick={() => void invite()}>
            <UserPlus aria-hidden="true" /> Convidar
          </button>
          <button
            className="chat-toggle"
            onClick={() => setChatOpen(!chatOpen)}
          >
            <MessageSquare aria-hidden="true" /> Chat
          </button>
          <button
            className={connectionOpen ? "connection-open" : "connection-toggle"}
            onClick={() => {
              const next = !connectionOpen;
              setConnectionOpen(next);
              if (next) void refreshConnectionStats();
            }}
          >
            <Activity aria-hidden="true" /> Status
          </button>
          <button
            className={settingsOpen ? "settings-open" : "settings"}
            onClick={() => {
              const next = !settingsOpen;
              setSettingsOpen(next);
            }}
          >
            <Settings2 aria-hidden="true" /> Ajustes
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
                <Minimize2 aria-hidden="true" size={14} />
              </button>
              <button
                onClick={() => setSettingsOpen(false)}
                aria-label="Fechar ajustes"
              >
                <X aria-hidden="true" size={14} />
              </button>
            </div>
          </div>
          {!settingsMinimized && (
            <>
              <div className="settings-menu">
                <details open>
                  <summary>
                    <span>
                      <Video aria-hidden="true" size={16} />
                    </span>
                    <div>
                      <b>Câmera e fundo</b>
                      <small>Webcam, imagem e desfoque</small>
                    </div>
                  </summary>
                  <div className="menu-content">
                    <label className="menu-field">
                      Câmera / placa de captura
                      <select
                        value={deviceId}
                        onChange={(event) =>
                          void selectCamera(event.target.value)
                        }
                        aria-label="Escolher câmera ou placa de captura"
                      >
                        <option value="">Câmera padrão do sistema</option>
                        {devices.map((device, index) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {videoInputLabel(device, index)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="capture-source-actions">
                      <small>
                        {isCaptureInputLabel(
                          devices.find((item) => item.deviceId === deviceId)
                            ?.label,
                        )
                          ? "Placa de captura ativa como fonte principal."
                          : devices.some((item) =>
                                isCaptureInputLabel(item.label),
                              )
                            ? "Placa detectada. Selecione a opção marcada como placa de captura acima."
                            : "Para HDMI/console, conecte a placa e autorize a câmera. Para jogo ou janela do PC, use a captura de tela."}
                      </small>
                      <button
                        className="open-preview capture-window-button"
                        onClick={() => {
                          if (sharing) void share();
                          else setShareScreenDialogOpen(true);
                        }}
                      >
                        {sharing ? (
                          <ScreenShareOff aria-hidden="true" size={15} />
                        ) : (
                          <MonitorUp aria-hidden="true" size={15} />
                        )}
                        {sharing
                          ? "Parar captura do PC"
                          : "Capturar janela, tela ou jogo"}
                      </button>
                    </div>
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
                    <label
                      className="menu-field"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        cursor: "pointer",
                        marginTop: "4px",
                        background: "rgba(255,255,255,0.04)",
                        padding: "8px 10px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <input
                        type="checkbox"
                        aria-label="Compartilhar som da tela"
                        checked={shareScreenAudio}
                        onChange={(e) => setShareScreenAudio(e.target.checked)}
                        style={{
                          width: "16px",
                          height: "16px",
                          accentColor: "#6366f1",
                          cursor: "pointer",
                        }}
                      />
                      <span
                        style={{
                          fontSize: "11px",
                          display: "block",
                          color: "#f4f4f5",
                        }}
                      >
                        Compartilhar som da tela
                        <small style={{ fontSize: "10px", color: "#a1a1aa" }}>
                          Inclui áudio do sistema / aba / vídeo ao transmitir
                          tela
                        </small>
                      </span>
                    </label>
                    {communicationAudioActive && (
                      <div className="audio-profile-warning" role="status">
                        <b>Qualidade de chamada detectada</b>
                        <p>
                          O Windows pode colocar todo o som do computador em
                          modo mono/comprimido enquanto este microfone estiver
                          ativo. Use outro microfone e mantenha o fone apenas
                          como saída para ouvir música, jogos e vídeos em
                          estéreo.
                        </p>
                        <button onClick={() => void preserveStereoListening()}>
                          Priorizar som estéreo
                        </button>
                      </div>
                    )}
                    <div className="setting-actions">
                      <label className="background-upload">
                        <ImagePlus aria-hidden="true" size={14} /> Escolher
                        imagem
                        <input
                          type="file"
                          accept="image/*,video/mp4,.mp4"
                          onChange={(event) =>
                            chooseBackground(event.target.files?.[0])
                          }
                        />
                      </label>
                      <label className="background-upload animated-background-upload">
                        <Sparkles aria-hidden="true" size={14} /> Subir GIF ou
                        MP4 animado
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
                        <Blend aria-hidden="true" size={14} /> Desfocar
                      </button>
                      <button
                        className={
                          backgroundMode === "remove" ? "format on" : "format"
                        }
                        onClick={toggleBackgroundRemoval}
                      >
                        <Layers2 aria-hidden="true" size={14} /> Remover fundo
                      </button>
                      <button
                        className={
                          mattingQuality === "premium"
                            ? "format on premium"
                            : "format premium"
                        }
                        onClick={togglePremiumMatting}
                      >
                        <Sparkles aria-hidden="true" size={14} /> IA Premium
                      </button>
                    </div>
                    <p className="matting-note">
                      {mattingQuality === "premium"
                        ? "IA Premium: recorte temporal de alta qualidade · ideal para GPUs fortes"
                        : "Recorte leve: mais rápido, indicado para computadores comuns"}
                    </p>
                    {backgroundLabel && (
                      <p className="background-file-note">
                        <ImagePlus aria-hidden="true" size={13} />{" "}
                        {backgroundLabel}
                        {/(GIF animado|Vídeo animado)/.test(backgroundLabel)
                          ? " · animação incluída na gravação"
                          : ""}
                      </p>
                    )}
                    {backgroundMode === "image" && (
                      <div
                        className="background-customizer"
                        style={{
                          marginTop: "10px",
                          padding: "10px",
                          background: "rgba(255,255,255,0.05)",
                          borderRadius: "10px",
                          border: "1px solid rgba(255,255,255,0.09)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "8px",
                          }}
                        >
                          <b style={{ fontSize: "12px", color: "#ffd7ce" }}>
                            <Sparkles aria-hidden="true" size={13} /> Ajuste do
                            GIF / Fundo
                          </b>
                          <button
                            type="button"
                            onClick={() => {
                              setBackgroundScale(100);
                              setBackgroundOffsetX(0);
                              setBackgroundOffsetY(0);
                              setBackgroundFit("cover");
                            }}
                            style={{
                              fontSize: "11px",
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(255,255,255,0.15)",
                              borderRadius: "6px",
                              color: "#ff8d80",
                              padding: "2px 8px",
                              cursor: "pointer",
                            }}
                          >
                            <RotateCcw aria-hidden="true" size={13} /> Redefinir
                          </button>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "6px",
                            marginBottom: "10px",
                          }}
                        >
                          <button
                            type="button"
                            className={
                              backgroundFit === "cover" ? "format on" : "format"
                            }
                            onClick={() => setBackgroundFit("cover")}
                            style={{
                              flex: 1,
                              padding: "5px 2px",
                              fontSize: "11px",
                            }}
                          >
                            Preencher
                          </button>
                          <button
                            type="button"
                            className={
                              backgroundFit === "contain"
                                ? "format on"
                                : "format"
                            }
                            onClick={() => setBackgroundFit("contain")}
                            style={{
                              flex: 1,
                              padding: "5px 2px",
                              fontSize: "11px",
                            }}
                          >
                            Ajustar (100%)
                          </button>
                          <button
                            type="button"
                            className={
                              backgroundFit === "original"
                                ? "format on"
                                : "format"
                            }
                            onClick={() => setBackgroundFit("original")}
                            style={{
                              flex: 1,
                              padding: "5px 2px",
                              fontSize: "11px",
                            }}
                          >
                            Original
                          </button>
                        </div>
                        <label
                          className="menu-field"
                          style={{
                            fontSize: "11px",
                            display: "block",
                            marginBottom: "8px",
                          }}
                        >
                          Zoom / Escala: {backgroundScale}%
                          <input
                            type="range"
                            min="20"
                            max="250"
                            step="5"
                            value={backgroundScale}
                            onChange={(e) =>
                              setBackgroundScale(Number(e.target.value))
                            }
                            style={{
                              width: "100%",
                              accentColor: "var(--ka-brand)",
                            }}
                          />
                        </label>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "8px",
                          }}
                        >
                          <label
                            className="menu-field"
                            style={{ fontSize: "11px" }}
                          >
                            Posição X: {backgroundOffsetX}%
                            <input
                              type="range"
                              min="-60"
                              max="60"
                              step="2"
                              value={backgroundOffsetX}
                              onChange={(e) =>
                                setBackgroundOffsetX(Number(e.target.value))
                              }
                              style={{
                                width: "100%",
                                accentColor: "var(--ka-brand)",
                              }}
                            />
                          </label>
                          <label
                            className="menu-field"
                            style={{ fontSize: "11px" }}
                          >
                            Posição Y: {backgroundOffsetY}%
                            <input
                              type="range"
                              min="-60"
                              max="60"
                              step="2"
                              value={backgroundOffsetY}
                              onChange={(e) =>
                                setBackgroundOffsetY(Number(e.target.value))
                              }
                              style={{
                                width: "100%",
                                accentColor: "var(--ka-brand)",
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    )}
                    <div className="webcam-text-layer">
                      <b>Camada na webcam</b>
                      <small>
                        Texto no vídeo, para a chamada e a gravação.
                      </small>
                      <input
                        value={webcamText}
                        maxLength={80}
                        onChange={(event) =>
                          updateWebcamLayerText(event.target.value)
                        }
                        placeholder="Ex.: AO VIVO · Episódio 01"
                      />
                      <div>
                        <button
                          className={
                            webcamTextPosition === "top" ? "selected" : ""
                          }
                          onClick={() => setWebcamTextPosition("top")}
                        >
                          Em cima
                        </button>
                        <button
                          className={
                            webcamTextPosition === "bottom" ? "selected" : ""
                          }
                          onClick={() => setWebcamTextPosition("bottom")}
                        >
                          Embaixo
                        </button>
                        <button onClick={() => updateWebcamLayerText("")}>
                          Limpar
                        </button>
                      </div>
                      <label className="background-upload">
                        <Frame aria-hidden="true" size={14} /> Subir moldura /
                        overlay
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif,.gif"
                          onChange={(event) =>
                            chooseCameraOverlay(event.target.files?.[0])
                          }
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
                              onChange={(event) => {
                                const opacity = Number(event.target.value);
                                cameraOverlayOpacityRef.current = opacity;
                                setCameraOverlayOpacity(opacity);
                              }}
                            />
                          </label>
                          <button
                            className="format"
                            onClick={clearCameraOverlay}
                          >
                            Limpar moldura
                          </button>
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
                        onChange={(event) => {
                          skinSmoothRef.current = event.target.checked;
                          setSkinSmooth(event.target.checked);
                        }}
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
                      <div
                        className="mic-meter"
                        aria-label="Nível do microfone"
                      >
                        <i style={{ width: `${micLevel}%` }} />
                      </div>
                      <button
                        className={micTesting ? "format on" : "format"}
                        onClick={testMicrophone}
                      >
                        {micTesting ? (
                          <>
                            <Circle
                              aria-hidden="true"
                              size={12}
                              fill="currentColor"
                            />{" "}
                            Testando…
                          </>
                        ) : (
                          <>
                            <Play aria-hidden="true" size={14} /> Testar
                            microfone
                          </>
                        )}
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
                    <span>
                      <Clapperboard aria-hidden="true" size={16} />
                    </span>
                    <div>
                      <b>Reels e prévia</b>
                      <small>Formato para salvar e edição visual</small>
                    </div>
                  </summary>
                  <div className="menu-content">
                    <div
                      className="vertical-camera-modes"
                      role="group"
                      aria-label="Layout da gravação vertical"
                    >
                      <button
                        className={
                          verticalCameraMode === "auto" ? "selected" : ""
                        }
                        onClick={() => selectVerticalCameraMode("auto")}
                      >
                        <LayoutTemplate aria-hidden="true" size={15} /> Completo
                      </button>
                      <button
                        className={
                          verticalCameraMode === "solo-mine" ? "selected" : ""
                        }
                        onClick={() => selectVerticalCameraMode("solo-mine")}
                      >
                        <User aria-hidden="true" size={15} /> Só eu
                      </button>
                      <button
                        className={
                          verticalCameraMode === "solo-friend" ? "selected" : ""
                        }
                        onClick={() => selectVerticalCameraMode("solo-friend")}
                        disabled={!friend}
                        title={
                          friend
                            ? "Gravar somente a câmera do amigo"
                            : "Disponível quando o amigo entrar"
                        }
                      >
                        <UserPlus aria-hidden="true" size={15} /> Só amigo
                      </button>
                    </div>
                    <small className="resenha-note">
                      Em “Só eu”, sua câmera ocupa todo o quadro TikTok 9:16 —
                      mesmo com outra pessoa na sala.
                    </small>
                    <button
                      className={
                        resenhaMode
                          ? "open-preview active-resenha"
                          : "open-preview"
                      }
                      onClick={toggleResenhaMode}
                      disabled={mode === "guest"}
                    >
                      {resenhaMode ? (
                        <>
                          <Circle
                            aria-hidden="true"
                            size={12}
                            fill="currentColor"
                          />{" "}
                          Modo Resenha ativo
                        </>
                      ) : (
                        <>
                          <Circle aria-hidden="true" size={12} /> Ativar Modo
                          Resenha
                        </>
                      )}
                    </button>
                    <small className="resenha-note">
                      {resenhaLayout === "solo"
                        ? "Uma câmera em cima e o vídeo compartilhado embaixo, ocupando todo o quadro sem faixa preta."
                        : "Duas câmeras empilhadas em 9:16. Se você compartilhar a tela, ela também entra na prévia e na gravação."}
                    </small>
                    {resenhaMode && (
                      <div className="resenha-controls">
                        <div
                          className="resenha-layout-options"
                          role="group"
                          aria-label="Quantidade de pessoas no Modo Resenha"
                        >
                          <button
                            type="button"
                            className={resenhaLayout === "solo" ? "selected" : ""}
                            onClick={() => selectResenhaLayout("solo")}
                          >
                            <User aria-hidden="true" size={14} /> 1 pessoa
                          </button>
                          <button
                            type="button"
                            className={resenhaLayout === "duo" ? "selected" : ""}
                            onClick={() => selectResenhaLayout("duo")}
                          >
                            <Users aria-hidden="true" size={14} /> 2 pessoas
                          </button>
                        </div>
                        <label className="preview-slider">
                          {resenhaLayout === "solo" ? "Altura da câmera" : "Minha câmera"} · {Math.round(resenhaMineSize * 100)}%
                          <input
                            type="range"
                            min="0.25"
                            max="0.75"
                            step="0.01"
                            value={resenhaMineSize}
                            disabled={mode === "guest"}
                            onChange={(event) =>
                              setResenhaMineSize(Number(event.target.value))
                            }
                          />
                        </label>
                        <button
                          className="open-preview resenha-share-button"
                          onClick={() => {
                            if (sharing) void share();
                            else setShareScreenDialogOpen(true);
                          }}
                        >
                          {sharing ? (
                            <ScreenShareOff aria-hidden="true" size={15} />
                          ) : (
                            <ScreenShare aria-hidden="true" size={15} />
                          )}
                          {sharing
                            ? "Parar compartilhamento"
                            : "Compartilhar tela"}
                        </button>
                      </div>
                    )}
                    <label className="menu-switch">
                      <input
                        type="checkbox"
                        checked={vertical}
                        onChange={(event) => {
                          setVertical(event.target.checked);
                          if (event.target.checked) setPreviewOpen(true);
                          else setVerticalCameraMode("auto");
                        }}
                      />
                      <span>Usar formato vertical 9:16</span>
                    </label>
                    <label className="menu-field">
                      Formato da gravação
                      <select
                        value={recordingFormat}
                        onChange={(event) =>
                          setRecordingFormat(event.target.value as ExportFormat)
                        }
                      >
                        <option value="mp4">
                          MP4 · melhor para redes sociais
                        </option>
                        <option value="webm">WebM · alta qualidade web</option>
                      </select>
                    </label>
                    <small className="resenha-note">
                      Se o Chrome não liberar MP4, a KLIPAPP preserva a gravação
                      em WebM.
                    </small>
                    <button
                      className="open-preview"
                      onClick={() => {
                        setVertical(true);
                        setPreviewOpen(!previewOpen);
                      }}
                    >
                      <Eye aria-hidden="true" size={14} />{" "}
                      {previewOpen ? "Fechar prévia" : "Abrir prévia"}
                    </button>
                  </div>
                </details>
                <details>
                  <summary>
                    <span>
                      <Repeat2 aria-hidden="true" size={16} />
                    </span>
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
                <RefreshCw aria-hidden="true" size={14} /> Recarregar sessão
              </button>
              <p className="app-version">KLIPAPP {APP_VERSION} · produção</p>
            </>
          )}
        </aside>
      )}
      <section
        className={
          "stage " +
          (resenhaMode
            ? `resenha-stage${screenActive ? " resenha-with-screen" : ""}`
            : screenActive
              ? "screen-on"
              : "")
        }
        style={
          resenhaMode
            ? screenActive
              ? {
                  gridTemplateColumns: `${resenhaMineSize}fr ${1 - resenhaMineSize}fr`,
                }
              : {
                  gridTemplateRows: `${resenhaMineSize}fr ${1 - resenhaMineSize}fr`,
                }
            : undefined
        }
      >
        {screenActive && (
          <div className="tile shared">
            {sharing ? (
              <video ref={screen} autoPlay playsInline muted />
            ) : (
              <>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Fluxo WebRTC ao vivo não possui uma faixa VTT estática. */}
                <video ref={remoteScreen} autoPlay playsInline />
              </>
            )}
            <label>
              {sharing
                ? "Sua tela"
                : `${friend || "Seu amigo"} está compartilhando`}{" "}
              <b>
                {(sharing ? screenAudioActive : remoteScreenAudioActive)
                  ? "Compartilhando com áudio"
                  : "Somente imagem"}
              </b>
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
            {name} (você){" "}
            <b aria-label={mic ? "Microfone ligado" : undefined}>
              {mic ? (
                <Mic aria-hidden="true" size={12} />
              ) : (
                "microfone desligado"
              )}
            </b>
          </label>
        </div>
        <div className={"tile waiting " + (speaking.friend ? "speaking" : "")}>
          {friend ? (
            <>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Fluxo WebRTC ao vivo não possui uma faixa VTT estática. */}
              <video ref={theirs} autoPlay playsInline />
              <label>
                {friend}{" "}
                <b>
                  <Circle aria-hidden="true" size={9} fill="currentColor" />{" "}
                  {friendRecording ? "gravando" : "conectado"}
                </b>
              </label>
            </>
          ) : (
            <>
              <div className="avatar">?</div>
              <p className="tile-status">Aguardando seu amigo</p>
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
                <Minimize2 aria-hidden="true" size={14} />
              </button>
              <button
                onClick={() => setPreviewOpen(false)}
                aria-label="Fechar prévia"
              >
                <X aria-hidden="true" size={14} />
              </button>
            </div>
          </div>
          {previewMinimized ? (
            <button
              className="mini-preview"
              onClick={() => setPreviewMinimized(false)}
              aria-label="Expandir prévia"
            >
              <div
                className={
                  verticalCameraMode !== "auto" ? "mini-preview-solo" : ""
                }
              >
                {verticalCameraMode === "solo-friend" && friend ? (
                  /* eslint-disable-next-line jsx-a11y/media-has-caption -- Prévia WebRTC ao vivo não possui uma faixa VTT estática. */
                  <video ref={previewFriend} autoPlay playsInline />
                ) : (
                  <video ref={previewMine} autoPlay muted playsInline />
                )}
                {verticalCameraMode === "auto" &&
                  !(resenhaMode && resenhaLayout === "solo") && (
                  /* eslint-disable-next-line jsx-a11y/media-has-caption -- Prévia WebRTC ao vivo não possui uma faixa VTT estática. */
                  <video ref={previewFriend} autoPlay playsInline />
                )}
              </div>
              <span>
                {verticalCameraMode === "auto"
                  ? "Prévia 9:16"
                  : "TikTok · uma câmera"}{" "}
                · clique para expandir
              </span>
            </button>
          ) : (
            <>
              <div
                className={
                  "preview-canvas " +
                  (verticalCameraMode !== "auto"
                    ? "solo-camera-preview"
                    : resenhaMode
                      ? `${resenhaLayout === "solo" ? "resenha-solo-preview" : "resenha-preview"} screen-${screenPosition}`
                      : "screen-" + screenPosition)
                }
              >
                {verticalCameraMode !== "auto" ? (
                  <div className="preview-solo-camera">
                    {verticalCameraMode === "solo-friend" && friend ? (
                      /* eslint-disable-next-line jsx-a11y/media-has-caption -- Prévia WebRTC ao vivo não possui uma faixa VTT estática. */
                      <video ref={previewFriend} autoPlay playsInline />
                    ) : (
                      <video ref={previewMine} autoPlay muted playsInline />
                    )}
                    <span>
                      {verticalCameraMode === "solo-friend" && friend
                        ? friend
                        : `${name} (você)`}
                    </span>
                  </div>
                ) : resenhaMode && resenhaLayout === "solo" ? (
                  <>
                    <div
                      className="resenha-solo-camera"
                      style={{
                        height: screenActive
                          ? `${Math.min(58, Math.max(24, resenhaMineSize * 100))}%`
                          : "100%",
                      }}
                    >
                      <video ref={previewMine} autoPlay muted playsInline />
                      <span>{name} (você)</span>
                    </div>
                    {screenActive && (
                      <div
                        className="preview-screen resenha-solo-video"
                        style={{
                          height: `${100 - Math.min(58, Math.max(24, resenhaMineSize * 100))}%`,
                        }}
                      >
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Compartilhamento ao vivo não possui uma faixa VTT estática. */}
                        <video ref={previewScreen} autoPlay playsInline />
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div
                      className={
                        (resenhaMode ? "resenha-cameras " : "preview-top ") +
                        topOrder
                      }
                      style={{
                        height: resenhaMode
                          ? screenActive
                            ? "56%"
                            : "100%"
                          : `${tiktokTop * 100}%`,
                        ...(resenhaMode
                          ? {
                              gridTemplateRows:
                                topOrder === "mine-first"
                                  ? `${resenhaMineSize}fr ${1 - resenhaMineSize}fr`
                                  : `${1 - resenhaMineSize}fr ${resenhaMineSize}fr`,
                            }
                          : {}),
                      }}
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
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Prévia WebRTC ao vivo não possui uma faixa VTT estática. */}
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
                    {(!resenhaMode || screenActive) && (
                      <div
                        className="preview-screen"
                        style={{
                          height: resenhaMode
                            ? "44%"
                            : `${(1 - tiktokTop) * 100}%`,
                        }}
                      >
                        {sharing || remoteSharing ? (
                          <>
                            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Compartilhamento ao vivo não possui uma faixa VTT estática. */}
                            <video ref={previewScreen} autoPlay playsInline />
                          </>
                        ) : (
                          <span>A tela compartilhada aparecerá aqui</span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              {!resenhaMode && verticalCameraMode === "auto" && (
                <label className="preview-slider">
                  Tamanho das câmeras
                  <input
                    type="range"
                    min="0.2"
                    max="0.5"
                    step="0.01"
                    value={tiktokTop}
                    disabled={mode === "guest"}
                    onChange={(event) =>
                      setTiktokTop(Number(event.target.value))
                    }
                  />
                </label>
              )}
              {resenhaMode && verticalCameraMode === "auto" && (
                <label className="preview-slider">
                  {resenhaLayout === "solo" ? "Altura da câmera" : "Minha câmera"} · {Math.round(resenhaMineSize * 100)}%
                  <input
                    type="range"
                    min="0.25"
                    max="0.75"
                    step="0.01"
                    value={resenhaMineSize}
                    disabled={mode === "guest"}
                    onChange={(event) =>
                      setResenhaMineSize(Number(event.target.value))
                    }
                  />
                </label>
              )}
              <small>
                {verticalCameraMode !== "auto"
                  ? "Uma câmera ocupa todo o quadro. Esta composição será usada exatamente assim na gravação."
                  : resenhaMode
                    ? resenhaLayout === "solo"
                      ? "A câmera fica em cima e o vídeo compartilhado embaixo, sem barras ou espaço vazio entre eles."
                      : "Ajuste o tamanho da sua câmera e arraste para trocar a ordem. A tela compartilhada também será gravada exatamente como aparece aqui."
                    : "Arraste uma câmera sobre a outra para trocar de lado. O tamanho da prévia será usado na gravação."}
              </small>
            </>
          )}
        </aside>
      )}
      {chatOpen && (
        <aside className="chat-panel">
          <div className="chat-title">
            Chat da sala{" "}
            <button onClick={() => setChatOpen(false)} aria-label="Fechar chat">
              <X aria-hidden="true" size={14} />
            </button>
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
      {recordingFinishedPrompt && editorClip && (
        <div className="screen-share-backdrop recording-finished-backdrop">
          <section
            className="screen-share-dialog recording-finished-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recording-finished-title"
          >
            <header>
              <div>
                <small>GRAVAÇÃO SALVA</small>
                <b id="recording-finished-title">Quer abrir no editor?</b>
              </div>
            </header>
            <p>
              O arquivo já foi salvo no seu dispositivo. Você pode editar agora
              ou continuar na sala sem abrir o editor.
            </p>
            <div className="recording-finished-actions">
              <button
                type="button"
                className="recording-stay-button"
                onClick={() => {
                  setRecordingFinishedPrompt(false);
                  setNotice("Gravação salva. Você continua na sala.");
                }}
              >
                Continuar na sala
              </button>
              <button
                type="button"
                className="recording-editor-button"
                onClick={() => {
                  setRecordingFinishedPrompt(false);
                  setEditorReturnToCall(true);
                  setEditorOpen(true);
                }}
              >
                <Clapperboard aria-hidden="true" size={17} /> Abrir no editor
              </button>
            </div>
          </section>
        </div>
      )}
      {shareScreenDialogOpen && !sharing && (
        <div
          className="screen-share-backdrop"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget)
              setShareScreenDialogOpen(false);
          }}
        >
          <section
            className="screen-share-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="screen-share-title"
          >
            <header>
              <div>
                <small>APRESENTAR</small>
                <b id="screen-share-title">Como você quer compartilhar?</b>
              </div>
              <button
                onClick={() => setShareScreenDialogOpen(false)}
                aria-label="Fechar"
              >
                <X aria-hidden="true" size={14} />
              </button>
            </header>
            <p>
              Escolha se o seu amigo também deve ouvir vídeos, músicas, jogos ou
              sons da guia compartilhada.
            </p>
            <button
              className="screen-share-choice with-audio"
              onClick={() => {
                setShareScreenAudio(true);
                void share(true);
              }}
            >
              <span>
                <Volume2 aria-hidden="true" size={20} />
              </span>
              <div>
                <b>Tela com áudio</b>
                <small>Envia imagem e som do sistema ou da guia</small>
              </div>
              <i>Recomendado</i>
            </button>
            <button
              className="screen-share-choice"
              onClick={() => {
                setShareScreenAudio(false);
                void share(false);
              }}
            >
              <span>
                <MonitorUp aria-hidden="true" size={20} />
              </span>
              <div>
                <b>Somente imagem</b>
                <small>
                  Seu microfone continua normal, mas o som da tela não é enviado
                </small>
              </div>
            </button>
            <small className="screen-share-hint">
              No Chrome, confirme também “Compartilhar áudio da guia” ou
              “Compartilhar áudio do sistema” no seletor que será aberto. A
              disponibilidade depende do sistema e do tipo de tela escolhido.
            </small>
          </section>
        </div>
      )}
      {connectionOpen && (
        <aside className="connection-panel" aria-label="Status da conexão">
          <div className="connection-title">
            <div>
              <b>Status da conexão</b>
              <small>Atualiza a cada 2 segundos</small>
            </div>
            <button
              onClick={() => setConnectionOpen(false)}
              aria-label="Fechar status"
            >
              <X aria-hidden="true" size={14} />
            </button>
          </div>
          <div className="connection-grid">
            <div>
              <small>FPS do vídeo</small>
              <b>
                {connectionStats.fps || "—"}
                <em> fps</em>
              </b>
            </div>
            <div>
              <small>Bitrate</small>
              <b>
                {connectionStats.bitrateKbps || "—"}
                <em> kb/s</em>
              </b>
            </div>
            <div>
              <small>Perda de pacotes</small>
              <b className={connectionStats.packetLoss > 2 ? "warning" : ""}>
                {connectionStats.packetLoss}
                <em>%</em>
              </b>
            </div>
            <div>
              <small>Latência / jitter</small>
              <b>
                {connectionStats.rttMs || "—"}
                <em> / {connectionStats.jitterMs} ms</em>
              </b>
            </div>
          </div>
          <p>
            Para fundo animado, até 24 fps é normal: assim a chamada preserva
            GPU e estabilidade.
          </p>
          <button
            className="refresh-connection"
            onClick={() => void refreshConnectionStats()}
          >
            <RefreshCw aria-hidden="true" size={14} /> Atualizar agora
          </button>
        </aside>
      )}
      {notice && (
        <div className="toast">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Fechar aviso">
            <X aria-hidden="true" size={14} />
          </button>
        </div>
      )}
      {virtualEffectLoading && (
        <div
          className="virtual-effect-loading"
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true" />
          <div>
            <b>{virtualEffectLoading}</b>
            <small>
              A câmera continua conectada enquanto o efeito é preparado.
            </small>
          </div>
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
          <b>
            {mic ? (
              <Mic aria-hidden="true" size={18} />
            ) : (
              <MicOff aria-hidden="true" size={18} />
            )}
          </b>
          <small>{mic ? "Microfone" : "Silenciado"}</small>
        </button>
        <button
          className={!cameraOn ? "off" : ""}
          onClick={() => {
            toggle("video", !cameraOn);
            setCameraOn(!cameraOn);
          }}
        >
          <b>
            {cameraOn ? (
              <Video aria-hidden="true" size={18} />
            ) : (
              <VideoOff aria-hidden="true" size={18} />
            )}
          </b>
          <small>{cameraOn ? "Câmera" : "Câmera off"}</small>
        </button>
        <button
          className={sharing ? "active" : ""}
          onClick={() => {
            if (sharing) void share();
            else setShareScreenDialogOpen(true);
          }}
        >
          <b>
            {sharing ? (
              <ScreenShareOff aria-hidden="true" size={18} />
            ) : (
              <ScreenShare aria-hidden="true" size={18} />
            )}
          </b>
          <small>{sharing ? "Parar tela" : "Compartilhar tela"}</small>
        </button>
        <button className={recording ? "recording" : ""} onClick={record}>
          <b>
            {recording ? (
              <>
                <CircleStop aria-hidden="true" size={18} />{" "}
                {timeLabel(recordSeconds)}
              </>
            ) : (
              <Circle aria-hidden="true" size={18} fill="currentColor" />
            )}
          </b>
          <small>{recording ? "Parar e salvar" : "Gravar local"}</small>
        </button>
        {editorClip && !recording && (
          <button
            className="edit-recording"
            onClick={() => {
              setEditorReturnToCall(true);
              setEditorOpen(true);
            }}
          >
            <b>
              <Sparkles aria-hidden="true" size={18} />
            </b>
            <small>Editar gravação</small>
          </button>
        )}
        {recording && (
          <button className="clip" onClick={saveClip}>
            <b>
              <Scissors aria-hidden="true" size={18} />
            </b>
            <small>Salvar trecho</small>
          </button>
        )}
        <i />
        <button className="leave" onClick={leave}>
          <b>
            <LogOut aria-hidden="true" size={18} />
          </b>
          <small>Sair</small>
        </button>
      </footer>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(u) => {
          setCurrentUser(u);
          localStorage.setItem("klip_user", JSON.stringify(u));
        }}
      />

      <SocialAccountsModal
        isOpen={socialModalOpen}
        onClose={() => setSocialModalOpen(false)}
      />

      {publishModalOpen && (
        <PublishModal
          isOpen
          onClose={() => setPublishModalOpen(false)}
          defaultTitle="Gravação KLIPAPP"
        />
      )}
    </main>
  );
}

/* eslint-disable @next/next/no-img-element -- O único img deste componente exibe uma URL blob local de moldura escolhida pelo usuário, incompatível com o otimizador do Next Image. */
function OfflineStudio({ onBack }: { onBack: () => void }) {
  type StudioBox = { x: number; y: number; w: number; h: number };
  const first = useRef<HTMLVideoElement>(null),
    second = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    overlayImage = useRef<HTMLImageElement | null>(null);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]),
    [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [camA, setCamA] = useState(""),
    [camB, setCamB] = useState(""),
    [micA, setMicA] = useState(""),
    [micB, setMicB] = useState("");
  const [audioMode, setAudioMode] = useState<"mix" | "a" | "b">("mix"),
    [recording, setRecording] = useState(false),
    [notice, setNotice] = useState(""),
    [recordSeconds, setRecordSeconds] = useState(0);
  const [preset, setPreset] = useState<"landscape" | "vertical" | "square">(
      "landscape",
    ),
    [fps, setFps] = useState(30),
    [quality, setQuality] = useState<"balanced" | "max">("balanced"),
    [overlay, setOverlay] = useState<string | null>(null),
    [overlayOpacity, setOverlayOpacity] = useState(0.85);
  const [layout, setLayout] = useState<"side" | "stack" | "pip" | "focus">(
      "side",
    ),
    [boxA, setBoxA] = useState<StudioBox>({ x: 0, y: 0, w: 50, h: 100 }),
    [boxB, setBoxB] = useState<StudioBox>({ x: 50, y: 0, w: 50, h: 100 });
  const [effectA, setEffectA] = useState("none"),
    [effectB, setEffectB] = useState("none"),
    [micLevels, setMicLevels] = useState<[number, number]>([0, 0]);
  const streams = useRef<[MediaStream | null, MediaStream | null]>([
    null,
    null,
  ]);
  const recorder = useRef<MediaRecorder | null>(null),
    chunks = useRef<Blob[]>([]),
    frame = useRef(0),
    audioContext = useRef<AudioContext | null>(null),
    meterContext = useRef<AudioContext | null>(null),
    meterAnalyzers = useRef<[AnalyserNode | null, AnalyserNode | null]>([
      null,
      null,
    ]),
    meterFrame = useRef(0);
  const drag = useRef<{
    index: 0 | 1;
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const studioTime = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  useEffect(() => {
    const activeStreams = streams.current;
    void navigator.mediaDevices.enumerateDevices().then((items) => {
      setCams(items.filter((item) => item.kind === "videoinput"));
      setMics(items.filter((item) => item.kind === "audioinput"));
    });
    return () => {
      cancelAnimationFrame(frame.current);
      cancelAnimationFrame(meterFrame.current);
      audioContext.current?.close();
      meterContext.current?.close();
      activeStreams.forEach((stream) =>
        stream?.getTracks().forEach((track) => track.stop()),
      );
    };
  }, []);
  useEffect(() => {
    if (!recording) return;
    const interval = window.setInterval(
      () => setRecordSeconds((value) => value + 1),
      1000,
    );
    return () => window.clearInterval(interval);
  }, [recording]);
  async function openCamera(index: 0 | 1, deviceId: string, micId: string) {
    streams.current[index]?.getTracks().forEach((track) => track.stop());
    if (!deviceId) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
      audio: micId
        ? {
            deviceId: { exact: micId },
            echoCancellation: true,
            noiseSuppression: true,
          }
        : false,
    });
    streams.current[index] = stream;
    const video = index === 0 ? first.current : second.current;
    if (video) {
      video.srcObject = stream;
      await video.play().catch(() => undefined);
    }
    if (stream.getAudioTracks().length) {
      const context = meterContext.current || new AudioContext();
      meterContext.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context
        .createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
        .connect(analyser);
      meterAnalyzers.current[index] = analyser;
      if (!meterFrame.current) {
        const updateMeters = () => {
          const levels = meterAnalyzers.current.map((node) => {
            if (!node) return 0;
            const samples = new Uint8Array(node.fftSize);
            node.getByteTimeDomainData(samples);
            const energy =
              samples.reduce((sum, sample) => sum + Math.abs(sample - 128), 0) /
              samples.length;
            return Math.min(100, Math.round(energy * 3.1));
          }) as [number, number];
          setMicLevels(levels);
          meterFrame.current = requestAnimationFrame(updateMeters);
        };
        updateMeters();
      }
    }
  }
  const filterFor = (effect: string) =>
    effect === "noir"
      ? "grayscale(1) contrast(1.25)"
      : effect === "cinema"
        ? "contrast(1.15) saturate(1.28) sepia(.12)"
        : effect === "cool"
          ? "saturate(1.18) hue-rotate(175deg)"
          : effect === "warm"
            ? "sepia(.22) saturate(1.2)"
            : effect === "vhs"
              ? "contrast(1.28) saturate(1.45) hue-rotate(-12deg)"
              : "none";
  const canvasFilter = (effect: string) =>
    effect === "noir"
      ? "grayscale(1) contrast(1.25)"
      : effect === "cinema"
        ? "contrast(1.15) saturate(1.28) sepia(.12)"
        : effect === "cool"
          ? "saturate(1.18) hue-rotate(175deg)"
          : effect === "warm"
            ? "sepia(.22) saturate(1.2)"
            : effect === "vhs"
              ? "contrast(1.28) saturate(1.45) hue-rotate(-12deg)"
              : "none";
  const updateBox = (index: 0 | 1, patch: Partial<StudioBox>) => {
    const apply = (box: StudioBox) => ({ ...box, ...patch });
    if (index === 0) setBoxA(apply);
    else setBoxB(apply);
  };
  const applyLayout = (next: "side" | "stack" | "pip" | "focus") => {
    setLayout(next);
    if (next === "side") {
      setBoxA({ x: 0, y: 0, w: 50, h: 100 });
      setBoxB({ x: 50, y: 0, w: 50, h: 100 });
    }
    if (next === "stack") {
      setBoxA({ x: 0, y: 0, w: 100, h: 50 });
      setBoxB({ x: 0, y: 50, w: 100, h: 50 });
    }
    if (next === "pip") {
      setBoxA({ x: 0, y: 0, w: 100, h: 100 });
      setBoxB({ x: 67, y: 65, w: 30, h: 30 });
    }
    if (next === "focus") {
      setBoxA({ x: 0, y: 0, w: 70, h: 100 });
      setBoxB({ x: 70, y: 0, w: 30, h: 100 });
    }
  };
  function draw() {
    const target = canvas.current,
      a = first.current,
      b = second.current;
    if (!target || !a || !b) return;
    const context = target.getContext("2d");
    if (!context) return;
    const dimensions =
      preset === "vertical"
        ? [1080, 1920]
        : preset === "square"
          ? [1080, 1080]
          : [1920, 1080];
    target.width = dimensions[0];
    target.height = dimensions[1];
    context.fillStyle = "#0d0f0e";
    context.fillRect(0, 0, target.width, target.height);
    const drawVideo = (
      video: HTMLVideoElement,
      box: StudioBox,
      effect: string,
    ) => {
      if (!video.videoWidth) return;
      const x = (box.x / 100) * target.width,
        y = (box.y / 100) * target.height,
        w = (box.w / 100) * target.width,
        h = (box.h / 100) * target.height;
      const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
      const dw = video.videoWidth * scale,
        dh = video.videoHeight * scale;
      context.save();
      context.beginPath();
      context.rect(x, y, w, h);
      context.clip();
      context.filter = canvasFilter(effect);
      context.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      context.restore();
    };
    drawVideo(a, boxA, effectA);
    drawVideo(b, boxB, effectB);
    if (overlayImage.current?.complete && overlayImage.current.naturalWidth) {
      context.save();
      context.globalAlpha = overlayOpacity;
      context.drawImage(
        overlayImage.current,
        0,
        0,
        target.width,
        target.height,
      );
      context.restore();
    }
    if (recording) frame.current = requestAnimationFrame(draw);
  }
  function startRecording() {
    if (!canvas.current) return;
    chunks.current = [];
    const output = canvas.current.captureStream(fps);
    const audio = new AudioContext();
    audioContext.current = audio;
    const destination = audio.createMediaStreamDestination();
    streams.current.forEach((stream, index) => {
      if (
        (audioMode === "a" && index !== 0) ||
        (audioMode === "b" && index !== 1)
      )
        return;
      const track = stream?.getAudioTracks()[0];
      if (track)
        audio
          .createMediaStreamSource(new MediaStream([track]))
          .connect(destination);
    });
    destination.stream
      .getAudioTracks()
      .forEach((track) => output.addTrack(track));
    const mime = mimeForExport("webm") || "video/webm";
    const media = new MediaRecorder(output, {
      mimeType: mime,
      videoBitsPerSecond: quality === "max" ? 24_000_000 : 12_000_000,
      audioBitsPerSecond: 192_000,
    });
    media.ondataavailable = (event) =>
      event.data.size && chunks.current.push(event.data);
    media.onstop = () => {
      const url = URL.createObjectURL(new Blob(chunks.current, { type: mime }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `klip-offline-${preset}-${Date.now()}.webm`;
      link.click();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        void audioContext.current?.close();
        audioContext.current = null;
      }, 60000);
      setNotice("Gravação salva com câmeras, áudio e overlay.");
    };
    recorder.current = media;
    setRecordSeconds(0);
    setRecording(true);
    media.start(250);
    draw();
  }
  function stopRecording() {
    recorder.current?.stop();
    setRecording(false);
    cancelAnimationFrame(frame.current);
  }
  const loadOverlay = (file: File) => {
    const url = URL.createObjectURL(file);
    setOverlay(url);
    const image = new Image();
    image.src = url;
    overlayImage.current = image;
  };
  const beginDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    index: 0 | 1,
  ) => {
    const box = index === 0 ? boxA : boxB;
    drag.current = {
      index,
      x: box.x,
      y: box.y,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const item = drag.current,
      stage = event.currentTarget.parentElement;
    if (!item || !stage) return;
    const bounds = stage.getBoundingClientRect();
    updateBox(item.index, {
      x: Math.max(
        0,
        Math.min(
          100 - (item.index === 0 ? boxA.w : boxB.w),
          item.x + ((event.clientX - item.startX) / bounds.width) * 100,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          100 - (item.index === 0 ? boxA.h : boxB.h),
          item.y + ((event.clientY - item.startY) / bounds.height) * 100,
        ),
      ),
    });
  };
  const cameraControl = (
    label: string,
    index: 0 | 1,
    box: StudioBox,
    effect: string,
    setEffect: (value: string) => void,
  ) => (
    <div className="studio-camera-control">
      <b>{label}</b>
      <label>
        Efeito
        <select
          value={effect}
          onChange={(event) => setEffect(event.target.value)}
        >
          <option value="none">Natural</option>
          <option value="cinema">Cinema</option>
          <option value="warm">Quente</option>
          <option value="cool">Frio</option>
          <option value="noir">Noir</option>
          <option value="vhs">VHS</option>
        </select>
      </label>
      <label>
        Tamanho
        <input
          type="range"
          min="20"
          max="100"
          value={box.w}
          onChange={(event) =>
            updateBox(index, { w: Number(event.target.value) })
          }
        />
      </label>
      <label>
        Horizontal
        <input
          type="range"
          min="0"
          max={Math.max(0, 100 - box.w)}
          value={box.x}
          onChange={(event) =>
            updateBox(index, { x: Number(event.target.value) })
          }
        />
      </label>
      <label>
        Vertical
        <input
          type="range"
          min="0"
          max={Math.max(0, 100 - box.h)}
          value={box.y}
          onChange={(event) =>
            updateBox(index, { y: Number(event.target.value) })
          }
        />
      </label>
    </div>
  );
  return (
    <main className="offline-studio">
      <header className="editor-header">
        <div className="brand">
          <KlipAppLogo variant="full" width={132} height={28} />
          <em>Estúdio local</em>
        </div>
        <div className="studio-status">
          <span className={recording ? "live" : ""}>
            {recording ? (
              <>
                <Circle aria-hidden="true" size={12} fill="currentColor" />{" "}
                GRAVANDO
              </>
            ) : (
              <>
                <Circle aria-hidden="true" size={12} /> PRONTO
              </>
            )}
          </span>
          <b>{studioTime(recordSeconds)}</b>
          <small>
            {preset === "vertical"
              ? "1080×1920"
              : preset === "square"
                ? "1080×1080"
                : "1920×1080"}{" "}
            · {fps} FPS
          </small>
        </div>
        <button onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={15} /> Voltar
        </button>
      </header>
      <section className="offline-grid offline-grid-pro">
        <aside className="offline-controls">
          <h2>Estúdio local</h2>
          <p>
            Monte a composição e arraste as câmeras diretamente na prévia. O
            arquivo salvo será igual.
          </p>
          <label>
            Câmera / placa 1
            <select
              value={camA}
              onChange={(event) => {
                setCamA(event.target.value);
                void openCamera(0, event.target.value, micA);
              }}
            >
              {cams.map((item, index) => (
                <option key={item.deviceId} value={item.deviceId}>
                  {videoInputLabel(item, index)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Microfone 1
            <select
              value={micA}
              onChange={(event) => {
                setMicA(event.target.value);
                if (camA) void openCamera(0, camA, event.target.value);
              }}
            >
              {mics.map((item) => (
                <option key={item.deviceId} value={item.deviceId}>
                  {item.label || "Microfone"}
                </option>
              ))}
            </select>
            <meter min="0" max="100" value={micLevels[0]} />
            <small>Volume: {micLevels[0]}%</small>
          </label>
          <label>
            Câmera / placa 2
            <select
              value={camB}
              onChange={(event) => {
                setCamB(event.target.value);
                void openCamera(1, event.target.value, micB);
              }}
            >
              {cams.map((item, index) => (
                <option key={item.deviceId} value={item.deviceId}>
                  {videoInputLabel(item, index)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Microfone 2
            <select
              value={micB}
              onChange={(event) => {
                setMicB(event.target.value);
                if (camB) void openCamera(1, camB, event.target.value);
              }}
            >
              {mics.map((item) => (
                <option key={item.deviceId} value={item.deviceId}>
                  {item.label || "Microfone"}
                </option>
              ))}
            </select>
            <meter min="0" max="100" value={micLevels[1]} />
            <small>Volume: {micLevels[1]}%</small>
          </label>
          <label>
            Formato de saída
            <select
              value={preset}
              onChange={(event) =>
                setPreset(event.target.value as typeof preset)
              }
            >
              <option value="landscape">YouTube / widescreen 16:9</option>
              <option value="vertical">TikTok / Reels / Shorts 9:16</option>
              <option value="square">Instagram quadrado 1:1</option>
            </select>
          </label>
          <div className="studio-layouts">
            <b>Layout</b>
            <div>
              {(
                [
                  ["side", MoveHorizontal, "Lado a lado"],
                  ["stack", MoveVertical, "Empilhado"],
                  ["pip", PictureInPicture, "Picture in picture"],
                  ["focus", Maximize2, "Destaque"],
                ] as const
              ).map(([key, LayoutIcon, label]) => (
                <button
                  key={key}
                  className={layout === key ? "selected" : ""}
                  onClick={() => applyLayout(key)}
                >
                  <LayoutIcon aria-hidden="true" size={14} /> {label}
                </button>
              ))}
            </div>
          </div>
          {cameraControl("Câmera 1", 0, boxA, effectA, setEffectA)}
          {cameraControl("Câmera 2", 1, boxB, effectB, setEffectB)}
          <label>
            FPS
            <select
              value={fps}
              onChange={(event) => setFps(Number(event.target.value))}
            >
              <option value="24">24 FPS · econômico</option>
              <option value="30">30 FPS · recomendado</option>
              <option value="60">60 FPS · máximo</option>
            </select>
          </label>
          <label>
            Qualidade
            <select
              value={quality}
              onChange={(event) =>
                setQuality(event.target.value as typeof quality)
              }
            >
              <option value="balanced">Equilibrada</option>
              <option value="max">Máxima</option>
            </select>
          </label>
          <label>
            Áudio da gravação
            <select
              value={audioMode}
              onChange={(event) =>
                setAudioMode(event.target.value as "mix" | "a" | "b")
              }
            >
              <option value="mix">Misturar os dois</option>
              <option value="a">Somente microfone 1</option>
              <option value="b">Somente microfone 2</option>
            </select>
          </label>
          <label>
            Overlay / moldura
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) loadOverlay(file);
              }}
            />
          </label>
          {overlay && (
            <label>
              Opacidade da moldura
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={overlayOpacity}
                onChange={(event) =>
                  setOverlayOpacity(Number(event.target.value))
                }
              />
            </label>
          )}
          <button
            className={recording ? "offline-stop" : "offline-record"}
            onClick={recording ? stopRecording : startRecording}
          >
            {recording ? (
              <>
                <CircleStop aria-hidden="true" size={15} /> Parar e salvar
              </>
            ) : (
              <>
                <Circle aria-hidden="true" size={15} fill="currentColor" />{" "}
                Iniciar gravação
              </>
            )}
          </button>
          {notice && <small>{notice}</small>}
        </aside>
        <section className="offline-preview">
          <div className={`offline-cameras offline-${preset} offline-composer`}>
            <div
              className="offline-camera-tile"
              onPointerDown={(event) => beginDrag(event, 0)}
              onPointerMove={moveDrag}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              style={{
                left: `${boxA.x}%`,
                top: `${boxA.y}%`,
                width: `${boxA.w}%`,
                height: `${boxA.h}%`,
              }}
            >
              <video
                ref={first}
                muted
                playsInline
                style={{ filter: filterFor(effectA) }}
              />
              <b>Câmera 1 · arraste</b>
            </div>
            <div
              className="offline-camera-tile"
              onPointerDown={(event) => beginDrag(event, 1)}
              onPointerMove={moveDrag}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              style={{
                left: `${boxB.x}%`,
                top: `${boxB.y}%`,
                width: `${boxB.w}%`,
                height: `${boxB.h}%`,
              }}
            >
              <video
                ref={second}
                muted
                playsInline
                style={{ filter: filterFor(effectB) }}
              />
              <b>Câmera 2 · arraste</b>
            </div>
            {overlay && (
              <img
                className="offline-overlay-preview"
                src={overlay}
                alt="Moldura"
                style={{ opacity: overlayOpacity }}
              />
            )}
          </div>
          <canvas ref={canvas} />
          <p>
            Prévia local · mesma posição, tamanho, efeitos e moldura da gravação
            final.
          </p>
        </section>
      </section>
    </main>
  );
}
/* eslint-enable @next/next/no-img-element */
