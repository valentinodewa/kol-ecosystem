export type KolRecord = {
  id: number;
  uplineId: string;
  name: string;
  status: "active" | "inactive";
  tierCode: string | null;
  picName: string | null;
  contact?: string | null;
  notes?: string | null;
};

export type KolInput = {
  uplineId: string;
  name: string;
  status: "active" | "inactive";
  tierCode: string | null;
  picName: string | null;
  contact?: string | null;
  notes?: string | null;
};

export type DailyPerformanceRow = {
  performanceDate: string;
  uplineId: string;
  kolName: string;
  totalRegistered: number;
  totalActive: number;
  totalNmat: number;
  totalAchieveTrx: number;
  totalAchieveRev: number;
  totalActivationCommission: number;
  totalActivationRevenue: number;
  syncedAt: string;
};

const remoteApi = import.meta.env.VITE_API_URL || "https://kol-ecosystem-api-staging.inovalentino99tele.workers.dev";
const tokenKey = "kol-operator-token";

function sessionToken() { return sessionStorage.getItem(tokenKey); }

async function request<T>(path: string, init?: RequestInit, adminOnly = false): Promise<T> {
  const token = sessionToken();
  const endpoint = token ? `${remoteApi}/api/v1/${adminOnly ? "admin" : "operator"}${path}` : `/local-api${path}`;
  const response = await fetch(endpoint, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token && !adminOnly ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
  });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json().catch(() => null) as { message?: string } | null : null;
  if (!response.ok) {
    throw new Error(body?.message ?? `Permintaan gagal (${response.status})`);
  }
  if (body === null) throw new Error(`API mengembalikan respons tidak valid (${response.status})`);
  return body as T;
}

export const kolApi = {
  list: () => request<{ items: KolRecord[] }>("/kols"),
  create: (input: KolInput) => request<KolRecord>("/kols", { method: "POST", body: JSON.stringify(input) }, true),
  update: (id: number, input: KolInput) => request<KolRecord>(`/kols/${id}`, { method: "PATCH", body: JSON.stringify(input) }, true),
  import: (rows: KolInput[]) => request<{ status: string; processedKols: number }>("/kols/import", { method: "POST", body: JSON.stringify({ rows }) }, true),
};

export const performanceApi = {
  daily: (periodStart: string, periodEnd: string, uplineId?: string) => {
    const params = new URLSearchParams({ periodStart, periodEnd });
    if (uplineId) params.set("uplineId", uplineId);
    return request<{ periodStart: string; periodEnd: string; uplineId: string | null; items: DailyPerformanceRow[] }>(`/performance/daily?${params}`);
  },
  import: (payload: unknown) => request<{ status: string; syncRunId: string; processedRows: number }>("/performance/import", { method: "POST", body: JSON.stringify(payload) }),
};

export const authApi = {
  hasSession: () => Boolean(sessionToken()),
  login: async (username: string, password: string) => {
    const response = await fetch(`${remoteApi}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    const body = await response.json() as { token?: string; user?: { username: string; role: string }; message?: string };
    if (!response.ok || !body.token || !body.user) throw new Error(body.message ?? "Login gagal");
    sessionStorage.setItem(tokenKey, body.token); sessionStorage.setItem("kol-operator-user", body.user.username); sessionStorage.setItem("kol-operator-role", body.user.role); return body.user;
  },
  logout: () => { sessionStorage.removeItem(tokenKey); sessionStorage.removeItem("kol-operator-user"); sessionStorage.removeItem("kol-operator-role"); },
  username: () => sessionStorage.getItem("kol-operator-user"),
  role: () => sessionStorage.getItem("kol-operator-role"),
};
