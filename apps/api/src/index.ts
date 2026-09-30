import { Hono } from "hono";
import { healthResponseSchema } from "@kol/contracts";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/v1/health", (context) => {
  const payload = healthResponseSchema.parse({
    status: "ok",
    service: "kol-ecosystem-api",
    environment: context.env.APP_ENV,
    timestamp: new Date().toISOString(),
  });

  return context.json(payload);
});

app.notFound((context) =>
  context.json({ error: "not_found", message: "Endpoint tidak ditemukan" }, 404),
);

app.onError((error, context) => {
  console.error(JSON.stringify({ event: "unhandled_error", message: error.message }));
  return context.json({ error: "internal_error", message: "Terjadi kesalahan pada server" }, 500);
});

export default app;
