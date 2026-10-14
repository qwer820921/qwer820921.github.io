// This service worker is required to expose an exported Godot project as a
// Progressive Web App. It provides an offline fallback page telling the user
// that they need an Internet connection to run the project if desired.
// Incrementing CACHE_VERSION will kick off the install event and force
// previously cached resources to be updated from the network.
/** @type {string} */
const CACHE_VERSION = '31440d05e1959bd7';
/** @type {string} */
const CACHE_PREFIX = 'shenmaSanguo-pkg-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
/** @type {string} */
const OFFLINE_URL = 'index.offline.html';
/** @type {boolean} */
const ENSURE_CROSSORIGIN_ISOLATION_HEADERS = true;
// Files that will be cached on load.
/** @type {string[]} */
const CACHED_FILES = ["index.html","index.js","index.offline.html","index.icon.png","index.apple-touch-icon.png","index.audio.worklet.js","index.audio.position.worklet.js"];
// Files that we might not want the user to preload, and will only be cached on first load.
/** @type {string[]} */
const CACHEABLE_FILES = ["index.wasm","index.pck"];
const FULL_CACHE = CACHED_FILES.concat(CACHEABLE_FILES);

// ── 神馬三國：版本完整性、核對後交付、重新驗證與引擎快取（tools/postexport.mjs）──
// 這一版的識別（外殼頁、載入程式、引擎、資料包與音訊 worklet 的內容決定）。外殼頁的版本守門把它加在頁面網址（shenma_ver），
// 這裡依請求的頁面版本只交付這一版的檔案：不是這一版的頁面（舊版、新版或沒有版本）要載入程式、引擎或資料包時拒絕，不拼成混版
const VERSION = '31440d05e1959bd7';
const VERSION_PARAM = 'shenma_ver';
// 這一版檔案的大小與 sha256：交付與放進快取前核對。text 的檔案去掉 CR 後計算（git 以 LF 保存、部署；Windows 工作樹可能是 CRLF）
const EXPECTED = {"index.html":{"bytes":16936,"sha256":"7712ee6797e7aa0d74ca0e4f74538efbaabc6ee759b150172e10fe9cf4a7b9e2","text":true},"index.js":{"bytes":101996,"sha256":"13646631a9ce5b431a77206492e047916c561ef07512c9f7b48078f69c21d689","text":true},"index.wasm":{"bytes":24230597,"sha256":"bbf69b9161c71064983c5582b8995143e989ca7aad9be8acc270a227cb170a2c"},"index.pck":{"bytes":3134644,"sha256":"728ad7115fd58fc8f71bab17412e189ac77aa03327570ea5f5b616487156f664"},"index.audio.worklet.js":{"bytes":7298,"sha256":"5b476a9c9ce642c0ee4256436d1bc31d9c38f868aca0f9a8e2a57c18d2dec2a3","text":true},"index.audio.position.worklet.js":{"bytes":2973,"sha256":"be33985bc7160d6bf9646f259cd86b259cd67b02ccb297ee5c44f8ac84327bc8","text":true}};
// 必須和頁面同一版才交付的檔案
const STRICT_FILES = ['index.js', 'index.wasm', 'index.pck'];
// 引擎（index.wasm）放在以 index.js 與 index.wasm 內容命名的快取：重新匯出但引擎相同時沿用，不重新下載。
// 每一版的目錄（網址）不同，引擎的快取鍵用版本目錄上一層的固定網址（只當快取鍵，伺服器上沒有這個檔案）：不同版本、同一個引擎時共用
const ENGINE_CACHE = CACHE_PREFIX + 'engine-1cc4187efd95c1aa';
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

self.addEventListener('install', (event) => {
	// 先載入的檔案都必須是這一版（核對過）；任何一個不符就不安裝，舊版本照常運作
	event.waitUntil(caches.open(CACHE_NAME).then((cache) => Promise.all(CACHED_FILES.map(async (name) => {
		const got = await download(name, null);
		if (!got.body) {
			throw new Error('Incomplete or mismatched file: ' + name + ' (' + got.reason + ')');
		}
		await cache.put(name, responseOf(got));
	}))));
});

/**
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

/**
 * Ensures that the response has the correct COEP/COOP headers
 * @param {Response} response
 * @returns {Response}
 */
function ensureCrossOriginIsolationHeaders(response) {
	if (response.headers.get('Cross-Origin-Embedder-Policy') === 'require-corp'
		&& response.headers.get('Cross-Origin-Opener-Policy') === 'same-origin') {
		return response;
	}

	const crossOriginIsolatedHeaders = new Headers(response.headers);
	crossOriginIsolatedHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
	crossOriginIsolatedHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
	const newResponse = new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: crossOriginIsolatedHeaders,
	});

	return newResponse;
}

/**
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

self.addEventListener('message', (event) => {
	// No cross origin
	if (event.origin !== self.origin) {
		return;
	}
	const id = event.source.id || '';
	const msg = event.data || '';
	// Ensure it's one of our clients.
	self.clients.get(id).then(function (client) {
		if (!client) {
			return; // Not a valid client.
		}
		if (msg === 'claim') {
			self.skipWaiting().then(() => self.clients.claim());
		} else if (msg === 'clear') {
			caches.delete(CACHE_NAME);
			caches.delete(ENGINE_CACHE);
		} else if (msg === 'update') {
			self.skipWaiting().then(() => self.clients.claim()).then(() => self.clients.matchAll()).then((all) => all.forEach((c) => c.navigate(c.url)));
		}
	});
});

