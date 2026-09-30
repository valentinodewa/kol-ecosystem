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
