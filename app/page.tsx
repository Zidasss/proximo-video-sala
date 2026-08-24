"use client";

import { useEffect, useRef, useState } from "react";

type Quality = "720" | "1080";
const constraints = (quality: Quality, deviceId?: string): MediaStreamConstraints => ({
  video: { width: { ideal: quality === "1080" ? 1920 : 1280 }, height: { ideal: quality === "1080" ? 1080 : 720 }, frameRate: { ideal: 30 }, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) },
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
});

export default function Home() {
  const [inRoom, setInRoom] = useState(false), [room, setRoom] = useState("PONTO-472"), [name, setName] = useState("Você");
  const [mic, setMic] = useState(true), [cam, setCam] = useState(true), [sharing, setSharing] = useState(false), [recording, setRecording] = useState(false);
  const [quality, setQuality] = useState<Quality>("1080"), [devices, setDevices] = useState<MediaDeviceInfo[]>([]), [deviceId, setDeviceId] = useState(""), [notice, setNotice] = useState("");
  const camera = useRef<HTMLVideoElement>(null), screen = useRef<HTMLVideoElement>(null), media = useRef<MediaStream | null>(null), display = useRef<MediaStream | null>(null), recorder = useRef<MediaRecorder | null>(null);
  useEffect(() => { if (inRoom && camera.current && media.current) camera.current.srcObject = media.current; }, [inRoom, cam]);
  useEffect(() => () => { media.current?.getTracks().forEach(t => t.stop()); display.current?.getTracks().forEach(t => t.stop()); recorder.current?.stop(); }, []);
  async function loadDevices() { const list = await navigator.mediaDevices.enumerateDevices(); setDevices(list.filter(d => d.kind === "videoinput")); }
  async function join(selectedId = deviceId) {
    try { media.current?.getTracks().forEach(t => t.stop()); const stream = await navigator.mediaDevices.getUserMedia(constraints(quality, selectedId || undefined)); media.current = stream; setInRoom(true); await loadDevices(); }
    catch { setNotice("Permita o uso da câmera e do microfone. Verifique também se outro app não está usando a webcam."); }
  }
  function setTrack(kind: "audio" | "video", enabled: boolean) { media.current?.getTracks().filter(t => t.kind === kind).forEach(t => t.enabled = enabled); }
  async function selectCamera(id: string) { setDeviceId(id); await join(id); }
  async function share() {
    if (sharing) { display.current?.getTracks().forEach(t => t.stop()); display.current = null; setSharing(false); return; }
    try { const stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } }, audio: true }); display.current = stream; if (screen.current) screen.current.srcObject = stream; stream.getVideoTracks()[0].onended = () => setSharing(false); setSharing(true); }
    catch { setNotice("O compartilhamento de tela foi cancelado."); }
  }
  function record() {
    if (recording) { recorder.current?.stop(); return; }
    if (!media.current) return;
    const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = quality === "1080" ? 1920 : 1280; canvas.height = quality === "1080" ? 1080 : 720;
    const draw = () => { if (!recorder.current || recorder.current.state === "inactive") return; ctx.fillStyle = "#101210"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (sharing && screen.current) { ctx.drawImage(screen.current, 0, 0, canvas.width, canvas.height); const w = canvas.width * .27, h = w * .5625; if (camera.current && cam) ctx.drawImage(camera.current, canvas.width-w-32, canvas.height-h-32, w, h); }
      else if (camera.current && cam) ctx.drawImage(camera.current, 0, 0, canvas.width, canvas.height); requestAnimationFrame(draw); };
    const out = canvas.captureStream(30), audio = new AudioContext(), destination = audio.createMediaStreamDestination();
    [media.current, display.current].filter(Boolean).forEach(stream => { stream!.getAudioTracks().forEach(track => audio.createMediaStreamSource(new MediaStream([track])).connect(destination)); });
    destination.stream.getAudioTracks().forEach(track => out.addTrack(track));
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
    const chunks: Blob[] = []; const rec = new MediaRecorder(out, { mimeType: mime, videoBitsPerSecond: quality === "1080" ? 12_000_000 : 6_000_000, audioBitsPerSecond: 192_000 });
    recorder.current = rec; rec.ondataavailable = e => e.data.size && chunks.push(e.data); rec.onstop = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(chunks, {type:mime})); a.download = "proximo-"+new Date().toISOString().replace(/[:.]/g,"-")+".webm"; a.click(); URL.revokeObjectURL(a.href); audio.close(); setRecording(false); setNotice("Gravação salva no seu computador."); }; rec.start(1000); setRecording(true); draw();
  }
  async function invite() { await navigator.clipboard?.writeText(location.origin+"?sala="+room); setNotice("Link da sala copiado."); }
  function leave() { recorder.current?.stop(); media.current?.getTracks().forEach(t=>t.stop()); display.current?.getTracks().forEach(t=>t.stop()); setSharing(false); setInRoom(false); }
  if (!inRoom) return <main className="landing"><nav><div className="brand"><span>◇</span>próximo</div><small>● Conversas privadas</small></nav><section className="hero"><div className="eyebrow">videochamada sem complicação</div><h1>Mais perto,<br/><em>de verdade.</em></h1><p>Abra uma sala, convide uma pessoa e conversem com câmera, voz, tela e gravação local.</p><div className="join"><label>SEU NOME<input value={name} onChange={e=>setName(e.target.value)}/></label><label>QUALIDADE<select value={quality} onChange={e=>setQuality(e.target.value as Quality)}><option value="1080">Full HD · 1080p</option><option value="720">HD · 720p</option></select></label><label>CÓDIGO DA SALA<input value={room} onChange={e=>setRoom(e.target.value.toUpperCase())}/></label><button onClick={()=>join()}>Entrar na sala <b>→</b></button>{notice&&<p>{notice}</p>}</div><small className="fine">Os vídeos são gravados diretamente no seu computador.</small></section><div className="orb one"/><div className="orb two"/></main>;
  return <main className="call"><header><div className="brand"><span>◇</span>próximo</div><div className="room"><i/> sala {room}</div><select className="camera-select" value={deviceId} onChange={e=>selectCamera(e.target.value)} aria-label="Escolher webcam"><option value="">Webcam padrão</option>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label || "Webcam"}</option>)}</select><button className="invite" onClick={invite}>⌁ Convidar amigo</button></header><section className={"stage "+(sharing?"screen-on":"")}>{sharing&&<div className="tile shared"><video ref={screen} autoPlay playsInline/><label>Sua tela <b>Compartilhando</b></label></div>}<div className="tile mine"><video ref={camera} autoPlay muted playsInline className={cam?"":"hidden"}/>{!cam&&<div className="avatar">V</div>}<label>{name} (você) <b>{mic?"●":"microfone desligado"}</b></label></div><div className="tile waiting"><div className="avatar">?</div><label>Aguardando seu amigo</label><p>Envie o convite para ele entrar</p></div></section>{notice&&<div className="toast">{notice}<button onClick={()=>setNotice("")}>×</button></div>}<footer><button className={!mic?"off":""} onClick={()=>{setTrack("audio",!mic);setMic(!mic)}}><b>{mic?"◉":"◌"}</b><small>{mic?"Microfone":"Silenciado"}</small></button><button className={!cam?"off":""} onClick={()=>{setTrack("video",!cam);setCam(!cam)}}><b>{cam?"◉":"◌"}</b><small>{cam?"Câmera":"Câmera off"}</small></button><button className={sharing?"active":""} onClick={share}><b>▣</b><small>{sharing?"Parar tela":"Compartilhar tela"}</small></button><button className={recording?"recording":""} onClick={record}><b>●</b><small>{recording?"Parar e salvar":"Gravar local"}</small></button><i/><button className="leave" onClick={leave}><b>⌕</b><small>Sair</small></button></footer></main>;
}
