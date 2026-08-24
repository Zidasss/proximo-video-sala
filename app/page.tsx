"use client";

import { useEffect, useRef, useState } from "react";
import Peer, { DataConnection, MediaConnection } from "peerjs";

type Quality = "720" | "1080";
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
const code = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const hostId = (room: string, pin: string) => `proximo-${room}-${pin}`;
const APP_VERSION = "v0.10.0";
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
    [cameraOn, setCameraOn] = useState(true),
    [sharing, setSharing] = useState(false),
    [remoteSharing, setRemoteSharing] = useState(false),
    [recording, setRecording] = useState(false),
    [recordSeconds, setRecordSeconds] = useState(0),
    [vertical, setVertical] = useState(false),
    [previewOpen, setPreviewOpen] = useState(false),
    [topOrder, setTopOrder] = useState<"mine-first" | "friend-first">(
      "mine-first",
    ),
    [screenPosition, setScreenPosition] = useState<"top" | "bottom">("bottom"),
    [tiktokTop, setTiktokTop] = useState(0.325),
    [dragging, setDragging] = useState(""),
    [background, setBackground] = useState(""),
    [backgroundMode, setBackgroundMode] = useState<"none" | "image" | "blur">(
      "none",
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
    cameraCalls = useRef<MediaConnection[]>([]),
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
      frame = 0,
      lastInferenceAt = 0,
      attached = false;
    const source = document.createElement("video"),
      canvas = document.createElement("canvas"),
      context = canvas.getContext("2d"),
      image = new Image();
    source.srcObject = local.current;
    source.muted = true;
    source.playsInline = true;
    image.src = background;
    const run = async () => {
      await source.play();
      if (!active || !context) return;
      canvas.width = source.videoWidth || 1280;
      canvas.height = source.videoHeight || 720;
      // Fundo virtual já recebe uma máscara limitada; 20 fps reduz bastante a
      // carga da webcam, do encoder e da chamada sem deixar o movimento duro.
      const output = canvas.captureStream(20);
      try {
        const { SelfieSegmentation } =
          await import("@mediapipe/selfie_segmentation");
        const segmenter = new SelfieSegmentation({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
        });
        // O modelo geral trabalha com uma máscara quadrada mais detalhada e
        // preserva melhor mãos, cabelo e braços no fundo virtual.
        segmenter.setOptions({ modelSelection: 0, selfieMode: false });
        segmenter.onResults((results) => {
          if (!active || !context) return;
          context.save();
          context.clearRect(0, 0, canvas.width, canvas.height);
          // A borda da máscara recebe só um anti-alias discreto. Um blur alto
          // aqui vaza o fundo sobre a pessoa e deixa o resultado "recortado".
          context.filter = "blur(.35px)";
          context.drawImage(
            results.segmentationMask,
            0,
            0,
            canvas.width,
            canvas.height,
          );
          context.filter = "none";
          context.globalCompositeOperation = "source-in";
          context.filter = skinSmooth
            ? "blur(.22px) brightness(1.012) contrast(.992) saturate(.985)"
            : "none";
          context.drawImage(results.image, 0, 0, canvas.width, canvas.height);
          context.globalCompositeOperation = "destination-over";
          if (backgroundMode === "blur") {
            const strength = blurAmountRef.current;
            context.filter = `blur(${strength}px) brightness(.9) saturate(.93)`;
            context.drawImage(
              results.image,
              -strength,
              -strength,
              canvas.width + strength * 2,
              canvas.height + strength * 2,
            );
            context.filter = "none";
          } else {
            const scale = Math.max(
                canvas.width / (image.naturalWidth || canvas.width),
                canvas.height / (image.naturalHeight || canvas.height),
              ),
              width = (image.naturalWidth || canvas.width) * scale,
              height = (image.naturalHeight || canvas.height) * scale;
            context.drawImage(
              image,
              (canvas.width - width) / 2,
              (canvas.height - height) / 2,
              width,
              height,
            );
          }
          context.restore();
          if (!attached) {
            processedLocal.current = output;
            replaceOutgoingVideo(output);
            // Alguns navegadores/implementações WebRTC não aplicam replaceTrack
            // numa chamada que já estava negociada. Uma chamada curta de atualização
            // garante que o outro participante passe a receber a câmera processada.
            refreshCameraForPeer();
            if (mine.current) {
              mine.current.srcObject = output;
              void mine.current.play().catch(() => undefined);
            }
            setVirtualEpoch((epoch) => epoch + 1);
            attached = true;
          }
        });
        const next = async () => {
          if (!active) return;
          // A máscara em até 10 fps é estável para vídeo e deixa CPU suficiente
          // para a chamada WebRTC. O canvas continua emitindo a 30 fps.
          if (performance.now() - lastInferenceAt < 100) {
            frame = requestAnimationFrame(() => void next());
            return;
          }
          lastInferenceAt = performance.now();
          await segmenter.send({ image: source });
          frame = requestAnimationFrame(() => void next());
        };
        void next();
        return () => {
          cancelAnimationFrame(frame);
          void segmenter.close();
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
      stop = cleanup;
    });
    return () => {
      active = false;
      stop?.();
    };
  }, [
    background,
    backgroundMode,
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
      });
  }, [mode, topOrder, screenPosition, tiktokTop]);
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
  }, [inRoom, friend]);

  async function devicesList() {
    const list = await navigator.mediaDevices.enumerateDevices();
    setDevices(list.filter((item) => item.kind === "videoinput"));
    setAudioInputs(list.filter((item) => item.kind === "audioinput"));
    setAudioOutputs(list.filter((item) => item.kind === "audiooutput"));
  }
  function showRemote(stream: MediaStream, remoteName: string) {
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
      ...stream.getAudioTracks(),
    ]);
  }
  function replaceOutgoingVideo(stream: MediaStream) {
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    cameraCalls.current.forEach((call) =>
      call.peerConnection
        ?.getSenders()
        .filter((sender) => sender.track?.kind === "video")
        .forEach((sender) => void sender.replaceTrack(track)),
    );
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
      conn.send({ kind: "name", name });
      if (mode === "host")
        conn.send({ kind: "layout", topOrder, screenPosition, tiktokTop });
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
        return;
      }
      if (data.kind === "chat" && data.name && data.text)
        setMessages((old) => [...old, { name: data.name!, text: data.text! }]);
    });
  }
  function startPeer(stream: MediaStream) {
    peer.current?.destroy();
    const isHost = mode === "host";
    const client = isHost ? new Peer(hostId(room, pin)) : new Peer();
    peer.current = client;
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
      peerRetry.current = 0;
      if (isHost) {
        setNotice("Sala pronta. Copie o convite e mantenha esta aba aberta.");
        return;
      }
      const call = client.call(hostId(room, pin), callStream(stream), {
        metadata: { name, kind: "camera" },
      });
      useCall(call, owner || "Anfitrião");
      useData(client.connect(hostId(room, pin)));
      setNotice("Conectando à sala…");
    });
    client.on("error", (error) => {
      if (
        (error.type === "peer-unavailable" ||
          error.type === "unavailable-id") &&
        peerRetry.current < 5
      ) {
        peerRetry.current += 1;
        setNotice("Reconectando à sala…");
        window.setTimeout(() => {
          if (peer.current === client) startPeer(stream);
        }, 1200);
      } else if (error.type === "peer-unavailable")
        setNotice(
          "O anfitrião ainda não está nesta sala. Peça para ele criar a sala primeiro.",
        );
      else if (error.type === "unavailable-id")
        setNotice("Esta sala já está aberta em outra aba.");
      else
        setNotice(
          "Não foi possível conectar. Atualize a página e tente novamente.",
        );
    });
  }
  async function join(chosen = deviceId, chosenAudio = audioInputId) {
    if (!name.trim()) {
      setNotice("Informe seu nome antes de entrar na sala.");
      return;
    }
    if (!inRoom) setBooting(true);
    try {
      local.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia(
        constraints(quality, chosen || undefined, chosenAudio || undefined),
      );
      local.current = stream;
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
    const reader = new FileReader();
    reader.onload = () => {
      setBackground(String(reader.result));
      setBackgroundMode("image");
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
    link.download = `proximo-${label}-${Date.now()}.webm`;
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
      context.strokeStyle = "#b9ff4d";
      context.lineWidth = 10;
      context.shadowColor = "#b9ff4d";
      context.shadowBlur = 18;
      context.strokeRect(x + 5, y + 5, width - 10, height - 10);
      context.restore();
    };
    const draw = () => {
      if (!recorder.current || recorder.current.state === "inactive") return;
      context.fillStyle = "#101210";
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (vertical) {
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
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";
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
      if (vertical) {
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
      <ClipEditor
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
                          accept="image/*"
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
      <section className={"stage " + (screenActive ? "screen-on" : "")}>
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
              <div className={"preview-canvas screen-" + screenPosition}>
                <div
                  className={"preview-top " + topOrder}
                  style={{ height: `${tiktokTop * 100}%` }}
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
              </div>
              <label className="preview-slider">
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
              </label>
              <small>
                Arraste uma câmera sobre a outra para trocar de lado. O tamanho
                da prévia será usado na gravação.
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
