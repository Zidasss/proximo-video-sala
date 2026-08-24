"use client";

import { useEffect, useRef, useState } from "react";

export default function Home() {
  const [inRoom, setInRoom] = useState(false);
  const [room, setRoom] = useState("PONTO-472");
  const [name, setName] = useState("Você");
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [notice, setNotice] = useState("");
  const camera = useRef<HTMLVideoElement>(null);
  const screen = useRef<HTMLVideoElement>(null);
  const media = useRef<MediaStream | null>(null);
  const display = useRef<MediaStream | null>(null);
  useEffect(() => () => { media.current?.getTracks().forEach(t=>t.stop()); display.current?.getTracks().forEach(t=>t.stop()); }, []);
  async function join() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30}},audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      media.current=stream; if(camera.current) camera.current.srcObject=stream; setInRoom(true);
    } catch { setNotice("Permita o uso da câmera e do microfone para entrar na sala."); }
  }
  function setTrack(kind:"audio"|"video", value:boolean) { media.current?.getTracks().filter(t=>t.kind===kind).forEach(t=>t.enabled=value); }
  async function share() {
    if(sharing) { display.current?.getTracks().forEach(t=>t.stop()); display.current=null; setSharing(false); return; }
    try { const stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:60}},audio:true}); display.current=stream; if(screen.current) screen.current.srcObject=stream; stream.getVideoTracks()[0].onended=()=>setSharing(false); setSharing(true); }
    catch { setNotice("O compartilhamento de tela foi cancelado."); }
  }
  async function invite() { await navigator.clipboard?.writeText(location.origin+"?sala="+room); setNotice("Link da sala copiado. Envie para seu amigo entrar."); }
  function leave() { media.current?.getTracks().forEach(t=>t.stop()); display.current?.getTracks().forEach(t=>t.stop()); setSharing(false); setInRoom(false); }
  if(!inRoom) return <main className="landing">
    <nav><div className="brand"><span>◇</span>próximo</div><small>● Conversas privadas</small></nav>
    <section className="hero"><div className="eyebrow">videochamada sem complicação</div><h1>Mais perto,<br/><em>de verdade.</em></h1><p>Abra uma sala, convide uma pessoa e conversem com câmera, voz e tela — tudo ao mesmo tempo.</p>
      <div className="join"><label>SEU NOME<input value={name} onChange={e=>setName(e.target.value)} /></label><label>CÓDIGO DA SALA<input value={room} onChange={e=>setRoom(e.target.value.toUpperCase())} /></label><button onClick={join}>Entrar na sala <b>→</b></button>{notice&&<p>{notice}</p>}</div><small className="fine">Ao entrar, você escolhe quais dispositivos compartilhar.</small>
    </section><div className="orb one"/><div className="orb two"/></main>;
  return <main className="call">
    <header><div className="brand"><span>◇</span>próximo</div><div className="room"><i/> sala {room}</div><button className="invite" onClick={invite}>⌁ Convidar amigo</button></header>
    <section className={"stage "+(sharing?"screen-on":"")}>{sharing&&<div className="tile shared"><video ref={screen} autoPlay playsInline/><label>Sua tela <b>Compartilhando</b></label></div>}<div className="tile mine"><video ref={camera} autoPlay muted playsInline className={cam?"":"hidden"}/>{!cam&&<div className="avatar">V</div>}<label>{name} (você) <b>{mic?"●":"microfone desligado"}</b></label></div><div className="tile waiting"><div className="avatar">?</div><label>Aguardando seu amigo</label><p>Envie o convite para ele entrar</p></div></section>
    {notice&&<div className="toast">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
    <footer><button className={!mic?"off":""} onClick={()=>{setTrack("audio",!mic);setMic(!mic)}}><b>{mic?"◉":"◌"}</b><small>{mic?"Microfone":"Silenciado"}</small></button><button className={!cam?"off":""} onClick={()=>{setTrack("video",!cam);setCam(!cam)}}><b>{cam?"◉":"◌"}</b><small>{cam?"Câmera":"Câmera off"}</small></button><button className={sharing?"active":""} onClick={share}><b>▣</b><small>{sharing?"Parar tela":"Compartilhar tela"}</small></button><i/><button className="leave" onClick={leave}><b>⌕</b><small>Sair</small></button></footer>
  </main>;
}
