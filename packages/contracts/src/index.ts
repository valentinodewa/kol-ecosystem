import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  environment: z.string(),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus menggunakan format YYYY-MM-DD");

export const performanceQuerySchema = z.object({
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
}).refine((value) => value.periodEnd >= value.periodStart, {
  message: "periodEnd tidak boleh lebih awal dari periodStart",
  path: ["periodEnd"],
});

export const kolPerformanceSummarySchema = z.object({
  uplineId: z.string(),
  kolName: z.string(),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  totalRegistered: z.number().int().nonnegative(),
  totalActive: z.number().int().nonnegative(),
  totalNmat: z.number().int().nonnegative(),
  totalAchieveTrx: z.number().int().nonnegative(),
  totalAchieveRev: z.number(),
  syncedAt: z.iso.datetime(),
});

export const performanceListResponseSchema = z.object({
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  items: z.array(kolPerformanceSummarySchema),
});

export type PerformanceQuery = z.infer<typeof performanceQuerySchema>;
export type KolPerformanceSummary = z.infer<typeof kolPerformanceSummarySchema>;
export type PerformanceListResponse = z.infer<typeof performanceListResponseSchema>;

export const performanceIngestionRowSchema = z
  .object({
    uplineId: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/),
    kolName: z.string().trim().min(1).max(200).optional(),
    totalRegistered: z.number().int().nonnegative(),
    totalActive: z.number().int().nonnegative(),
    totalNmat: z.number().int().nonnegative(),
    totalAchieveTrx: z.number().int().nonnegative(),
    totalAchieveRev: z.number().finite(),
  })
  .refine((value) => value.totalNmat <= value.totalActive, {
    message: "totalNmat tidak boleh melebihi totalActive",
    path: ["totalNmat"],
  });

export const performanceIngestionRequestSchema = z
  .object({
    syncRunId: z.uuid(),
    periodStart: isoDateSchema,
    periodEnd: isoDateSchema,
    extractedAt: z.iso.datetime(),
    queryVersion: z.string().trim().min(1).max(64),
    rows: z.array(performanceIngestionRowSchema).min(1).max(100),
  })
  .refine((value) => value.periodEnd >= value.periodStart, {
    message: "periodEnd tidak boleh lebih awal dari periodStart",
    path: ["periodEnd"],
  });

export const performanceIngestionResponseSchema = z.object({
  status: z.literal("accepted"),
  syncRunId: z.uuid(),
  processedKols: z.number().int().nonnegative(),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
});

export type PerformanceIngestionRow = z.infer<typeof performanceIngestionRowSchema>;
export type PerformanceIngestionRequest = z.infer<typeof performanceIngestionRequestSchema>;
export type PerformanceIngestionResponse = z.infer<typeof performanceIngestionResponseSchema>;

export const uplineIdSchema = z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/);
export const tierCodeSchema = z.string().trim().min(1).max(64);
export const periodMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periode harus menggunakan format YYYY-MM");

export const kolRecordSchema = z.object({
  id: z.number().int().positive(),
  uplineId: uplineIdSchema,
  name: z.string(),
  status: z.enum(["active", "inactive"]),
  tierCode: z.string().nullable(),
  joinedAt: isoDateSchema.nullable(),
  contact: z.string().nullable(),
  picName: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const kolCreateRequestSchema = z.object({
  uplineId: uplineIdSchema,
  name: z.string().trim().min(1).max(200),
  status: z.enum(["active", "inactive"]).default("active"),
  tierCode: tierCodeSchema.nullable().optional(),
  joinedAt: isoDateSchema.nullable().optional(),
  contact: z.string().trim().max(200).nullable().optional(),
  picName: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const kolUpdateRequestSchema = kolCreateRequestSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "Minimal satu field harus diubah" },
);

export const kolImportRequestSchema = z.object({
  rows: z.array(kolCreateRequestSchema).min(1).max(100),
}).refine((value) => new Set(value.rows.map((row) => row.uplineId)).size === value.rows.length, {
  message: "Upline ID tidak boleh duplikat dalam satu file",
  path: ["rows"],
});

export const kolListResponseSchema = z.object({ items: z.array(kolRecordSchema) });

export const rosterRowSchema = z.object({
  uplineId: uplineIdSchema,
  tierCode: tierCodeSchema.nullable().optional(),
  picName: z.string().trim().max(120).nullable().optional(),
  cooperationStatus: z.enum(["active", "paused", "ended"]).default("active"),
});

export const rosterReplaceRequestSchema = z.object({
  status: z.enum(["draft", "active", "closed"]).default("draft"),
  rows: z.array(rosterRowSchema).max(500),
});

export const rosterItemSchema = rosterRowSchema.extend({
  kolId: z.number().int().positive(),
  kolName: z.string(),
});

export const rosterResponseSchema = z.object({
  periodMonth: periodMonthSchema,
  status: z.enum(["draft", "active", "closed"]),
  items: z.array(rosterItemSchema),
});

export const missionMetricSchema = z.enum(["registered", "active", "nmat", "transactions", "revenue"]);
export const missionTargetSchema = z.object({ metric: missionMetricSchema, targetValue: z.number().nonnegative() });
export const missionCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable().optional(),
  tierCode: tierCodeSchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  rewardDescription: z.string().trim().max(500).nullable().optional(),
  status: z.enum(["draft", "active", "completed", "cancelled"]).default("draft"),
  targets: z.array(missionTargetSchema).min(1).max(5),
}).refine((value) => value.endDate >= value.startDate, {
  message: "endDate tidak boleh lebih awal dari startDate",
  path: ["endDate"],
});
export const missionUpdateRequestSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  tierCode: tierCodeSchema.optional(),
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  rewardDescription: z.string().trim().max(500).nullable().optional(),
  status: z.enum(["draft", "active", "completed", "cancelled"]).optional(),
  targets: z.array(missionTargetSchema).min(1).max(5).optional(),
}).refine(
  (value) => Object.keys(value).length > 0,
  { message: "Minimal satu field mission harus diubah" },
);

