// Thin wrapper around the S3 SDK so the UI never imports SDK commands
// directly. Covers browse + usage + upload + delete + create-folder.
import { CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { createR2Client } from "@/lib/buckets/providers/r2";
import { createS3Client } from "@/lib/buckets/providers/s3";
import type { BrowseResult, Connection, FileEntry, Usage } from "@/lib/buckets/types";

export function buildClient(conn: Connection): S3Client {
  switch (conn.provider) {
    case "r2":
      return createR2Client(conn);
    case "s3":
      return createS3Client(conn);
  }
}

// Single LIST at a given prefix using "/" as a delimiter — gives us folders
// and files split apart, which is what the file browser renders.
export async function browse(client: S3Client, bucket: string, prefix: string): Promise<BrowseResult> {
  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      Delimiter: "/",
    }),
  );

  const folders = (res.CommonPrefixes ?? []).map((cp) => cp.Prefix).filter((p): p is string => typeof p === "string");

  const files = (res.Contents ?? [])
    // S3 returns the prefix itself as a 0-byte "folder marker" object; hide it
    // from the file list so users don't see a duplicate of their own folder.
    .filter((o) => typeof o.Key === "string" && o.Key !== prefix)
    .map((o) => ({
      key: o.Key as string,
      size: o.Size ?? 0,
      lastModified: o.LastModified,
      etag: o.ETag,
    }));

  return {
    prefix,
    folders: folders.map((p) => ({ prefix: p })),
    files,
    truncated: Boolean(res.IsTruncated),
  };
}

// Full-bucket scan to compute total bytes used. Paginates without a
// delimiter so every object is counted. Called once on connect; updated
// locally after upload/delete (phase 2) to avoid re-listing every time.
export async function computeUsage(client: S3Client, bucket: string): Promise<Usage> {
  let bytes = 0;
  let objects = 0;
  let token: string | undefined;

  // Hard guard so a runaway pagination loop on a misbehaving endpoint can't
  // pin the tab. 100 pages × 1000 keys = 100k objects — plenty for video buckets.
  const MAX_PAGES = 100;
  for (let i = 0; i < MAX_PAGES; i++) {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: token,
      }),
    );
    for (const o of res.Contents ?? []) {
      bytes += o.Size ?? 0;
      objects += 1;
    }
    if (!res.IsTruncated || !res.NextContinuationToken) {
      return { bytes, objects };
    }
    token = res.NextContinuationToken;
  }
  // Hit the page cap — return what we counted; the UI can flag "approximate".
  return { bytes, objects };
}

// Single-shot PUT. The SDK signs the full payload up front (SHA-256 over the
// whole body), and in the browser its stream-handling path can fail with
// "readableStream.getReader is not a function" when passed a File/Blob
// directly. Buffering the file into a Uint8Array first sidesteps the issue —
// the SDK hashes and PUTs the bytes without trying to stream them.
//
// Memory cost: the entire file lives in RAM during the upload. Fine for the
// hundreds-of-MB range; multi-GB uploads would need multipart (which uses
// POST and is a separate CORS conversation).
export async function uploadFile(client: S3Client, bucket: string, key: string, file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: file.type || undefined,
      ContentLength: bytes.byteLength,
    }),
  );
}

export async function deleteFile(client: S3Client, bucket: string, key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

// S3 has no rename and no real folders — a zero-byte object with a trailing
// "/" acts as the marker that makes the prefix appear in CommonPrefixes.
export async function createFolder(client: S3Client, bucket: string, prefix: string): Promise<void> {
  const key = prefix.endsWith("/") ? prefix : prefix + "/";
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: new Uint8Array(),
    }),
  );
}

// Walk a prefix to enumerate every object underneath. Used before a folder
// delete so the UI can warn ("this will remove N items totalling X").
export async function listAllUnderPrefix(client: S3Client, bucket: string, prefix: string): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  let token: string | undefined;
  const MAX_PAGES = 100;
  for (let i = 0; i < MAX_PAGES; i++) {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const o of res.Contents ?? []) {
      if (typeof o.Key !== "string") continue;
      out.push({ key: o.Key, size: o.Size ?? 0, lastModified: o.LastModified, etag: o.ETag });
    }
    if (!res.IsTruncated || !res.NextContinuationToken) return out;
    token = res.NextContinuationToken;
  }
  return out;
}

