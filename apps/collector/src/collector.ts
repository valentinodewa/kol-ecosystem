import { performanceIngestionRequestSchema, type PerformanceIngestionRow } from "@kol/contracts";
import type { CsvRecord } from "./csv.ts";

type RegistrationMetrics = {
  totalRegistered: number;
  totalActive: number;
};

type NmatMetrics = {
  totalNmat: number;
  totalAchieveTrx: number;
  totalAchieveRev: number;
};

function requiredColumn(record: CsvRecord, aliases: string[], rowNumber: number) {
  for (const alias of aliases) {
    if (record[alias] !== undefined) {
      return record[alias];
    }
  }
  throw new Error(`Kolom ${aliases.join("/")} tidak ditemukan pada baris ${rowNumber}`);
}

function parseMetric(value: string, name: string, rowNumber: number, allowNegative = false) {
  const normalized = value.trim().replace(/\s+/g, "");
  const number = Number(normalized);

  if (!Number.isFinite(number) || !Number.isInteger(number)) {
    throw new Error(`${name} pada baris ${rowNumber} harus berupa bilangan bulat: ${value}`);
  }
  if (!allowNegative && number < 0) {
    throw new Error(`${name} pada baris ${rowNumber} tidak boleh negatif`);
  }

  return number;
}

function normalizeUpline(value: string, rowNumber: number) {
  const upline = value.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,32}$/.test(upline)) {
    throw new Error(`Format upline pada baris ${rowNumber} tidak valid: ${value}`);
  }
  return upline;
}

function ensureUnique(map: Map<string, unknown>, upline: string, source: string) {
  if (map.has(upline)) {
    throw new Error(`Upline ${upline} muncul lebih dari sekali pada CSV ${source}`);
  }
}

export function mergePerformanceRows(
  registrationRecords: CsvRecord[],
  nmatRecords: CsvRecord[],
): PerformanceIngestionRow[] {
  const registrations = new Map<string, RegistrationMetrics>();
  const nmats = new Map<string, NmatMetrics>();

  registrationRecords.forEach((record, index) => {
    const rowNumber = index + 2;
    const upline = normalizeUpline(requiredColumn(record, ["upline"], rowNumber), rowNumber);
    ensureUnique(registrations, upline, "register/aktif");
    registrations.set(upline, {
      totalRegistered: parseMetric(
        requiredColumn(record, ["total_outlet_terdaftar", "total_registered"], rowNumber),
        "total_registered",
        rowNumber,
      ),
      totalActive: parseMetric(
        requiredColumn(record, ["total_outlet_aktif", "total_active"], rowNumber),
        "total_active",
        rowNumber,
      ),
    });
  });

  nmatRecords.forEach((record, index) => {
    const rowNumber = index + 2;
    const upline = normalizeUpline(requiredColumn(record, ["upline"], rowNumber), rowNumber);
    ensureUnique(nmats, upline, "NMAT");
    if (!registrations.has(upline)) {
      throw new Error(`Upline ${upline} ada pada CSV NMAT tetapi tidak ada pada CSV register/aktif`);
    }
    nmats.set(upline, {
      totalNmat: parseMetric(requiredColumn(record, ["total_nmat"], rowNumber), "total_nmat", rowNumber),
      totalAchieveTrx: parseMetric(
        requiredColumn(record, ["total_achieve_trx", "total_ach_trx"], rowNumber),
        "total_achieve_trx",
        rowNumber,
      ),
      totalAchieveRev: parseMetric(
        requiredColumn(record, ["total_achieve_rev", "total_ach_rev"], rowNumber),
        "total_achieve_rev",
        rowNumber,
        true,
      ),
    });
  });

  return [...registrations.entries()]
    .map(([uplineId, registration]) => {
      const nmat = nmats.get(uplineId) ?? {
        totalNmat: 0,
        totalAchieveTrx: 0,
        totalAchieveRev: 0,
      };
      return {
        uplineId,
        ...registration,
        ...nmat,
      };
    })
    .sort((left, right) => right.totalNmat - left.totalNmat || left.uplineId.localeCompare(right.uplineId));
}

export function buildPayload(input: {
  periodStart: string;
  periodEnd: string;
  extractedAt: string;
  queryVersion: string;
  rows: PerformanceIngestionRow[];
}) {
  return performanceIngestionRequestSchema.parse({
    syncRunId: crypto.randomUUID(),
    ...input,
  });
}
