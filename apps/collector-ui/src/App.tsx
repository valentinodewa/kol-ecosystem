import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { authApi, kolApi, kolPortalApi, missionApi, performanceApi, type DailyPerformanceRow, type KolInput, type KolPortalMission, type KolPortalProfile, type KolRecord, type MissionInput, type MissionRecord } from "./api";
import { mergeWorkbooks, parseFinancialWorkbook, parseNmatWorkbook, parseRegistrationWorkbook, type ImportRow } from "./workbooks";

type Page = "home" | "performance" | "daily" | "master" | "monthly" | "missions" | "queries" | "history" | "settings";
type UploadKind = "registration" | "nmat" | "financial" | "master" | "monthly";
type UploadedFile = { name: string; size: string; rows: number };
type Kol = { id: number; upline: string; name: string; tier: string; status: "Aktif" | "Nonaktif"; pic: string; notes: string };
type DailyMetric = "nmat" | "registered" | "active" | "transactions" | "revenue" | "activationCommission" | "activationRevenue";
type DailySummary = { date: string; registered: number; active: number; nmat: number; transactions: number; revenue: number; activationCommission: number; activationRevenue: number; cumulativeNmat: number };

const nav: Array<{ id: Page; code: string; label: string }> = [
  { id: "home", code: "OV", label: "Beranda" },
  { id: "performance", code: "UP", label: "Update Performa" },
  { id: "daily", code: "DP", label: "Performa Harian" },
  { id: "master", code: "MK", label: "Master KOL" },
  { id: "monthly", code: "KB", label: "KOL Bulanan" },
  { id: "missions", code: "MS", label: "Mission" },
  { id: "queries", code: "QG", label: "Query Generator" },
  { id: "history", code: "HS", label: "Riwayat Sinkronisasi" },
  { id: "settings", code: "ST", label: "Pengaturan" },
];

const mapKol = (kol: KolRecord): Kol => ({
  id: kol.id,
  upline: kol.uplineId,
  name: kol.name,
  tier: kol.tierCode ?? "Belum diatur",
  status: kol.status === "active" ? "Aktif" : "Nonaktif",
  pic: kol.picName ?? "—",
  notes: kol.notes ?? "",
});

function fileSize(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

const numberFormat = new Intl.NumberFormat("id-ID");
const currencyFormat = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const shortDateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });

async function inspectCsv(file: File): Promise<UploadedFile> {
  if (file.name.toLowerCase().endsWith(".xlsx")) return { name: file.name, size: fileSize(file.size), rows: 0 };
  const text = await file.text();
  const rows = text.split(/\r?\n/).filter((row) => row.trim()).length;
  return { name: file.name, size: fileSize(file.size), rows: Math.max(0, rows - 1) };
}

function parseCsvLine(line: string) {
  const values: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { values.push(value.trim()); value = ""; }
    else value += char;
  }
  values.push(value.trim()); return values;
}

function csvValue(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

async function parseMasterCsv(file: File): Promise<KolInput[]> {
  const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const headers = parseCsvLine(lines[0] ?? "").map((header) => header.toLowerCase());
  for (const required of ["upline_id", "name"]) if (!headers.includes(required)) throw new Error(`Kolom wajib tidak ditemukan: ${required}`);
  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line); const get = (name: string) => values[headers.indexOf(name)]?.trim() ?? "";
    const status = get("status").toLowerCase();
    const uplineId = get("upline_id").toUpperCase(); const name = get("name");
    if (!uplineId || !name) throw new Error(`Baris ${index + 2}: upline_id dan name wajib diisi`);
    return { uplineId, name, tierCode: get("tier_code") || null, picName: get("pic_name") || null, notes: get("notes") || null, status: status === "inactive" || status === "nonaktif" ? "inactive" as const : "active" as const };
  });
  if (!rows.length) throw new Error("CSV tidak memiliki baris data");
  if (rows.length > 100) throw new Error("Maksimal 100 KOL per sekali import");
  if (new Set(rows.map((row) => row.uplineId)).size !== rows.length) throw new Error("Ada upline_id duplikat di CSV");
  return rows;
}

