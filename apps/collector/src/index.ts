import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildPayload, mergePerformanceRows } from "./collector.ts";
import { parseCsv } from "./csv.ts";

type Options = {
  periodStart: string;
  periodEnd: string;
  registrationCsv: string;
  nmatCsv: string;
  apiUrl: string;
  queryVersion: string;
  dryRun: boolean;
};

function readArgument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireArgument(name: string) {
  const value = readArgument(name);
  if (!value || value.startsWith("--")) {
    throw new Error(`Argumen wajib belum diisi: ${name}`);
  }
  return value;
}

function parseOptions(): Options {
  return {
    periodStart: requireArgument("--period-start"),
    periodEnd: requireArgument("--period-end"),
    registrationCsv: requireArgument("--registration-csv"),
    nmatCsv: requireArgument("--nmat-csv"),
    apiUrl:
      readArgument("--api-url") ??
      process.env.COLLECTOR_API_URL ??
      "http://localhost:8787/api/v1/ingestion/performance",
    queryVersion: readArgument("--query-version") ?? "fastpay-manual-export-v1",
    dryRun: process.argv.includes("--dry-run"),
  };
}

async function loadCsv(path: string) {
  const candidates = [resolve(process.cwd(), path), resolve(process.cwd(), "../..", path)];

  for (const candidate of candidates) {
    try {
      return parseCsv(await readFile(candidate, "utf8"));
    } catch (error: unknown) {
      const isMissing =
        error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
      if (!isMissing) {
        throw error;
      }
    }
  }

  throw new Error(`File CSV tidak ditemukan: ${path}`);
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function sendPayload(apiUrl: string, apiKey: string, payload: ReturnType<typeof buildPayload>) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`API menolak batch (${response.status}): ${responseText}`);
  }

  return JSON.parse(responseText) as unknown;
}

async function main() {
  const options = parseOptions();
  const [registrationRecords, nmatRecords] = await Promise.all([
    loadCsv(options.registrationCsv),
    loadCsv(options.nmatCsv),
  ]);
  const rows = mergePerformanceRows(registrationRecords, nmatRecords);
  const extractedAt = new Date().toISOString();
  const payloads = chunks(rows, 100).map((batch) =>
    buildPayload({
      periodStart: options.periodStart,
      periodEnd: options.periodEnd,
      extractedAt,
      queryVersion: options.queryVersion,
      rows: batch,
    }),
  );

  if (options.dryRun) {
    console.log(JSON.stringify({ mode: "dry-run", totalKols: rows.length, payloads }, null, 2));
    return;
  }

  const apiKey = process.env.INGESTION_API_KEY;
  if (!apiKey) {
    throw new Error("Environment variable INGESTION_API_KEY belum diisi");
  }

  const responses = [];
  for (const payload of payloads) {
    responses.push(await sendPayload(options.apiUrl, apiKey, payload));
  }

  console.log(
    JSON.stringify(
      { mode: "upload", totalKols: rows.length, batchCount: payloads.length, responses },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ status: "failed", message }));
  process.exitCode = 1;
});
