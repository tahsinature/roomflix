// Shared types for the storage/buckets feature. Credentials live in the
// browser only — see session.ts. The rest of the UI imports these.

export type ProviderId = "r2" | "s3";

interface ConnectionBase {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  // Optional base URL for the bucket's public objects (e.g. https://pub-xxx.r2.dev
  // or a custom domain). Used to match files against the Library by URL.
  publicBaseUrl?: string;
  // Hard ceiling in bytes. Uploads that would push (used + size) over this
  // are refused client-side so the user can't accidentally exceed their plan.
  maxBytes: number;
  // User-facing label so multiple exported JSON configs are recognizable.
  label?: string;
}

export type R2Connection = ConnectionBase & {
  provider: "r2";
  // R2 endpoint is derived from accountId.
  accountId: string;
  region?: never;
};

export type S3Connection = ConnectionBase & {
  provider: "s3";
  region: string;
  accountId?: never;
};

export type Connection = R2Connection | S3Connection;

export interface FileEntry {
  // Full object key, e.g. "videos/movie.mp4".
  key: string;
  size: number;
  lastModified?: Date;
  etag?: string;
}

export interface FolderEntry {
  // Common prefix from S3 LIST with delimiter, e.g. "videos/".
  prefix: string;
}

export interface BrowseResult {
  prefix: string;
  files: FileEntry[];
  folders: FolderEntry[];
  // True if there are more pages at this prefix. The browser doesn't paginate
  // through these for v1 — we just surface "X+ items, list truncated" if so.
  truncated: boolean;
}

export interface Usage {
  bytes: number;
  objects: number;
}

// Exported JSON file shape. Same fields as Connection plus an envelope so we
// can refuse files from other apps or future schema versions.
export type ConfigFileV1 = Connection & {
  version: 1;
  kind: "roomflix-storage-connection";
};
