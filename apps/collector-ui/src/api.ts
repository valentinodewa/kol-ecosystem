export type KolRecord = {
  id: number;
  uplineId: string;
  name: string;
  status: "active" | "inactive";
  tierCode: string | null;
  picName: string | null;
};

export type KolInput = {
  uplineId: string;
  name: string;
  status: "active" | "inactive";
  tierCode: string | null;
  picName: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/local-api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) {
    throw new Error(body?.message ?? `Permintaan gagal (${response.status})`);
  }
  return body as T;
}

export const kolApi = {
  list: () => request<{ items: KolRecord[] }>("/kols"),
  create: (input: KolInput) => request<KolRecord>("/kols", { method: "POST", body: JSON.stringify(input) }),
  update: (id: number, input: KolInput) => request<KolRecord>(`/kols/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
};
