import { toBlob } from "html-to-image";
import { pad } from "./timeUtils";

export type ShareImageResult = "clipboard" | "download";

const buildFileName = (d: Date = new Date()): string =>
  `clockout-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
    d.getHours()
  )}${pad(d.getMinutes())}.png`;

const downloadBlob = (blob: Blob): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = buildFileName();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export async function copyScreenAsImage(
  node: HTMLElement
): Promise<ShareImageResult> {
  const blob = await toBlob(node, { pixelRatio: 2 });
  if (!blob) throw new Error("截圖失敗");

  const canWriteImage =
    !!navigator.clipboard?.write && typeof ClipboardItem !== "undefined";

  if (canWriteImage) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      return "clipboard";
    } catch {
      downloadBlob(blob);
      return "download";
    }
  }

  downloadBlob(blob);
  return "download";
}
