import { describe, expect, test } from "bun:test";
import { InMemoryVideoRepo } from "../storage/memory.ts";

describe("InMemoryVideoRepo", () => {
  test("create stores a video with a generated id and empty subtitles", async () => {
    const repo = new InMemoryVideoRepo();
    const v = await repo.create({ url: "https://x.test/a.mp4", title: "A" });
    expect(v.id).toBeTruthy();
    expect(v.url).toBe("https://x.test/a.mp4");
    expect(v.title).toBe("A");
    expect(v.subtitles).toEqual([]);
  });

  test("create is idempotent on URL — returns the existing entry", async () => {
    const repo = new InMemoryVideoRepo();
    const first = await repo.create({ url: "https://x.test/a.mp4", title: "A" });
    const second = await repo.create({ url: "https://x.test/a.mp4", title: "B" });
    expect(second.id).toBe(first.id);
    expect(second.title).toBe("A");
  });

  test("findByUrl returns the entry, null on miss", async () => {
    const repo = new InMemoryVideoRepo();
    const v = await repo.create({ url: "https://x.test/a.mp4" });
    expect(await repo.findByUrl("https://x.test/a.mp4")).toEqual(v);
    expect(await repo.findByUrl("https://nope.test/a.mp4")).toBeNull();
  });

  test("update patches title and mints subtitle ids", async () => {
    const repo = new InMemoryVideoRepo();
    const v = await repo.create({ url: "https://x.test/a.mp4", title: "old" });
    const updated = await repo.update(v.id, {
      title: "new",
      subtitles: [{ id: "", url: "https://s.test/en.vtt", label: "EN", lang: "en" }],
    });
    expect(updated?.title).toBe("new");
    expect(updated?.subtitles).toHaveLength(1);
    expect(updated?.subtitles[0]?.id).toBeTruthy();
    expect(updated?.subtitles[0]?.label).toBe("EN");
  });

  test("update on missing id returns null", async () => {
    const repo = new InMemoryVideoRepo();
    expect(await repo.update("nope", { title: "x" })).toBeNull();
  });

  test("remove deletes once and reports false thereafter", async () => {
    const repo = new InMemoryVideoRepo();
    const v = await repo.create({ url: "https://x.test/a.mp4" });
    expect(await repo.remove(v.id)).toBe(true);
    expect(await repo.get(v.id)).toBeNull();
    expect(await repo.remove(v.id)).toBe(false);
  });
});