function parseGoogleMasterCsv(text: string): KolInput[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const headers = parseCsvLine(lines[0] ?? "").map((header) => header.trim().toUpperCase());
  const grouped = new Map<string, KolInput>();
  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line); const get = (name: string) => values[headers.indexOf(name)]?.trim() ?? "";
    const uplineId = get("KOL ID").toUpperCase(); if (!/^(FA|AC)[A-Z0-9]+$/.test(uplineId)) continue;
    const contact = get("USERNAME KOL"); const firstUrl = contact.split(/\r?\n/)[0]?.trim() ?? "";
    const handle = firstUrl.match(/@([A-Za-z0-9._-]+)/)?.[1] ?? firstUrl.match(/\/([^/?#]+)\/?$/)?.[1] ?? uplineId;
    grouped.set(uplineId, { uplineId, name: handle, status: "active", tierCode: get("TIER").toUpperCase() || null, picName: get("PIC") || null, contact: contact || null, notes: get("CATATAN") || null });
  }
  return [...grouped.values()].sort((a, b) => a.uplineId.localeCompare(b.uplineId));
}

function DropZone({ kind, title, hint, file, onFile, workbook = false }: { kind: UploadKind; title: string; hint: string; file?: UploadedFile; onFile: (kind: UploadKind, file: File) => void; workbook?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const receive = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const dropped = event.dataTransfer.files[0];
    if (dropped) onFile(kind, dropped);
  };
  return <div className={`dropzone ${file ? "dropzone-ready" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={receive}>
    <input ref={input} type="file" accept={workbook ? ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : ".csv,text/csv"} hidden onChange={(event) => event.target.files?.[0] && onFile(kind, event.target.files[0])} />
    <span className="upload-symbol" aria-hidden="true">{file ? "✓" : "↑"}</span>
    {file ? <>
      <strong>{file.name}</strong>
      <p>{file.rows ? `${file.rows} baris · ` : ""}{file.size}</p>
      <button className="text-button" type="button" onClick={() => input.current?.click()}>Ganti file</button>
    </> : <>
      <strong>{title}</strong><p>{hint}</p>
      <button className="secondary-button" type="button" onClick={() => input.current?.click()}>Pilih {workbook ? "XLSX" : "CSV"}</button>
    </>}
  </div>;
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return <header className="page-header"><div><p className="eyebrow">KOL OPERATIONS</p><h1>{title}</h1><p>{subtitle}</p></div><div className="header-session"><div className="connection"><span />API development terhubung</div><div className="session-user"><strong>{authApi.username() ?? "Local admin"}</strong><small>{authApi.role() === "admin" ? "Super admin" : authApi.role() === "operator" ? "Operator" : "Administrator"}</small></div><button className="header-logout" onClick={() => { void authApi.logout().finally(() => location.reload()); }}>Keluar</button></div></header>;
}

function KolPortalFoundation({ onLogout }: { onLogout: () => void }) {
  const [profile, setProfile] = useState<KolPortalProfile | null>(null);
  const [missions, setMissions] = useState<KolPortalMission[]>([]);
  const today = new Date();
  const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setUTCDate(today.getUTCDate() - 29);
  const [periodStart, setPeriodStart] = useState(thirtyDaysAgo.toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(today.toISOString().slice(0, 10));
  const [performance, setPerformance] = useState<DailyPerformanceRow[]>([]);
  const [metric, setMetric] = useState<DailyMetric>("nmat");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadPortal = async (start = periodStart, end = periodEnd) => {
    if (end < start) { setError("Tanggal akhir tidak boleh lebih awal dari tanggal awal"); return; }
    setLoading(true); setError(null);
    try {
      const [nextProfile, nextMissions, nextPerformance] = await Promise.all([kolPortalApi.profile(), kolPortalApi.missions(), kolPortalApi.performance(start, end)]);
      setProfile(nextProfile); setMissions(nextMissions.items); setPerformance(nextPerformance.items);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Portal KOL gagal dimuat"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadPortal(); }, []);
  const targetLabel = (metric: KolPortalMission["targets"][number]["metric"]) => ({ registered: "Register", active: "Aktivasi", nmat: "NMAT", transactions: "Transaksi", revenue: "Revenue" })[metric];
  const missionState = (mission: KolPortalMission) => {
    const todayIso = new Date().toISOString().slice(0, 10);
    if (mission.startDate > todayIso) return "Akan datang";
    if (mission.endDate < todayIso) return "Berakhir";
    return "Berjalan";
  };
  const metricValue = (row: DailyPerformanceRow) => ({ registered: row.totalRegistered, active: row.totalActive, nmat: row.totalNmat, transactions: row.totalAchieveTrx, revenue: row.totalAchieveRev, activationCommission: row.totalActivationCommission, activationRevenue: row.totalActivationRevenue })[metric];
  const maximum = Math.max(1, ...performance.map(metricValue));
  const metricLabel = ({ registered: "Register", active: "Aktivasi", nmat: "NMAT", transactions: "Transaksi", revenue: "Revenue transaksi", activationCommission: "Komisi aktivasi", activationRevenue: "Revenue aktivasi" } as const)[metric];
  const currencyMetric = ["revenue", "activationCommission", "activationRevenue"].includes(metric);
  const total = (field: keyof Pick<DailyPerformanceRow, "totalRegistered" | "totalActive" | "totalNmat" | "totalAchieveTrx" | "totalAchieveRev" | "totalActivationCommission" | "totalActivationRevenue">) => performance.reduce((sum, row) => sum + row[field], 0);
  const kpis = [
    ["Register", total("totalRegistered"), false], ["Aktivasi", total("totalActive"), false], ["NMAT", total("totalNmat"), false],
    ["Transaksi", total("totalAchieveTrx"), false], ["Revenue transaksi", total("totalAchieveRev"), true],
    ["Komisi aktivasi", total("totalActivationCommission"), true], ["Revenue aktivasi", total("totalActivationRevenue"), true],
  ] as const;
  return <div className="kol-foundation-shell"><header><span className="brand-mark">K</span><div><strong>Fastpay KOL Portal</strong><small>Development preview · akses pribadi</small></div><div className="kol-header-actions"><button onClick={() => void loadPortal()} disabled={loading}>{loading ? "Memuat…" : "Perbarui"}</button><button onClick={() => { void authApi.logout().finally(onLogout); }}>Keluar</button></div></header><main><div className="kol-hero"><div><p className="eyebrow">PORTAL KOL · TAHAP 3</p><h1>{profile ? `Halo, ${profile.name}` : "Portal KOL"}</h1><p>Pantau performa pribadi dan mission yang sesuai dengan tier terbaru Anda.</p></div><span className={`kol-tier-badge tier-${(profile?.tierCode ?? "belum-diatur").toLowerCase().replaceAll(" ", "-")}`}>{profile?.tierCode ?? "Tier belum diatur"}</span></div>{error ? <div className="api-message api-error"><strong>Gagal</strong><span>{error}</span></div> : null}<section className="kol-profile-grid"><article><small>Upline ID</small><strong>{profile?.uplineId ?? "Memuat…"}</strong></article><article><small>Tier saat ini</small><strong>{profile?.tierCode ?? "Belum diatur"}</strong></article><article><small>Status kerja sama</small><strong>{profile?.status === "active" ? "Aktif" : "Tidak aktif"}</strong></article><article><small>PIC</small><strong>{profile?.picName ?? "Belum ditentukan"}</strong></article></section><section className="kol-performance-section"><div className="kol-section-heading"><div><p className="eyebrow">PERFORMA PRIBADI</p><h2>Pencapaian Anda</h2><p>Data hanya berasal dari upline ID akun yang sedang login.</p></div></div><div className="kol-performance-filter"><label>Tanggal awal<input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label><label>Tanggal akhir<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label><label>Metrik grafik<select value={metric} onChange={(event) => setMetric(event.target.value as DailyMetric)}><option value="registered">Register</option><option value="active">Aktivasi</option><option value="nmat">NMAT</option><option value="transactions">Transaksi</option><option value="revenue">Revenue transaksi</option><option value="activationCommission">Komisi aktivasi</option><option value="activationRevenue">Revenue aktivasi</option></select></label><button onClick={() => void loadPortal(periodStart, periodEnd)} disabled={loading}>{loading ? "Memuat…" : "Tampilkan"}</button></div><div className="kol-kpi-grid">{kpis.map(([label, value, money]) => <article key={label}><small>{label}</small><strong>{money ? currencyFormat.format(value) : numberFormat.format(value)}</strong></article>)}</div><div className="kol-chart-heading"><div><h3>{metricLabel} per hari</h3><p>{performance.length} hari memiliki data dalam rentang terpilih.</p></div></div>{performance.length === 0 ? <div className="kol-empty"><strong>Belum ada data performa</strong><p>Pilih rentang tanggal lain atau tunggu pembaruan data dari tim KOL.</p></div> : <><div className="kol-daily-chart">{performance.map((row) => <div className="kol-daily-bar" key={row.performanceDate} title={`${row.performanceDate}: ${currencyMetric ? currencyFormat.format(metricValue(row)) : numberFormat.format(metricValue(row))}`}><span>{currencyMetric ? numberFormat.format(metricValue(row)) : metricValue(row)}</span><i style={{ height: `${Math.max(3, metricValue(row) / maximum * 100)}%` }} /><small>{shortDateFormat.format(new Date(`${row.performanceDate}T00:00:00Z`))}</small></div>)}</div><div className="kol-daily-table-wrap"><table><thead><tr><th>Tanggal</th><th>Register</th><th>Aktivasi</th><th>NMAT</th><th>Transaksi</th><th>Revenue</th><th>Komisi aktivasi</th></tr></thead><tbody>{performance.map((row) => <tr key={row.performanceDate}><td>{dateFormat.format(new Date(`${row.performanceDate}T00:00:00Z`))}</td><td>{numberFormat.format(row.totalRegistered)}</td><td>{numberFormat.format(row.totalActive)}</td><td>{numberFormat.format(row.totalNmat)}</td><td>{numberFormat.format(row.totalAchieveTrx)}</td><td>{currencyFormat.format(row.totalAchieveRev)}</td><td>{currencyFormat.format(row.totalActivationCommission)}</td></tr>)}</tbody></table></div></>}</section><section className="kol-mission-section"><div className="kol-section-heading"><div><p className="eyebrow">MISSION UNTUK TIER {profile?.tierCode ?? "—"}</p><h2>Mission Anda</h2><p>Daftar ini otomatis mengikuti tier terbaru di master KOL.</p></div><span>{missions.length} mission aktif</span></div>{loading ? <div className="kol-empty">Memuat mission…</div> : missions.length === 0 ? <div className="kol-empty"><strong>Belum ada mission aktif</strong><p>Mission draft tidak ditampilkan. Saat tim mengaktifkan mission untuk tier {profile?.tierCode ?? "Anda"}, mission akan muncul di sini.</p></div> : <div className="kol-mission-grid">{missions.map((mission) => <article key={mission.id}><div className="kol-mission-top"><span className="kol-mission-state">{missionState(mission)}</span><span>{mission.tierCode}</span></div><h3>{mission.name}</h3><p>{mission.description ?? "Tanpa deskripsi"}</p><div className="kol-mission-period">{dateFormat.format(new Date(`${mission.startDate}T00:00:00Z`))} – {dateFormat.format(new Date(`${mission.endDate}T00:00:00Z`))}</div><div className="kol-mission-targets">{mission.targets.map((target) => <div key={target.metric}><small>Target {targetLabel(target.metric)}</small><strong>{target.metric === "revenue" ? currencyFormat.format(target.targetValue) : numberFormat.format(target.targetValue)}</strong></div>)}</div>{mission.rewardDescription ? <div className="kol-reward"><small>Reward</small><strong>{mission.rewardDescription}</strong></div> : null}</article>)}</div>}</section><div className="kol-foundation-notice"><strong>Akses data dibatasi per akun</strong><span>Performa selalu diambil dari upline ID pada sesi login. Perubahan tier otomatis mengubah mission yang tampil setelah tombol “Perbarui” ditekan.</span></div></main></div>;
}

export function App() {
  const [authenticated, setAuthenticated] = useState(() => ["localhost", "127.0.0.1"].includes(location.hostname) || authApi.hasSession());
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [page, setPage] = useState<Page>("home");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [files, setFiles] = useState<Partial<Record<UploadKind, UploadedFile>>>({});
  const [rawFiles, setRawFiles] = useState<Partial<Record<UploadKind, File>>>({});
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState("2026-09-01");
  const [periodEnd, setPeriodEnd] = useState("2026-09-30");
  const [validated, setValidated] = useState(false);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [kols, setKols] = useState<Kol[]>([]);
  const [masterLoading, setMasterLoading] = useState(true);
  const [masterSaving, setMasterSaving] = useState(false);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [masterNotice, setMasterNotice] = useState<string | null>(null);
  const [masterImportRows, setMasterImportRows] = useState<KolInput[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingKol, setEditingKol] = useState<Kol | null>(null);
  const [showMissionForm, setShowMissionForm] = useState(false);
  const [missions, setMissions] = useState<MissionRecord[]>([]);
  const [editingMission, setEditingMission] = useState<MissionRecord | null>(null);
  const [missionError, setMissionError] = useState<string | null>(null);
  const [missionSaving, setMissionSaving] = useState(false);
  const [monthlyPreview, setMonthlyPreview] = useState(false);
  const [dailyStart, setDailyStart] = useState("2026-09-01");
  const [dailyEnd, setDailyEnd] = useState("2026-09-30");
  const [dailyUpline, setDailyUpline] = useState("");
  const [dailyMetric, setDailyMetric] = useState<DailyMetric>("nmat");
  const [leaderStart, setLeaderStart] = useState("2026-09-01");
  const [leaderEnd, setLeaderEnd] = useState("2026-09-30");
  const [leaderMetric, setLeaderMetric] = useState<DailyMetric>("nmat");
  const [dailyRows, setDailyRows] = useState<DailyPerformanceRow[]>([]);
  const [topRows, setTopRows] = useState<DailyPerformanceRow[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [topLoading, setTopLoading] = useState(false);
  const [dailyError, setDailyError] = useState<string | null>(null);

  const visibleKols = useMemo(() => kols.filter((kol) => (!tierFilter || kol.tier === tierFilter) && `${kol.upline} ${kol.name} ${kol.tier}`.toLowerCase().includes(search.toLowerCase())), [kols, search, tierFilter]);
  const activeKolCount = kols.filter((kol) => kol.status === "Aktif").length;
  const tierCount = new Set(kols.map((kol) => kol.tier).filter((tier) => tier !== "Belum diatur")).size;
  const tierSummary = useMemo(() => ["BARU","JELEK","BIASA","LUMAYAN","KUAT","Belum diatur"].map((tier)=>({tier,count:kols.filter((kol)=>kol.tier===tier).length})),[kols]);
  const dailySeries = useMemo<DailySummary[]>(() => {
    const grouped = new Map<string, Omit<DailySummary, "cumulativeNmat">>();
    for (const row of dailyRows) {
      const current = grouped.get(row.performanceDate) ?? { date: row.performanceDate, registered: 0, active: 0, nmat: 0, transactions: 0, revenue: 0, activationCommission: 0, activationRevenue: 0 };
      current.registered += row.totalRegistered; current.active += row.totalActive; current.nmat += row.totalNmat;
      current.transactions += row.totalAchieveTrx; current.revenue += row.totalAchieveRev;
      current.activationCommission += row.totalActivationCommission; current.activationRevenue += row.totalActivationRevenue;
      grouped.set(row.performanceDate, current);
    }
    let cumulativeNmat = 0;
    return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date)).map((row) => ({ ...row, cumulativeNmat: cumulativeNmat += row.nmat }));
  }, [dailyRows]);
  const selectedMetricLabel = ({ nmat: "NMAT", registered: "Register", active: "Aktif", transactions: "Transaksi", revenue: "Revenue transaksi", activationCommission: "Komisi aktivasi", activationRevenue: "Revenue aktivasi" } as const)[dailyMetric];
  const leaderMetricLabel = ({ nmat: "NMAT", registered: "Register", active: "Aktif", transactions: "Transaksi", revenue: "Revenue transaksi", activationCommission: "Komisi aktivasi", activationRevenue: "Revenue aktivasi" } as const)[leaderMetric];
  const dailyMetricIsCurrency = ["revenue", "activationCommission", "activationRevenue"].includes(dailyMetric);
  const leaderMetricIsCurrency = ["revenue", "activationCommission", "activationRevenue"].includes(leaderMetric);
  const metricValue = (row: DailySummary) => row[dailyMetric];
  const rawMetricValue = (row: DailyPerformanceRow, metric: DailyMetric) => ({ nmat: row.totalNmat, registered: row.totalRegistered, active: row.totalActive, transactions: row.totalAchieveTrx, revenue: row.totalAchieveRev, activationCommission: row.totalActivationCommission, activationRevenue: row.totalActivationRevenue })[metric];
  const metricMax = Math.max(1, ...dailySeries.map(metricValue));
  const topPerformers = useMemo(() => {
    const grouped = new Map<string, { uplineId: string; kolName: string; value: number }>();
    for (const row of topRows) {
      const current = grouped.get(row.uplineId) ?? { uplineId: row.uplineId, kolName: row.kolName, value: 0 };
      current.value += rawMetricValue(row, leaderMetric); grouped.set(row.uplineId, current);
    }
    return [...grouped.values()].sort((left, right) => right.value - left.value || left.uplineId.localeCompare(right.uplineId)).slice(0, 5);
  }, [topRows, leaderMetric]);
  const topPerformerMaximum = Math.max(1, ...topPerformers.map((row) => row.value));
  const cooperationKolCount = new Set(dailyRows.map((row) => row.uplineId)).size;
  const registeredKolCount = new Set(dailyRows.filter((row) => row.totalRegistered > 0).map((row) => row.uplineId)).size;
  const totalRegistered = dailyRows.reduce((sum, row) => sum + row.totalRegistered, 0);
  const totalActive = dailyRows.reduce((sum, row) => sum + row.totalActive, 0);
  const totalTransactions = dailyRows.reduce((sum, row) => sum + row.totalAchieveTrx, 0);
  const totalTransactionRevenue = dailyRows.reduce((sum, row) => sum + row.totalAchieveRev, 0);
  const totalActivationCommission = dailyRows.reduce((sum, row) => sum + row.totalActivationCommission, 0);
  const totalActivationRevenue = dailyRows.reduce((sum, row) => sum + row.totalActivationRevenue, 0);

  useEffect(() => {
    void kolApi.list()
      .then(({ items }) => { setKols(items.map(mapKol)); setMasterError(null); })
      .catch((error: unknown) => setMasterError(error instanceof Error ? error.message : "Master KOL gagal dimuat"))
      .finally(() => setMasterLoading(false));
  }, []);

  useEffect(() => { if (page === "missions") void missionApi.list().then(({items})=>{setMissions(items);setMissionError(null)}).catch((error:unknown)=>setMissionError(error instanceof Error?error.message:"Mission gagal dimuat")); }, [page]);

  async function loadDailyPerformance() {
    if (dailyEnd < dailyStart) { setDailyError("Tanggal akhir tidak boleh lebih awal dari tanggal awal"); return; }
    setDailyLoading(true); setDailyError(null);
    try {
      const response = await performanceApi.daily(dailyStart, dailyEnd, dailyUpline || undefined);
      setDailyRows(response.items);
    } catch (error) {
      setDailyError(error instanceof Error ? error.message : "Performa harian gagal dimuat");
    } finally { setDailyLoading(false); }
  }

  async function loadTopPerformance() {
    if (leaderEnd < leaderStart) { setDailyError("Rentang Top Performance tidak valid"); return; }
    setTopLoading(true); setDailyError(null);
    try {
      const response = await performanceApi.daily(leaderStart, leaderEnd);
      setTopRows(response.items);
    } catch (error) {
      setDailyError(error instanceof Error ? error.message : "Top Performance gagal dimuat");
    } finally { setTopLoading(false); }
  }

  useEffect(() => {
    if (page === "daily" && dailyRows.length === 0 && !dailyLoading) {
      void loadDailyPerformance(); void loadTopPerformance();
    }
  }, [page]);

  function exportDailyCsv() {
    const lines = ["tanggal,register,aktif,nmat,transaksi,revenue_transaksi,komisi_aktivasi,revenue_aktivasi,nmat_kumulatif", ...dailySeries.map((row) => [row.date, row.registered, row.active, row.nmat, row.transactions, row.revenue, row.activationCommission, row.activationRevenue, row.cumulativeNmat].join(","))];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `performa-harian-${dailyStart}-${dailyEnd}${dailyUpline ? `-${dailyUpline}` : ""}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  async function saveKol(form: HTMLFormElement) {
    const data = new FormData(form);
    const input: KolInput = {
      uplineId: String(data.get("upline")).trim().toUpperCase(),
      name: String(data.get("name")).trim(),
      tierCode: String(data.get("tier")) || null,
      picName: String(data.get("pic")).trim() || null,
      notes: String(data.get("notes")).trim() || null,
      status: data.get("status") === "Aktif" ? "active" : "inactive",
    };
    setMasterSaving(true); setMasterError(null); setMasterNotice(null);
    try {
      const saved = editingKol ? await kolApi.update(editingKol.id, input) : await kolApi.create(input);
      const mapped = mapKol(saved);
      setKols((current) => editingKol ? current.map((kol) => kol.id === mapped.id ? mapped : kol) : [mapped, ...current]);
      setMasterNotice(editingKol ? "Data KOL berhasil diperbarui." : "KOL baru berhasil ditambahkan.");
      setShowForm(false); setEditingKol(null);
    } catch (error) {
      setMasterError(error instanceof Error ? error.message : "Data KOL gagal disimpan");
    } finally { setMasterSaving(false); }
  }

  async function addFile(kind: UploadKind, file: File) {
    setFiles((current) => ({ ...current, [kind]: undefined }));
    try {
      const inspected = await inspectCsv(file);
      setRawFiles((current) => ({ ...current, [kind]: file }));
      if (kind === "master") setMasterImportRows(await parseMasterCsv(file));
      setFiles((current) => ({ ...current, [kind]: inspected }));
      setMasterError(null);
    } catch (error) {
      if (kind === "master") { setMasterImportRows([]); setMasterError(error instanceof Error ? error.message : "CSV tidak valid"); }
    }
    setValidated(false);
  }

  async function validatePerformanceFiles() {
    if (!rawFiles.registration || !rawFiles.nmat || !rawFiles.financial) return;
    if (periodEnd < periodStart) { setMasterError("Tanggal akhir tidak boleh lebih awal dari tanggal awal"); return; }
    setImportLoading(true); setMasterError(null); setImportNotice(null);
    try {
      const [registration, nmat, financial] = await Promise.all([
        parseRegistrationWorkbook(rawFiles.registration), parseNmatWorkbook(rawFiles.nmat, periodStart.slice(0, 7)), parseFinancialWorkbook(rawFiles.financial),
      ]);
      const rows = mergeWorkbooks([registration, nmat, financial], periodStart, periodEnd);
      if (!rows.length) throw new Error("Tidak ada data yang dapat diimpor");
      setImportRows(rows); setFiles((current) => ({ ...current, registration: current.registration && { ...current.registration, rows: registration.length }, nmat: current.nmat && { ...current.nmat, rows: nmat.length }, financial: current.financial && { ...current.financial, rows: financial.length } })); setValidated(true);
    } catch (error) { setMasterError(error instanceof Error ? error.message : "Validasi workbook gagal"); setValidated(false); }
    finally { setImportLoading(false); }
  }

  async function syncPerformance() {
    setImportLoading(true); setMasterError(null); setImportNotice(null);
    try {
      const result = await performanceApi.import({ syncRunId: crypto.randomUUID(), periodStart, periodEnd, extractedAt: new Date().toISOString(), rows: importRows });
      setImportNotice(`${result.processedRows} baris performa berhasil disinkronkan.`); setValidated(false); setImportRows([]); setFiles((current) => ({ master: current.master, monthly: current.monthly })); setRawFiles((current) => ({ master: current.master, monthly: current.monthly }));
    } catch (error) { setMasterError(error instanceof Error ? error.message : "Sinkronisasi gagal"); }
    finally { setImportLoading(false); }
  }

  async function submitLogin(form: HTMLFormElement) {
    const data = new FormData(form); setLoginLoading(true); setLoginError(null);
    try { await authApi.login(String(data.get("username")), String(data.get("password"))); setAuthenticated(true); }
    catch (error) { setLoginError(error instanceof Error ? error.message : "Login gagal"); }
    finally { setLoginLoading(false); }
  }

  async function importMasterKols() {
    setMasterSaving(true); setMasterError(null); setMasterNotice(null);
    try {
      const result = await kolApi.import(masterImportRows);
      const latest = await kolApi.list(); setKols(latest.items.map(mapKol));
      setMasterNotice(`${result.processedKols} KOL berhasil diimpor atau diperbarui.`);
      setFiles((current) => ({ ...current, master: undefined })); setMasterImportRows([]);
    } catch (error) { setMasterError(error instanceof Error ? error.message : "Import gagal"); }
    finally { setMasterSaving(false); }
  }

  async function syncGoogleMaster() {
    setMasterSaving(true); setMasterError(null); setMasterNotice(null);
    try {
      const rows = parseGoogleMasterCsv(await kolApi.googleMaster()); if (!rows.length) throw new Error("Tidak ada KOL valid pada Google Sheet");
      let processed = 0;
      for (let index = 0; index < rows.length; index += 100) processed += (await kolApi.import(rows.slice(index, index + 100))).processedKols;
      const latest = await kolApi.list(); setKols(latest.items.map(mapKol));
      setMasterNotice(`${processed} KOL berhasil disinkronkan dari Google Sheet.`);
    } catch (error) { setMasterError(error instanceof Error ? error.message : "Sinkronisasi Google Sheet gagal"); }
    finally { setMasterSaving(false); }
  }

  async function exportMasterKol() {
    setMasterSaving(true); setMasterError(null); setMasterNotice(null);
    try {
      const { items } = await kolApi.list();
      const header = ["upline_id", "name", "tier_code", "pic_name", "status", "notes"];
      const rows = items.map((item) => [item.uplineId, item.name, item.tierCode, item.picName, item.status, item.notes].map(csvValue).join(","));
      const url = URL.createObjectURL(new Blob(["\uFEFF", [header.join(","), ...rows].join("\r\n")], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `master-kol-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
      setMasterNotice(`${items.length} KOL terbaru dari D1 berhasil diekspor.`);
    } catch (error) { setMasterError(error instanceof Error ? error.message : "Export Master KOL gagal"); }
    finally { setMasterSaving(false); }
  }

  async function saveMission(form: HTMLFormElement) {
    const data = new FormData(form); const metric = String(data.get("metric")) as MissionInput["targets"][number]["metric"];
    const input: MissionInput = { name:String(data.get("name")).trim(), description:String(data.get("description")).trim()||null, tierCode:String(data.get("tier")), startDate:String(data.get("startDate")), endDate:String(data.get("endDate")), rewardDescription:null, status:String(data.get("status")) as MissionInput["status"], participantTarget:Number(data.get("participantTarget")), budgetAmount:Number(data.get("budgetAmount")), targets:[{metric,targetValue:Number(data.get("target"))}] };
    setMissionSaving(true); setMissionError(null);
    try { const saved=editingMission?await missionApi.update(editingMission.id,input):await missionApi.create(input); setMissions((current)=>editingMission?current.map((item)=>item.id===saved.id?saved:item):[saved,...current]); setShowMissionForm(false);setEditingMission(null); }
    catch(error){setMissionError(error instanceof Error?error.message:"Mission gagal disimpan");}
    finally{setMissionSaving(false);}
  }

  function choosePage(next: Page) { setPage(next); setMobileOpen(false); }

  if (!authenticated) return <div className="login-shell"><form className="login-card" onSubmit={(event) => { event.preventDefault(); void submitLogin(event.currentTarget); }}><span className="brand-mark">K</span><p className="eyebrow">FASTPAY KOL ECOSYSTEM</p><h1>Masuk ke portal</h1><p>Gunakan akun yang diberikan administrator.</p><label>Username<input name="username" autoComplete="username" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label>{loginError&&<div className="api-message api-error"><span>{loginError}</span></div>}<button className="primary-button" disabled={loginLoading}>{loginLoading?"Memeriksa…":"Masuk"}</button></form></div>;

  if (authApi.role() === "kol") return <KolPortalFoundation onLogout={() => setAuthenticated(false)} />;

  return <div className="portal-shell">
    <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
      <div className="brand"><span className="brand-mark">K</span><span><strong>KOL Operations</strong><small>Local workspace</small></span></div>
      <nav aria-label="Navigasi utama">{nav.map((item) => <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => choosePage(item.id)}><span>{item.code}</span>{item.label}{["queries", "history", "settings"].includes(item.id) ? <small>Segera</small> : null}</button>)}</nav>
      <div className="sidebar-footer"><div className="avatar">{(authApi.username() ?? "AD").slice(0,2).toUpperCase()}</div><div><strong>{authApi.username() ?? "Administrator"}</strong><small>{authApi.role()==="admin"?"Super admin":authApi.role()==="operator"?"Operator":"Local admin"}</small></div><button className="logout-button" onClick={()=>{void authApi.logout().finally(()=>setAuthenticated(false))}}>Keluar</button></div>
    </aside>
    <div className="workspace">
      <div className="mobile-bar"><button onClick={() => setMobileOpen((value) => !value)}>☰</button><strong>KOL Operations</strong><span /></div>
      {page === "home" && <main><Header title={`Selamat datang, ${authApi.username() ?? "Administrator"}.`} subtitle="Kelola data KOL dan pembaruan performa Fastpay dari satu tempat." />
        <section className="stats-grid">
          <article><span className="stat-code teal">KOL</span><p>Master KOL aktif</p><strong>72</strong><small>2 perlu dilengkapi</small></article>
          <article><span className="stat-code blue">PRD</span><p>Periode terakhir</p><strong>Sep 2026</strong><small>Data sudah lengkap</small></article>
          <article><span className="stat-code violet">SYN</span><p>Sinkronisasi terakhir</p><strong>10:31</strong><small>Hari ini · Berhasil</small></article>
          <article><span className="stat-code amber">API</span><p>Status sistem</p><strong>Online</strong><small>Cloudflare staging</small></article>
        </section>
        <section className="two-column"><article className="panel action-panel"><div className="panel-heading"><div><p className="eyebrow">AKSI CEPAT</p><h2>Apa yang ingin dikerjakan?</h2></div></div><button className="action-row" onClick={() => choosePage("performance")}><span className="action-icon">↑</span><div><strong>Update performa bulanan</strong><small>Upload CSV register dan NMAT</small></div><b>→</b></button><button className="action-row" onClick={() => choosePage("master")}><span className="action-icon">+</span><div><strong>Tambah master KOL</strong><small>Input manual atau import CSV</small></div><b>→</b></button><button className="action-row muted" onClick={() => choosePage("queries")}><span className="action-icon">Q</span><div><strong>Buat query Fastpay</strong><small>Fitur berikutnya</small></div><b>→</b></button></article>
          <article className="panel"><div className="panel-heading"><div><p className="eyebrow">AKTIVITAS TERBARU</p><h2>Riwayat operasional</h2></div><button className="text-button" onClick={() => choosePage("history")}>Lihat semua</button></div><div className="timeline"><div><span className="success-dot">✓</span><p><strong>Performa September berhasil disinkronkan</strong><small>72 KOL · Hari ini, 10:31</small></p></div><div><span>+</span><p><strong>5 master KOL diperbarui</strong><small>Kemarin, 16:42</small></p></div><div><span>Q</span><p><strong>Query September dibuat</strong><small>30 Sep 2026, 09:08</small></p></div></div></article>
        </section>
      </main>}
      {page === "performance" && <main><Header title="Update performa" subtitle="Unggah hasil query Fastpay, periksa datanya, lalu lanjutkan sinkronisasi." />
        <div className="stepper"><span className="current"><b>1</b>Pilih periode & file</span><i /><span className={validated ? "done" : ""}><b>2</b>Validasi data</span><i /><span><b>3</b>Konfirmasi</span></div>
        <section className="panel form-panel"><div className="panel-heading"><div><p className="eyebrow">LANGKAH 1</p><h2>Periode laporan</h2><p>Gunakan periode yang sama dengan query Fastpay.</p></div></div><div className="date-grid"><label>Tanggal awal<input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label><span>—</span><label>Tanggal akhir<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label></div></section>
        <section className="panel form-panel"><div className="panel-heading"><div><p className="eyebrow">LANGKAH 2</p><h2>Upload hasil query</h2><p>Tiga workbook dibaca dan digabungkan berdasarkan tanggal + upline.</p></div></div><div className="upload-grid upload-grid-three"><DropZone workbook kind="registration" title="Register & Aktivasi" hint="registration1-30sept.xlsx" file={files.registration} onFile={addFile} /><DropZone workbook kind="nmat" title="NMAT & Transaksi" hint="nmat1-30sept.xlsx" file={files.nmat} onFile={addFile} /><DropZone workbook kind="financial" title="Komisi & Revenue Aktivasi" hint="komisiaktifasidanrevenue.xlsx" file={files.financial} onFile={addFile} /></div></section>
        {masterError&&<div className="api-message api-error"><strong>Gagal</strong><span>{masterError}</span></div>}{importNotice&&<div className="api-message api-success"><strong>Berhasil</strong><span>{importNotice}</span></div>}
        {validated && <section className="validation-card"><div className="validation-title"><span>✓</span><div><strong>Data lolos validasi</strong><p>Tiga workbook siap disinkronkan ke database.</p></div></div><div className="validation-stats"><div><small>Baris tanggal–KOL</small><strong>{numberFormat.format(importRows.length)}</strong></div><div><small>Total register</small><strong>{numberFormat.format(importRows.reduce((sum,row)=>sum+row.totalRegistered,0))}</strong></div><div><small>Total aktif</small><strong>{numberFormat.format(importRows.reduce((sum,row)=>sum+row.totalActive,0))}</strong></div><div><small>Total NMAT</small><strong>{numberFormat.format(importRows.reduce((sum,row)=>sum+row.totalNmat,0))}</strong></div></div><div className="notice"><strong>Siap kirim</strong><span>Data baru dikirim setelah tombol Sinkronkan ditekan.</span></div></section>}
        <div className="page-actions"><button className="secondary-button" disabled={importLoading}>Simpan sebagai draft</button>{validated?<button className="primary-button" disabled={importLoading} onClick={()=>void syncPerformance()}>{importLoading?"Menyinkronkan…":"Sinkronkan ke database"}</button>:<button className="primary-button" disabled={importLoading||!files.registration||!files.nmat||!files.financial} onClick={()=>void validatePerformanceFiles()}>{importLoading?"Memvalidasi…":"Validasi data"}</button>}</div>
      </main>}
      {page === "daily" && <main><Header title="Performa harian" subtitle="Lihat pergerakan register, aktivasi, NMAT, transaksi, dan revenue dari hari ke hari." />
        <section className="panel top-performance"><div className="panel-heading top-performance-heading"><div><p className="eyebrow">TOP PERFORMANCE</p><h2>5 KOL terbaik</h2><p>Peringkat dihitung dari total pencapaian KOL selama rentang yang dipilih.</p></div><div className="top-performance-filters"><label>Tanggal awal<input type="date" value={leaderStart} onChange={(event)=>setLeaderStart(event.target.value)}/></label><label>Tanggal akhir<input type="date" value={leaderEnd} onChange={(event)=>setLeaderEnd(event.target.value)}/></label><label>Peringkat berdasarkan<select value={leaderMetric} onChange={(event)=>setLeaderMetric(event.target.value as DailyMetric)}><option value="nmat">NMAT</option><option value="registered">Register</option><option value="active">Aktif</option><option value="transactions">Transaksi</option><option value="revenue">Revenue transaksi</option><option value="activationCommission">Komisi aktivasi</option><option value="activationRevenue">Revenue aktivasi</option></select></label><button className="primary-button" disabled={topLoading} onClick={()=>void loadTopPerformance()}>{topLoading?"Memuat…":"Tampilkan"}</button></div></div><div className="top-performance-list">{topPerformers.length===0?<p className="empty-state">Belum ada data pada rentang yang dipilih.</p>:topPerformers.map((row,index)=>{const value=row.value;return <article key={row.uplineId}><span className={`rank rank-${index+1}`}>{index+1}</span><div className="top-performer-name"><strong>{row.kolName}</strong><small>{row.uplineId}</small></div><div className="leader-bar"><i style={{width:`${Math.max(4,(value/topPerformerMaximum)*100)}%`}}/></div><strong className="leader-value">{leaderMetricIsCurrency?currencyFormat.format(value):numberFormat.format(value)}<small>{leaderMetricLabel}</small></strong></article>})}</div></section>
        <section className="panel daily-filter range-filter"><label>KOL<select value={dailyUpline} onChange={(event)=>setDailyUpline(event.target.value)}><option value="">Semua KOL</option>{kols.map((kol)=><option value={kol.upline} key={kol.id}>{kol.upline} · {kol.name}</option>)}</select></label><label>Tanggal awal<input type="date" value={dailyStart} onChange={(event)=>setDailyStart(event.target.value)} /></label><label>Tanggal akhir<input type="date" value={dailyEnd} onChange={(event)=>setDailyEnd(event.target.value)} /></label><label>Metrik<select value={dailyMetric} onChange={(event)=>setDailyMetric(event.target.value as DailyMetric)}><option value="nmat">NMAT</option><option value="registered">Register</option><option value="active">Aktif</option><option value="transactions">Transaksi</option><option value="revenue">Revenue transaksi</option><option value="activationCommission">Komisi aktivasi</option><option value="activationRevenue">Revenue aktivasi</option></select></label><button className="primary-button" disabled={dailyLoading} onClick={()=>void loadDailyPerformance()}>{dailyLoading?"Memuat…":"Tampilkan"}</button></section>
        {dailyError&&<div className="api-message api-error"><strong>Gagal</strong><span>{dailyError}</span></div>}
        <section className="daily-kpis summary-seven"><article><p>KOL memiliki downline</p><strong>{numberFormat.format(registeredKolCount)}</strong><small>dari {numberFormat.format(cooperationKolCount)} KOL tercatat</small></article><article><p>Total register</p><strong>{numberFormat.format(totalRegistered)}</strong><small>downline terdaftar</small></article><article><p>Total aktivasi</p><strong>{numberFormat.format(totalActive)}</strong><small>downline aktif</small></article><article><p>Total transaksi</p><strong>{numberFormat.format(totalTransactions)}</strong><small>transaksi anggota NMAT</small></article><article><p>Revenue transaksi</p><strong>{currencyFormat.format(totalTransactionRevenue)}</strong><small>total margin_fp transaksi</small></article><article><p>Komisi aktivasi</p><strong>{currencyFormat.format(totalActivationCommission)}</strong><small>komisi untuk KOL</small></article><article><p>Revenue aktivasi</p><strong>{currencyFormat.format(totalActivationRevenue)}</strong><small>margin aktivasi untuk Fastpay</small></article></section>
        <section className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">TREN HARIAN</p><h2>{selectedMetricLabel} per tanggal</h2><p>Data aktual dari D1 staging, dikelompokkan berdasarkan tanggal.</p></div><div className="chart-legend"><span><i />Aktual</span></div></div><div className="bar-chart">{dailySeries.length===0?<p>Belum ada data pada periode ini.</p>:dailySeries.map((row)=><div className="bar-column" key={row.date}><span className="bar-value">{dailyMetricIsCurrency?numberFormat.format(metricValue(row)):metricValue(row)}</span><i style={{height:`${Math.max(3,(metricValue(row)/metricMax)*100)}%`}}/><small>{shortDateFormat.format(new Date(`${row.date}T00:00:00Z`))}</small></div>)}</div></section>
        <section className="panel daily-table"><div className="panel-heading"><div><p className="eyebrow">BREAKDOWN DATA</p><h2>Performa per tanggal</h2></div><button className="secondary-button" disabled={!dailySeries.length} onClick={exportDailyCsv}>Export CSV</button></div><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Register</th><th>Aktif</th><th>NMAT baru</th><th>Transaksi</th><th>Revenue transaksi</th><th>Komisi aktivasi</th><th>Revenue aktivasi</th><th>NMAT kumulatif</th></tr></thead><tbody>{dailySeries.length===0?<tr><td colSpan={9}>{dailyLoading?"Memuat data…":"Belum ada data pada periode ini."}</td></tr>:[...dailySeries].reverse().map((row)=><tr key={row.date}><td>{dateFormat.format(new Date(`${row.date}T00:00:00Z`))}</td><td className="numeric">{numberFormat.format(row.registered)}</td><td className="numeric">{numberFormat.format(row.active)}</td><td className="numeric">{numberFormat.format(row.nmat)}</td><td className="numeric">{numberFormat.format(row.transactions)}</td><td className="numeric">{currencyFormat.format(row.revenue)}</td><td className="numeric">{currencyFormat.format(row.activationCommission)}</td><td className="numeric">{currencyFormat.format(row.activationRevenue)}</td><td className="numeric">{numberFormat.format(row.cumulativeNmat)}</td></tr>)}</tbody></table></div></section>
      </main>}
      {page === "monthly" && <main><Header title="KOL bulanan" subtitle="Tentukan daftar KOL yang bekerja sama dan tier yang berlaku pada setiap bulan." />
        <section className="panel period-roster"><div className="panel-heading"><div><p className="eyebrow">PERIODE KERJA SAMA</p><h2>Roster Oktober 2026</h2><p>Daftar ini menjadi acuan query dan mission bulan berjalan.</p></div><div className="month-actions"><input type="month" defaultValue="2026-10" /><button className="secondary-button">Salin dari September</button></div></div><div className="roster-metrics"><div><strong>68</strong><span>KOL bulan ini</span></div><div><strong className="positive">+6</strong><span>KOL baru</span></div><div><strong className="negative">−10</strong><span>Tidak berlanjut</span></div><div><strong>4</strong><span>Belum punya tier</span></div></div></section>
        <section className="panel form-panel"><div className="panel-heading"><div><p className="eyebrow">IMPORT ROSTER</p><h2>Upload ID KOL bulan ini</h2><p>CSV minimal memiliki kolom upline_id. Tier dan PIC bersifat opsional.</p></div><button className="text-button">Unduh template</button></div><div className="single-upload"><DropZone kind="monthly" title="CSV KOL Bulanan" hint="upline_id, tier, dan PIC" file={files.monthly} onFile={addFile}/></div>{files.monthly&&<div className="page-actions roster-action"><button className="secondary-button">Batal</button><button className="primary-button" onClick={()=>setMonthlyPreview(true)}>Periksa perubahan</button></div>}</section>
        {monthlyPreview&&<section className="panel change-preview"><div className="panel-heading"><div><p className="eyebrow">PREVIEW PERUBAHAN</p><h2>Perbandingan dengan September</h2><p>Belum ada perubahan yang disimpan pada mode prototype.</p></div><span className="review-badge">Siap ditinjau</span></div><div className="change-grid"><article><span className="change-new">BARU</span><strong>6 KOL</strong><p>Termasuk FA168621 dan FA761490</p></article><article><span className="change-stay">LANJUT</span><strong>62 KOL</strong><p>Tier 4 KOL berubah bulan ini</p></article><article><span className="change-end">SELESAI</span><strong>10 KOL</strong><p>Tidak masuk roster Oktober</p></article><article><span className="change-alert">PERLU CEK</span><strong>2 ID</strong><p>Belum ditemukan di Master KOL</p></article></div><div className="notice"><strong>Perhatian</strong><span>ID yang belum ada di Master KOL harus dilengkapi sebelum roster dikonfirmasi.</span></div><div className="page-actions"><button className="secondary-button">Kembali</button><button className="primary-button" disabled>Konfirmasi roster</button></div></section>}
      </main>}
      {page === "missions" && <main><Header title="Mission" subtitle="Susun target berdasarkan tier dan pantau mission yang sedang berjalan." />
        <div className="mission-top"><div className="tabs"><button className="selected">Semua <span>{missions.length}</span></button><button>Aktif <span>{missions.filter((item)=>item.status==="active").length}</span></button><button>Draft <span>{missions.filter((item)=>item.status==="draft").length}</span></button></div><button className="primary-button" onClick={()=>{setEditingMission(null);setShowMissionForm(true)}}>+ Buat mission</button></div>
        {missionError&&<div className="api-message api-error"><strong>Gagal</strong><span>{missionError}</span></div>}
        <section className="mission-grid">{missions.length===0?<div className="empty-state">Belum ada mission. Klik “Buat mission” untuk menambahkan.</div>:missions.map((mission)=><article className="mission-card" key={mission.id}><div className="mission-card-top"><span className={`tier tier-${mission.tierCode.toLowerCase()}`}>{mission.tierCode}</span><span className="live-dot">{mission.status}</span></div><h2>{mission.name}</h2><p>{mission.description||"Tanpa deskripsi"}</p><div className="mission-period">{mission.startDate} – {mission.endDate}</div><div className="mission-budget"><small>Budget mission</small><strong>{currencyFormat.format(mission.budgetAmount)}</strong></div><div className="mission-targets">{mission.targets.slice(0,2).map((target)=><div key={target.metric}><small>Target {target.metric}</small><strong>{numberFormat.format(target.targetValue)}</strong></div>)}<div><small>Peserta aktual / target</small><strong>{mission.participantCount} / {mission.participantTarget} KOL</strong></div></div><footer><button className="text-button" onClick={()=>{setEditingMission(mission);setShowMissionForm(true)}}>Edit mission</button></footer></article>)}</section>
        {showMissionForm&&<div className="modal-backdrop" onMouseDown={()=>!missionSaving&&setShowMissionForm(false)}><form className="modal mission-modal" onMouseDown={(event)=>event.stopPropagation()} onSubmit={(event)=>{event.preventDefault();void saveMission(event.currentTarget)}}><div className="modal-heading"><div><p className="eyebrow">MISSION BUILDER</p><h2>{editingMission?"Edit mission":"Buat mission baru"}</h2><p>Atur peserta, periode, budget, dan indikator keberhasilan.</p></div><button type="button" onClick={()=>setShowMissionForm(false)}>×</button></div><label>Nama mission<input name="name" defaultValue={editingMission?.name??""} required/></label><div className="form-row"><label>Tier peserta<select name="tier" defaultValue={editingMission?.tierCode??"BARU"}><option>BARU</option><option>JELEK</option><option>BIASA</option><option>LUMAYAN</option><option>KUAT</option></select></label><label>Status<select name="status" defaultValue={editingMission?.status??"draft"}><option value="draft">Draft</option><option value="active">Aktif</option><option value="completed">Selesai</option><option value="cancelled">Dibatalkan</option></select></label></div><div className="form-row"><label>Target jumlah KOL<input name="participantTarget" type="number" min="0" defaultValue={editingMission?.participantTarget??0} required/><small>Jumlah KOL yang direncanakan mengikuti mission.</small></label><label>Budget mission (Rp)<input name="budgetAmount" type="number" min="0" step="1" defaultValue={editingMission?.budgetAmount??0} required/><small>Total anggaran untuk mission ini.</small></label></div><div className="form-row"><label>Tanggal mulai<input name="startDate" type="date" defaultValue={editingMission?.startDate??"2026-10-01"} required/></label><label>Tanggal selesai<input name="endDate" type="date" defaultValue={editingMission?.endDate??"2026-10-31"} required/></label></div><div className="target-builder"><div><label>Metrik<select name="metric" defaultValue={editingMission?.targets[0]?.metric??"nmat"}><option value="nmat">NMAT</option><option value="registered">Register</option><option value="active">Aktif</option><option value="transactions">Transaksi</option><option value="revenue">Revenue</option></select></label><label>Target<input name="target" type="number" min="0" defaultValue={editingMission?.targets[0]?.targetValue??50} required/></label></div></div><label>Deskripsi<input name="description" defaultValue={editingMission?.description??""} placeholder="Tujuan singkat mission"/></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>setShowMissionForm(false)}>Batal</button><button className="primary-button" disabled={missionSaving}>{missionSaving?"Menyimpan…":editingMission?"Simpan perubahan":"Buat mission"}</button></div></form></div>}
      </main>}
      {page === "master" && <main><Header title="Master KOL" subtitle="Kelola identitas KOL yang menjadi acuan query, tiering, mission, dan dashboard." />
        <section className="master-summary"><div><span>{kols.length}</span><p>Total KOL</p></div><div><span>{activeKolCount}</span><p>Aktif</p></div><div><span>{kols.length-activeKolCount}</span><p>Nonaktif</p></div><div><span>{tierCount}</span><p>Tier tersedia</p></div></section>
        <section className="tier-overview"><button className={!tierFilter?"selected":""} onClick={()=>setTierFilter("")}><strong>{kols.length}</strong><span>Semua tier</span></button>{tierSummary.map((item)=><button key={item.tier} className={tierFilter===item.tier?"selected":""} onClick={()=>setTierFilter(item.tier)}><strong>{item.count}</strong><span>{item.tier}</span></button>)}</section>
        <section className="panel master-panel"><div className="master-toolbar"><div className="search"><span>⌕</span><input placeholder="Cari nama, upline, atau tier…" value={search} onChange={(event) => setSearch(event.target.value)} /></div><div><button className="secondary-button" disabled={masterSaving} onClick={() => void syncGoogleMaster()}>{masterSaving ? "Memproses…" : "Import Google Sheet"}</button><button className="secondary-button" disabled={masterSaving} onClick={() => void exportMasterKol()}>Export CSV</button><label className="import-button">Import CSV<input type="file" accept=".csv" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files?.[0] && void addFile("master", event.target.files[0])} /></label><button className="primary-button" onClick={() => { setEditingKol(null); setShowForm(true); }}>+ Tambah KOL</button></div></div>
          {masterError && <div className="api-message api-error"><strong>Gagal</strong><span>{masterError}</span></div>}
          {masterNotice && <div className="api-message api-success"><strong>Berhasil</strong><span>{masterNotice}</span></div>}
          {files.master && <div className="import-preview"><span>CSV lolos validasi</span><strong>{files.master.name}</strong><small>{masterImportRows.length} baris · upsert berdasarkan upline_id</small><button className="text-button" disabled={masterSaving} onClick={() => void importMasterKols()}>{masterSaving ? "Mengimpor…" : "Import ke database"}</button></div>}
          <div className="table-wrap"><table><thead><tr><th>Upline ID</th><th>Nama KOL</th><th>Tier</th><th>PIC</th><th>Keterangan</th><th>Status</th><th /></tr></thead><tbody>{masterLoading ? <tr><td colSpan={7}>Memuat data staging…</td></tr> : visibleKols.length === 0 ? <tr><td colSpan={7}>Belum ada data KOL yang sesuai.</td></tr> : visibleKols.map((kol) => <tr key={kol.id}><td><strong className="upline">{kol.upline}</strong></td><td><div className="person"><span>{kol.name.slice(0, 2).toUpperCase()}</span><strong>{kol.name}</strong></div></td><td><span className={`tier tier-${kol.tier.toLowerCase().replaceAll(" ", "-")}`}>{kol.tier}</span></td><td>{kol.pic}</td><td className="kol-notes" title={kol.notes}>{kol.notes || "—"}</td><td><span className={`status status-${kol.status.toLowerCase()}`}>{kol.status}</span></td><td><button className="edit-button" onClick={() => { setEditingKol(kol); setShowForm(true); }}>Edit</button></td></tr>)}</tbody></table></div><div className="table-footer"><span>Menampilkan {visibleKols.length} dari {kols.length} KOL</span></div>
        </section>
        {showForm && <div className="modal-backdrop" onMouseDown={() => !masterSaving && setShowForm(false)}><form className="modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void saveKol(event.currentTarget); }}><div className="modal-heading"><div><p className="eyebrow">MASTER KOL</p><h2>{editingKol ? "Edit data KOL" : "Tambah KOL baru"}</h2><p>Perubahan akan langsung disimpan ke database staging.</p></div><button type="button" disabled={masterSaving} onClick={() => setShowForm(false)}>×</button></div><label>Upline ID<input name="upline" placeholder="Contoh: FA582386" defaultValue={editingKol?.upline} required /></label>{editingKol && <div className="id-warning">Perubahan Upline ID ikut tercatat dalam audit log.</div>}<label>Nama KOL<input name="name" placeholder="Nama lengkap atau nama channel" defaultValue={editingKol?.name} required /></label><div className="form-row"><label>Tier<select name="tier" defaultValue={editingKol?.tier === "Belum diatur" ? "" : editingKol?.tier ?? ""}><option value="">Belum diatur</option><option>BARU</option><option>JELEK</option><option>BIASA</option><option>LUMAYAN</option><option>KUAT</option></select></label><label>PIC<input name="pic" placeholder="Nama PIC" defaultValue={editingKol?.pic === "—" ? "" : editingKol?.pic} /></label></div><label>Keterangan<textarea name="notes" rows={3} placeholder="Catatan tambahan tentang KOL" defaultValue={editingKol?.notes ?? ""} /></label><label>Status<select name="status" defaultValue={editingKol?.status ?? "Aktif"}><option>Aktif</option><option>Nonaktif</option></select></label><div className="modal-actions"><button type="button" className="secondary-button" disabled={masterSaving} onClick={() => setShowForm(false)}>Batal</button><button className="primary-button" disabled={masterSaving} type="submit">{masterSaving ? "Menyimpan…" : editingKol ? "Simpan perubahan" : "Tambah ke daftar"}</button></div></form></div>}
      </main>}
      {["queries", "history", "settings"].includes(page) && <main><Header title={nav.find((item) => item.id === page)?.label ?? "Segera hadir"} subtitle="Halaman ini disiapkan untuk fase pengembangan berikutnya." /><section className="coming-soon"><span>{nav.find((item) => item.id === page)?.code}</span><h2>Fondasinya sudah disiapkan.</h2><p>Kita akan mengaktifkan fungsi ini setelah alur Update Performa dan Master KOL disetujui.</p><button className="secondary-button" onClick={() => choosePage("home")}>Kembali ke beranda</button></section></main>}
    </div>
  </div>;
}
