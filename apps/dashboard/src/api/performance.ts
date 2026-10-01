import { performanceListResponseSchema } from "@kol/contracts";
const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
export async function fetchPerformance(periodStart: string, periodEnd: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ periodStart, periodEnd });
  const response = await fetch(`${base}/api/v1/performance?${query}`, { headers: { Accept: "application/json" }, signal });
  if (!response.ok) throw new Error(`API mengembalikan status ${response.status}. Pastikan API lokal sedang berjalan.`);
  return performanceListResponseSchema.parse(await response.json());
}
