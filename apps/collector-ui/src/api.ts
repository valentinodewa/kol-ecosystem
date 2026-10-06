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
export type MissionTarget = { metric: "registered" | "active" | "nmat" | "transactions" | "revenue"; targetValue: number };
export type MissionRecord = { id: string; name: string; description: string | null; tierCode: string; startDate: string; endDate: string; rewardDescription: string | null; status: "draft" | "active" | "completed" | "cancelled"; participantTarget: number; participantCount: number; budgetAmount: number; targets: MissionTarget[]; createdAt: string; updatedAt: string };
export type MissionInput = Omit<MissionRecord, "id" | "participantCount" | "createdAt" | "updatedAt">;
export type KolPortalProfile = { uplineId: string; name: string; tierCode: string | null; status: string; joinedAt: string | null; picName: string | null; mustChangePassword: boolean };
export type KolPortalMission = { id: string; name: string; description: string | null; tierCode: string; startDate: string; endDate: string; rewardDescription: string | null; status: "active"; targets: MissionTarget[] };
export type KolAccountRecord = { kolId: number; uplineId: string; kolName: string; tierCode: string | null; kolStatus: string; accountId: number | null; username: string | null; isActive: boolean; mustChangePassword: boolean; lastLoginAt: string | null; createdAt: string | null };
export type TemporaryCredential = { accountId: number; username: string; temporaryPassword: string; mustChangePassword: boolean };

const remoteApi = import.meta.env.VITE_API_URL ?? "https://kol-ecosystem-api-staging.inovalentino99tele.workers.dev";
const tokenKey = "kol-auth-token-v3";
const expiryKey = "kol-auth-expiry-v3";

function sessionToken() { return sessionStorage.getItem(tokenKey); }

