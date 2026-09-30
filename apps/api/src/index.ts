import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  healthResponseSchema,
  performanceListResponseSchema,
  performanceQuerySchema,
} from "@kol/contracts";

const app = new Hono<{ Bindings: Env }>();

type PerformanceRow = {
  upline_id: string;
  kol_name: string;
  period_start: string;
  period_end: string;
  total_registered: number;
  total_active: number;
  total_nmat: number;
  total_achieve_trx: number;
  total_achieve_rev: number;
  synced_at: string;
};

app.get("/api/v1/health", (context) => {
  const payload = healthResponseSchema.parse({
    status: "ok",
    service: "kol-ecosystem-api",
    environment: context.env.APP_ENV,
    timestamp: new Date().toISOString(),
  });

  return context.json(payload);
});

app.get("/api/v1/db/health", async (context) => {
  const result = await context.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();

  return context.json({
    status: result?.ok === 1 ? "ok" : "error",
    database: "d1",
    environment: context.env.APP_ENV,
    timestamp: new Date().toISOString(),
  });
});

app.get(
  "/api/v1/performance",
  zValidator("query", performanceQuerySchema),
  async (context) => {
    const { periodStart, periodEnd } = context.req.valid("query");

    const result = await context.env.DB.prepare(
      `SELECT
        k.upline_id,
        k.name AS kol_name,
        p.period_start,
        p.period_end,
        s.total_registered,
        s.total_active,
        s.total_nmat,
        s.total_achieve_trx,
        s.total_achieve_rev,
        s.synced_at
      FROM kol_performance_snapshots s
      INNER JOIN kols k ON k.id = s.kol_id
      INNER JOIN performance_periods p ON p.id = s.period_id
      WHERE p.period_start = ? AND p.period_end = ?
      ORDER BY s.total_nmat DESC, k.upline_id ASC`,
    )
      .bind(periodStart, periodEnd)
      .all<PerformanceRow>();

    const payload = performanceListResponseSchema.parse({
      periodStart,
      periodEnd,
      items: result.results.map((row) => ({
        uplineId: row.upline_id,
        kolName: row.kol_name,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        totalRegistered: row.total_registered,
        totalActive: row.total_active,
        totalNmat: row.total_nmat,
        totalAchieveTrx: row.total_achieve_trx,
        totalAchieveRev: row.total_achieve_rev,
        syncedAt: row.synced_at,
      })),
    });

    return context.json(payload);
  },
);

app.notFound((context) =>
  context.json({ error: "not_found", message: "Endpoint tidak ditemukan" }, 404),
);

app.onError((error, context) => {
  console.error(JSON.stringify({ event: "unhandled_error", message: error.message }));
  return context.json({ error: "internal_error", message: "Terjadi kesalahan pada server" }, 500);
});

export default app;
