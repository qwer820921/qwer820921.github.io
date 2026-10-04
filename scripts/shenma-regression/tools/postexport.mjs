// Godot 網頁匯出後的處理（交付產物 public/games/shenmaSanguo 由「匯出＋這一步」產生，godot-check.sh 照同樣的步驟核對）
// 1. 背景音樂：資料包排除了 audio/bgm（export_presets.cfg 的 exclude_filter，啟動時不必下載），
//    把原始檔複製到匯出目錄，遊戲第一次要播放時才下載（SFXManager.gd）
// 2. 版本完整性：一個頁面只會拿到同一版的外殼頁、載入程式（index.js）、引擎（index.wasm）與資料包（index.pck），
//    拿不到就明確失敗，不會拼成混版
//    - 版本：這一版檔案內容決定的識別（VERSION），同時寫進外殼頁與 Service Worker
//    - 外殼頁（index.html）的版本守門：網址加上 shenma_ver=<版本>（之後的請求帶著它），確認控制這個頁面的
//      Service Worker 是同一版（不是就讓同一版接手；伺服器上沒有這一版時重新載入一次，仍不行就說明）之後，
//      才載入 index.js、開始下載引擎與資料包。Service Worker 下載時送來的進度顯示在進度條，拒絕交付時說明原因。
//      引擎啟動後才把焦點交給遊戲畫面，而且嵌入的網頁正在用焦點（開著視窗、正在輸入）時不搶（Godot 的 focusCanvas 關掉）
//    - Service Worker（Godot 模板產生的 index.service.worker.js）：
//      - 只交付這一版：index.js／index.wasm／index.pck 只給同一版的頁面（頁面網址的 shenma_ver），不是就拒絕（503）
//      - 先核對再交付：這一版檔案的大小與 sha256 寫進 Service Worker；快取裡的（放進快取前都核對過）直接用，
//        沒有才下載，完整讀完、大小與 sha256 相符才交給頁面並放進快取。舊版、新版、沒下載完、錯誤狀態、網路錯誤
//        都不交給頁面（拒絕並告訴頁面原因），也不放進快取；安裝時先載入的檔案任何一個不符就不安裝（舊版本照常運作）
//      - 向伺服器重新驗證：下載用 cache: 'no-cache'（相同時伺服器回 304、不重新下載），不用 HTTP 快取裡還沒過期的舊檔；
//        外殼頁的導覽也一樣（關掉導覽預載）。這一版的檔案都在快取時，外殼頁用快取的（可以離線）
//      - 引擎快取：index.wasm 放在以「index.js＋index.wasm 的 sha256」命名的快取，重新匯出但引擎相同時沿用；
//        任一個不同就是新的名稱（不會拿舊引擎配新的載入程式）
//      - 啟用時接手範圍內的頁面（第一次開啟也由 Service Worker 核對）；不是這一版的頁面要的檔案照樣拒絕
// 3. 版本目錄（發布方式見 tools/game-release.mjs）：每一版放在自己的目錄 games/shenmaSanguo-v/<版本>/，
//    發布後內容不再改變；舊正式版留在原本的 games/shenmaSanguo/（Godot 原本的 Service Worker，範圍不包含版本目錄）
//    - 快取用自己的命名空間 CACHE_PREFIX（shenmaSanguo-pkg-）：舊正式版的 Service Worker 啟用時只刪它自己前綴
//      （shenmaSanguo-sw-cache-）的快取，碰不到版本目錄的快取；這裡也不刪舊正式版的快取
//    - CACHE_VERSION 換成這一版的版本：同一版的 Service Worker 內容固定，快取名稱就是 CACHE_PREFIX＋版本
//    - 引擎快取的鍵用版本目錄上一層的固定網址（不是實際的檔案）：不同版本、同一個引擎時共用，不重新下載 index.wasm
//    - 啟用時刪除這個命名空間裡其他版本的快取，但目前還有頁面（含 iframe）開著的版本保留，那時引擎快取也都保留
//    模板裡只改已知的片段與區塊（片段必須剛好出現一次、整段換掉的區塊內容要和 Godot 4.6.2 相同，模板改版時直接失敗）
// 用法：node scripts/shenma-regression/tools/postexport.mjs <匯出目錄> [Godot 專案目錄，預設 godot/shenmaSanguo]
// 結束碼：0 完成；1 模板和預期不同或檔案缺少；2 參數錯誤
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const BGM_SOURCE = "audio/bgm/bgm_battle.ogg";
export const BGM_FILE = "bgm_battle.ogg";
/** 大小與 sha256 寫進 Service Worker 的檔案（交付與放進快取前核對） */
export const VERIFIED_FILES = [
  "index.html",
  "index.js",
  "index.wasm",
  "index.pck",
  "index.audio.worklet.js",
  "index.audio.position.worklet.js",
];
// 文字檔：去掉 CR 後計算大小與 sha256（git 以 LF 保存與部署；Windows 工作樹可能是 CRLF）
export const TEXT_FILES = [
  "index.html",
  "index.js",
  "index.audio.worklet.js",
  "index.audio.position.worklet.js",
];
export const stripCR = (buf) => Buffer.from(buf.filter((b) => b !== 13));
/** 外殼頁與 Service Worker 之間的約定（網址參數、訊息、快取命名空間與版本目錄）；改了約定就換這個值，版本跟著不同 */
export const GUARD_PROTOCOL = "shenma-guard-2";
export const VERSION_PARAM = "shenma_ver";
/** Godot 模板產生的快取前綴（舊正式版用這個；它的 Service Worker 啟用時刪除這個前綴的其他快取） */
export const TEMPLATE_CACHE_PREFIX = "shenmaSanguo-sw-cache-";
/** 版本目錄的快取命名空間：不能以 TEMPLATE_CACHE_PREFIX 開頭（否則舊正式版的 Service Worker 啟用時會刪掉） */
export const CACHE_NAMESPACE = "shenmaSanguo-pkg-";
/** 外殼頁裡版本的位置（計算版本時遮掉） */
export const VERSION_PLACEHOLDER = "__SHENMA_VERSION__";
const VERSION_LINE =
  /^\tconst VERSION = '([0-9a-f]{16}|__SHENMA_VERSION__)';$/m;
