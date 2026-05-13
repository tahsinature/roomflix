// R2-specific S3Client factory. Cloudflare R2 speaks the S3 API with a
// fixed `auto` region and a per-account endpoint. Everything else is the
// same S3 surface — list / put / delete commands work unchanged.

// Must precede the SDK import so globalThis.Buffer is in place before any
// SigV4 signing code runs.
import "@/lib/buckets/polyfill";
import { S3Client } from "@aws-sdk/client-s3";
import type { Connection } from "@/lib/buckets/types";

export function r2Endpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export function createR2Client(conn: Connection): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: r2Endpoint(conn.accountId),
    credentials: {
      accessKeyId: conn.accessKeyId,
      secretAccessKey: conn.secretAccessKey,
    },
  });
}

// Recommended CORS document for a bucket the browser will talk to directly.
// Surfaced from CorsHint when a LIST fails with a CORS-shaped error so the
// user can copy-paste it into the R2 dashboard.
export function recommendedCorsForOrigin(origin: string): string {
  const doc = [
    {
      AllowedOrigins: [origin],
      AllowedMethods: ["GET", "PUT", "DELETE", "HEAD"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag", "Content-Length"],
      MaxAgeSeconds: 3000,
    },
  ];
  return JSON.stringify(doc, null, 2);
}
