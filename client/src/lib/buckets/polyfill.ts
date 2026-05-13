// AWS SDK v3 SigV4 signer reaches for Node's Buffer when hashing the secret
// access key. Vite doesn't polyfill Node globals, so we stub it on globalThis
// here. Imported once at the top of providers/r2.ts so the polyfill ships
// inside the lazy-loaded Storage chunk, not the main bundle.
import { Buffer } from "buffer";

const g = globalThis as { Buffer?: unknown };
if (typeof g.Buffer === "undefined") {
  g.Buffer = Buffer;
}
