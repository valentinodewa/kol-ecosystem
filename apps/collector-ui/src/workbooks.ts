import * as XLSX from "xlsx";

export type ImportRow = {
  performanceDate: string; uplineId: string; totalRegistered: number; totalActive: number;
  totalNmat: number; totalAchieveTrx: number; totalAchieveRev: number;
  totalActivationCommission: number; totalActivationRevenue: number;
};

type PartialRow = Partial<Omit<ImportRow, "performanceDate" | "uplineId">> & { performanceDate: string; uplineId: string };

function isoDate(value: unknown) {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value); if (!parsed) throw new Error("Tanggal Excel tidak valid");
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  throw new Error(`Tanggal tidak valid: ${text || "kosong"}`);
}

function metric(value: unknown, label: string, integer = true) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replaceAll(".", "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) throw new Error(`${label} harus berupa angka non-negatif`);
  return parsed;
}

async function workbook(file: File) { return XLSX.read(await file.arrayBuffer(), { cellDates: false }); }
function matrix(book: XLSX.WorkBook, sheet: string) { const source = book.Sheets[sheet]; if (!source) throw new Error(`Sheet ${sheet} tidak ditemukan`); return XLSX.utils.sheet_to_json<unknown[]>(source, { header: 1, raw: true, defval: null }); }
function headerMap(rows: unknown[][]) { return new Map((rows[0] ?? []).map((cell, index) => [String(cell ?? "").trim().toLowerCase(), index])); }
function cell(row: unknown[], headers: Map<string, number>, name: string) { const index = headers.get(name); if (index === undefined) throw new Error(`Kolom ${name} tidak ditemukan`); return row[index]; }
function upline(value: unknown) { const id = String(value ?? "").trim().toUpperCase(); if (!/^[A-Z]{2}[A-Z0-9]+$/.test(id)) throw new Error(`Upline tidak valid: ${id || "kosong"}`); return id; }

export async function parseRegistrationWorkbook(file: File): Promise<PartialRow[]> {
  const book = await workbook(file); const result = new Map<string, PartialRow>();
  for (const [sheet, field, column] of [["Registrasi", "totalRegistered", "total_outlet_terdaftar"], ["Aktivasi", "totalActive", "total_outlet_aktif"]] as const) {
    if (!book.SheetNames.includes(sheet)) throw new Error(`Sheet ${sheet} tidak ditemukan`);
    const rows = matrix(book, sheet); const headers = headerMap(rows);
    rows.slice(1).forEach((row, index) => {
      if (!row.some((value) => value !== null && value !== "")) return;
      try {
        const performanceDate = isoDate(cell(row, headers, "tanggal")); const uplineId = upline(cell(row, headers, "upline")); const key = `${performanceDate}:${uplineId}`;
        const current = result.get(key) ?? { performanceDate, uplineId };
        if (current[field] !== undefined) throw new Error("tanggal dan upline duplikat");
        current[field] = metric(cell(row, headers, column), column); result.set(key, current);
      } catch (error) { throw new Error(`${sheet} baris ${index + 2}: ${error instanceof Error ? error.message : "data tidak valid"}`); }
    });
  }
  return [...result.values()];
}

export async function parseNmatWorkbook(file: File, yearMonth: string): Promise<PartialRow[]> {
  const book = await workbook(file); const result: PartialRow[] = [];
  for (const sheet of book.SheetNames) {
    const day = Number(sheet.match(/^\s*(\d{1,2})/)?.[1]); if (!day) continue;
    const performanceDate = `${yearMonth}-${String(day).padStart(2, "0")}`; const rows = matrix(book, sheet); const headers = headerMap(rows);
    rows.slice(1).forEach((row, index) => {
      if (!row.some((value) => value !== null && value !== "")) return;
      try { result.push({ performanceDate, uplineId: upline(cell(row, headers, "upline")), totalNmat: metric(cell(row, headers, "total_nmat"), "total_nmat"), totalAchieveTrx: metric(cell(row, headers, "total_ach_trx"), "total_ach_trx"), totalAchieveRev: metric(cell(row, headers, "total_ach_rev"), "total_ach_rev", false) }); }
      catch (error) { throw new Error(`${sheet} baris ${index + 2}: ${error instanceof Error ? error.message : "data tidak valid"}`); }
    });
  }
  if (!result.length) throw new Error("Tidak ada sheet harian NMAT yang terbaca"); return result;
}

export async function parseFinancialWorkbook(file: File): Promise<PartialRow[]> {
  const book = await workbook(file); const sheet = book.SheetNames[0]; if (!sheet) throw new Error("Workbook kosong");
  const rows = matrix(book, sheet); const headers = headerMap(rows); const result: PartialRow[] = [];
  rows.slice(1).forEach((row) => {
    if (!row.some((value) => value !== null && value !== "")) return;
    try { result.push({ performanceDate: isoDate(cell(row, headers, "tanggal")), uplineId: upline(cell(row, headers, "upline")), totalActivationCommission: metric(cell(row, headers, "komisi_aktifasi"), "komisi_aktifasi", false), totalActivationRevenue: metric(cell(row, headers, "revenue"), "revenue", false) }); } catch { /* footer/non-data rows diabaikan */ }
  });
  if (!result.length) throw new Error("Tidak ada data komisi/revenue yang terbaca"); return result;
}

export function mergeWorkbooks(groups: PartialRow[][], start: string, end: string): ImportRow[] {
  const merged = new Map<string, ImportRow>();
  for (const group of groups) for (const partial of group) {
    if (partial.performanceDate < start || partial.performanceDate > end) throw new Error(`Tanggal ${partial.performanceDate} berada di luar periode`);
    const key = `${partial.performanceDate}:${partial.uplineId}`;
    const current = merged.get(key) ?? { performanceDate: partial.performanceDate, uplineId: partial.uplineId, totalRegistered: 0, totalActive: 0, totalNmat: 0, totalAchieveTrx: 0, totalAchieveRev: 0, totalActivationCommission: 0, totalActivationRevenue: 0 };
    Object.assign(current, partial); merged.set(key, current);
  }
  return [...merged.values()].sort((a, b) => a.performanceDate.localeCompare(b.performanceDate) || a.uplineId.localeCompare(b.uplineId));
}
