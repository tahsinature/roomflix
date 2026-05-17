import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync } from "node:fs";
import path from "node:path";

// Where the dev server proxies /api. Defaults to the local Bun server;
// in compose the dev profile sets this to point at the server-dev
// container. WebSocket bypasses the proxy entirely (see useSessionSync).
const API_TARGET = process.env.API_TARGET || "http://localhost:3000";

// The path prefix the built site is served from. For GitHub Pages
// project pages (https://<user>.github.io/roomflix/) this must be
// `/roomflix/`. For custom-domain Pages or same-origin Bun serving
// it's `/`. Override per build via PAGES_BASE (the Pages CI sets it
// to `/roomflix/`; local dev / Bun-served builds stay at `/`).
const BASE = process.env.PAGES_BASE || "/";

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    // After build, copy index.html → 404.html so GH Pages serves the
    // SPA shell on any unknown deep-link path. Pages returns 404.html
    // for not-found routes; our React Router then takes over and
    // hydrates the right page.
    {
      name: "spa-fallback-404",
      apply: "build",
      closeBundle() {
        const dist = path.resolve(__dirname, "dist");
        try {
          copyFileSync(path.join(dist, "index.html"), path.join(dist, "404.html"));
        } catch {
          // best-effort — if index.html isn't there for any reason,
          // the build itself has bigger problems and we don't want
          // to mask them with a confusing copy error.
        }
      },
    },
  ],
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