async function request<T>(path: string, init?: RequestInit, adminOnly = false): Promise<T> {
  const token = sessionToken();
  const endpoint = token ? `${remoteApi}/api/v1/${adminOnly ? "admin" : "operator"}${path}` : `/local-api${path}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(endpoint, {
      ...init, cache: "no-store",
      headers: { "Accept": "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
    });
    const text = await response.text();
    let body: ({ message?: string } & T) | null = null;
    try { body = text ? JSON.parse(text) as ({ message?: string } & T) : null; } catch { body = null; }
    if (!response.ok) {
      if (response.status === 401 && token) authApi.logout();
      throw new Error(body?.message ?? `Permintaan gagal (${response.status})`);
    }
    if (body !== null) return body as T;
    if (attempt === 0) continue;
    throw new Error(`API mengembalikan respons tidak valid (${response.status})`);
  }
  throw new Error("API tidak dapat dihubungi");
}

export const kolApi = {
  list: () => request<{ items: KolRecord[] }>("/kols", undefined, true),
  create: (input: KolInput) => request<KolRecord>("/kols", { method: "POST", body: JSON.stringify(input) }, true),
  update: (id: number, input: KolInput) => request<KolRecord>(`/kols/${id}`, { method: "PATCH", body: JSON.stringify(input) }, true),
  import: (rows: KolInput[]) => request<{ status: string; processedKols: number }>("/kols/import", { method: "POST", body: JSON.stringify({ rows }) }, true),
  googleMaster: async () => {
    const token = sessionToken(); const response = await fetch(`${remoteApi}/api/v1/admin/google-master.csv`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) { const body = await response.json().catch(()=>null) as {message?:string}|null; throw new Error(body?.message ?? `Google Sheet gagal dibaca (${response.status})`); }
    return response.text();
  },
};

export const kolAccountApi = {
  list: () => request<{ items: KolAccountRecord[] }>("/kol-accounts", undefined, true),
  create: (kolId: number, username: string) => request<TemporaryCredential>("/kol-accounts", { method: "POST", body: JSON.stringify({ kolId, username }) }, true),
  resetPassword: (accountId: number) => request<TemporaryCredential>(`/kol-accounts/${accountId}/reset-password`, { method: "POST" }, true),
  setActive: (accountId: number, isActive: boolean) => request<{ accountId: number; isActive: boolean }>(`/kol-accounts/${accountId}/status`, { method: "PATCH", body: JSON.stringify({ isActive }) }, true),
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
  hasSession: () => {
    const valid = Boolean(sessionToken()) && Number(sessionStorage.getItem(expiryKey) ?? 0) > Date.now();
    if (!valid) { sessionStorage.removeItem(tokenKey); sessionStorage.removeItem(expiryKey); sessionStorage.removeItem("kol-operator-user"); sessionStorage.removeItem("kol-operator-role"); }
    return valid;
  },
  login: async (username: string, password: string) => {
    const response = await fetch(`${remoteApi}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    const body = await response.json() as { token?: string; user?: { username: string; role: string }; expiresIn?: number; message?: string };
    if (!response.ok || !body.token || !body.user) throw new Error(body.message ?? "Login gagal");
    sessionStorage.setItem(tokenKey, body.token); sessionStorage.setItem(expiryKey, String(Date.now() + (body.expiresIn ?? 43200) * 1000)); sessionStorage.setItem("kol-operator-user", body.user.username); sessionStorage.setItem("kol-operator-role", body.user.role); return body.user;
  },
  logout: async () => {
    const token = sessionToken();
    if (token) await fetch(`${remoteApi}/api/v1/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
    sessionStorage.removeItem(tokenKey); sessionStorage.removeItem(expiryKey); sessionStorage.removeItem("kol-auth-token-v2"); sessionStorage.removeItem("kol-operator-token"); sessionStorage.removeItem("kol-operator-user"); sessionStorage.removeItem("kol-operator-role");
  },
  username: () => sessionStorage.getItem("kol-operator-user"),
  role: () => sessionStorage.getItem("kol-operator-role"),
};

export const kolPortalApi = {
  profile: async (): Promise<KolPortalProfile> => {
    const token = sessionToken();
    const response = await fetch(`${remoteApi}/api/v1/kol/profile`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const body = await response.json().catch(() => null) as (Partial<KolPortalProfile> & { message?: string }) | null;
    if (!response.ok || !body?.uplineId || !body.name) throw new Error(body?.message ?? `Profil KOL gagal dimuat (${response.status})`);
    return body as KolPortalProfile;
  },
  missions: async (): Promise<{ tierCode: string | null; items: KolPortalMission[] }> => {
    const token = sessionToken();
    const response = await fetch(`${remoteApi}/api/v1/kol/missions`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const body = await response.json().catch(() => null) as { tierCode?: string | null; items?: KolPortalMission[]; message?: string } | null;
    if (!response.ok || !body || !Array.isArray(body.items)) throw new Error(body?.message ?? `Mission KOL gagal dimuat (${response.status})`);
    return { tierCode: body.tierCode ?? null, items: body.items };
  },
  performance: async (periodStart: string, periodEnd: string): Promise<{ periodStart: string; periodEnd: string; uplineId: string; items: DailyPerformanceRow[] }> => {
    const token = sessionToken();
    const params = new URLSearchParams({ periodStart, periodEnd });
    const response = await fetch(`${remoteApi}/api/v1/kol/performance?${params}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const body = await response.json().catch(() => null) as { periodStart?: string; periodEnd?: string; uplineId?: string; items?: DailyPerformanceRow[]; message?: string } | null;
    if (!response.ok || !body?.periodStart || !body.periodEnd || !body.uplineId || !Array.isArray(body.items)) throw new Error(body?.message ?? `Performa KOL gagal dimuat (${response.status})`);
    return body as { periodStart: string; periodEnd: string; uplineId: string; items: DailyPerformanceRow[] };
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    const token = sessionToken();
    const response = await fetch(`${remoteApi}/api/v1/kol/change-password`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ currentPassword, newPassword }) });
    const body = await response.json().catch(() => null) as { status?: string; reauthenticate?: boolean; message?: string } | null;
    if (!response.ok || body?.status !== "password_changed") throw new Error(body?.message ?? `Password gagal diubah (${response.status})`);
    return body;
  },
};

export const missionApi = {
  list: () => request<{ items: MissionRecord[] }>("/missions", undefined, true),
  create: (input: MissionInput) => request<MissionRecord>("/missions", { method: "POST", body: JSON.stringify(input) }, true),
  update: (id: string, input: Partial<MissionInput>) => request<MissionRecord>(`/missions/${id}`, { method: "PATCH", body: JSON.stringify(input) }, true),
};
