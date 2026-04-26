# 神馬三國 — 手機端載入優化計畫

## 現況分析

| 檔案         | 大小         | 說明                                     |
| ------------ | ------------ | ---------------------------------------- |
| `index.pck`  | **70 MB**    | 遊戲資源包（貼圖、場景、腳本）← 主要瓶頸 |
| `index.wasm` | **35 MB**    | Godot 引擎 WebAssembly 本體              |
| `index.js`   | 276 KB       | Godot JS 啟動器                          |
| **合計**     | **≈ 105 MB** | 每次首次訪問都需完整下載                 |

### 現有 export_presets.cfg 已確認的問題設定

```
vram_texture_compression/for_mobile=false   ← 未開啟行動端 VRAM 壓縮
progressive_web_app/enabled=false           ← 未啟用 PWA/Service Worker
variant/thread_support=false                ← 單執行緒模式
```

---

## 優化項目一覽

優先度：⭐⭐⭐⭐⭐ 最高 → ⭐ 最低

---

### 1. ⭐⭐⭐⭐⭐ PWA Service Worker 快取（重複訪問免下載）

**類別：** Godot Export 設定  
**難度：** 低  
**影響：** 首次載入不變，**第二次起近乎即時**

**作法：**
在 `export_presets.cfg` 開啟 PWA：

```
progressive_web_app/enabled=true
progressive_web_app/display=1
progressive_web_app/offline_page=""
```

開啟後 Godot 會自動生成 Service Worker，將 `.pck` / `.wasm` 快取至瀏覽器。
手機使用者第二次打開時無需重新下載（快取有效期由 SW cache busting hash 控制）。

**注意：**

- GitHub Pages 有 HTTPS，Service Worker 可正常運作
- 快取版本更新靠 Godot export 時自動更換 hash
- 需設定 PWA 圖示（`icon_512x512`）以獲得完整 PWA 功能

---

### 2. ⭐⭐⭐⭐⭐ 行動端 VRAM 貼圖壓縮（ETC2）

**類別：** Godot Export 設定 + 貼圖重建  
**難度：** 低（設定）/ 中（驗證）  
**影響：** `.pck` 體積預估減少 **30~50%**（→ 35~50 MB）

**作法：**

```
vram_texture_compression/for_mobile=true
```

Godot 會將所有貼圖轉為 **ETC2** 格式（GPU 原生壓縮）。

| 格式           | 平台支援                      | 壓縮比               |
| -------------- | ----------------------------- | -------------------- |
| WebP（現在）   | 所有平台（CPU 解碼）          | 好                   |
| ETC2（啟用後） | Android 98%+、iOS 需降為 ASTC | 極好（GPU 直接讀取） |

**注意：**

- iOS/Safari 使用 ASTC，Godot 會自動生成兩份（會略增 .pck 大小）
- 啟用後需重新 export 並驗證所有貼圖顯示正確
- 建議同時保留 `vram_texture_compression/for_desktop=true`

---

### 3. ⭐⭐⭐⭐ 多執行緒載入（Thread Support）

**類別：** Godot Export 設定 + GitHub Pages 標頭  
**難度：** 中（需解決 SharedArrayBuffer 標頭問題）  
**影響：** `.wasm` 解析速度提升 **2~4×**、資源載入並行化

**作法：**

Step 1 — 開啟 thread support：

```
variant/thread_support=true
threads/emscripten_pool_size=8
threads/godot_pool_size=4
```

Step 2 — `SharedArrayBuffer` 需要 COOP/COEP 標頭，但 GitHub Pages 不支援自訂標頭。
解法：在 Service Worker 中攔截請求並注入標頭（CoopCoep SW Shim）：

```javascript
// public/coi-serviceworker.js（使用開源 coi-serviceworker 庫）
self.addEventListener("fetch", (e) => {
  if (e.request.cache === "only-if-cached" && e.request.mode !== "same-origin")
    return;
  e.respondWith(
    fetch(e.request).then((response) => {
      const newHeaders = new Headers(response.headers);
      newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
      newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    })
  );
});
```

**注意：**

- 需在 `index.html` 載入 `coi-serviceworker.js`（Godot 自訂 HTML Shell）
- 開源庫：`gzuidhof/coi-serviceworker`（MIT License）
- iOS 16.4+ 支援 SharedArrayBuffer；更舊版本退回單執行緒

---

### 4. ⭐⭐⭐⭐ 載入進度條 UI（體感優化）

**類別：** React 前端  
**難度：** 低  
**影響：** 不縮短實際時間，但大幅降低使用者放棄率

**現況：** `SinglePageContent.tsx` 只顯示 Spinner + 「載入戰場中...」

**作法：**
用 `XMLHttpRequest` 預先下載 `.pck`，追蹤 `onprogress` 事件顯示百分比：

