import { Hono } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { timingSafeEqual } from "node:crypto";
import {
  healthResponseSchema,
  performanceIngestionRequestSchema,
  performanceIngestionResponseSchema,
  performanceListResponseSchema,
  performanceQuerySchema,
} from "@kol/contracts";

const app = new Hono<{ Bindings: Env }>();

const publicReadCors = cors({
  origin: "*",
  allowMethods: ["GET"],
  allowHeaders: ["Accept"],
  maxAge: 86400,
});

app.use("/api/v1/health", publicReadCors);
app.use("/api/v1/db/health", publicReadCors);
app.use("/api/v1/performance", publicReadCors);

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

const textEncoder = new TextEncoder();

async function hasValidBearerToken(authorization: string | undefined, expectedToken: string) {
  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const providedToken = authorization.slice("Bearer ".length);
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(providedToken)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(expectedToken)),
  ]);

  return timingSafeEqual(new Uint8Array(providedHash), new Uint8Array(expectedHash));
}

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

app.post(
  "/api/v1/ingestion/performance",
  async (context, next) => {
    const isAuthorized = await hasValidBearerToken(
      context.req.header("Authorization"),
      context.env.INGESTION_API_KEY,
    );

    if (!isAuthorized) {
      return context.json({ error: "unauthorized", message: "Kredensial ingestion tidak valid" }, 401);
    }

    return next();
  },
  zValidator("json", performanceIngestionRequestSchema),
  async (context) => {
    const payload = context.req.valid("json");
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [
      context.env.DB.prepare(
        `INSERT INTO performance_periods (period_start, period_end, label, status)
         VALUES (?1, ?2, ?3, 'open')
         ON CONFLICT(period_start, period_end) DO UPDATE SET label = excluded.label`,
      ).bind(payload.periodStart, payload.periodEnd, `${payload.periodStart} – ${payload.periodEnd}`),
      context.env.DB.prepare(
        `INSERT INTO sync_runs (
          id, period_start, period_end, status, source, query_version,
          kol_count, row_count, started_at, completed_at, error_message
        ) VALUES (?1, ?2, ?3, 'running', 'fastpay_collector', ?4, ?5, ?5, ?6, NULL, NULL)
        ON CONFLICT(id) DO UPDATE SET
          period_start = excluded.period_start,
          period_end = excluded.period_end,
          status = 'running',
          source = excluded.source,
          query_version = excluded.query_version,
          kol_count = excluded.kol_count,
          row_count = excluded.row_count,
          started_at = excluded.started_at,
          completed_at = NULL,
          error_message = NULL`,
      ).bind(
        payload.syncRunId,
        payload.periodStart,
        payload.periodEnd,
        payload.queryVersion,
        payload.rows.length,
        payload.extractedAt,
      ),
    ];

    for (const row of payload.rows) {
      statements.push(
        context.env.DB.prepare(
          `INSERT INTO kols (upline_id, name, status, updated_at)
           VALUES (?1, ?2, 'active', ?3)
           ON CONFLICT(upline_id) DO UPDATE SET updated_at = excluded.updated_at`,
        ).bind(row.uplineId, row.kolName ?? row.uplineId, now),
        context.env.DB.prepare(
          `INSERT INTO kol_performance_snapshots (
            kol_id, period_id, sync_run_id, total_registered, total_active,
            total_nmat, total_achieve_trx, total_achieve_rev, synced_at
          )
          SELECT k.id, p.id, ?1, ?2, ?3, ?4, ?5, ?6, ?7
          FROM kols k
          CROSS JOIN performance_periods p
          WHERE k.upline_id = ?8
            AND p.period_start = ?9
            AND p.period_end = ?10
          ON CONFLICT(kol_id, period_id) DO UPDATE SET
            sync_run_id = excluded.sync_run_id,
            total_registered = excluded.total_registered,
            total_active = excluded.total_active,
            total_nmat = excluded.total_nmat,
            total_achieve_trx = excluded.total_achieve_trx,
            total_achieve_rev = excluded.total_achieve_rev,
            synced_at = excluded.synced_at,
            updated_at = excluded.synced_at`,
        ).bind(
          payload.syncRunId,
          row.totalRegistered,
          row.totalActive,
          row.totalNmat,
          row.totalAchieveTrx,
          row.totalAchieveRev,
          payload.extractedAt,
          row.uplineId,
          payload.periodStart,
          payload.periodEnd,
        ),
      );
    }

    statements.push(
      context.env.DB.prepare(
        `UPDATE sync_runs
         SET status = 'succeeded', completed_at = ?1
         WHERE id = ?2`,
      ).bind(now, payload.syncRunId),
    );

    await context.env.DB.batch(statements);

    console.log(
      JSON.stringify({
        event: "performance_ingestion_succeeded",
        syncRunId: payload.syncRunId,
        periodStart: payload.periodStart,
        periodEnd: payload.periodEnd,
        processedKols: payload.rows.length,
      }),
    );

    const response = performanceIngestionResponseSchema.parse({
      status: "accepted",
      syncRunId: payload.syncRunId,
      processedKols: payload.rows.length,
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
    });

    return context.json(response, 202);
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
