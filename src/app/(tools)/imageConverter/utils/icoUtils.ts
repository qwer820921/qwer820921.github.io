/**
 * 圖檔工具：ICO 編碼器
 * 功能：將 PNG 檔案包裝為 ICO 格式
 */

/**
 * 將 PNG Blob 轉換為單一圖片的 ICO Blob
 * ICO 格式：Header (6 bytes) + Directory Entry (16 bytes) + ImageData
 * 參考：https://en.wikipedia.org/wiki/ICO_(file_format)
 */
export async function wrapPngToIco(pngBlob: Blob): Promise<Blob> {
  const pngArrayBuffer = await pngBlob.arrayBuffer();

  // 1. 取得圖片尺寸（從 Blob 比較難，通常在外部傳入或從 canvas 取得，這裡假設我們已經縮放好）
  // 為了精準，我們可以透過簡單的 PNG Header 讀取尺寸，但最安全的方法是讓外部傳入。
  // 這裡我們假設呼叫者會處理好尺寸。

  // 我們先建立一個能讀取 PNG 寬高的簡易邏輯（PNG 寬高在 16-24 bytes 位址）
  const view = new DataView(pngArrayBuffer);
  const width = view.getUint32(16);
  const height = view.getUint32(20);

  // ICO Directory 規定 256px 標記為 0
  const icoWidth = width >= 256 ? 0 : width;
  const icoHeight = height >= 256 ? 0 : height;

  const buffer = new ArrayBuffer(22);
  const icoView = new DataView(buffer);

  // --- Header (6 bytes) ---
  icoView.setUint16(0, 0, true); // Reserved
  icoView.setUint16(2, 1, true); // Type: 1 = ICO
  icoView.setUint16(4, 1, true); // Count: 1 image

  // --- Directory Entry (16 bytes) ---
  icoView.setUint8(6, icoWidth); // Width
  icoView.setUint8(7, icoHeight); // Height
  icoView.setUint8(8, 0); // Color palette (0 for no palette)
  icoView.setUint8(9, 0); // Reserved
  icoView.setUint16(10, 1, true); // Color planes (1)
  icoView.setUint16(12, 32, true); // Bits per pixel (32)
  icoView.setUint32(14, pngArrayBuffer.byteLength, true); // Image size
  icoView.setUint32(18, 22, true); // Offset to image data (22 bytes header)

  // 合併 Header 和 PNG 數據
  return new Blob([buffer, pngArrayBuffer], { type: "image/x-icon" });
}

/**
 * 計算符合 ICO 規範的尺寸（最大 256x256）
 */
export function getIcoTargetSize(
  originalWidth: number,
  originalHeight: number
): { width: number; height: number } {
  const MAX_SIZE = 256;
  if (originalWidth <= MAX_SIZE && originalHeight <= MAX_SIZE) {
    return { width: originalWidth, height: originalHeight };
  }

  const ratio = Math.min(MAX_SIZE / originalWidth, MAX_SIZE / originalHeight);
  return {
    width: Math.round(originalWidth * ratio),
    height: Math.round(originalHeight * ratio),
  };
}
