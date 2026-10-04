import { describe, expect, test } from "bun:test";
import type { ImdbRatings } from "../server/protocol";
import { createOmdbClient } from "../server/discovery/omdb-client";

function response(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}
const body = { Response: "True", imdbID: "tt2543164", imdbRating: "7.9", imdbVotes: "1,177,133" };

describe("OMDb ratings adapter", () => {
  test("matches IMDb identity and parses comma-separated votes", async () => {
    const client = createOmdbClient({
      apiKey: () => "test-key",
      fetcher: (async (url) => {
        expect(new URL(String(url)).searchParams.get("i")).toBe("tt2543164");
        return response(body);
      }) as typeof fetch,
    });
    const ratings = await client("tt2543164");
    expect(ratings).toMatchObject({ rating: 7.9, votes: 1177133, status: "available" });
    expect(ratings.fetchedAt).not.toBeNull();
  });

  test("coalesces requests and reuses results for 24 hours", async () => {
    let calls = 0;
    let now = Date.now();
    const client = createOmdbClient({
      apiKey: () => "test-key",
      now: () => now,
      fetcher: (async () => {
        calls++;
        return response(body);
      }) as typeof fetch,
    });
    await Promise.all([client("tt2543164"), client("tt2543164")]);
    await client("tt2543164");
    expect(calls).toBe(1);
    now += 24 * 60 * 60 * 1000 + 1;
    await client("tt2543164");
    expect(calls).toBe(2);
  });

  test("reuses persisted ratings across client restarts and refreshes expired results", async () => {
    const records = new Map<string, { data: ImdbRatings; expiresAt: number }>();
    let calls = 0;
    let time = Date.now();
    const options = {
      apiKey: () => "test-key",
      now: () => time,
      persistentCache: {
        get: async (key: string) => records.get(key) ?? null,
        set: async (key: string, data: ImdbRatings, expiresAt: number) => {
          records.set(key, { data, expiresAt });
        },
      },
      fetcher: (async () => {
        calls++;
        return response(body);
      }) as typeof fetch,
    };
    const first = await createOmdbClient(options)("tt2543164");
    const restarted = createOmdbClient(options);
    expect(await Promise.all([restarted("tt2543164"), restarted("tt2543164")])).toEqual([first, first]);
    expect(calls).toBe(1);
    time += 24 * 60 * 60 * 1000 + 1;
    await createOmdbClient(options)("tt2543164");
    expect(calls).toBe(2);
  });

  test("cache storage failures do not prevent loading valid ratings", async () => {
    const client = createOmdbClient({
      apiKey: () => "test-key",
      persistentCache: {
        get: async () => {
          throw new Error("offline");
        },
        set: async () => {
          throw new Error("offline");
        },
      },
      fetcher: (async () => response(body)) as typeof fetch,
    });
    expect((await client("tt2543164")).rating).toBe(7.9);
  });

  test("does not send requests without a key or for invalid identities", async () => {
    let calls = 0;
    const client = createOmdbClient({
      apiKey: () => undefined,
      fetcher: (async () => {
        calls++;
        return response(body);
      }) as typeof fetch,
    });
    expect((await client("tt2543164")).status).toBe("not_configured");
    expect((await client("https://example.com")).status).toBe("not_found");
    expect(calls).toBe(0);
  });

  test("missing and malformed ratings never become zero or simulated scores", async () => {
    for (const values of [
      { imdbRating: "N/A", imdbVotes: "N/A" },
      { imdbRating: "12", imdbVotes: "1.2k" },
    ]) {
      const client = createOmdbClient({ apiKey: () => "test-key", fetcher: (async () => response({ ...body, ...values })) as typeof fetch });
      expect(await client("tt2543164")).toMatchObject({ rating: null, votes: null, status: "not_found" });
    }
  });

  test("rejects mismatched titles and handles network failures", async () => {
    const mismatch = createOmdbClient({ apiKey: () => "test-key", fetcher: (async () => response({ ...body, imdbID: "tt0000001" })) as typeof fetch });
    expect((await mismatch("tt2543164")).status).toBe("unavailable");
    const failed = createOmdbClient({
      apiKey: () => "test-key",
      fetcher: (async () => {
        throw new Error("Network failed");
      }) as typeof fetch,
    });
    expect(await failed("tt2543164")).toEqual({ rating: null, votes: null, status: "unavailable", fetchedAt: null });
  });

  test("identifies rejected keys and HTTP quota errors", async () => {
    for (const providerResponse of [response({ Response: "False", Error: "Invalid API key!" }), new Response(null, { status: 401 })]) {
      const client = createOmdbClient({ apiKey: () => "bad-key", fetcher: (async () => providerResponse) as typeof fetch });
      expect((await client("tt2543164")).status).toBe("invalid_key");
    }
    const quotaUnauthorized = createOmdbClient({
      apiKey: () => "test-key",
      fetcher: (async () => new Response(JSON.stringify({ Response: "False", Error: "Request limit reached!" }), { status: 401 })) as typeof fetch,
    });
    expect((await quotaUnauthorized("tt2543164")).status).toBe("quota_exceeded");
    const limited = createOmdbClient({ apiKey: () => "test-key", fetcher: (async () => new Response(null, { status: 429 })) as typeof fetch });
    expect((await limited("tt2543164")).status).toBe("quota_exceeded");
  });

  test("stops further requests temporarily when the daily quota is exhausted", async () => {
    let calls = 0;
    const client = createOmdbClient({
      apiKey: () => "test-key",
      fetcher: (async () => {
        calls++;
        return response({ Response: "False", Error: "Request limit reached!" });
      }) as typeof fetch,
    });
    expect((await client("tt2543164")).status).toBe("quota_exceeded");
    expect((await client("tt0137523")).status).toBe("quota_exceeded");
    expect(calls).toBe(1);
  });
});
