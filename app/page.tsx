"use client";

import { useEffect, useRef, useState } from "react";
import Peer, { DataConnection, MediaConnection } from "peerjs";

type Quality = "720" | "1080";
type Msg = { name: string; text: string };
const code = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const hostId = (room: string, pin: string) => `proximo-${room}-${pin}`;
const constraints = (quality: Quality, deviceId?: string): MediaStreamConstraints => ({
  video: { width: { ideal: quality === "1080" ? 1920 : 1280 }, height: { ideal: quality === "1080" ? 1080 : 720 }, frameRate: { ideal: 30 }, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) },
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
});

export default function Home() {
  const [inRoom, setInRoom] = useState(false);
  const [room, setRoom] = useState("------"), [pin, setPin] = useState("----");
  const [name, setName] = useState(""), [owner, setOwner] = useState("");
  const [mode, setMode] = useState<"host" | "guest">("host");
  const [quality, setQuality] = useState<Quality>("1080"), [deviceId, setDeviceId] = useState(""), [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [mic, setMic] = useState(true), [cameraOn, setCameraOn] = useState(true), [sharing, setSharing] = useState(false), [remoteSharing, setRemoteSharing] = useState(false), [recording, setRecording] = useState(false), [vertical, setVertical] = useState(false), [background, setBackground] = useState(""), [backgroundMode, setBackgroundMode] = useState<"none" | "image" | "blur">("none"), [cameraEpoch, setCameraEpoch] = useState(0);
  const [friend, setFriend] = useState(""), [notice, setNotice] = useState(""), [chatOpen, setChatOpen] = useState(false), [draft, setDraft] = useState(""), [messages, setMessages] = useState<Msg[]>([]);
  const local = useRef<MediaStream | null>(null), remote = useRef<MediaStream | null>(null), displayed = useRef<MediaStream | null>(null), remoteDisplayed = useRef<MediaStream | null>(null);
  const peer = useRef<Peer | null>(null), connection = useRef<DataConnection | null>(null), remoteId = useRef(""), recorder = useRef<MediaRecorder | null>(null);
  const mine = useRef<HTMLVideoElement>(null), theirs = useRef<HTMLVideoElement>(null), screen = useRef<HTMLVideoElement>(null), remoteScreen = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const invitedRoom = (query.get("sala") || "").replace(/\D/g, ""), invitedPin = (query.get("senha") || "").replace(/\D/g, "");
    if (invitedRoom.length === 6 && invitedPin.length === 4) {
      setRoom(invitedRoom); setPin(invitedPin); setOwner((query.get("anfitriao") || "Anfitrião").slice(0, 40)); setMode("guest");
    } else { setRoom(code(6)); setPin(code(4)); }
  }, []);
  useEffect(() => () => { peer.current?.destroy(); local.current?.getTracks().forEach(track => track.stop()); displayed.current?.getTracks().forEach(track => track.stop()); }, []);
  useEffect(() => {
    if (inRoom && mine.current && local.current) { mine.current.srcObject = local.current; void mine.current.play().catch(() => undefined); }
    if (friend && theirs.current && remote.current) { theirs.current.srcObject = remote.current; void theirs.current.play().catch(() => undefined); }
    if (sharing && screen.current && displayed.current) { screen.current.srcObject = displayed.current; void screen.current.play().catch(() => undefined); }
    if (remoteSharing && remoteScreen.current && remoteDisplayed.current) { remoteScreen.current.srcObject = remoteDisplayed.current; void remoteScreen.current.play().catch(() => undefined); }
  }, [inRoom, friend, sharing, remoteSharing]);
  useEffect(() => {
    if (!inRoom || backgroundMode === "none" || !local.current) return;
    let active = true, frame = 0, attached = false;
    const source = document.createElement("video"), canvas = document.createElement("canvas"), context = canvas.getContext("2d"), image = new Image();
    source.srcObject = local.current; source.muted = true; source.playsInline = true; image.src = background;
    const run = async () => {
      await source.play(); if (!active || !context) return;
      canvas.width = source.videoWidth || 1280; canvas.height = source.videoHeight || 720;
      const output = canvas.captureStream(30);
      try {
        const { SelfieSegmentation } = await import("@mediapipe/selfie_segmentation");
        const segmenter = new SelfieSegmentation({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}` });
        segmenter.setOptions({ modelSelection: 1, selfieMode: true });
        segmenter.onResults(results => { if (!active || !context) return; context.save(); context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height); context.globalCompositeOperation = "source-out"; if (backgroundMode === "blur") { context.filter = "blur(18px)"; context.drawImage(results.image, -18, -18, canvas.width + 36, canvas.height + 36); context.filter = "none"; } else { const scale = Math.max(canvas.width / (image.naturalWidth || canvas.width), canvas.height / (image.naturalHeight || canvas.height)), width = (image.naturalWidth || canvas.width) * scale, height = (image.naturalHeight || canvas.height) * scale; context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height); } context.globalCompositeOperation = "destination-atop"; context.drawImage(results.image, 0, 0, canvas.width, canvas.height); context.restore(); if (!attached && mine.current) { mine.current.srcObject = output; void mine.current.play().catch(() => undefined); attached = true; } });
        const next = async () => { if (!active) return; await segmenter.send({ image: source }); frame = requestAnimationFrame(() => void next()); };
        void next(); return () => { cancelAnimationFrame(frame); void segmenter.close(); output.getTracks().forEach(track => track.stop()); };
      } catch { setNotice("Não foi possível aplicar o fundo virtual. A câmera continua normal."); output.getTracks().forEach(track => track.stop()); }
    };
    let stop: (() => void) | undefined; void run().then(cleanup => { stop = cleanup; });
    return () => { active = false; stop?.(); };
  }, [background, backgroundMode, cameraEpoch, inRoom]);

  async function devicesList() {
    const list = await navigator.mediaDevices.enumerateDevices();
    setDevices(list.filter(item => item.kind === "videoinput"));
  }
  function showRemote(stream: MediaStream, remoteName: string) {
    remote.current = stream;
    if (theirs.current) { theirs.current.srcObject = stream; void theirs.current.play().catch(() => undefined); }
    setFriend(remoteName || "Seu amigo"); setNotice("Conectado com seu amigo.");
  }
  function useCall(call: MediaConnection, fallback: string) {
    remoteId.current = call.peer;
    call.on("stream", stream => showRemote(stream, String(call.metadata?.name || fallback)));
    call.on("error", () => setNotice("A chamada caiu. Atualize os dois navegadores e tente novamente."));
  }
  function useData(conn: DataConnection) {
    connection.current = conn;
    conn.on("open", () => conn.send({ kind: "name", name }));
    conn.on("data", item => {
      const data = item as { kind?: string; name?: string; text?: string };
      if (data.kind === "name" && data.name) setFriend(data.name);
      if (data.kind === "chat" && data.name && data.text) setMessages(old => [...old, { name: data.name!, text: data.text! }]);
    });
  }
  function startPeer(stream: MediaStream) {
    peer.current?.destroy();
    const isHost = mode === "host";
    const client = isHost ? new Peer(hostId(room, pin)) : new Peer();
    peer.current = client;
    client.on("connection", useData);
    client.on("call", call => {
      if (call.metadata?.kind === "screen") {
        call.answer();
        call.on("stream", shared => {
          remoteDisplayed.current = shared;
          if (remoteScreen.current) { remoteScreen.current.srcObject = shared; void remoteScreen.current.play().catch(() => undefined); }
          setRemoteSharing(true);
        });
        call.on("close", () => setRemoteSharing(false));
        return;
      }
      call.answer(stream);
      useCall(call, String(call.metadata?.name || "Seu amigo"));
    });
    client.on("open", () => {
      if (isHost) { setNotice("Sala pronta. Copie o convite e mantenha esta aba aberta."); return; }
      const call = client.call(hostId(room, pin), stream, { metadata: { name, kind: "camera" } });
      useCall(call, owner || "Anfitrião");
      useData(client.connect(hostId(room, pin)));
      setNotice("Conectando à sala…");
    });
    client.on("error", error => {
      if (error.type === "peer-unavailable") setNotice("O anfitrião ainda não está nesta sala. Peça para ele criar a sala primeiro.");
      else if (error.type === "unavailable-id") setNotice("Esta sala já está aberta em outra aba.");
      else setNotice("Não foi possível conectar. Atualize a página e tente novamente.");
    });
  }
  async function join(chosen = deviceId) {
    if (!name.trim()) { setNotice("Informe seu nome antes de entrar na sala."); return; }
    try {
      local.current?.getTracks().forEach(track => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia(constraints(quality, chosen || undefined));
      local.current = stream; setCameraEpoch(value => value + 1);
      if (mine.current) { mine.current.srcObject = stream; await mine.current.play().catch(() => undefined); }
      if (mode === "host") setOwner(name.trim() || "Anfitrião");
      setInRoom(true);
      await devicesList();
      startPeer(stream);
    } catch { setNotice("Permita câmera e microfone. Feche outros aplicativos que possam estar usando a webcam."); }
  }
  async function selectCamera(id: string) { setDeviceId(id); await join(id); }
  function toggle(kind: "audio" | "video", value: boolean) { local.current?.getTracks().filter(track => track.kind === kind).forEach(track => { track.enabled = value; }); }
  async function share() {
    if (sharing) { displayed.current?.getTracks().forEach(track => track.stop()); displayed.current = null; setSharing(false); return; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } }, audio: true });
      displayed.current = stream;
      if (screen.current) { screen.current.srcObject = stream; await screen.current.play().catch(() => undefined); }
      stream.getVideoTracks()[0].onended = () => setSharing(false);
      setSharing(true);
      if (peer.current && remoteId.current) peer.current.call(remoteId.current, stream, { metadata: { kind: "screen", name } });
    } catch { setNotice("O compartilhamento de tela foi cancelado."); }
  }
  async function invite() {
    const url = new URL(location.href);
    url.search = "";
    url.searchParams.set("sala", room); url.searchParams.set("senha", pin); url.searchParams.set("anfitriao", owner || name || "Anfitrião");
    await navigator.clipboard.writeText(url.toString());
    setNotice("Link copiado. Seu amigo entrará nesta mesma sala.");
  }
  function send() {
    const text = draft.trim(); if (!text) return;
    const message = { name, text }; setMessages(old => [...old, message]); connection.current?.send({ kind: "chat", ...message }); setDraft("");
  }
  function chooseBackground(file?: File) { if (!file) return; const reader = new FileReader(); reader.onload = () => { setBackground(String(reader.result)); setBackgroundMode("image"); }; reader.readAsDataURL(file); }
  function toggleBlur() { const next = backgroundMode === "blur" ? "none" : "blur"; setBackgroundMode(next); if (next === "none" && mine.current && local.current) { mine.current.srcObject = local.current; void mine.current.play().catch(() => undefined); } }
  function record() {
    if (recording) { recorder.current?.stop(); return; }
    const canvas = document.createElement("canvas"), context = canvas.getContext("2d"); if (!context || !local.current) return;
    canvas.width = vertical ? 1080 : quality === "1080" ? 1920 : 1280; canvas.height = vertical ? 1920 : quality === "1080" ? 1080 : 720;
    const cover = (video: HTMLVideoElement | null, x: number, y: number, width: number, height: number) => { if (!video?.videoWidth) return; const scale = Math.max(width / video.videoWidth, height / video.videoHeight), drawWidth = video.videoWidth * scale, drawHeight = video.videoHeight * scale; context.drawImage(video, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight); };
    const draw = () => { if (!recorder.current || recorder.current.state === "inactive") return; context.fillStyle = "#101210"; context.fillRect(0, 0, canvas.width, canvas.height); if (vertical) { const top = 620, gap = 12, half = (canvas.width - gap) / 2; cover(mine.current, 0, 0, half, top); cover(theirs.current, half + gap, 0, half, top); cover(sharing ? screen.current : remoteScreen.current, 0, top + gap, canvas.width, canvas.height - top - gap); } else { cover(sharing ? screen.current : remoteSharing ? remoteScreen.current : mine.current, 0, 0, canvas.width, canvas.height); cover(mine.current, canvas.width * .72, canvas.height * .68, canvas.width * .25, canvas.height * .28); cover(theirs.current, 24, canvas.height * .72, canvas.width * .2, canvas.height * .23); } requestAnimationFrame(draw); };
    const output = canvas.captureStream(30), chunks: Blob[] = [], mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
    const rec = new MediaRecorder(output, { mimeType: mime, videoBitsPerSecond: quality === "1080" ? 12_000_000 : 6_000_000 }); recorder.current = rec;
    rec.ondataavailable = event => event.data.size && chunks.push(event.data); rec.onstop = () => { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(chunks, { type: mime })); link.download = `proximo-${Date.now()}.webm`; link.click(); URL.revokeObjectURL(link.href); setRecording(false); };
    rec.start(1000); setRecording(true); draw();
  }
  function leave() {
    peer.current?.destroy(); peer.current = null; connection.current = null;
    local.current?.getTracks().forEach(track => track.stop()); displayed.current?.getTracks().forEach(track => track.stop());
    local.current = null; displayed.current = null; remote.current = null; remoteId.current = "";
    setFriend(""); setSharing(false); setRemoteSharing(false); setInRoom(false);
  }
  if (!inRoom) return <main className="landing"><nav><div className="brand"><span>◇</span>próximo</div></nav><section className="hero"><div className="eyebrow">vídeo privado em tempo real</div><h1>{mode === "host" ? <>Crie sua<br/><em>sala.</em></> : <>Entre na<br/><em>sala.</em></>}</h1><p>{mode === "host" ? "Informe seu nome, entre e envie o convite. Mantenha a aba aberta." : `Você vai entrar na sala de ${owner || "seu amigo"}.`}</p><div className="entry-tabs"><button className={mode === "host" ? "selected" : ""} onClick={() => setMode("host")}>Criar nova sala</button><button className={mode === "guest" ? "selected" : ""} onClick={() => setMode("guest")}>Entrar em sessão</button></div><div className="join"><label>SEU NOME<input value={name} placeholder="Digite seu nome" onChange={event => setName(event.target.value)}/></label><label>QUALIDADE<select value={quality} onChange={event => setQuality(event.target.value as Quality)}><option value="1080">Full HD · 1080p</option><option value="720">HD · 720p</option></select></label><label>SALA (6 NÚMEROS)<input value={room} inputMode="numeric" maxLength={6} onChange={event => setRoom(event.target.value.replace(/\D/g, ""))}/></label><label>SENHA DE CONFIRMAÇÃO<input value={pin} inputMode="numeric" maxLength={4} onChange={event => setPin(event.target.value.replace(/\D/g, ""))}/></label>{mode === "host" && <button className="secondary" onClick={() => { setRoom(code(6)); setPin(code(4)); }}>Gerar nova sala e senha</button>}<button onClick={() => void join()}>{mode === "host" ? "Criar e entrar na sala" : "Entrar na sessão"} <b>→</b></button>{notice && <p>{notice}</p>}</div></section><div className="orb one"/><div className="orb two"/></main>;
  const screenActive = sharing || remoteSharing;
  return <main className="call"><header><div className="brand"><span>◇</span>próximo</div><div className="room"><i/> sala {room} · senha {pin}</div><label className="background-upload session-background">▧ Fundo da câmera<input type="file" accept="image/*" onChange={event => chooseBackground(event.target.files?.[0])}/></label><button className={backgroundMode==="blur"?"format on":"format"} onClick={toggleBlur}>◌ Desfocar {backgroundMode==="blur"?"ON":""}</button><select className="camera-select" value={deviceId} onChange={event => void selectCamera(event.target.value)} aria-label="Escolher webcam"><option value="">Webcam padrão</option>{devices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || "Webcam"}</option>)}</select><button className={vertical?"format on":"format"} onClick={() => setVertical(!vertical)}>▯ TikTok {vertical?"ON":""}</button><button className="invite" onClick={() => void invite()}>⌁ Convidar amigo</button><button className="chat-toggle" onClick={() => setChatOpen(!chatOpen)}>▤ Chat</button><button className="refresh" onClick={() => location.reload()} title="Recarregar a sessão">↻</button></header><section className={"stage " + (screenActive ? "screen-on" : "")}>{screenActive && <div className="tile shared"><video ref={sharing ? screen : remoteScreen} autoPlay playsInline/><label>{sharing ? "Sua tela" : `${friend || "Seu amigo"} está compartilhando`} <b>Compartilhando</b></label></div>}<div className="tile mine"><video ref={mine} autoPlay muted playsInline className={cameraOn ? "" : "hidden"}/>{!cameraOn && <div className="avatar">V</div>}<label>{name} (você) <b>{mic ? "●" : "microfone desligado"}</b></label></div><div className="tile waiting">{friend ? <><video ref={theirs} autoPlay playsInline/><label>{friend} <b>● conectado</b></label></> : <><div className="avatar">?</div><label>Aguardando seu amigo</label><p>Envie o convite para ele entrar nesta sala</p></>}</div></section>{chatOpen && <aside className="chat-panel"><div className="chat-title">Chat da sala <button onClick={() => setChatOpen(false)}>×</button></div><div className="chat-messages">{messages.length ? messages.map((message, index) => <p key={index}><b>{message.name}</b>{message.text}</p>) : <span>Sem mensagens ainda.</span>}</div><div className="chat-compose"><input value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => event.key === "Enter" && send()} placeholder="Digite uma mensagem…"/><button onClick={send}>Enviar</button></div></aside>}{notice && <div className="toast">{notice}<button onClick={() => setNotice("")}>×</button></div>}<footer><button className={!mic ? "off" : ""} onClick={() => { toggle("audio", !mic); setMic(!mic); }}><b>{mic ? "◉" : "◌"}</b><small>{mic ? "Microfone" : "Silenciado"}</small></button><button className={!cameraOn ? "off" : ""} onClick={() => { toggle("video", !cameraOn); setCameraOn(!cameraOn); }}><b>{cameraOn ? "◉" : "◌"}</b><small>{cameraOn ? "Câmera" : "Câmera off"}</small></button><button className={sharing ? "active" : ""} onClick={() => void share()}><b>▣</b><small>{sharing ? "Parar tela" : "Compartilhar tela"}</small></button><button className={recording ? "recording" : ""} onClick={record}><b>●</b><small>{recording ? "Parar e salvar" : "Gravar local"}</small></button><i/><button className="leave" onClick={leave}><b>⌕</b><small>Sair</small></button></footer></main>;
}