export const missionRecordSchema = missionCreateRequestSchema.extend({
  id: z.uuid(),
  participantCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const missionListResponseSchema = z.object({ items: z.array(missionRecordSchema) });

export const dailyPerformanceQuerySchema = performanceQuerySchema.extend({
  uplineId: uplineIdSchema.optional(),
});

export const dailyPerformanceRowSchema = z.object({
  performanceDate: isoDateSchema,
  uplineId: uplineIdSchema,
  kolName: z.string(),
  totalRegistered: z.number().int().nonnegative(),
  totalActive: z.number().int().nonnegative(),
  totalNmat: z.number().int().nonnegative(),
  totalAchieveTrx: z.number().int().nonnegative(),
  totalAchieveRev: z.number(),
  totalActivationCommission: z.number(),
  totalActivationRevenue: z.number(),
  syncedAt: z.iso.datetime(),
});

export const dailyPerformanceListResponseSchema = z.object({
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  uplineId: uplineIdSchema.nullable(),
  items: z.array(dailyPerformanceRowSchema),
});

export const dailyPerformanceIngestionRowSchema = dailyPerformanceRowSchema.omit({ kolName: true, syncedAt: true, totalActivationCommission: true, totalActivationRevenue: true });
export const completeDailyPerformanceRowSchema = dailyPerformanceRowSchema.omit({ kolName: true, syncedAt: true });
export const completeDailyPerformanceImportRequestSchema = z.object({
  syncRunId: z.uuid(),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  extractedAt: z.iso.datetime(),
  rows: z.array(completeDailyPerformanceRowSchema).min(1).max(750),
}).refine((value) => value.periodEnd >= value.periodStart, {
  message: "periodEnd tidak boleh lebih awal dari periodStart", path: ["periodEnd"],
}).refine((value) => value.rows.every((row) => row.performanceDate >= value.periodStart && row.performanceDate <= value.periodEnd), {
  message: "Semua tanggal harus berada di dalam periode", path: ["rows"],
}).refine((value) => new Set(value.rows.map((row) => `${row.performanceDate}:${row.uplineId}`)).size === value.rows.length, {
  message: "Kombinasi tanggal dan upline tidak boleh duplikat", path: ["rows"],
});

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(200),
});
export const dailyPerformanceIngestionRequestSchema = z.object({
  syncRunId: z.uuid(),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  extractedAt: z.iso.datetime(),
  queryVersion: z.string().trim().min(1).max(64),
  rows: z.array(dailyPerformanceIngestionRowSchema).min(1).max(500),
}).refine((value) => value.periodEnd >= value.periodStart, {
  message: "periodEnd tidak boleh lebih awal dari periodStart",
  path: ["periodEnd"],
}).refine((value) => value.rows.every((row) => row.performanceDate >= value.periodStart && row.performanceDate <= value.periodEnd), {
  message: "Semua performanceDate harus berada di dalam periode",
  path: ["rows"],
}).refine((value) => new Set(value.rows.map((row) => `${row.performanceDate}:${row.uplineId}`)).size === value.rows.length, {
  message: "Kombinasi performanceDate dan uplineId tidak boleh duplikat",
  path: ["rows"],
});

export type KolRecord = z.infer<typeof kolRecordSchema>;
export type KolCreateRequest = z.infer<typeof kolCreateRequestSchema>;
export type KolUpdateRequest = z.infer<typeof kolUpdateRequestSchema>;
export type KolImportRequest = z.infer<typeof kolImportRequestSchema>;
export type RosterReplaceRequest = z.infer<typeof rosterReplaceRequestSchema>;
export type RosterResponse = z.infer<typeof rosterResponseSchema>;
export type MissionCreateRequest = z.infer<typeof missionCreateRequestSchema>;
export type MissionRecord = z.infer<typeof missionRecordSchema>;
export type DailyPerformanceIngestionRequest = z.infer<typeof dailyPerformanceIngestionRequestSchema>;