const MARK =
  "// ── 神馬三國：版本完整性、核對後交付、重新驗證與引擎快取（tools/postexport.mjs）──";
const GUARD_MARK = "// 神馬三國：版本守門（tools/postexport.mjs）";

/** 原始碼用兩個空白縮排，輸出成模板的 tab 縮排 */
const tabs = (s) => s.replace(/^(?: {2})+/gm, (m) => "\t".repeat(m.length / 2));

const HELPERS = tabs(`
${MARK}
// 這一版的識別（外殼頁、載入程式、引擎、資料包與音訊 worklet 的內容決定）。外殼頁的版本守門把它加在頁面網址（shenma_ver），
// 這裡依請求的頁面版本只交付這一版的檔案：不是這一版的頁面（舊版、新版或沒有版本）要載入程式、引擎或資料包時拒絕，不拼成混版
const VERSION = '__VERSION__';
const VERSION_PARAM = '${VERSION_PARAM}';
// 這一版檔案的大小與 sha256：交付與放進快取前核對。text 的檔案去掉 CR 後計算（git 以 LF 保存、部署；Windows 工作樹可能是 CRLF）
const EXPECTED = __EXPECTED__;
// 必須和頁面同一版才交付的檔案
const STRICT_FILES = ['index.js', 'index.wasm', 'index.pck'];
// 引擎（index.wasm）放在以 index.js 與 index.wasm 內容命名的快取：重新匯出但引擎相同時沿用，不重新下載。
// 每一版的目錄（網址）不同，引擎的快取鍵用版本目錄上一層的固定網址（只當快取鍵，伺服器上沒有這個檔案）：不同版本、同一個引擎時共用
const ENGINE_CACHE = CACHE_PREFIX + 'engine-__ENGINE__';
const ENGINE_FILES = ['index.wasm'];
const ENGINE_KEY_BASE = new URL('../' + ENGINE_CACHE + '/', self.location.href).href;
const cacheNameFor = (name) => (ENGINE_FILES.includes(name) ? ENGINE_CACHE : CACHE_NAME);
const cacheKeyFor = (name) => (ENGINE_FILES.includes(name) ? ENGINE_KEY_BASE + name : name);
const fileNameOf = (url) => new URL(url, self.location.href).pathname.split('/').pop();
// 下載到的內容不是這一版而拒絕過的檔案（名稱 → 時間）：Godot 失敗後會重試，短時間內直接拒絕，不重複下載
const REFUSE_MEMORY_MS = 10000;
const recentRefusals = new Map();

/**
 * 請求這個檔案的頁面的版本（頁面網址的 shenma_ver；先看 referrer，沒有再看頁面目前的網址）；不知道時是 null
 * @param {FetchEvent} event
 * @returns {Promise<string|null>}
 */
async function pageVersionOf(event) {
  const fromUrl = (u) => {
    try {
      return new URL(u).searchParams.get(VERSION_PARAM);
    } catch (e) {
      return null;
    }
  };
  const fromReferrer = fromUrl(event.request.referrer || '');
  if (fromReferrer) {
    return fromReferrer;
  }
  const client = event.clientId ? await self.clients.get(event.clientId) : null;
  return client ? fromUrl(client.url) : null;
}

/** 內容已經解壓縮、長度可能不同：去掉 Content-Encoding／Content-Length */
function plainHeaders(headers) {
  const h = new Headers(headers || {});
  h.delete('Content-Encoding');
  h.delete('Content-Length');
  return h;
}

/** 下載的結果 → 200 的 Response */
function responseOf(got) {
  return new Response(got.body, { status: 200, statusText: got.statusText || 'OK', headers: plainHeaders(got.headers) });
}

/**
 * 內容是否是這一版（大小與 sha256）；沒有記錄的檔案（離線頁、圖示）不核對
 * @param {string} name
 * @param {ArrayBuffer} body
 * @returns {Promise<boolean>}
 */
async function isExpected(name, body) {
  const expected = EXPECTED[name];
  if (!expected) {
    return true;
  }
  const data = expected.text ? new Uint8Array(body).filter((b) => b !== 13) : new Uint8Array(body);
  if (data.byteLength !== expected.bytes) {
    return false;
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('') === expected.sha256;
}

/**
 * 從伺服器下載這一版的檔案：向伺服器重新驗證（cache: 'no-cache'，相同時 304、不重新下載；不用 HTTP 快取裡還沒過期的舊檔），
 * 完整讀完並核對才回傳 body。不是 200、網路錯誤、沒讀完或大小不符（size）、內容不是這一版（mismatch）都回傳 body: null 與原因；
 * 讀取中把已下載的位元組交給 onProgress（頁面顯示進度）
 * @param {string} name
 * @param {((loaded: number) => void)|null} onProgress
 */
async function download(name, onProgress) {
  let response;
  try {
    response = await self.fetch(new Request(name, { cache: 'no-cache' }));
  } catch (e) {
    return { body: null, reason: 'network' };
  }
  if (!response || response.status !== 200 || !response.body) {
    return { body: null, reason: 'status', status: response ? response.status : 0 };
  }
  const expected = EXPECTED[name];
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  let reported = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
      loaded += value.byteLength;
      if (expected && !expected.text && loaded > expected.bytes) {
        reader.cancel().catch(() => {});
        return { body: null, reason: 'mismatch' };
      }
      if (onProgress && Date.now() - reported >= 200) {
        reported = Date.now();
        onProgress(loaded);
      }
    }
  } catch (e) {
    return { body: null, reason: 'network' };
  }
  const body = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (onProgress) {
    onProgress(loaded);
  }
  if (!(await isExpected(name, body.buffer))) {
    return { body: null, reason: expected && !expected.text && loaded < expected.bytes ? 'size' : 'mismatch' };
  }
  return { body: body.buffer, headers: response.headers, statusText: response.statusText };
}

/** 告訴頁面（版本守門依此說明，或換成伺服器上的版本） */
async function notifyPage(clientId, message) {
  const client = clientId ? await self.clients.get(clientId) : null;
  if (client) {
    client.postMessage(message);
  }
}

/**
 * 拒絕交付（503）：不是這一版的頁面（page-version／no-page-version），或下載到的不是這一版的完整檔案。
 * 錯的內容不交給頁面、也不放進快取；伺服器可能已經換成別的版本時，檢查 Service Worker 有沒有新版
 * @param {FetchEvent} event
 * @param {string} name
 * @param {string} reason
 * @param {number} [status]
 * @returns {Response}
 */
function refuse(event, name, reason, status) {
  const message = { type: 'shenma-sw-refused', file: name, reason, status: status || 0, version: VERSION };
  event.waitUntil(notifyPage(event.clientId, message).catch(() => {}));
  if (reason === 'mismatch' || reason === 'page-version') {
    event.waitUntil(self.registration.update().catch(() => {}));
  }
  return new Response('Refused: ' + name + ' (' + reason + ')', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Shenma-SW': 'refused; reason=' + reason },
  });
}
`);

