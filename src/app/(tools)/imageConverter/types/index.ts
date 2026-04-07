// 圖檔轉檔 相關型別定義

/**
 * 可輸出的圖片格式（Canvas API 原生支援 + AVIF 需特徵檢測）
 */
export type OutputFormat =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/avif"
  | "image/x-icon"
  | "image/bmp"
  | "application/pdf";

/**
 * 僅可輸入的格式（瀏覽器可讀取但無法直接輸出）
 */
export type InputOnlyFormat = "image/heic" | "image/svg+xml";

/** 所有支援輸入的格式 */
export type InputFormat = OutputFormat | InputOnlyFormat;

/** 輸出格式對應的副檔名 */
export const FORMAT_EXTENSIONS: Record<OutputFormat, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/x-icon": ".ico",
  "image/bmp": ".bmp",
  "application/pdf": ".pdf",
};

/** 輸出格式對應的顯示名稱 */
export const FORMAT_LABELS: Record<OutputFormat, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
  "image/avif": "AVIF",
  "image/x-icon": "ICO",
  "image/bmp": "BMP",
  "application/pdf": "PDF",
};

/** 輸入格式的顯示名稱 */
export const IMAGE_TYPE_LABELS: Record<string, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/jpg": "JPEG",
  "image/webp": "WebP",
  "image/avif": "AVIF",
  "image/heic": "HEIC",
  "image/heif": "HEIC",
  "image/svg+xml": "SVG",
  "image/x-icon": "ICO",
  "image/vnd.microsoft.icon": "ICO",
  "image/bmp": "BMP",
};

/** 單張圖片的上傳項目 */
export interface UploadItem {
  id: string;
  file: File;
  previewUrl: string;
  format: string;
  width: number;
  height: number;
  size: number;
  isLoading: boolean; // HEIC 正在轉換
}

/** 單張圖片的轉換結果 */
export interface ConvertedItem {
  sourceId: string;
  sourceName: string;
  sourceFormat: string;
  sourceSize: number;
  sourceWidth: number;
  sourceHeight: number;
  resultUrl: string;
  resultName: string;
  resultFormat: string;
  resultSize: number;
  resultWidth: number;
  resultHeight: number;
}

/** 轉換設定 */
export interface ConvertSettings {
  targetFormat: OutputFormat;
  quality: number;
}

/**
 * 檢測瀏覽器是否支援 AVIF 輸出
 */
export async function checkAvifSupport(): Promise<boolean> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/avif", 0.5);
    });
    return blob !== null && blob.type === "image/avif";
  } catch {
    return false;
  }
}

/** 可接受的輸入檔案類型 */
export const ACCEPTED_INPUT_TYPES =
  "image/png,image/jpeg,image/webp,image/avif,image/heic,image/heif,image/svg+xml,image/x-icon,image/bmp,.heic,.heif,.ico,.svg,.avif,.bmp";

/** 產生唯一 ID */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** 格式化檔案大小 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** 從 MIME type 取得顯示名稱 */
export function getFormatLabel(mime: string): string {
  if (mime in IMAGE_TYPE_LABELS) return IMAGE_TYPE_LABELS[mime];
  const parts = mime.split("/");
  return (parts[1] || mime).toUpperCase();
}

/** 判斷是否為 HEIC 格式 */
export function isHeicFile(file: File): boolean {
  if (file.type === "image/heic" || file.type === "image/heif") return true;
  const ext = file.name.toLowerCase();
  return ext.endsWith(".heic") || ext.endsWith(".heif");
}
