/** Poster clipboard/download helpers with graceful URL fallbacks. */

const MAX_CLIPBOARD_EDGE = 1200;

export type PosterCopyResult = "image" | "url";
export type PosterDownloadResult = "downloaded" | "opened";

export async function copyPosterImage(imageUrl: string): Promise<PosterCopyResult> {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Image clipboard unavailable");
    const image = await loadImage(imageUrl);
    const longEdge = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, MAX_CLIPBOARD_EDGE / longEdge);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await canvasToPng(canvas);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return "image";
  } catch {
    await navigator.clipboard.writeText(imageUrl);
    return "url";
  }
}

export async function downloadPoster(imageUrl: string, filename: string): Promise<PosterDownloadResult> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Poster download failed");
    const objectUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    return "downloaded";
  } catch {
    window.open(imageUrl, "_blank", "noopener,noreferrer");
    return "opened";
  }
}

export function posterFilename(title: string, year: string): string {
  const safeTitle = `${title}${year ? ` (${year})` : ""}`.replace(/[^a-z0-9()\- ]/gi, "").trim();
  return `${safeTitle || "poster"}.jpg`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Poster image failed to load"));
    image.src = url;
  });
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Poster conversion failed"))), "image/png");
  });
}