const SW_INSTALL = tabs(`self.addEventListener('install', (event) => {
  // 先載入的檔案都必須是這一版（核對過）；任何一個不符就不安裝，舊版本照常運作
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => Promise.all(CACHED_FILES.map(async (name) => {
    const got = await download(name, null);
    if (!got.body) {
      throw new Error('Incomplete or mismatched file: ' + name + ' (' + got.reason + ')');
    }
    await cache.put(name, responseOf(got));
  }))));
});

`);

const SW_ACTIVATE = tabs(`/**
 * 目前開著的頁面（含 iframe，不論由哪個 Service Worker 控制）正在使用的版本：版本目錄上一層之下的第一層目錄名稱
 * @returns {Promise<Set<string>>}
 */
async function versionsInUse() {
  const parent = new URL('../', self.location.href).pathname;
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const out = new Set();
  for (const client of all) {
    const path = new URL(client.url).pathname;
    if (path.startsWith(parent)) {
      out.add(path.slice(parent.length).split('/')[0]);
    }
  }
  return out;
}

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([caches.keys(), versionsInUse().catch(() => null)]).then(
    function ([keys, inUse]) {
      // 只刪這個命名空間（CACHE_PREFIX）裡其他版本的快取；舊正式版（Godot 原本的前綴）與網站其他的快取不動。
      // 還有頁面開著的其他版本保留它的快取，那時也保留所有引擎快取（不知道那一版用哪個引擎）；查不到開著的頁面時都不刪
      if (!inUse) {
        return [];
      }
      inUse.delete(VERSION);
      const keep = (key) => key === CACHE_NAME || key === ENGINE_CACHE || inUse.has(key.slice(CACHE_PREFIX.length)) || (inUse.size > 0 && key.startsWith(CACHE_PREFIX + 'engine-'));
      return Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && !keep(key)).map((key) => caches.delete(key)));
    }
  ).then(function () {
    // 外殼頁的導覽自己向伺服器重新驗證：關掉導覽預載（預載會用 HTTP 快取裡還沒過期的舊頁面；舊版本開啟過）
    return ('navigationPreload' in self.registration) ? self.registration.navigationPreload.disable() : Promise.resolve();
  }).then(function () {
    // 接手範圍內的頁面（第一次開啟的頁面也改由這裡核對）；不是這一版的頁面要的檔案照樣拒絕，不會混版
    return self.clients.claim();
  }));
});

`);

