import { describe, expect, test } from "bun:test";
import { InMemoryVideoRepo } from "@/storage/memory.ts";

const SPACE = "space-1";
const USER = "user-1";

describe("InMemoryVideoRepo", () => {
  test("create stores a video with a generated id and empty subtitles", async () => {
    const repo = new InMemoryVideoRepo();
    const v = await repo.create({ spaceId: SPACE, addedBy: USER, url: "https://x.test/a.mp4", title: "A" });
    expect(v.id).toBeTruthy();
    expect(v.spaceId).toBe(SPACE);
    expect(v.addedBy).toBe(USER);
    expect(v.url).toBe("https://x.test/a.mp4");
    expect(v.title).toBe("A");
    expect(v.subtitles).toEqual([]);
  });

  test("create is idempotent on (space, url) — returns the existing entry", async () => {
    const repo = new InMemoryVideoRepo();
    const first = await repo.create({ spaceId: SPACE, addedBy: USER, url: "https://x.test/a.mp4", title: "A" });
    const second = await repo.create({ spaceId: SPACE, addedBy: USER, url: "https://x.test/a.mp4", title: "B" });
    expect(second.id).toBe(first.id);
    expect(second.title).toBe("A");
  });

  test("findByUrl returns the entry, null on miss", async () => {
    const repo = new InMemoryVideoRepo();
    const v = await repo.create({ spaceId: SPACE, addedBy: USER, url: "https://x.test/a.mp4" });
    expect(await repo.findByUrl(SPACE, "https://x.test/a.mp4")).toEqual(v);
    expect(await repo.findByUrl(SPACE, "https://nope.test/a.mp4")).toBeNull();
  });

  test("library is isolated per space — A doesn't see B's videos", async () => {
    const repo = new InMemoryVideoRepo();
    const a = await repo.create({ spaceId: "a", addedBy: USER, url: "https://x.test/a.mp4" });
    const b = await repo.create({ spaceId: "b", addedBy: USER, url: "https://x.test/b.mp4" });
    expect((await repo.list("a")).map((v) => v.id)).toEqual([a.id]);
    expect((await repo.list("b")).map((v) => v.id)).toEqual([b.id]);
    expect(await repo.get("a", b.id)).toBeNull();
  });

  test("update patches title and mints subtitle ids", async () => {
    const repo = new InMemoryVideoRepo();
    const v = await repo.create({ spaceId: SPACE, addedBy: USER, url: "https://x.test/a.mp4", title: "old" });
    const updated = await repo.update(SPACE, v.id, {
      title: "new",
      subtitles: [{ id: "", url: "https://s.test/en.vtt", label: "EN", lang: "en" }],
    });
    expect(updated?.title).toBe("new");
    expect(updated?.subtitles).toHaveLength(1);
    expect(updated?.subtitles[0]?.id).toBeTruthy();
    expect(updated?.subtitles[0]?.label).toBe("EN");
  });

  test("update by a different space returns null", async () => {
    const repo = new InMemoryVideoRepo();
    const v = await repo.create({ spaceId: SPACE, addedBy: USER, url: "https://x.test/a.mp4" });
    expect(await repo.update("other-space", v.id, { title: "hijack" })).toBeNull();
  });

  test("update on missing id returns null", async () => {
    const repo = new InMemoryVideoRepo();
    expect(await repo.update(SPACE, "nope", { title: "x" })).toBeNull();
  });

  test("remove deletes once and reports false thereafter", async () => {
    const repo = new InMemoryVideoRepo();
    const v = await repo.create({ spaceId: SPACE, addedBy: USER, url: "https://x.test/a.mp4" });
    expect(await repo.remove(SPACE, v.id)).toBe(true);
    expect(await repo.get(SPACE, v.id)).toBeNull();
    expect(await repo.remove(SPACE, v.id)).toBe(false);
  });

  test("remove by a different space returns false and preserves the row", async () => {
    const repo = new InMemoryVideoRepo();
    const v = await repo.create({ spaceId: SPACE, addedBy: USER, url: "https://x.test/a.mp4" });
    expect(await repo.remove("other-space", v.id)).toBe(false);
    expect(await repo.get(SPACE, v.id)).not.toBeNull();
  });
});
