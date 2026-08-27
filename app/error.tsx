"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main className="ka-system-state" aria-labelledby="error-title">
      <section className="ka-system-state__card" role="alert" aria-describedby="error-description">
        <div className="ka-system-state__mark"><AlertTriangle aria-hidden="true" /></div>
        <h1 id="error-title">Algo saiu do ritmo</h1>
        <p id="error-description">Não foi possível concluir esta tela. Seu projeto permanece no navegador.</p>
        <div className="ka-system-state__actions">
          <button className="primary" type="button" onClick={reset}><RotateCcw aria-hidden="true" size={18} /> Tentar novamente</button>
          <Link href="/">Voltar ao início</Link>
        </div>
      </section>
    </main>
  );
}
