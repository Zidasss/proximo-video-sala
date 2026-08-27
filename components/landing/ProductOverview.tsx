"use client";

import { ArrowRight, Clapperboard, Radio, Send, Sparkles } from "lucide-react";
import styles from "./ProductOverview.module.css";

export function ProductOverview({ onStart }: { onStart: () => void }) {
  return (
    <section className={styles.section} aria-labelledby="product-overview-title">
      <header className={styles.header}>
        <span>UM FLUXO, DO INÍCIO AO FEED</span>
        <h2 id="product-overview-title">Grave. Recorte. Publique.</h2>
      </header>

      <div className={styles.workflow}>
        <article>
          <i><Radio aria-hidden="true" /></i>
          <span>01</span>
          <h3>Sala em alta definição</h3>
          <p>Conversa, câmera, tela e áudio gravados no seu dispositivo.</p>
        </article>
        <article>
          <i><Clapperboard aria-hidden="true" /></i>
          <span>02</span>
          <h3>Studio para todos os formatos</h3>
          <p>Timeline livre, Radar e composição para Reels, Shorts e TikTok.</p>
        </article>
        <article>
          <i><Send aria-hidden="true" /></i>
          <span>03</span>
          <h3>Publicação conectada</h3>
          <p>Envie para seus canais sem reconstruir o projeto em outro app.</p>
        </article>
      </div>

      <div className={styles.cta}>
        <div><Sparkles aria-hidden="true" /><span><b>Comece grátis</b><small>Crie sua conta e abra a primeira sala.</small></span></div>
        <button type="button" onClick={onStart}>Criar conta <ArrowRight aria-hidden="true" size={18} /></button>
      </div>
    </section>
  );
}
