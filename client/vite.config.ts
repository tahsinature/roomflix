import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Where the dev server proxies /api. Defaults to the local Bun server;
// in compose the dev profile sets this to point at the server-dev
// container. WebSocket bypasses the proxy entirely (see useSessionSync).
const API_TARGET = process.env.API_TARGET || "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../server"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Only /api needs proxying. WebSocket bypasses Vite entirely —
      // the client connects directly to the Bun server on :3000 (see
      // useSessionSync). Vite's WS proxy was unreliable in dev and we
      // don't need it.
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
});
