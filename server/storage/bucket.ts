// Server-side bucket access — used by synced collections to enumerate
// the source folder live on read. The CLIENT also talks to R2 directly
// (uploads, browse, deletes); this is a separate, server-side path for
// things only the server can do — namely: list a folder on behalf of a
// space member who may not own the storage connection.
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

export type BucketEntry = { key: string; size: number; lastModified?: Date };

// R2 endpoint shape — mirrors client/src/lib/buckets/providers/r2.ts so
// the two layers always sign against the same host.
export function r2Endpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export function makeBucketClient(creds: { accountId: string; accessKeyId: string; secretAccessKey: string }): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: r2Endpoint(creds.accountId),
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
  });
}

const MAX_PAGES = 50;

// Paginated full scan of a single folder prefix. Skips the prefix marker
// itself and any "folder placeholder" keys ending in "/". Capped at 50
// pages × 1000 keys to bound any single request.
export async function listFolder(client: S3Client, bucket: string, prefix: string): Promise<BucketEntry[]> {
  const out: BucketEntry[] = [];
  let token: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of res.Contents ?? []) {
      if (typeof o.Key !== "string" || o.Key === prefix || o.Key.endsWith("/")) continue;
      out.push({ key: o.Key, size: o.Size ?? 0, lastModified: o.LastModified });
    }
    if (!res.IsTruncated || !res.NextContinuationToken) return out;
    token = res.NextContinuationToken;
  }
  return out;
}

// Build the public CDN URL for a given key. Mirrors client logic so the
// items a synced collection produces are byte-identical to the ones the
// client would emit if it built them.
export function publicUrlForKey(base: string, key: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${b}/${key}`;
}

// Media extension allow-list. Includes images, video, and audio — same
// surface a collection can hold. Kept in sync with client/lib/utils.
const MEDIA_EXTS = /\.(mp4|webm|ogv|ogg|mkv|mov|m4v|avi|mpeg|mpg|3gp|mp3|m4a|aac|flac|wav|opus|oga|weba|jpg|jpeg|png|gif|webp|avif|heic|heif|bmp|tif|tiff)(\?|$)/i;

export function isMediaKey(key: string): boolean {
  return MEDIA_EXTS.test(key);
}
