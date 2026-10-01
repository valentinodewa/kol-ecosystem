import { Hono } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { timingSafeEqual } from "node:crypto";
import {
  healthResponseSchema,
  dailyPerformanceIngestionRequestSchema,
  dailyPerformanceListResponseSchema,
  dailyPerformanceQuerySchema,
  kolCreateRequestSchema,
  kolListResponseSchema,
  kolRecordSchema,
  kolUpdateRequestSchema,
  missionCreateRequestSchema,
  missionListResponseSchema,
  missionRecordSchema,
  performanceIngestionRequestSchema,
  performanceIngestionResponseSchema,
  performanceListResponseSchema,
  performanceQuerySchema,
  periodMonthSchema,
  rosterReplaceRequestSchema,
  rosterResponseSchema,
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

const adminCors = cors({
  origin: (origin) => ["http://localhost:4174", "http://127.0.0.1:4174"].includes(origin) ? origin : "",
  allowMethods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"],
  allowHeaders: ["Accept", "Authorization", "Content-Type"],
  maxAge: 86400,
});

app.use("/api/v1/admin/*", adminCors);
app.use("/api/v1/admin/*", async (context, next) => {
  const isAuthorized = await hasValidBearerToken(
    context.req.header("Authorization"),
    context.env.ADMIN_API_KEY,
  );
  if (!isAuthorized) {
    return context.json({ error: "unauthorized", message: "Kredensial admin tidak valid" }, 401);
  }
  return next();
});

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

type KolRow = {
  id: number; upline_id: string; name: string; status: "active" | "inactive";
  tier_code: string | null; joined_at: string | null; contact: string | null;
  pic_name: string | null; notes: string | null; created_at: string; updated_at: string;
};

type RosterDbRow = {
  kol_id: number; upline_id: string; kol_name: string; tier_code: string | null;
  pic_name: string | null; cooperation_status: "active" | "paused" | "ended";
};

type MissionDbRow = {
  id: string; name: string; description: string | null; tier_code: string;
  start_date: string; end_date: string; reward_description: string | null;
  status: "draft" | "active" | "completed" | "cancelled";
  participant_count: number; created_at: string; updated_at: string;
};

function mapKol(row: KolRow) {
  return {
    id: row.id, uplineId: row.upline_id, name: row.name, status: row.status,
    tierCode: row.tier_code, joinedAt: row.joined_at, contact: row.contact,
    picName: row.pic_name, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

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

app.get("/api/v1/admin/kols", async (context) => {
  const result = await context.env.DB.prepare(
    `SELECT id, upline_id, name, status, tier_code, joined_at, contact, pic_name, notes, created_at, updated_at
     FROM kols ORDER BY status ASC, name COLLATE NOCASE ASC`,
  ).all<KolRow>();
  return context.json(kolListResponseSchema.parse({ items: result.results.map(mapKol) }));
});

app.post("/api/v1/admin/kols", zValidator("json", kolCreateRequestSchema), async (context) => {
  const input = context.req.valid("json");
  const now = new Date().toISOString();
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `INSERT INTO kols (upline_id, name, status, tier_code, joined_at, contact, pic_name, notes, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      ).bind(input.uplineId, input.name, input.status, input.tierCode ?? null, input.joinedAt ?? null, input.contact ?? null, input.picName ?? null, input.notes ?? null, now),
      context.env.DB.prepare(
        `INSERT INTO audit_logs (action, entity_type, entity_id, after_json)
         VALUES ('create', 'kol', ?1, ?2)`,
      ).bind(input.uplineId, JSON.stringify(input)),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      return context.json({ error: "duplicate_upline", message: "Upline ID sudah terdaftar" }, 409);
    }
    throw error;
  }
  const row = await context.env.DB.prepare(
    `SELECT id, upline_id, name, status, tier_code, joined_at, contact, pic_name, notes, created_at, updated_at
     FROM kols WHERE upline_id = ?`,
  ).bind(input.uplineId).first<KolRow>();
  return context.json(kolRecordSchema.parse(mapKol(row!)), 201);
});

app.patch("/api/v1/admin/kols/:id", zValidator("json", kolUpdateRequestSchema), async (context) => {
  const id = Number(context.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return context.json({ error: "invalid_id", message: "ID KOL tidak valid" }, 400);
  const before = await context.env.DB.prepare(
    `SELECT id, upline_id, name, status, tier_code, joined_at, contact, pic_name, notes, created_at, updated_at FROM kols WHERE id = ?`,
  ).bind(id).first<KolRow>();
  if (!before) return context.json({ error: "not_found", message: "KOL tidak ditemukan" }, 404);
  const input = context.req.valid("json");
  const columnMap = { uplineId: "upline_id", name: "name", status: "status", tierCode: "tier_code", joinedAt: "joined_at", contact: "contact", picName: "pic_name", notes: "notes" } as const;
  const assignments: string[] = [];
  const values: unknown[] = [];
  for (const key of Object.keys(columnMap) as Array<keyof typeof columnMap>) {
    if (key in input) { assignments.push(`${columnMap[key]} = ?`); values.push(input[key] ?? null); }
  }
  assignments.push("updated_at = ?"); values.push(new Date().toISOString()); values.push(id);
  try {
    await context.env.DB.prepare(`UPDATE kols SET ${assignments.join(", ")} WHERE id = ?`).bind(...values).run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      return context.json({ error: "duplicate_upline", message: "Upline ID sudah digunakan KOL lain" }, 409);
    }
    throw error;
  }
  const after = await context.env.DB.prepare(
    `SELECT id, upline_id, name, status, tier_code, joined_at, contact, pic_name, notes, created_at, updated_at FROM kols WHERE id = ?`,
  ).bind(id).first<KolRow>();
  await context.env.DB.prepare(
    `INSERT INTO audit_logs (action, entity_type, entity_id, before_json, after_json) VALUES ('update', 'kol', ?1, ?2, ?3)`,
  ).bind(String(id), JSON.stringify(mapKol(before)), JSON.stringify(mapKol(after!))).run();
  return context.json(kolRecordSchema.parse(mapKol(after!)));
});

app.get("/api/v1/admin/rosters/:periodMonth", async (context) => {
  const parsedMonth = periodMonthSchema.safeParse(context.req.param("periodMonth"));
  if (!parsedMonth.success) return context.json({ error: "invalid_period", message: parsedMonth.error.issues[0]?.message }, 400);
  const period = await context.env.DB.prepare("SELECT id, status FROM collaboration_periods WHERE period_month = ?").bind(parsedMonth.data).first<{ id: number; status: "draft" | "active" | "closed" }>();
  if (!period) return context.json(rosterResponseSchema.parse({ periodMonth: parsedMonth.data, status: "draft", items: [] }));
  const result = await context.env.DB.prepare(
    `SELECT r.kol_id, k.upline_id, k.name AS kol_name, r.tier_code, r.pic_name, r.cooperation_status
     FROM kol_monthly_roster r INNER JOIN kols k ON k.id = r.kol_id
     WHERE r.collaboration_period_id = ? ORDER BY k.name COLLATE NOCASE ASC`,
  ).bind(period.id).all<RosterDbRow>();
  return context.json(rosterResponseSchema.parse({ periodMonth: parsedMonth.data, status: period.status, items: result.results.map((row) => ({ kolId: row.kol_id, uplineId: row.upline_id, kolName: row.kol_name, tierCode: row.tier_code, picName: row.pic_name, cooperationStatus: row.cooperation_status })) }));
});

app.put("/api/v1/admin/rosters/:periodMonth", zValidator("json", rosterReplaceRequestSchema), async (context) => {
  const parsedMonth = periodMonthSchema.safeParse(context.req.param("periodMonth"));
  if (!parsedMonth.success) return context.json({ error: "invalid_period", message: parsedMonth.error.issues[0]?.message }, 400);
  const input = context.req.valid("json");
  const uniqueUplines = [...new Set(input.rows.map((row) => row.uplineId))];
  if (uniqueUplines.length !== input.rows.length) return context.json({ error: "duplicate_upline", message: "Satu upline hanya boleh muncul sekali" }, 400);
  const placeholders = uniqueUplines.map(() => "?").join(",");
  const existing = uniqueUplines.length ? await context.env.DB.prepare(`SELECT upline_id FROM kols WHERE upline_id IN (${placeholders})`).bind(...uniqueUplines).all<{ upline_id: string }>() : { results: [] };
  const found = new Set(existing.results.map((row) => row.upline_id));
  const missing = uniqueUplines.filter((upline) => !found.has(upline));
  if (missing.length) return context.json({ error: "unknown_uplines", message: "Ada upline yang belum terdaftar di Master KOL", missingUplineIds: missing }, 422);
  const now = new Date().toISOString();
  await context.env.DB.prepare(
    `INSERT INTO collaboration_periods (period_month, status, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(period_month) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
  ).bind(parsedMonth.data, input.status, now).run();
  const period = await context.env.DB.prepare("SELECT id FROM collaboration_periods WHERE period_month = ?").bind(parsedMonth.data).first<{ id: number }>();
  const statements = [context.env.DB.prepare("DELETE FROM kol_monthly_roster WHERE collaboration_period_id = ?").bind(period!.id)];
  for (const row of input.rows) statements.push(context.env.DB.prepare(
    `INSERT INTO kol_monthly_roster (collaboration_period_id, kol_id, tier_code, pic_name, cooperation_status, updated_at)
     SELECT ?1, id, ?2, ?3, ?4, ?5 FROM kols WHERE upline_id = ?6`,
  ).bind(period!.id, row.tierCode ?? null, row.picName ?? null, row.cooperationStatus, now, row.uplineId));
  statements.push(context.env.DB.prepare(
    `INSERT INTO audit_logs (action, entity_type, entity_id, after_json) VALUES ('replace', 'monthly_roster', ?1, ?2)`,
  ).bind(parsedMonth.data, JSON.stringify({ status: input.status, rowCount: input.rows.length })));
  await context.env.DB.batch(statements);
  return context.json({ status: "accepted", periodMonth: parsedMonth.data, processedKols: input.rows.length });
});

app.get("/api/v1/admin/missions", async (context) => {
  const missions = await context.env.DB.prepare(
    `SELECT m.*, COUNT(mp.id) AS participant_count FROM missions m
     LEFT JOIN mission_participants mp ON mp.mission_id = m.id
     GROUP BY m.id ORDER BY m.start_date DESC, m.created_at DESC`,
  ).all<MissionDbRow>();
  const targets = await context.env.DB.prepare("SELECT mission_id, metric, target_value FROM mission_targets ORDER BY position, id").all<{ mission_id: string; metric: "registered" | "active" | "nmat" | "transactions" | "revenue"; target_value: number }>();
  const items = missions.results.map((row) => missionRecordSchema.parse({ id: row.id, name: row.name, description: row.description, tierCode: row.tier_code, startDate: row.start_date, endDate: row.end_date, rewardDescription: row.reward_description, status: row.status, participantCount: row.participant_count, createdAt: row.created_at, updatedAt: row.updated_at, targets: targets.results.filter((target) => target.mission_id === row.id).map((target) => ({ metric: target.metric, targetValue: target.target_value })) }));
  return context.json(missionListResponseSchema.parse({ items }));
});

app.post("/api/v1/admin/missions", zValidator("json", missionCreateRequestSchema), async (context) => {
  const input = context.req.valid("json");
  const id = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [context.env.DB.prepare(
    `INSERT INTO missions (id, name, description, tier_code, start_date, end_date, reward_description, status)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  ).bind(id, input.name, input.description ?? null, input.tierCode, input.startDate, input.endDate, input.rewardDescription ?? null, input.status)];
  input.targets.forEach((target, index) => statements.push(context.env.DB.prepare(
    "INSERT INTO mission_targets (mission_id, metric, target_value, position) VALUES (?1, ?2, ?3, ?4)",
  ).bind(id, target.metric, target.targetValue, index)));
  statements.push(context.env.DB.prepare(
    `INSERT INTO mission_participants (mission_id, kol_id, collaboration_period_id, tier_code_snapshot)
     SELECT ?1, r.kol_id, r.collaboration_period_id, r.tier_code
     FROM kol_monthly_roster r INNER JOIN collaboration_periods p ON p.id = r.collaboration_period_id
     WHERE p.period_month = ?2 AND r.tier_code = ?3 AND r.cooperation_status = 'active'`,
  ).bind(id, input.startDate.slice(0, 7), input.tierCode));
  await context.env.DB.batch(statements);
  const participant = await context.env.DB.prepare("SELECT COUNT(*) AS count FROM mission_participants WHERE mission_id = ?").bind(id).first<{ count: number }>();
  const now = new Date().toISOString();
  return context.json(missionRecordSchema.parse({ id, ...input, description: input.description ?? null, rewardDescription: input.rewardDescription ?? null, participantCount: participant?.count ?? 0, createdAt: now, updatedAt: now }), 201);
});

app.get("/api/v1/admin/performance/daily", zValidator("query", dailyPerformanceQuerySchema), async (context) => {
  const query = context.req.valid("query");
  const conditions = ["d.performance_date BETWEEN ?1 AND ?2"];
  const bindings: unknown[] = [query.periodStart, query.periodEnd];
  if (query.uplineId) { conditions.push("k.upline_id = ?3"); bindings.push(query.uplineId); }
  const result = await context.env.DB.prepare(
    `SELECT d.performance_date, k.upline_id, k.name AS kol_name, d.total_registered, d.total_active,
      d.total_nmat, d.total_achieve_trx, d.total_achieve_rev, d.synced_at
     FROM kol_daily_performance d INNER JOIN kols k ON k.id = d.kol_id
     WHERE ${conditions.join(" AND ")} ORDER BY d.performance_date ASC, d.total_nmat DESC, k.upline_id ASC`,
  ).bind(...bindings).all<{ performance_date: string; upline_id: string; kol_name: string; total_registered: number; total_active: number; total_nmat: number; total_achieve_trx: number; total_achieve_rev: number; synced_at: string }>();
  return context.json(dailyPerformanceListResponseSchema.parse({ periodStart: query.periodStart, periodEnd: query.periodEnd, uplineId: query.uplineId ?? null, items: result.results.map((row) => ({ performanceDate: row.performance_date, uplineId: row.upline_id, kolName: row.kol_name, totalRegistered: row.total_registered, totalActive: row.total_active, totalNmat: row.total_nmat, totalAchieveTrx: row.total_achieve_trx, totalAchieveRev: row.total_achieve_rev, syncedAt: row.synced_at })) }));
});

app.post(
  "/api/v1/ingestion/performance/daily",
  async (context, next) => {
    const isAuthorized = await hasValidBearerToken(context.req.header("Authorization"), context.env.INGESTION_API_KEY);
    if (!isAuthorized) return context.json({ error: "unauthorized", message: "Kredensial ingestion tidak valid" }, 401);
    return next();
  },
  zValidator("json", dailyPerformanceIngestionRequestSchema),
  async (context) => {
    const payload = context.req.valid("json");
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [context.env.DB.prepare(
      `INSERT INTO sync_runs (id, period_start, period_end, status, source, query_version, kol_count, row_count, started_at, completed_at)
       VALUES (?1, ?2, ?3, 'running', 'fastpay_daily_collector', ?4, ?5, ?6, ?7, NULL)
       ON CONFLICT(id) DO UPDATE SET status = 'running', row_count = excluded.row_count, started_at = excluded.started_at, completed_at = NULL, error_message = NULL`,
    ).bind(payload.syncRunId, payload.periodStart, payload.periodEnd, payload.queryVersion, new Set(payload.rows.map((row) => row.uplineId)).size, payload.rows.length, payload.extractedAt)];
    for (const row of payload.rows) {
      statements.push(
        context.env.DB.prepare(
          `INSERT INTO kols (upline_id, name, status, updated_at) VALUES (?1, ?1, 'active', ?2)
           ON CONFLICT(upline_id) DO UPDATE SET updated_at = excluded.updated_at`,
        ).bind(row.uplineId, now),
        context.env.DB.prepare(
          `INSERT INTO kol_daily_performance (kol_id, performance_date, sync_run_id, total_registered, total_active, total_nmat, total_achieve_trx, total_achieve_rev, synced_at)
           SELECT id, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 FROM kols WHERE upline_id = ?9
           ON CONFLICT(kol_id, performance_date) DO UPDATE SET sync_run_id = excluded.sync_run_id,
             total_registered = excluded.total_registered, total_active = excluded.total_active,
             total_nmat = excluded.total_nmat, total_achieve_trx = excluded.total_achieve_trx,
             total_achieve_rev = excluded.total_achieve_rev, synced_at = excluded.synced_at, updated_at = excluded.synced_at`,
        ).bind(row.performanceDate, payload.syncRunId, row.totalRegistered, row.totalActive, row.totalNmat, row.totalAchieveTrx, row.totalAchieveRev, payload.extractedAt, row.uplineId),
      );
    }
    statements.push(context.env.DB.prepare(
      "UPDATE sync_runs SET status = 'succeeded', completed_at = ?1 WHERE id = ?2",
    ).bind(now, payload.syncRunId));
    await context.env.DB.batch(statements);
    return context.json({ status: "accepted", syncRunId: payload.syncRunId, processedRows: payload.rows.length, periodStart: payload.periodStart, periodEnd: payload.periodEnd }, 202);
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
