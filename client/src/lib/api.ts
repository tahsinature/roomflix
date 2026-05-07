import type { RoomListItem, Subtitle, Video } from "@shared/protocol";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `${res.status} ${res.statusText}${text ? `: ${text}` : ""}`,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listRooms: (opts: { includeAll?: boolean } = {}) =>
    request<RoomListItem[]>(
      opts.includeAll ? "/api/rooms?include=all" : "/api/rooms",
    ),
  listVideos: () => request<Video[]>("/api/videos"),
  createVideo: (input: {
    url: string;
    title?: string;
    subtitles?: Subtitle[];
  }) =>
    request<Video>("/api/videos", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateVideo: (
    id: string,
    patch: { title?: string; subtitles?: Subtitle[] },
  ) =>
    request<Video>(`/api/videos/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteVideo: (id: string) =>
    request<void>(`/api/videos/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  uploadSubtitle: (input: { content: string; filename: string }) =>
    request<{ id: string; url: string }>("/api/subtitles", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
