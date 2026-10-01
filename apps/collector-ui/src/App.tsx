import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { kolApi, type KolInput, type KolRecord } from "./api";

type Page = "home" | "performance" | "daily" | "master" | "monthly" | "missions" | "queries" | "history" | "settings";
type UploadKind = "registration" | "nmat" | "master" | "monthly";
type UploadedFile = { name: string; size: string; rows: number };
type Kol = { id: number; upline: string; name: string; tier: string; status: "Aktif" | "Nonaktif"; pic: string };

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
});

function fileSize(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

async function inspectCsv(file: File): Promise<UploadedFile> {
  const text = await file.text();
  const rows = text.split(/\r?\n/).filter((row) => row.trim()).length;
  return { name: file.name, size: fileSize(file.size), rows: Math.max(0, rows - 1) };
}

function DropZone({ kind, title, hint, file, onFile }: { kind: UploadKind; title: string; hint: string; file?: UploadedFile; onFile: (kind: UploadKind, file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const receive = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const dropped = event.dataTransfer.files[0];
    if (dropped) onFile(kind, dropped);
  };
  return <div className={`dropzone ${file ? "dropzone-ready" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={receive}>
    <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(event) => event.target.files?.[0] && onFile(kind, event.target.files[0])} />
    <span className="upload-symbol" aria-hidden="true">{file ? "✓" : "↑"}</span>
    {file ? <>
      <strong>{file.name}</strong>
      <p>{file.rows} baris · {file.size}</p>
      <button className="text-button" type="button" onClick={() => input.current?.click()}>Ganti file</button>
    </> : <>
      <strong>{title}</strong><p>{hint}</p>
      <button className="secondary-button" type="button" onClick={() => input.current?.click()}>Pilih CSV</button>
    </>}
  </div>;
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return <header className="page-header"><div><p className="eyebrow">KOL OPERATIONS</p><h1>{title}</h1><p>{subtitle}</p></div><div className="connection"><span />API staging terhubung</div></header>;
}

export function App() {
  const [page, setPage] = useState<Page>("home");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [files, setFiles] = useState<Partial<Record<UploadKind, UploadedFile>>>({});
  const [periodStart, setPeriodStart] = useState("2026-09-01");
  const [periodEnd, setPeriodEnd] = useState("2026-09-30");
  const [validated, setValidated] = useState(false);
  const [search, setSearch] = useState("");
  const [kols, setKols] = useState<Kol[]>([]);
  const [masterLoading, setMasterLoading] = useState(true);
  const [masterSaving, setMasterSaving] = useState(false);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [masterNotice, setMasterNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingKol, setEditingKol] = useState<Kol | null>(null);
  const [showMissionForm, setShowMissionForm] = useState(false);
  const [monthlyPreview, setMonthlyPreview] = useState(false);

  const visibleKols = useMemo(() => kols.filter((kol) => `${kol.upline} ${kol.name} ${kol.tier}`.toLowerCase().includes(search.toLowerCase())), [kols, search]);
  const activeKolCount = kols.filter((kol) => kol.status === "Aktif").length;
  const tierCount = new Set(kols.map((kol) => kol.tier).filter((tier) => tier !== "Belum diatur")).size;

  useEffect(() => {
    void kolApi.list()
      .then(({ items }) => { setKols(items.map(mapKol)); setMasterError(null); })
      .catch((error: unknown) => setMasterError(error instanceof Error ? error.message : "Master KOL gagal dimuat"))
      .finally(() => setMasterLoading(false));
  }, []);

  async function saveKol(form: HTMLFormElement) {
    const data = new FormData(form);
    const input: KolInput = {
      uplineId: String(data.get("upline")).trim().toUpperCase(),
      name: String(data.get("name")).trim(),
      tierCode: String(data.get("tier")) || null,
      picName: String(data.get("pic")).trim() || null,
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
    const inspected = await inspectCsv(file);
    setFiles((current) => ({ ...current, [kind]: inspected }));
    setValidated(false);
  }

  function choosePage(next: Page) { setPage(next); setMobileOpen(false); }

  return <div className="portal-shell">
    <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
      <div className="brand"><span className="brand-mark">K</span><span><strong>KOL Operations</strong><small>Local workspace</small></span></div>
      <nav aria-label="Navigasi utama">{nav.map((item) => <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => choosePage(item.id)}><span>{item.code}</span>{item.label}{["queries", "history", "settings"].includes(item.id) ? <small>Segera</small> : null}</button>)}</nav>
      <div className="sidebar-footer"><div className="avatar">VD</div><div><strong>Valentino Dewa</strong><small>Administrator</small></div><span className="online-dot" /></div>
    </aside>
    <div className="workspace">
      <div className="mobile-bar"><button onClick={() => setMobileOpen((value) => !value)}>☰</button><strong>KOL Operations</strong><span /></div>
      {page === "home" && <main><Header title="Selamat datang, Valentino." subtitle="Kelola data KOL dan pembaruan performa Fastpay dari satu tempat." />
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
        <section className="panel form-panel"><div className="panel-heading"><div><p className="eyebrow">LANGKAH 2</p><h2>Upload hasil query</h2><p>File hanya dibaca di komputer ini sampai Anda menekan tombol sinkronisasi.</p></div><button className="text-button">Unduh contoh CSV</button></div><div className="upload-grid"><DropZone kind="registration" title="CSV Register & Aktif" hint="Tarik file ke sini atau pilih dari komputer" file={files.registration} onFile={addFile} /><DropZone kind="nmat" title="CSV NMAT" hint="Tarik file ke sini atau pilih dari komputer" file={files.nmat} onFile={addFile} /></div></section>
        {validated && <section className="validation-card"><div className="validation-title"><span>✓</span><div><strong>Data lolos validasi awal</strong><p>Kedua file memiliki struktur yang sesuai dan siap diperiksa.</p></div></div><div className="validation-stats"><div><small>KOL ditemukan</small><strong>72</strong></div><div><small>Total register</small><strong>2.076</strong></div><div><small>Total aktif</small><strong>2.076</strong></div><div><small>Total NMAT</small><strong>1.740</strong></div></div><div className="notice"><strong>Mode prototype</strong><span>Belum ada data yang dikirim ke API atau database.</span></div></section>}
        <div className="page-actions"><button className="secondary-button">Simpan sebagai draft</button><button className="primary-button" disabled={!files.registration || !files.nmat} onClick={() => setValidated(true)}>{validated ? "Lanjut ke konfirmasi" : "Validasi data"}</button></div>
      </main>}
      {page === "daily" && <main><Header title="Performa harian" subtitle="Lihat pergerakan register, aktivasi, NMAT, transaksi, dan revenue dari hari ke hari." />
        <section className="panel daily-filter"><label>KOL<select><option>Semua KOL</option><option>FA582386 · Nadia Prameswari</option><option>FA660738 · Raka Digital</option></select></label><label>Periode<input type="month" defaultValue="2026-09" /></label><label>Metrik<select><option>NMAT</option><option>Register</option><option>Aktif</option><option>Transaksi</option><option>Revenue</option></select></label><button className="primary-button">Tampilkan</button></section>
        <section className="daily-kpis"><article><p>Rata-rata NMAT/hari</p><strong>58</strong><small>30 hari tercatat</small></article><article><p>Hari terbaik</p><strong>12 Sep</strong><small>96 NMAT</small></article><article><p>Pertumbuhan</p><strong className="positive">+12,4%</strong><small>dibanding Agustus</small></article><article><p>Progress bulanan</p><strong>1.740</strong><small>dari target 2.000</small></article></section>
        <section className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">TREN HARIAN</p><h2>NMAT per tanggal</h2><p>Batang menunjukkan pencapaian harian; garis putus-putus adalah target 65 NMAT.</p></div><div className="chart-legend"><span><i />Aktual</span><span><i />Target</span></div></div><div className="bar-chart"><div className="target-line"><span>65</span></div>{[42,58,71,54,83,61,45,77,96,68,73,51,65,88].map((value,index)=><div className="bar-column" key={index}><span className="bar-value">{value}</span><i style={{height:`${value}%`}}/><small>{index+1} Sep</small></div>)}</div></section>
        <section className="panel daily-table"><div className="panel-heading"><div><p className="eyebrow">BREAKDOWN DATA</p><h2>Performa per tanggal</h2></div><button className="secondary-button">Export CSV</button></div><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Register</th><th>Aktif</th><th>NMAT baru</th><th>Transaksi</th><th>Revenue</th><th>NMAT kumulatif</th></tr></thead><tbody>{[["05 Sep 2026",72,68,83,721,"Rp 842.500",308],["04 Sep 2026",61,57,54,604,"Rp 715.200",225],["03 Sep 2026",80,73,71,688,"Rp 790.400",171],["02 Sep 2026",64,60,58,531,"Rp 626.100",100],["01 Sep 2026",51,47,42,498,"Rp 581.300",42]].map((row)=><tr key={String(row[0])}>{row.map((cell,index)=><td className={index>0?"numeric":""} key={index}>{cell}</td>)}</tr>)}</tbody></table></div></section>
      </main>}
      {page === "monthly" && <main><Header title="KOL bulanan" subtitle="Tentukan daftar KOL yang bekerja sama dan tier yang berlaku pada setiap bulan." />
        <section className="panel period-roster"><div className="panel-heading"><div><p className="eyebrow">PERIODE KERJA SAMA</p><h2>Roster Oktober 2026</h2><p>Daftar ini menjadi acuan query dan mission bulan berjalan.</p></div><div className="month-actions"><input type="month" defaultValue="2026-10" /><button className="secondary-button">Salin dari September</button></div></div><div className="roster-metrics"><div><strong>68</strong><span>KOL bulan ini</span></div><div><strong className="positive">+6</strong><span>KOL baru</span></div><div><strong className="negative">−10</strong><span>Tidak berlanjut</span></div><div><strong>4</strong><span>Belum punya tier</span></div></div></section>
        <section className="panel form-panel"><div className="panel-heading"><div><p className="eyebrow">IMPORT ROSTER</p><h2>Upload ID KOL bulan ini</h2><p>CSV minimal memiliki kolom upline_id. Tier dan PIC bersifat opsional.</p></div><button className="text-button">Unduh template</button></div><div className="single-upload"><DropZone kind="monthly" title="CSV KOL Bulanan" hint="upline_id, tier, dan PIC" file={files.monthly} onFile={addFile}/></div>{files.monthly&&<div className="page-actions roster-action"><button className="secondary-button">Batal</button><button className="primary-button" onClick={()=>setMonthlyPreview(true)}>Periksa perubahan</button></div>}</section>
        {monthlyPreview&&<section className="panel change-preview"><div className="panel-heading"><div><p className="eyebrow">PREVIEW PERUBAHAN</p><h2>Perbandingan dengan September</h2><p>Belum ada perubahan yang disimpan pada mode prototype.</p></div><span className="review-badge">Siap ditinjau</span></div><div className="change-grid"><article><span className="change-new">BARU</span><strong>6 KOL</strong><p>Termasuk FA168621 dan FA761490</p></article><article><span className="change-stay">LANJUT</span><strong>62 KOL</strong><p>Tier 4 KOL berubah bulan ini</p></article><article><span className="change-end">SELESAI</span><strong>10 KOL</strong><p>Tidak masuk roster Oktober</p></article><article><span className="change-alert">PERLU CEK</span><strong>2 ID</strong><p>Belum ditemukan di Master KOL</p></article></div><div className="notice"><strong>Perhatian</strong><span>ID yang belum ada di Master KOL harus dilengkapi sebelum roster dikonfirmasi.</span></div><div className="page-actions"><button className="secondary-button">Kembali</button><button className="primary-button" disabled>Konfirmasi roster</button></div></section>}
      </main>}
      {page === "missions" && <main><Header title="Mission" subtitle="Susun target berdasarkan tier dan pantau mission yang sedang berjalan." />
        <div className="mission-top"><div className="tabs"><button className="selected">Aktif <span>3</span></button><button>Draft <span>1</span></button><button>Selesai <span>12</span></button></div><button className="primary-button" onClick={()=>setShowMissionForm(true)}>+ Buat mission</button></div>
        <section className="mission-grid"><article className="mission-card"><div className="mission-card-top"><span className="tier tier-growth">Growth</span><span className="live-dot">Aktif</span></div><h2>October Growth Challenge</h2><p>Dorong aktivasi dan transaksi member baru sepanjang Oktober.</p><div className="mission-period">01–31 Oktober 2026</div><div className="mission-targets"><div><small>Target NMAT</small><strong>50</strong></div><div><small>Target transaksi</small><strong>500</strong></div><div><small>Peserta</small><strong>24 KOL</strong></div></div><div className="progress-row"><span>Rata-rata progress</span><strong>68%</strong></div><div className="progress"><i style={{width:"68%"}}/></div><footer><button className="text-button">Lihat progress</button><button className="dots">•••</button></footer></article>
          <article className="mission-card"><div className="mission-card-top"><span className="tier tier-starter">Starter</span><span className="live-dot">Aktif</span></div><h2>First 10 Active Members</h2><p>Mission onboarding untuk KOL yang baru bergabung.</p><div className="mission-period">01–31 Oktober 2026</div><div className="mission-targets"><div><small>Target aktif</small><strong>10</strong></div><div><small>Target NMAT</small><strong>5</strong></div><div><small>Peserta</small><strong>38 KOL</strong></div></div><div className="progress-row"><span>Rata-rata progress</span><strong>42%</strong></div><div className="progress"><i style={{width:"42%"}}/></div><footer><button className="text-button">Lihat progress</button><button className="dots">•••</button></footer></article>
          <article className="mission-card"><div className="mission-card-top"><span className="tier tier-champion">Champion</span><span className="live-dot">Aktif</span></div><h2>Revenue Champion</h2><p>Pertahankan kualitas transaksi dan revenue jaringan.</p><div className="mission-period">01 Okt–31 Des 2026</div><div className="mission-targets"><div><small>Target revenue</small><strong>Rp5 jt</strong></div><div><small>Target NMAT</small><strong>150</strong></div><div><small>Peserta</small><strong>6 KOL</strong></div></div><div className="progress-row"><span>Rata-rata progress</span><strong>31%</strong></div><div className="progress"><i style={{width:"31%"}}/></div><footer><button className="text-button">Lihat progress</button><button className="dots">•••</button></footer></article></section>
        {showMissionForm&&<div className="modal-backdrop" onMouseDown={()=>setShowMissionForm(false)}><form className="modal mission-modal" onMouseDown={(event)=>event.stopPropagation()} onSubmit={(event)=>{event.preventDefault();setShowMissionForm(false)}}><div className="modal-heading"><div><p className="eyebrow">MISSION BUILDER</p><h2>Buat mission baru</h2><p>Atur peserta, periode, dan indikator keberhasilan.</p></div><button type="button" onClick={()=>setShowMissionForm(false)}>×</button></div><label>Nama mission<input placeholder="Contoh: November Growth Challenge" required/></label><div className="form-row"><label>Tier peserta<select><option>Starter</option><option>Growth</option><option>Champion</option></select></label><label>Status<select><option>Draft</option><option>Aktif</option></select></label></div><div className="form-row"><label>Tanggal mulai<input type="date" defaultValue="2026-11-01"/></label><label>Tanggal selesai<input type="date" defaultValue="2026-11-30"/></label></div><div className="target-builder"><div><label>Metrik<select><option>NMAT</option><option>Register</option><option>Aktif</option><option>Transaksi</option><option>Revenue</option></select></label><label>Target<input type="number" defaultValue="50"/></label></div><button type="button" className="text-button">+ Tambah target</button></div><label>Deskripsi<input placeholder="Tujuan singkat mission"/></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>setShowMissionForm(false)}>Batal</button><button className="primary-button">Simpan sebagai draft</button></div></form></div>}
      </main>}
      {page === "master" && <main><Header title="Master KOL" subtitle="Kelola identitas KOL yang menjadi acuan query, tiering, mission, dan dashboard." />
        <section className="master-summary"><div><span>{kols.length}</span><p>Total KOL</p></div><div><span>{activeKolCount}</span><p>Aktif</p></div><div><span>{kols.length-activeKolCount}</span><p>Nonaktif</p></div><div><span>{tierCount}</span><p>Tier tersedia</p></div></section>
        <section className="panel master-panel"><div className="master-toolbar"><div className="search"><span>⌕</span><input placeholder="Cari nama, upline, atau tier…" value={search} onChange={(event) => setSearch(event.target.value)} /></div><div><label className="import-button">Import CSV<input type="file" accept=".csv" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files?.[0] && void addFile("master", event.target.files[0])} /></label><button className="primary-button" onClick={() => { setEditingKol(null); setShowForm(true); }}>+ Tambah KOL</button></div></div>
          {masterError && <div className="api-message api-error"><strong>Gagal</strong><span>{masterError}</span></div>}
          {masterNotice && <div className="api-message api-success"><strong>Berhasil</strong><span>{masterNotice}</span></div>}
          {files.master && <div className="import-preview"><span>CSV siap diperiksa</span><strong>{files.master.name}</strong><small>{files.master.rows} baris · belum disimpan</small><button className="text-button">Lihat preview</button></div>}
          <div className="table-wrap"><table><thead><tr><th>Upline ID</th><th>Nama KOL</th><th>Tier</th><th>PIC</th><th>Status</th><th /></tr></thead><tbody>{masterLoading ? <tr><td colSpan={6}>Memuat data staging…</td></tr> : visibleKols.length === 0 ? <tr><td colSpan={6}>Belum ada data KOL yang sesuai.</td></tr> : visibleKols.map((kol) => <tr key={kol.id}><td><strong className="upline">{kol.upline}</strong></td><td><div className="person"><span>{kol.name.slice(0, 2).toUpperCase()}</span><strong>{kol.name}</strong></div></td><td><span className={`tier tier-${kol.tier.toLowerCase().replaceAll(" ", "-")}`}>{kol.tier}</span></td><td>{kol.pic}</td><td><span className={`status status-${kol.status.toLowerCase()}`}>{kol.status}</span></td><td><button className="edit-button" onClick={() => { setEditingKol(kol); setShowForm(true); }}>Edit</button></td></tr>)}</tbody></table></div><div className="table-footer"><span>Menampilkan {visibleKols.length} dari {kols.length} KOL</span></div>
        </section>
        {showForm && <div className="modal-backdrop" onMouseDown={() => !masterSaving && setShowForm(false)}><form className="modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void saveKol(event.currentTarget); }}><div className="modal-heading"><div><p className="eyebrow">MASTER KOL</p><h2>{editingKol ? "Edit data KOL" : "Tambah KOL baru"}</h2><p>Perubahan akan langsung disimpan ke database staging.</p></div><button type="button" disabled={masterSaving} onClick={() => setShowForm(false)}>×</button></div><label>Upline ID<input name="upline" placeholder="Contoh: FA582386" defaultValue={editingKol?.upline} required /></label>{editingKol && <div className="id-warning">Perubahan Upline ID ikut tercatat dalam audit log.</div>}<label>Nama KOL<input name="name" placeholder="Nama lengkap atau nama channel" defaultValue={editingKol?.name} required /></label><div className="form-row"><label>Tier<select name="tier" defaultValue={editingKol?.tier === "Belum diatur" ? "" : editingKol?.tier ?? "Starter"}><option value="">Belum diatur</option><option>Starter</option><option>Growth</option><option>Champion</option></select></label><label>PIC<input name="pic" placeholder="Nama PIC" defaultValue={editingKol?.pic === "—" ? "" : editingKol?.pic} /></label></div><label>Status<select name="status" defaultValue={editingKol?.status ?? "Aktif"}><option>Aktif</option><option>Nonaktif</option></select></label><div className="modal-actions"><button type="button" className="secondary-button" disabled={masterSaving} onClick={() => setShowForm(false)}>Batal</button><button className="primary-button" disabled={masterSaving} type="submit">{masterSaving ? "Menyimpan…" : editingKol ? "Simpan perubahan" : "Tambah ke daftar"}</button></div></form></div>}
      </main>}
      {["queries", "history", "settings"].includes(page) && <main><Header title={nav.find((item) => item.id === page)?.label ?? "Segera hadir"} subtitle="Halaman ini disiapkan untuk fase pengembangan berikutnya." /><section className="coming-soon"><span>{nav.find((item) => item.id === page)?.code}</span><h2>Fondasinya sudah disiapkan.</h2><p>Kita akan mengaktifkan fungsi ini setelah alur Update Performa dan Master KOL disetujui.</p><button className="secondary-button" onClick={() => choosePage("home")}>Kembali ke beranda</button></section></main>}
    </div>
  </div>;
}
