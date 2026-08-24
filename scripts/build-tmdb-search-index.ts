import { mkdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { dirname, resolve } from "node:path";

type SearchKind = "m" | "t" | "p";
type SearchIndexEntry = [SearchKind, number, string, number];

interface ExportDefinition {
  filePrefix: "movie" | "tv_series" | "person";
  kind: SearchKind;
  limit: number;
  nameField: "original_title" | "original_name" | "name";
}

interface RawExportEntry {
  id?: number;
  original_title?: string;
  original_name?: string;
  name?: string;
  popularity?: number;
  video?: boolean;
}

const EXPORT_BASE = "https://files.tmdb.org/p/exports";
const OUTPUT_PATH = resolve(import.meta.dir, "../server/data/tmdb-search-index.json");
const MAX_DATE_ATTEMPTS = 4;
const exportsToIndex: ExportDefinition[] = [
  {
    filePrefix: "movie",
    kind: "m",
    limit: 25_000,
    nameField: "original_title",
  },
  {
    filePrefix: "tv_series",
    kind: "t",
    limit: 25_000,
    nameField: "original_name",
  },
  {
    filePrefix: "person",
    kind: "p",
    limit: 25_000,
    nameField: "name",
  },
];

class PopularityHeap {
  private readonly entries: SearchIndexEntry[] = [];

  constructor(private readonly limit: number) {}

  add(entry: SearchIndexEntry) {
    if (this.entries.length < this.limit) {
      this.entries.push(entry);
      this.bubbleUp(this.entries.length - 1);
      return;
    }
    if (entry[3] <= this.entries[0][3]) return;

    this.entries[0] = entry;
    this.sinkDown(0);
  }

  sorted(): SearchIndexEntry[] {
    return [...this.entries].sort((a, b) => b[3] - a[3]);
  }

  private bubbleUp(startIndex: number) {
    let index = startIndex;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.entries[parent][3] <= this.entries[index][3]) return;
      [this.entries[parent], this.entries[index]] = [this.entries[index], this.entries[parent]];
      index = parent;
    }
  }

  private sinkDown(startIndex: number) {
    let index = startIndex;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;

      if (left < this.entries.length && this.entries[left][3] < this.entries[smallest][3]) {
        smallest = left;
      }
      if (right < this.entries.length && this.entries[right][3] < this.entries[smallest][3]) {
        smallest = right;
      }
      if (smallest === index) return;

      [this.entries[index], this.entries[smallest]] = [this.entries[smallest], this.entries[index]];
      index = smallest;
    }
  }
}

function exportDate(offsetDays: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - offsetDays);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const year = date.getUTCFullYear();
  return {
    fileDate: `${month}_${day}_${year}`,
    isoDate: `${year}-${month}-${day}`,
  };
}

function exportUrl(definition: ExportDefinition, fileDate: string): string {
  return `${EXPORT_BASE}/${definition.filePrefix}_ids_${fileDate}.json.gz`;
}

async function latestAvailableDate() {
  for (let offset = 0; offset < MAX_DATE_ATTEMPTS; offset += 1) {
    const date = exportDate(offset);
    const responses = await Promise.all(exportsToIndex.map((definition) => fetch(exportUrl(definition, date.fileDate), { method: "HEAD" })));
    if (responses.every((response) => response.ok)) return date;
  }
  throw new Error("No complete TMDB daily export was available.");
}

async function readExport(definition: ExportDefinition, fileDate: string): Promise<SearchIndexEntry[]> {
  const response = await fetch(exportUrl(definition, fileDate));
  if (!response.ok || !response.body) {
    throw new Error(`TMDB ${definition.filePrefix} export failed (${response.status}).`);
  }

  const input = Readable.fromWeb(response.body as never).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  const heap = new PopularityHeap(definition.limit);

  for await (const line of lines) {
    if (!line) continue;
    const raw = JSON.parse(line) as RawExportEntry;
    const name = raw[definition.nameField]?.trim();
    if (!raw.id || !name || (definition.kind === "m" && raw.video)) continue;

    heap.add([definition.kind, raw.id, name, Math.round((raw.popularity ?? 0) * 100) / 100]);
  }

  return heap.sorted();
}

async function buildSearchIndex() {
  const date = await latestAvailableDate();
  console.log(`Building fuzzy index from TMDB exports dated ${date.isoDate}…`);

  const groupedEntries = await Promise.all(exportsToIndex.map((definition) => readExport(definition, date.fileDate)));
  const entries = groupedEntries.flat();
  const document = {
    version: 1,
    sourceDate: date.isoDate,
    entries,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await Bun.write(OUTPUT_PATH, JSON.stringify(document));
  const megabytes = (Bun.file(OUTPUT_PATH).size / 1_000_000).toFixed(2);
  console.log(`Wrote ${entries.length.toLocaleString()} entries (${megabytes} MB).`);
}

if (import.meta.main) {
  try {
    await buildSearchIndex();
  } catch (error) {
    if (await Bun.file(OUTPUT_PATH).exists()) {
      console.warn(`Index refresh failed; keeping the existing index. ${String(error)}`);
    } else {
      throw error;
    }
  }
}