const SW_FETCH = tabs(`/**
 * 外殼頁（index.html）的導覽：這一版的檔案都在快取時用快取的外殼頁（可以離線、成套）。還不完整時向伺服器重新驗證取得：
 * 是這一版就交付並放進快取；是別的版本照樣交付，那一版的外殼頁會先確認控制它的 Service Worker 是同一版（版本守門），
 * 這裡也不會把這一版的檔案交給它。連不上時給離線頁
 * @param {FetchEvent} event
 * @returns {Promise<Response>}
 */
async function serveShell(event) {
  const files = await Promise.all(FULL_CACHE.map((name) => caches.open(cacheNameFor(name)).then((c) => c.match(cacheKeyFor(name)))));
  if (files.every((v) => v !== undefined)) {
    return files[0];
  }
  let response;
  try {
    response = await self.fetch(new Request(CACHED_FILES[0], { cache: 'no-cache' }));
  } catch (e) {
    console.error('Network error: ', e); // eslint-disable-line no-console
    return (await caches.match(OFFLINE_URL)) || Response.error();
  }
  if (response.status !== 200) {
    return response;
  }
  const body = await response.arrayBuffer();
  const shell = { body, headers: response.headers, statusText: response.statusText };
  if (await isExpected(CACHED_FILES[0], body)) {
    const cache = await caches.open(CACHE_NAME);
    event.waitUntil(cache.put(CACHED_FILES[0], responseOf({ ...shell, body: body.slice(0) })).catch(() => {}));
  }
  return responseOf(shell);
}

/**
 * 遊戲檔案（FULL_CACHE）：載入程式、引擎與資料包只交給同一版的頁面。快取裡有（放進快取前都核對過）就用快取，
 * 沒有才下載：完整讀完並核對是這一版才交付並放進快取，否則拒絕（不交付錯的內容）
 * @param {FetchEvent} event
 * @param {string} name
 * @returns {Promise<Response>}
 */
async function serveFile(event, name) {
  if (STRICT_FILES.includes(name)) {
    const page = await pageVersionOf(event);
    if (page !== VERSION) {
      return refuse(event, name, page ? 'page-version' : 'no-page-version');
    }
  }
  const cache = await caches.open(cacheNameFor(name));
  const cached = await cache.match(cacheKeyFor(name));
  if (cached) {
    return cached;
  }
  const refusedAt = recentRefusals.get(name);
  if (refusedAt && Date.now() - refusedAt < REFUSE_MEMORY_MS) {
    return refuse(event, name, 'mismatch');
  }
  const client = event.clientId ? await self.clients.get(event.clientId) : null;
  const expected = EXPECTED[name];
  const onProgress = client && expected ? (loaded) => client.postMessage({ type: 'shenma-sw-progress', file: name, loaded, total: expected.bytes }) : null;
  const got = await download(name, onProgress);
  if (!got.body) {
    if (got.reason === 'mismatch') {
      recentRefusals.set(name, Date.now());
    }
    return refuse(event, name, got.reason, got.status);
  }
  recentRefusals.delete(name);
  const response = responseOf(got);
  event.waitUntil(cache.put(cacheKeyFor(name), response.clone()).catch(() => {}));
  return response;
}

self.addEventListener(
  'fetch',
  /**
   * 外殼頁的導覽與遊戲檔案由 serveShell／serveFile 處理；範圍內其他頁面的導覽先用快取；其他請求只補上跨來源隔離的標頭
   * @param {FetchEvent} event
   */
  (event) => {
    const isNavigate = event.request.mode === 'navigate';
    const url = event.request.url || '';
    const name = fileNameOf(url);
    const isGameFile = FULL_CACHE.includes(name) && new URL(url).pathname === new URL(name, self.location.href).pathname;
    if (isNavigate || isGameFile) {
      event.respondWith((async () => {
        let response;
        if (isNavigate && (name === CACHED_FILES[0] || name === '')) {
          response = await serveShell(event);
        } else if (isNavigate) {
          const cached = isGameFile ? await caches.open(cacheNameFor(name)).then((c) => c.match(cacheKeyFor(name))) : undefined;
          response = cached || await self.fetch(event.request);
        } else {
          response = await serveFile(event, name);
        }
        if (ENSURE_CROSSORIGIN_ISOLATION_HEADERS && response.type !== 'error') {
          response = ensureCrossOriginIsolationHeaders(response);
        }
        return response;
      })());
    } else if (ENSURE_CROSSORIGIN_ISOLATION_HEADERS) {
      event.respondWith((async () => {
        let response = await fetch(event.request);
        response = ensureCrossOriginIsolationHeaders(response);
        return response;
      })());
    }
  }
);

self.addEventListener('message', (event) => {
  // 外殼頁的版本守門：問版本（用傳來的 port 回答）、要求接手（等候中的新版本立即啟用並接手頁面）
  const data = event.data;
  if (!data || typeof data !== 'object') {
    return;
  }
  if (data.type === 'shenma-version' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ type: 'shenma-version', version: VERSION });
  } else if (data.type === 'shenma-claim') {
    event.waitUntil(self.skipWaiting().then(() => self.clients.claim()).catch(() => {}));
  }
});

`);

