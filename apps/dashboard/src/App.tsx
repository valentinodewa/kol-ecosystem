import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { PerformanceListResponse } from "@kol/contracts";
import { fetchPerformance } from "./api/performance";
import { KpiCard } from "./components/KpiCard";
import { PerformanceTable } from "./components/PerformanceTable";
import { formatDateLong, formatDateTime, formatIdr, formatNumber } from "./utils/format";

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function previousMonth() {
  const now = new Date();
  return { periodStart: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), periodEnd: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
}
const initialPeriod = previousMonth();

export function App() {
  const [periodStart, setPeriodStart] = useState(initialPeriod.periodStart);
  const [periodEnd, setPeriodEnd] = useState(initialPeriod.periodEnd);
  const [activePeriod, setActivePeriod] = useState(initialPeriod);
  const [data, setData] = useState<PerformanceListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (period: typeof initialPeriod, signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      setData(await fetchPerformance(period.periodStart, period.periodEnd, signal));
      setActivePeriod(period);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Dashboard gagal memuat data.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(initialPeriod, controller.signal);
    return () => controller.abort();
  }, [load]);

  const totals = useMemo(() => (data?.items ?? []).reduce((sum, item) => ({
    registered: sum.registered + item.totalRegistered,
    active: sum.active + item.totalActive,
    nmat: sum.nmat + item.totalNmat,
    transactions: sum.transactions + item.totalAchieveTrx,
    revenue: sum.revenue + item.totalAchieveRev,
  }), { registered: 0, active: 0, nmat: 0, transactions: 0, revenue: 0 }), [data]);
  const lastSyncedAt = useMemo(() => (data?.items ?? []).map((item) => item.syncedAt).sort().at(-1), [data]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (periodEnd < periodStart) return setError("Tanggal akhir tidak boleh lebih awal dari tanggal awal.");
    void load({ periodStart, periodEnd });
  }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="/" aria-label="KOL Ecosystem beranda"><span className="brand-mark">K</span><span><strong>KOL Ecosystem</strong><small>Performance Center</small></span></a>
      <div className="system-status"><span aria-hidden="true" />Data Fastpay</div>
    </header>
    <main className="page-shell">
      <section className="intro">
        <div><p className="eyebrow">PERFORMANCE OVERVIEW</p><h1>Performa KOL, dalam satu pandangan.</h1><p className="lede">Pantau pertumbuhan downline, aktivasi, NMAT, transaksi, dan revenue berdasarkan periode.</p></div>
        <form className="period-filter" onSubmit={submit}>
          <div className="date-field"><label htmlFor="period-start">Tanggal awal</label><input id="period-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required /></div>
          <span className="date-separator" aria-hidden="true">—</span>
          <div className="date-field"><label htmlFor="period-end">Tanggal akhir</label><input id="period-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required /></div>
          <button className="primary-button" type="submit" disabled={loading}>{loading ? "Memuat…" : "Tampilkan"}</button>
        </form>
      </section>
      <div className="period-summary" aria-live="polite"><span>Periode aktif</span><strong>{formatDateLong(activePeriod.periodStart)} – {formatDateLong(activePeriod.periodEnd)}</strong><button type="button" className="refresh-button" onClick={() => void load(activePeriod)} disabled={loading}>↻ Refresh</button></div>
      {error ? <div className="alert" role="alert"><strong>Data belum dapat ditampilkan.</strong><span>{error}</span></div> : null}
      <section className="kpi-grid" aria-label="Ringkasan performa">
        <KpiCard label="Total register" value={formatNumber(totals.registered)} code="REG" tone="blue" loading={loading} />
        <KpiCard label="Total aktif" value={formatNumber(totals.active)} code="ACT" tone="teal" loading={loading} />
        <KpiCard label="Total NMAT" value={formatNumber(totals.nmat)} code="NMT" tone="violet" loading={loading} />
        <KpiCard label="Total transaksi" value={formatNumber(totals.transactions)} code="TRX" tone="amber" loading={loading} />
        <KpiCard label="Total revenue" value={formatIdr(totals.revenue)} code="REV" tone="green" loading={loading} wide />
      </section>
      <section className="ranking-card">
        <div className="section-heading"><div><p className="eyebrow">KOL RANKING</p><h2>Performa per KOL</h2><p>{data?.items.length ?? 0} KOL ditemukan pada periode ini.</p></div><div className="sync-time"><span>Sinkronisasi terakhir</span><strong>{lastSyncedAt ? formatDateTime(lastSyncedAt) : "Belum tersedia"}</strong></div></div>
        <PerformanceTable items={data?.items ?? []} loading={loading} />
      </section>
      <footer><span>KOL Ecosystem · Internal Performance Dashboard</span><span>Sumber data: Fastpay Collector</span></footer>
    </main>
  </div>;
}
