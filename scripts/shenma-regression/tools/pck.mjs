// Godot 4 PCK 解析（pck-diff.mjs、verify-export.mjs 共用）
import { readFileSync } from "node:fs";

/** 讀取 PCK 目錄，回傳 { fmt, ver, flags, count, files: Map<路徑, { offset, size, md5, data }> }（offset 為檔案內絕對位置） */
export function parsePck(path) {
  const b = readFileSync(path);
  if (b.toString("latin1", 0, 4) !== "GDPC") {
    throw new Error("不是 PCK: " + path);
  }
  const fmt = b.readUInt32LE(4);
  const ver = [b.readUInt32LE(8), b.readUInt32LE(12), b.readUInt32LE(16)].join(
    "."
  );
  const flags = b.readUInt32LE(20);
  const fileBase = Number(b.readBigUInt64LE(24));
  // 格式 3 起目錄位移記在 header；舊格式緊接在保留欄位之後
  let p = fmt >= 3 ? Number(b.readBigUInt64LE(32)) : 32 + 16 * 4;
  const count = b.readUInt32LE(p);
  p += 4;
  const files = new Map();
  for (let i = 0; i < count; i++) {
    const len = b.readUInt32LE(p);
    p += 4;
    const name = b.toString("utf8", p, p + len).replace(/\0+$/, "");
    p += len;
    const off = Number(b.readBigUInt64LE(p));
    const size = Number(b.readBigUInt64LE(p + 8));
    const md5 = b.toString("hex", p + 16, p + 32);
    p += 36;
    files.set(name, {
      offset: fileBase + off,
      size,
      md5,
      data: b.subarray(fileBase + off, fileBase + off + size),
    });
  }
  return { fmt, ver, flags, count, files };
}

// 二進位資源（RSRC）中字典鍵的存法：u32 型別 5（字串）、u32 長度（含結尾 NUL）、字串；
// 值為 u32 型別 32（PackedInt32Array）、u32 元素數、元素。只把這段元素內容清零。
const NODE_IDS_KEY = Buffer.from("node_ids\0", "latin1");
export function maskNodeIds(buf) {
  const out = Buffer.from(buf);
  const hits = [];
  for (
    let i = out.indexOf(NODE_IDS_KEY);
    i !== -1;
    i = out.indexOf(NODE_IDS_KEY, i + 1)
  ) {
    if (
      i < 8 ||
      out.readUInt32LE(i - 8) !== 5 ||
      out.readUInt32LE(i - 4) !== NODE_IDS_KEY.length
    )
      continue;
    const typeAt = i + NODE_IDS_KEY.length;
    if (typeAt + 8 > out.length || out.readUInt32LE(typeAt) !== 32) continue;
    const count = out.readUInt32LE(typeAt + 4);
    const start = typeAt + 8;
    const end = start + count * 4;
    if (end > out.length) continue;
    out.fill(0, start, end);
    hits.push({ start, end });
  }
  return { masked: out, hits };
}