/** 模板裡整段換掉的區塊：開始（含）到結束（不含）的內容必須和 Godot 4.6.2 的模板相同（sha256） */
const SW_REGIONS = [
  [
    "self.addEventListener('install'",
    "self.addEventListener('activate'",
    "eb500dd0ce073d01564b615c7278b1fcd1f7636a8ed8eebc80112e5df4f84c1e",
    SW_INSTALL,
  ],
  [
    "self.addEventListener('activate'",
    "/**\n * Ensures",
    "e9bbb38d8895a5c04feea4a38f8665ee32771d870926d332865a34683efe2494",
    SW_ACTIVATE,
  ],
  [
    "/**\n * Calls fetch and cache",
    "self.addEventListener('message'",
    "733434db0ad95ed47a2ec067e76a24657f43ed95dc310e3e434fcfff8061c1fa",
    SW_FETCH,
  ],
];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const CACHE_VERSION_LINE = /^const CACHE_VERSION = '[^'\n]*';$/gm;

/** 把 text 裡剛好出現一次的片段換掉（出現次數不是 1 就失敗：模板可能改版） */
function replaceOnce(text, a, b, what) {
  const n = text.split(a).length - 1;
  if (n !== 1)
    throw new Error(
      `${what}模板的片段出現 ${n} 次（模板可能改版）：${a.slice(0, 60)}`
    );
  return text.replace(a, () => b);
}

/** Service Worker：info 是 { version, engine, expected } */
export function patchServiceWorker(src, info) {
  const text = src.replace(/\r\n/g, "\n");
  if (text.includes(MARK))
    throw new Error("Service Worker 已經處理過（重複執行）");
  let out = text;
  for (const [start, end, hash, body] of SW_REGIONS) {
    const n = out.split(start).length - 1;
    const i = out.indexOf(start);
    const j = out.indexOf(end, i + start.length);
    if (n !== 1 || j < 0 || sha256(out.slice(i, j)) !== hash)
      throw new Error(
        `Service Worker 模板的區塊和預期不同（模板可能改版）：${start.slice(0, 40)}`
      );
    out = out.slice(0, i) + body + out.slice(j);
  }
  const helpers = HELPERS.replace("__VERSION__", info.version)
    .replace("__EXPECTED__", JSON.stringify(info.expected))
    .replace("__ENGINE__", info.engine);
  // 快取名稱＝自己的命名空間＋這一版的版本（模板的 CACHE_VERSION 是匯出時間，換成版本後同一版的內容固定）
  const cacheLines = out.match(CACHE_VERSION_LINE) || [];
  if (cacheLines.length !== 1)
    throw new Error(
      `Service Worker 模板的 CACHE_VERSION 出現 ${cacheLines.length} 次（模板可能改版）`
    );
  out = out.replace(
    CACHE_VERSION_LINE,
    () => `const CACHE_VERSION = '${info.version}';`
  );
  out = replaceOnce(
    out,
    `const CACHE_PREFIX = '${TEMPLATE_CACHE_PREFIX}';\n`,
    `const CACHE_PREFIX = '${CACHE_NAMESPACE}';\n`,
    "Service Worker "
  );
  out = replaceOnce(
    out,
    "const FULL_CACHE = CACHED_FILES.concat(CACHEABLE_FILES);\n",
    "const FULL_CACHE = CACHED_FILES.concat(CACHEABLE_FILES);\n" + helpers,
    "Service Worker "
  );
  out = replaceOnce(
    out,
    "\t\t} else if (msg === 'clear') {\n\t\t\tcaches.delete(CACHE_NAME);\n",
    "\t\t} else if (msg === 'clear') {\n\t\t\tcaches.delete(CACHE_NAME);\n\t\t\tcaches.delete(ENGINE_CACHE);\n",
    "Service Worker "
  );
  return out;
}

