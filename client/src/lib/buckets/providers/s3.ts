// AWS S3 client factory. Unlike R2, AWS derives its endpoint from the
// bucket region, so no custom endpoint is necessary.

// Must precede the SDK import so globalThis.Buffer is available to the
// SigV4 signer in browsers.
import "@/lib/buckets/polyfill";
import { S3Client } from "@aws-sdk/client-s3";
import type { S3Connection } from "@/lib/buckets/types";

export function createS3Client(conn: S3Connection): S3Client {
  return new S3Client({
    region: conn.region,
    credentials: {
      accessKeyId: conn.accessKeyId,
      secretAccessKey: conn.secretAccessKey,
    },
  });
}