```typescript
// 在 SinglePageContent 掛載時預載
const xhr = new XMLHttpRequest();
xhr.open("GET", "/games/shenmaSanguo/index.pck");
xhr.responseType = "blob";
xhr.onprogress = (e) => {
  if (e.lengthComputable) {
    setLoadProgress(Math.round((e.loaded / e.total) * 100));
  }
};
xhr.onload = () => {
  // .pck 已在瀏覽器快取中，Godot iframe 載入時直接命中
};
xhr.send();
```

顯示：

```
載入中... 47% (33 MB / 70 MB)
████████████░░░░░░░░░
預計剩餘 12 秒
```

**注意：**

- 需搭配 `Service-Worker` 快取才能真正避免重複下載
- GitHub Pages 的 `.pck` 有 CORS 設定，需確認 XHR 可正常存取

---

### 5. ⭐⭐⭐ 資源瘦身（移除未使用 / 縮減貼圖）

**類別：** 資源管理  
**難度：** 中（需人工審查）  
**影響：** 視情況，估計可省下 5~15 MB

**待審查項目：**

| 類別      | 現有數量             | 建議                     |
| --------- | -------------------- | ------------------------ |
| 背景圖    | 6 張（bg_forest0~5） | 確認是否全部用到         |
| 地形 tile | 25 張                | 確認是否全部在關卡中引用 |
| 武將精靈  | 26 × 2 = 52 張       | 確認是否對應實際武將設定 |
| 敵人精靈  | 9 × 2 = 18 張        | 同上                     |
| 防禦塔    | 6 × 2 = 12 張        | 同上                     |

**工具：**  
Godot 匯出時開啟 `export_filter="selected_resources"` 可只打包場景引用到的資源（需手動設定清單，較繁瑣但最精確）。

---

### 6. ⭐⭐⭐ Brotli 壓縮（伺服器端）

**類別：** Hosting / 部署  
**難度：** 中（需遷移或設定）  
**影響：** `.pck` 傳輸體積可再減少 **20~30%**

**說明：**
GitHub Pages 對大多數檔案只提供 **gzip** 壓縮（`.wasm` 除外，現代瀏覽器會自動 gzip .wasm）。
`.pck` 為二進位格式，gzip 效果有限；Brotli 壓縮率更高。

**作法：**

選項 A — 遷移至 **Cloudflare Pages**（免費）：

- 自動 Brotli 壓縮所有靜態資源
- 支援自訂 HTTP 標頭（解決 thread support 問題）
- 部署指令：`git push` 觸發自動部署

選項 B — 保留 GitHub Pages + **Cloudflare CDN 代理**：

- 在 Cloudflare 上設定 domain → GitHub Pages origin
- 啟用 Brotli + HTTP/2 Push

---

### 7. ⭐⭐ 延遲載入地圖資源（架構重構）

**類別：** Godot 架構  
**難度：** 高  
**影響：** 首次啟動時間大幅縮短，但開發成本高

**說明：**
目前所有資源（含所有地圖背景、所有武將貼圖）都打包進同一個 `.pck`。
若改為「核心 .pck（引擎 + 基礎場景）+ 地圖包（按需載入）」架構：

```
index.pck      ← 核心，~10MB（引擎場景）
map_01.pck     ← 第一章地圖資源，~5MB
map_02.pck     ← 第二章，~5MB
...
```

Godot 4 支援 runtime 載入額外 .pck：

```gdscript
ProjectSettings.load_resource_pack("map_01.pck")
```

**注意：**

- 此方案需重構 Godot 場景結構，工程量大
- 建議在其他優化做完後，視需要再評估

---

## 優先執行順序

```
立即可做（低風險、高效益）
  1. 開啟 PWA Service Worker          → 重複訪問免下載
  2. 開啟 mobile VRAM 壓縮（ETC2）    → .pck 縮減 30~50%
  3. 加入載入進度條 UI                 → 改善使用者體感

下一階段（需額外設定）
  4. Thread support + COI SW Shim     → 載入並行化
  5. 資源審查 & 移除未使用貼圖        → 進一步縮減 .pck

長期（視需求評估）
  6. 遷移至 Cloudflare Pages          → Brotli + 自訂標頭
  7. 延遲載入地圖資源（架構重構）     → 最小首次載入體積
```

---

## 預期效果（估算）

| 優化組合           | 首次載入（4G） | 首次載入（3G） | 重複訪問 |
| ------------------ | -------------- | -------------- | -------- |
| 現在               | ~30s           | ~90s           | ~30s     |
| 1+2（PWA + ETC2）  | ~18s           | ~55s           | **<2s**  |
| 1+2+4（加 Thread） | ~12s           | ~38s           | **<2s**  |
| 全部優化           | ~8s            | ~25s           | **<2s**  |

> 數字為估算，實際效果依網路環境、裝置效能、資源實際壓縮率而異。
