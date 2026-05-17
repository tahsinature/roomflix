/// <reference types="vite/client" />

// Project-specific Vite env vars. Baked in at build time, so each
// build target (local dev, Bun-served prod, GitHub Pages) carries a
// matched set. Empty / undefined falls back to relative URLs, which is
// the right default for same-origin deployments.
interface ImportMetaEnv {
  // Origin for API requests (e.g. "https://roomflix.tahsin.us").
  // Leave unset to use the page's own origin.
  readonly VITE_API_BASE?: string;
  // Origin for the WebSocket (e.g. "wss://roomflix.tahsin.us").
  // Leave unset to derive from the API origin (or page origin).
  readonly VITE_WS_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
