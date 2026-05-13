// Generic JSON export actions, shared by Library and Storage. Each takes
// a serializable value and pretty-prints it before handing it to the
// browser (copy / download / new tab).

function stringify(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export async function copyJsonToClipboard(data: unknown): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(stringify(data));
    return true;
  } catch {
    // Clipboard blocked (insecure context, denied permission, etc.) — callers
    // should fall back to a "select + copy" affordance if this returns false.
    return false;
  }
}

export function downloadJsonFile(data: unknown, filename: string): void {
  const blob = new Blob([stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function openJsonInNewTab(data: unknown): void {
  const blob = new Blob([stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  // Tab needs the URL for a beat — schedule cleanup rather than revoking
  // immediately.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