// S3 has no rename — emulate by copy-then-delete. The copy is server-side
// within the bucket so the bytes never traverse the browser; fast even for
// multi-GB videos. CopySource is the bucket + URL-encoded key per AWS spec.
export async function renameObject(client: S3Client, bucket: string, oldKey: string, newKey: string): Promise<void> {
  if (oldKey === newKey) return;
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: newKey,
      CopySource: `/${bucket}/${encodeURIComponent(oldKey).replace(/%2F/g, "/")}`,
    }),
  );
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: oldKey }));
}

// Folder rename: enumerate every object under the prefix, copy each to the
// new prefix, then delete the originals. Caller passes prefixes WITH trailing
// "/" (the folder-marker convention used elsewhere in this module).
export async function renamePrefix(client: S3Client, bucket: string, oldPrefix: string, newPrefix: string): Promise<{ oldKeys: string[]; newKeys: string[] }> {
  if (oldPrefix === newPrefix) return { oldKeys: [], newKeys: [] };
  const items = await listAllUnderPrefix(client, bucket, oldPrefix);
  const oldKeys = items.map((it) => it.key);
  const newKeys = oldKeys.map((k) => newPrefix + k.slice(oldPrefix.length));

  // Copies first, in chunked parallel — bounded so we don't drown the
  // connection pool on huge folders.
  const CHUNK = 20;
  for (let i = 0; i < oldKeys.length; i += CHUNK) {
    const slice = oldKeys.slice(i, i + CHUNK);
    await Promise.all(
      slice.map((src, j) =>
        client.send(
          new CopyObjectCommand({
            Bucket: bucket,
            Key: newKeys[i + j],
            CopySource: `/${bucket}/${encodeURIComponent(src).replace(/%2F/g, "/")}`,
          }),
        ),
      ),
    );
  }
  // Then delete originals.
  await deleteMany(client, bucket, oldKeys);
  return { oldKeys, newKeys };
}

// Parallel single DELETEs in modest chunks. The S3 bulk endpoint
// (POST /?delete=) is more efficient but uses POST, which would require
// users to expand their bucket CORS rules to include a method they didn't
// otherwise need. Single DELETEs reuse the existing CORS surface; chunks
// of 20 keep the connection pool happy on big folder deletes.
export async function deleteMany(client: S3Client, bucket: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const CHUNK = 20;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const slice = keys.slice(i, i + CHUNK);
    await Promise.all(slice.map((Key) => client.send(new DeleteObjectCommand({ Bucket: bucket, Key }))));
  }
}

// Heuristic: SDK errors from CORS rejection in the browser are network-shaped
// (TypeError "Failed to fetch", or a Cors error from the runtime). The SDK
// doesn't classify them, so we sniff the message — good enough to gate the hint.
export function looksLikeCorsError(err: unknown): boolean {
  if (!err) return false;
  const msg = String((err as Error)?.message ?? err).toLowerCase();
  return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("cors") || msg.includes("network error");
}

// Classifies an upload failure so the queue can (a) decide whether to
// auto-retry, and (b) show the user a useful one-word reason instead of
// the raw SDK message.
//
//   network → transient (Wi-Fi blip, fetch abort, CORS preflight). Worth
//             auto-retrying with backoff.
//   config  → bucket policy / IAM / signature. Won't get better by
//             retrying; the user has to fix something.
//   size    → bucket cap or 413. Same as config — terminal.
//   unknown → fall-through. Don't auto-retry (could be anything), but
//             expose the raw message so the user can copy it.
export type UploadErrorKind = "network" | "config" | "size" | "unknown";

export function classifyUploadError(err: unknown): { kind: UploadErrorKind; label: string } {
  if (!err) return { kind: "unknown", label: "Upload failed" };
  const e = err as {
    name?: string;
    message?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const msg = String(e.message ?? err);
  const code = e.Code ?? "";
  const status = e.$metadata?.httpStatusCode;

  if (e.name === "TypeError" || /failed to fetch|network|cors/i.test(msg)) {
    return { kind: "network", label: "Network error — connection dropped" };
  }
  if (code === "AccessDenied" || code === "InvalidAccessKeyId" || code === "SignatureDoesNotMatch" || status === 403) {
    return { kind: "config", label: code ? `Permission error (${code})` : "Permission error" };
  }
  if (code === "EntityTooLarge" || status === 413) {
    return { kind: "size", label: "File too large for the backend" };
  }
  return { kind: "unknown", label: msg || "Upload failed" };
}