const GUARD = tabs(`\t\t<script>
${GUARD_MARK}
// 這一版的外殼頁只和同一版的 Service Worker 一起載入：網址加上 shenma_ver=<版本>（Service Worker 依此只交付這一版的檔案），
// 確認控制這個頁面的 Service Worker 是同一版（不是就讓同一版接手；伺服器上沒有這一版時重新載入一次，仍不行就說明）之後，
// 才載入 index.js、開始下載引擎與資料包。Service Worker 下載與核對時送來進度（顯示在進度條），拒絕交付時在這裡說明
window.__shenmaGuard = (function () {
  const VERSION = '${VERSION_PLACEHOLDER}';
  const PARAM = '${VERSION_PARAM}';
  // 自動重新載入的時間（sessionStorage）：一分鐘內只自動重新載入一次，避免一直重新載入
  const RELOAD_KEY = 'shenma_sw_reload';
  const RELOAD_GAP_MS = 60000;
  const UPDATING = '遊戲正在更新，伺服器上的檔案還不是同一個版本。請稍候一分鐘再重新載入。';
  const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
  const swLoaded = {};
  let godot = { current: 0, total: 0 };
  let refused = null;
  let recovering = false;
  // 診斷用：確認版本花的時間、是否由 Service Worker 控制、結果（載入量測會讀）；
  // 引擎啟動時有沒有把焦點交給遊戲畫面（嵌入的網頁正在用焦點時是 false）
  const stats = { ensureMs: null, controlled: null, ok: null, focusedAtStart: null };
  try {
    const url = new URL(location.href);
    if (url.searchParams.get(PARAM) !== VERSION) {
      url.searchParams.set(PARAM, VERSION);
      history.replaceState(history.state, '', url.href);
    }
  } catch (e) {
    // 網址改不了：Service Worker 不知道這個頁面的版本，會拒絕交付並送來原因
  }
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** 問 Service Worker 的版本（沒有回答的舊版本是 null） */
  function ask(worker) {
    return new Promise((resolve) => {
      if (!worker) {
        resolve(null);
        return;
      }
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(null), 1500);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        resolve((event.data && event.data.version) || null);
      };
      try {
        worker.postMessage({ type: 'shenma-version' }, [channel.port2]);
      } catch (e) {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  /** 等安裝中的 Service Worker 裝好或失敗 */
  function settle(worker, ms) {
    return new Promise((resolve) => {
      if (!worker || worker.state !== 'installing') {
        resolve();
        return;
      }
      const timer = setTimeout(resolve, ms);
      worker.addEventListener('statechange', () => {
        if (worker.state !== 'installing') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }

  /**
   * 請 worker 接手這個頁面，等到控制這個頁面的就是它（或逾時）。已經是它時不送：
   * 第一次開啟時它啟用就會接手，在那之後才記「原本的」控制者會一直等不到改變
   */
  async function claimBy(worker, ms) {
    if (sw.controller === worker) {
      return;
    }
    worker.postMessage({ type: 'shenma-claim' });
    const end = Date.now() + ms;
    while (Date.now() < end && sw.controller !== worker) {
      await sleep(50);
    }
  }

  /** 讓同一版的 Service Worker 控制這個頁面；做不到（伺服器上的 Service Worker 是別的版本、裝不起來）時是 false */
  async function ensure() {
    if (!sw) {
      return true;
    }
    let registration;
    try {
      registration = await sw.register('index.service.worker.js');
    } catch (e) {
      // 不能使用 Service Worker（例如瀏覽器設定）：照常從網路載入
      return true;
    }
    for (let round = 0; round < 2; round++) {
      if (sw.controller && (await ask(sw.controller)) === VERSION) {
        return true;
      }
      await settle(registration.installing, 30000);
      let mine = null;
      for (const worker of [registration.waiting, registration.active]) {
        if (!mine && worker && (await ask(worker)) === VERSION) {
          mine = worker;
        }
      }
      if (mine) {
        await claimBy(mine, 15000);
        continue;
      }
      if (round === 0) {
        try {
          await registration.update();
        } catch (e) {
          // 檢查不到新版本：照下面判斷
        }
      }
    }
    return !!sw.controller && (await ask(sw.controller)) === VERSION;
  }

  /** 自動重新載入（一分鐘內只一次）；不能重新載入時是 false */
  function reloadOnce() {
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
      if (Date.now() - last < RELOAD_GAP_MS) {
        return false;
      }
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch (e) {
      return false;
    }
    location.reload();
    return true;
  }

  /** 在外殼頁的狀態區顯示說明（網站的載入畫面會讀到它） */
  function show(text) {
    const status = document.getElementById('status');
    const notice = document.getElementById('status-notice');
    const progress = document.getElementById('status-progress');
    if (!status || !notice) {
      return;
    }
    while (notice.lastChild) {
      notice.removeChild(notice.lastChild);
    }
    notice.appendChild(document.createTextNode(text));
    if (progress) {
      progress.style.display = 'none';
    }
    notice.style.display = 'block';
    status.style.visibility = 'visible';
  }

  /** Service Worker 拒絕交付的原因 → 說明（檔名照原文） */
  function describe(r) {
    const file = r && r.file ? ' ' + r.file + ' ' : '';
    switch (r && r.reason) {
      case 'network':
        return '下載遊戲檔案' + file + '失敗：網路連線中斷或伺服器沒有回應。請確認網路後重新載入。';
      case 'status':
        return '伺服器沒有提供遊戲檔案' + file + '（HTTP ' + r.status + '）。請稍後再重新載入。';
      case 'size':
        return '遊戲檔案' + file + '沒有下載完整。請重新載入。';
      case 'mismatch':
        return '遊戲剛更新，伺服器上的遊戲檔案' + file + '和這次載入的版本不同。請稍候一分鐘再重新載入。';
      default:
        return '這個頁面和目前的遊戲版本不同（' + (r && r.file) + '）。請重新載入。';
    }
  }

  /** 拒絕交付是版本不同：換成伺服器上的版本並重新載入一次；不行就說明 */
  async function recover() {
    if (recovering) {
      return;
    }
    recovering = true;
    try {
      const registration = await sw.getRegistration();
      if (registration) {
        try {
          await registration.update();
        } catch (e) {
          // 檢查不到新版本：仍重新載入一次
        }
        await settle(registration.installing, 30000);
        const waiting = registration.waiting;
        if (waiting && (await ask(waiting)) !== null) {
          await claimBy(waiting, 15000);
        }
      }
    } catch (e) {
      // 換不了：照下面重新載入或說明
    }
    if (!reloadOnce()) {
      show(describe(refused));
    }
  }

  function onMessage(event) {
    const data = event.data;
    if (!data || typeof data !== 'object') {
      return;
    }
    if (data.type === 'shenma-sw-progress' && typeof data.loaded === 'number') {
      swLoaded[data.file] = data.loaded;
      paint();
    } else if (data.type === 'shenma-sw-refused') {
      refused = data;
      console.warn('Service Worker refused ' + data.file + ': ' + data.reason); // eslint-disable-line no-console
      if (data.reason === 'mismatch' || data.reason === 'page-version' || data.reason === 'no-page-version') {
        recover();
      }
    }
  }

  const swTotal = () => Object.keys(swLoaded).reduce((sum, key) => sum + swLoaded[key], 0);

  /** Service Worker 下載中（核對完才交給 Godot）也顯示已下載的位元組 */
  function paint() {
    const bar = document.getElementById('status-progress');
    if (!bar || bar.style.display !== 'block' || !(godot.total > 0)) {
      return;
    }
    const current = Math.min(Math.max(godot.current, swTotal()), godot.total);
    if (current > 0) {
      bar.value = current;
      bar.max = godot.total;
    }
  }

  /** Godot 的進度（onProgress）：顯示 Godot 與 Service Worker 已下載的較大者 */
  function progress(current, total) {
    godot = { current, total };
    return total > 0 ? Math.max(current, Math.min(swTotal(), total)) : current;
  }

  /** Godot 載入失敗（displayFailureNotice）：版本守門已經在處理或知道原因時由這裡說明，回傳 true */
  function handleFailure() {
    if (recovering) {
      return true;
    }
    if (refused) {
      show(describe(refused));
      return true;
    }
    return false;
  }

  /** 引擎啟動（外殼頁的 #status 移除）後執行；沒有啟動（失敗、還在說明）時不執行 */
  function whenStarted(callback) {
    if (!document.getElementById('status')) {
      callback();
      return;
    }
    const observer = new MutationObserver(() => {
      if (!document.getElementById('status')) {
        observer.disconnect();
        callback();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * 把焦點交給遊戲畫面，但嵌入的網頁正在用焦點時不搶（網頁開著視窗、正在輸入）：網頁的焦點在頁面本身、
   * 或已經在這個 iframe 上時才交。Godot 預設在啟動時直接 focus 遊戲畫面（focusCanvas），會把網頁視窗裡的焦點搶走
   */
  function focusWhenFree() {
    const canvas = document.getElementById('canvas');
    if (!canvas) {
      return;
    }
    let free = true;
    try {
      if (window.parent !== window) {
        const doc = window.parent.document;
        const active = doc.activeElement;
        free = !active || active === doc.body || active === doc.documentElement || active === window.frameElement;
      }
    } catch (e) {
      // 跨來源嵌入（看不到網頁的焦點）：照 Godot 原本的行為
      free = true;
    }
    stats.focusedAtStart = free;
    if (free) {
      canvas.focus();
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed loading file ' + src));
      document.body.appendChild(script);
    });
  }

  /** 確認版本後載入 index.js，再執行原本的啟動程式（start） */
  async function boot(start) {
    if (sw) {
      sw.addEventListener('message', onMessage);
      sw.startMessages();
    }
    let ok = true;
    const t0 = Date.now();
    try {
      ok = await ensure();
    } catch (e) {
      ok = true;
    }
    stats.ensureMs = Date.now() - t0;
    stats.controlled = !!(sw && sw.controller);
    stats.ok = ok;
    if (!ok) {
      if (!reloadOnce()) {
        show(UPDATING);
      }
      return;
    }
    try {
      await loadScript('index.js');
    } catch (e) {
      // 拒絕的原因可能稍後才送到
      await sleep(500);
      if (!recovering) {
        show(refused ? describe(refused) : '無法載入遊戲的載入程式（index.js）。請確認網路後重新載入。');
      }
      return;
    }
    // 啟動時不讓 Godot 直接 focus 遊戲畫面，改成啟動後由 focusWhenFree 判斷
    try {
      GODOT_CONFIG.focusCanvas = false;
    } catch (e) {
      // 沒有設定物件：照 Godot 原本的行為
    }
    whenStarted(focusWhenFree);
    start();
  }

  return { boot, progress, handleFailure, stats };
}());
\t\t</script>
`);

