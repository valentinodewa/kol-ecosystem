import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiUrl = env.COLLECTOR_API_URL ?? "https://kol-ecosystem-api-staging.inovalentino99tele.workers.dev";

  return {
    plugins: [react()],
    server: {
      port: 4174,
      proxy: {
        "/local-api": {
          target: apiUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/local-api/, "/api/v1/admin"),
          headers: env.ADMIN_API_KEY
            ? { Authorization: `Bearer ${env.ADMIN_API_KEY}` }
            : undefined,
        },
      },
    },
  };
});
