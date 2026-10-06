import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Dev-only proxy for the Jev API: the browser calls /api/jev/..., this server adds the key.
// The API does not allow browser-origin (CORS) requests, and a key in client code would be public.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const key = (env.VITE_JEV_API_KEY ?? "").trim().replace(/^["']|["']$/g, "");
  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api/jev": {
          target: "https://api.typesafe.ai",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/jev/, ""),
          headers: key ? { Authorization: `Bearer ${key}` } : {},
          configure: (proxy) => {
            const t = new WeakMap<object, number>();
            proxy.on("proxyReq", (_p, req) => t.set(req, Date.now()));
            proxy.on("proxyRes", (res, req) =>
              console.log(`[jev proxy] ${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - (t.get(req) ?? Date.now())} ms)`),
            );
            proxy.on("error", (err) => console.log(`[jev proxy] error: ${err.message}`));
          },
        },
      },
    },
    test: { include: ["src/**/*.test.ts", "extension/src/**/*.test.ts"] },
  };
});