/** 外殼頁：加上版本守門（版本先用 VERSION_PLACEHOLDER），index.js 改成確認版本後才載入 */
export function patchHtml(src) {
  const text = src.replace(/\r\n/g, "\n");
  if (text.includes(GUARD_MARK))
    throw new Error("外殼頁已經處理過（重複執行）");
  let out = text;
  out = replaceOnce(
    out,
    '\t\t<script src="index.js"></script>\n',
    GUARD,
    "外殼頁"
  );
  out = replaceOnce(
    out,
    "const engine = new Engine(GODOT_CONFIG);\n",
    "window.__shenmaGuard.boot(function () {\nconst engine = new Engine(GODOT_CONFIG);\n",
    "外殼頁"
  );
  out = replaceOnce(
    out,
    "}());\n\t\t</script>\n\t</body>",
    "}());\n});\n\t\t</script>\n\t</body>",
    "外殼頁"
  );
  out = replaceOnce(
    out,
    "\tfunction displayFailureNotice(err) {\n",
    "\tfunction displayFailureNotice(err) {\n\t\tif (window.__shenmaGuard.handleFailure(err)) {\n\t\t\tinitializing = false;\n\t\t\treturn;\n\t\t}\n",
    "外殼頁"
  );
  out = replaceOnce(
    out,
    "\t\t\t'onProgress': function (current, total) {\n",
    "\t\t\t'onProgress': function (current, total) {\n\t\t\t\tcurrent = window.__shenmaGuard.progress(current, total);\n",
    "外殼頁"
  );
  return out;
}

