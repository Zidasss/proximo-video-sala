export default function Loading() {
  return (
    <main className="ka-system-state" aria-busy="true" aria-labelledby="loading-title">
      <section className="ka-system-state__card" role="status" aria-live="polite" aria-atomic="true">
        <div className="ka-loader" aria-hidden="true" />
        <h1 id="loading-title">Preparando a KLIPAPP</h1>
        <p>Carregando seu espaço de criação.</p>
      </section>
    </main>
  );
}
