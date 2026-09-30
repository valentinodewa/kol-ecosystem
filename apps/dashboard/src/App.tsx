const modules = [
  { name: "Dashboard", status: "Fondasi siap" },
  { name: "KOL & Tier", status: "Fase berikutnya" },
  { name: "Mission", status: "Fase berikutnya" },
  { name: "Sinkronisasi Fastpay", status: "Fase berikutnya" },
];

export function App() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">KOL ECOSYSTEM</p>
        <h1>Fondasi dashboard sudah aktif.</h1>
        <p className="lede">
          Proyek siap dikembangkan bertahap untuk NMAT, tier, mission, dan sinkronisasi data Fastpay.
        </p>
      </section>

      <section className="module-grid" aria-label="Status modul">
        {modules.map((module) => (
          <article className="module-card" key={module.name}>
            <h2>{module.name}</h2>
            <p>{module.status}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