/** 檔案的大小與 sha256（text 的檔案去掉 CR） */
function fileInfo(name, buf) {
  const text = TEXT_FILES.includes(name);
  const data = text ? stripCR(buf) : buf;
  return text
    ? { bytes: data.length, sha256: sha256(data), text: true }
    : { bytes: data.length, sha256: sha256(data) };
}

/**
 * 版本：外殼頁（版本遮掉）與其他核對檔案的 sha256，加上約定的版本，取 sha256 前 16 碼
 * @param {string} maskedHtml 外殼頁（版本是 VERSION_PLACEHOLDER，LF）
 * @param {Record<string, {sha256: string}>} expected 其他核對檔案
 */
export function versionOf(maskedHtml, expected) {
  const parts = [GUARD_PROTOCOL, "index.html:" + sha256(maskedHtml)];
  for (const f of VERIFIED_FILES)
    if (f !== "index.html") parts.push(`${f}:${expected[f].sha256}`);
  return sha256(parts.join("\n")).slice(0, 16);
}

/** 外殼頁裡的版本（沒有版本守門時是 null） */
export const htmlVersionOf = (html) =>
  (html.replace(/\r\n/g, "\n").match(VERSION_LINE) || [])[1] || null;

/** 外殼頁把版本遮掉（計算與核對版本用） */
export const maskHtmlVersion = (html) =>
  html
    .replace(/\r\n/g, "\n")
    .replace(VERSION_LINE, `\tconst VERSION = '${VERSION_PLACEHOLDER}';`);

/**
 * 處理外殼頁並算出這一版：回傳 { html（已填入版本）, version, engine, expected }
 * @param {(name: string) => Buffer} read 讀匯出目錄的檔案（外殼頁是 Godot 產生、還沒處理過的）
 */
export function buildInfo(read) {
  const maskedHtml = patchHtml(read("index.html").toString("utf8"));
  const expected = {};
  for (const f of VERIFIED_FILES)
    if (f !== "index.html") expected[f] = fileInfo(f, read(f));
  const version = versionOf(maskedHtml, expected);
  const html = maskedHtml.replace(`'${VERSION_PLACEHOLDER}'`, `'${version}'`);
  const engine = sha256(
    Buffer.concat([stripCR(read("index.js")), read("index.wasm")])
  ).slice(0, 16);
  return {
    html,
    version,
    engine,
    expected: {
      "index.html": fileInfo("index.html", Buffer.from(html, "utf8")),
      ...expected,
    },
  };
}

/** 把 CACHE_VERSION 遮掉後的 sha256（記錄模板的版本） */
export const templateHash = (sw) =>
  sha256(
    sw
      .replace(/\r\n/g, "\n")
      .replace(
        /^const CACHE_VERSION = '[^'\n]*';$/m,
        "const CACHE_VERSION = '<masked>';"
      )
  );

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [dir, projectArg] = process.argv.slice(2);
  if (!dir) {
    console.error("用法：node postexport.mjs <匯出目錄> [Godot 專案目錄]");
    process.exit(2);
  }
  const project = resolve(projectArg || join(ROOT, "godot/shenmaSanguo"));
  try {
    for (const f of [...VERIFIED_FILES, "index.service.worker.js"]) {
      if (!existsSync(join(dir, f))) throw new Error(`匯出目錄缺少 ${f}`);
    }
    const bgm = join(project, BGM_SOURCE);
    if (!existsSync(bgm)) throw new Error(`找不到背景音樂 ${bgm}`);
    const info = buildInfo((f) => readFileSync(join(dir, f)));
    const sw = join(dir, "index.service.worker.js");
    const template = readFileSync(sw, "utf8");
    const patched = patchServiceWorker(template, info);
    copyFileSync(bgm, join(dir, BGM_FILE));
    writeFileSync(join(dir, "index.html"), info.html);
    writeFileSync(sw, patched);
    console.log(
      JSON.stringify({
        bgm: {
          file: BGM_FILE,
          bytes: statSync(bgm).size,
          sha256: sha256(readFileSync(bgm)),
        },
        version: info.version,
        engine: info.engine,
        expected: info.expected,
        serviceWorkerTemplateSha256: templateHash(template),
      })
    );
  } catch (e) {
    console.error(String((e && e.message) || e));
    process.exit(1);
  }
}
