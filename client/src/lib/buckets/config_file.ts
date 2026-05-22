// Import/export of the connection as a JSON file. The file *is* the user's
// "backend" — keeping it means they can restore the connection on any device.
// Because it contains the secret access key in plaintext, the UI calls this
// out loudly on export.
import type { ConfigFileV1, Connection } from "@/lib/buckets/types";

export function toConfigFile(conn: Connection): ConfigFileV1 {
  return {
    version: 1,
    kind: "roomflix-storage-connection",
    ...conn,
  };
}

export function configFilename(conn: Connection): string {
  const safeBucket = conn.bucket.replace(/[^a-z0-9-_]/gi, "_") || "bucket";
  return `roomflix-${conn.provider}-${safeBucket}.json`;
}

export type ParsedConfig = { ok: true; connection: Connection } | { ok: false; reason: string };

export async function parseConfigFile(file: File): Promise<ParsedConfig> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, reason: "Couldn't read the file." };
  }
  return parseConfigText(text);
}

export function parseConfigText(text: string): ParsedConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "File isn't valid JSON." };
  }
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "File doesn't contain a JSON object." };
  }
  const r = raw as Record<string, unknown>;
  if (r.kind !== "roomflix-storage-connection") {
    return { ok: false, reason: "Not a Roomflix storage config (wrong kind)." };
  }
  if (r.version !== 1) {
    return { ok: false, reason: `Unsupported config version: ${String(r.version)}.` };
  }
  if (r.provider !== "r2") {
    return { ok: false, reason: `Unsupported provider: ${String(r.provider)}.` };
  }
  const required = ["accountId", "accessKeyId", "secretAccessKey", "bucket"] as const;
  for (const k of required) {
    if (typeof r[k] !== "string" || !(r[k] as string).trim()) {
      return { ok: false, reason: `Missing or empty field: ${k}.` };
    }
  }
  if (typeof r.maxBytes !== "number" || !Number.isFinite(r.maxBytes) || r.maxBytes <= 0) {
    return { ok: false, reason: "Missing or invalid maxBytes." };
  }

  const conn: Connection = {
    provider: "r2",
    accountId: (r.accountId as string).trim(),
    accessKeyId: (r.accessKeyId as string).trim(),
    secretAccessKey: (r.secretAccessKey as string).trim(),
    bucket: (r.bucket as string).trim(),
    publicBaseUrl: typeof r.publicBaseUrl === "string" ? r.publicBaseUrl.trim() || undefined : undefined,
    maxBytes: r.maxBytes,
    label: typeof r.label === "string" ? r.label.trim() || undefined : undefined,
  };
  return { ok: true, connection: conn };
}
