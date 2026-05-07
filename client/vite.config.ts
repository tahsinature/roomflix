import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

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
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
      },
      "/api": {
        target: "http://localhost:3000",
      },
    },
  },
});
