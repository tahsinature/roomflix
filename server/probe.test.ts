import { afterEach, describe, expect, test } from "bun:test";

import { fetchProbe } from "@/probe.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchProbe", () => {
  test("uses HEAD for ordinary media URLs", async () => {
    let method = "";
    globalThis.fetch = mockFetch((_url, init) => {
      method = init?.method ?? "GET";
      return new Response(null, {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "1234" },
      });
    });

    const result = await fetchProbe("https://media.example/movie.mp4");

    expect(method).toBe("HEAD");
    expect(result).toEqual({ kind: "ok", status: 200, contentType: "video/mp4", contentLength: 1234 });
  });

  test("uses a one-byte GET for AWS presigned URLs", async () => {
    let method = "";
    let range = "";
    globalThis.fetch = mockFetch((_url, init) => {
      method = init?.method ?? "GET";
      range = new Headers(init?.headers).get("range") ?? "";
      return new Response("x", {
        status: 206,
        headers: {
          "content-type": "video/mp4",
          "content-length": "1",
          "content-range": "bytes 0-0/987654",
        },
      });
    });

    const result = await fetchProbe("https://bucket.s3.us-east-2.amazonaws.com/movie.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=temporary&X-Amz-Signature=signed");

    expect(method).toBe("GET");
    expect(range).toBe("bytes=0-0");
    expect(result).toEqual({ kind: "ok", status: 206, contentType: "video/mp4", contentLength: 987654 });
  });
});

function mockFetch(handler: (url: string | URL | Request, init?: RequestInit) => Response): typeof fetch {
  return ((url: string | URL | Request, init?: RequestInit) => Promise.resolve(handler(url, init))) as typeof fetch;
}
