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
