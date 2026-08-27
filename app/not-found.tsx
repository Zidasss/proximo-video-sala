import { ArrowLeft, Compass } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="ka-system-state" aria-labelledby="not-found-title">
      <section className="ka-system-state__card">
        <div className="ka-system-state__mark"><Compass aria-hidden="true" /></div>
        <h1 id="not-found-title">Página não encontrada</h1>
        <p>O endereço pode ter mudado ou não estar mais disponível.</p>
        <div className="ka-system-state__actions">
          <Link className="primary" href="/"><ArrowLeft aria-hidden="true" size={18} /> Voltar à KLIPAPP</Link>
        </div>
      </section>
    </main>
  );
}
