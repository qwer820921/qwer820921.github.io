// 以 HTTP Range 從官方 export_templates.tpz（zip 格式）只取出 Web 單執行緒模板，
// 避免下載整包 1.25 GB。每個取出的項目都以 zip 中央目錄記錄的 CRC32 驗證。
// 用法：node extract-web-templates.mjs <輸出目錄>
import { mkdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import zlib from "node:zlib";

const URL_ =
  "https://github.com/godotengine/godot/releases/download/4.6.2-stable/Godot_v4.6.2-stable_export_templates.tpz";
const WANTED = [
  "templates/web_nothreads_release.zip",
  "templates/web_nothreads_debug.zip",
  "templates/version.txt",
];
const outDir = process.argv[2];
if (!outDir) throw new Error("需要輸出目錄參數");

async function head() {
  const r = await fetch(URL_, { method: "HEAD", redirect: "follow" });
  return Number(r.headers.get("content-length"));
}
async function range(start, end) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(URL_, {
        headers: { Range: `bytes=${start}-${end}` },
        redirect: "follow",
      });
      if (r.status !== 206)
        throw new Error(`HTTP ${r.status}（伺服器未接受 Range）`);
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length !== end - start + 1) throw new Error(`長度不符 ${b.length}`);
      return b;
    } catch (e) {
      if (attempt >= 4) throw e;
      console.error(
        `range ${start}-${end} 失敗（${e.message}），重試 ${attempt}`
      );
    }
  }
}

const total = await head();
console.log("tpz 大小:", total);

// ── 找 End Of Central Directory ──
const tailLen = Math.min(total, 65536 + 22 + 20);
const tail = await range(total - tailLen, total - 1);
const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
if (eocd < 0) throw new Error("找不到 EOCD");
let entries = tail.readUInt16LE(eocd + 10);
let cdSize = tail.readUInt32LE(eocd + 12);
let cdOffset = tail.readUInt32LE(eocd + 16);
if (cdOffset === 0xffffffff || cdSize === 0xffffffff || entries === 0xffff) {
  // ZIP64
  const loc = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]), eocd);
  const z64Off = Number(tail.readBigUInt64LE(loc + 8));
  const z64 = await range(z64Off, z64Off + 56 - 1);
  entries = Number(z64.readBigUInt64LE(32));
  cdSize = Number(z64.readBigUInt64LE(40));
  cdOffset = Number(z64.readBigUInt64LE(48));
}
console.log("中央目錄:", { entries, cdSize, cdOffset });

// ── 解析中央目錄 ──
const cd = await range(cdOffset, cdOffset + cdSize - 1);
const list = [];
for (let p = 0; p < cd.length; ) {
  if (cd.readUInt32LE(p) !== 0x02014b50)
    throw new Error("中央目錄格式錯誤 @" + p);
  const method = cd.readUInt16LE(p + 10);
  const crc = cd.readUInt32LE(p + 16);
  let comp = cd.readUInt32LE(p + 20);
  let uncomp = cd.readUInt32LE(p + 24);
  const nameLen = cd.readUInt16LE(p + 28);
  const extraLen = cd.readUInt16LE(p + 30);
  const commentLen = cd.readUInt16LE(p + 32);
  let local = cd.readUInt32LE(p + 42);
  const name = cd.subarray(p + 46, p + 46 + nameLen).toString("utf8");
  // ZIP64 extra field
  let e = p + 46 + nameLen;
  const eEnd = e + extraLen;
  while (e + 4 <= eEnd) {
    const id = cd.readUInt16LE(e);
    const sz = cd.readUInt16LE(e + 2);
    if (id === 0x0001) {
      let q = e + 4;
      if (uncomp === 0xffffffff) {
        uncomp = Number(cd.readBigUInt64LE(q));
        q += 8;
      }
      if (comp === 0xffffffff) {
        comp = Number(cd.readBigUInt64LE(q));
        q += 8;
      }
      if (local === 0xffffffff) {
        local = Number(cd.readBigUInt64LE(q));
        q += 8;
      }
    }
    e += 4 + sz;
  }
  list.push({ name, method, crc, comp, uncomp, local });
  p += 46 + nameLen + extraLen + commentLen;
}
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, "_tpz-entries.txt"),
  list
    .map(
      (x) =>
        `${x.name}\t${x.uncomp}\tcrc32=${x.crc.toString(16).padStart(8, "0")}`
    )
    .join("\n") + "\n"
);
console.log("tpz 內項目數:", list.length);

// ── 只取需要的項目 ──
for (const want of WANTED) {
  const ent = list.find((x) => x.name === want);
  if (!ent) throw new Error("tpz 內找不到 " + want);
  const lh = await range(ent.local, ent.local + 30 - 1);
  if (lh.readUInt32LE(0) !== 0x04034b50)
    throw new Error("本地檔頭格式錯誤: " + want);
  const dataStart = ent.local + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  const raw =
    ent.comp > 0
      ? await range(dataStart, dataStart + ent.comp - 1)
      : Buffer.alloc(0);
  const data =
    ent.method === 8 ? zlib.inflateRawSync(raw) : ent.method === 0 ? raw : null;
  if (!data) throw new Error("不支援的壓縮方式 " + ent.method);
  const crc = zlib.crc32(data) >>> 0;
  if (data.length !== ent.uncomp || crc !== ent.crc) {
    throw new Error(
      `${want} 驗證失敗 len=${data.length}/${ent.uncomp} crc=${crc.toString(16)}/${ent.crc.toString(16)}`
    );
  }
  writeFileSync(join(outDir, basename(want)), data);
  console.log(
    `OK ${want} ${data.length} bytes crc32=${crc.toString(16).padStart(8, "0")}`
  );
}
