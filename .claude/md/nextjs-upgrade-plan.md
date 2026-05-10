# Next.js 15 → 16 升級計畫

> 建立日期：2026-05-10  
> 目前版本：`15.5.18`（npm backport tag）  
> 目標版本：`16.2.6`（npm latest tag）  
> 整體風險評估：**低（3 個已知風險，2 個已預先修復）**

---

## 專案現況確認

| 項目              | 狀態                  | 說明                                |
| ----------------- | --------------------- | ----------------------------------- |
| `params` async 化 | ✅ 已完成             | 三個動態路由皆已 `await params`     |
| middleware.ts     | ✅ 無此檔案           | 不需 rename → proxy.ts              |
| webpack 自訂設定  | ✅ 無                 | Turbopack 無縫接手                  |
| React 版本        | ✅ ^19.0.0            | Next.js 16 完整支援                 |
| Static Export     | ✅ `output: "export"` | gh-pages 部署方式不變               |
| Node.js 版本      | ✅ v22.13.0           | 遠超 20.9.0 最低要求                |
| next-mdx-remote   | ✅ ^6.0.0             | peerDeps 只要求 react>=16，完全相容 |
| Sass tilde 引入   | ✅ 無                 | 無 `~bootstrap` 等寫法需修正        |

---

## 已確認的真實風險

### ✅ 風險 1：`npm run lint` 指令失效 → 已修復

**問題**：Next.js 16 完全移除 `next lint` 指令。  
**修復（已完成）**：`package.json` 的 `"lint"` 已改為 `"eslint ."`，驗證通過無報錯。

---

### ✅ 風險 2：雙重 ESLint 設定共存 → 已修復

**問題**：`.eslintrc.json`（legacy）與 `eslint.config.mjs`（Flat Config）並存，前者是死碼。  
**修復（已完成）**：`.eslintrc.json` 已刪除，`eslint.config.mjs` 獨立運作正常。  
**升級後仍需確認**：`eslint-config-next@16` 若 native 支援 Flat Config，`FlatCompat` 包裝層可能需調整，升級後跑一次 `npm run lint` 驗證。

---

### 🟡 風險 3：API Route 在靜態匯出模式（低）

**問題**：`src/app/(tools)/mapEditor/api/upload/route.ts` 是一個使用 `fs/promises` 寫檔的 API Route。  
靜態匯出（`output: "export"`）模式**原本就不支援 API Routes**，Next.js 16 可能在 build 時更明確地報錯或警告。

**現況**：這條路由只在 Vercel / Docker 環境有效，gh-pages 靜態匯出本就不會包含它。  
**修復**：若 build 出現錯誤，可在 route.ts 加上 `export const dynamic = "force-dynamic"` 讓靜態分析跳過，或確認 build 輸出僅在 `isVercel=true` 時才包含此路由。

---

## 主要 Breaking Changes（與本專案相關）

### 1. Turbopack 成為預設 Bundler

- dev / build 預設改用 Turbopack（原 webpack）
- **本專案影響：無**（`next.config.ts` 無 webpack 自訂設定）
- `--turbopack` flag 已不需要加，直接 `next dev` / `next build` 即可

### 2. Async Request APIs（已處理）

Next.js 16 完全移除同步 params 存取，本專案三個動態路由：

| 路由                              | 狀態                                            |
| --------------------------------- | ----------------------------------------------- |
| `blog/[slug]/page.tsx`            | ✅ `params: Promise<{slug}>` + `await params`   |
| `novels/[id]/page.tsx`            | ✅ `params: Promise<{id}>` + `await params`     |
| `novels/reader/[bookId]/page.tsx` | ✅ `params: Promise<{bookId}>` + `await params` |

### 3. ESLint Flat Config

- `eslint-config-next` 改用 Flat Config 格式
- 本專案已使用 `eslint.config.mjs`（Flat Config），`.eslintrc.json` 已提前清除
- **升級後需確認**：`eslint-config-next@16` 可能 native 支援 Flat Config，`FlatCompat` 包裝層需驗證，跑一次 `npm run lint` 確認無誤

### 4. Image 元件行為調整

- `minimumCacheTTL` 預設從 60s → 14400s（4 小時）
- 本專案已設定 `images: { unoptimized: true }`，**不受影響**

### 5. middleware → proxy（不適用）

- 本專案無 middleware.ts，略過

### 6. Node.js 最低要求

- Next.js 16 要求 **Node.js 20.9.0+**
- 升級前請確認本機 Node 版本：`node -v`

---

## 升級步驟

### Step 1：確認 Node.js 版本 ✅ 已確認

```powershell
node -v
# 需要 >= 20.9.0
# 目前：v22.13.0 ✅
```

### Step 2：執行官方 Codemod（推薦先跑）

```powershell
npx @next/codemod@canary upgrade latest
```

此 codemod 可自動處理大部分 breaking change（async params、config 欄位搬移等）。

### Step 3：手動更新套件

```powershell
npm install next@latest eslint-config-next@latest
```

同時確認 `package.json` 中的版本已更新為 `^16.x.x`。

### Step 3.5：修正 lint 指令 + 清理死碼 ✅ 已提前完成

- `package.json` `"lint"` 已改為 `"eslint ."`
- `.eslintrc.json` 已刪除

### Step 4：確認 next.config.ts 無需變動

目前設定已簡潔，**無需修改**：

```ts
// 現有設定相容 Next.js 16，不需要變動
const nextConfig = {
  ...(isVercel ? {} : { output: "export" }),
  reactStrictMode: true,
  images: { unoptimized: true },
  assetPrefix: isVercel ? undefined : "https://qwer820921.github.io/",
};
```

### Step 5：本機 Build 驗證

```powershell
npm run build
```

確認：

- [ ] Build 無 error / warning
- [ ] `out/` 靜態資料夾結構正常
- [ ] `out/index.html` 存在

### Step 6：本機 Dev 驗證

```powershell
npm run dev
```

確認：

- [ ] Turbopack dev server 正常啟動
- [ ] 各頁面路由可正常瀏覽
- [ ] blog `[slug]`、novels `[id]`、novels/reader `[bookId]` 動態路由正常

### Step 7：部署

```powershell
npm run deploy
```

確認 GitHub Pages 部署後靜態頁面正常載入。

---

## 可選強化項目（升級後考慮）

| 功能                   | 設定方式                                            | 說明                       |
| ---------------------- | --------------------------------------------------- | -------------------------- |
| React Compiler         | `reactCompiler: true` in next.config                | 自動 memoization，效能提升 |
| Turbopack 檔案系統快取 | `experimental.turbopackFileSystemCacheForDev: true` | 加快 dev 重啟速度          |
| Cache Components       | `cacheComponents: true`                             | 取代 experimental.ppr      |

---

## 注意事項

- **靜態匯出 RSC 已知 issue**：Next.js 16 靜態匯出 + App Router 有 [RSC 路徑 404 問題](https://github.com/vercel/next.js/issues/85374)，若 client-side navigation 出現 404，先等官方 patch 或暫時降回 15.x。
- `lint-staged` 直接呼叫 `eslint --fix`，升級後不受影響。
- 若有使用 Sass 並以 `~bootstrap/...` tilde prefix 引入，需改為 `bootstrap/...`（本專案確認無此問題）。

---

## 回滾方式

若升級後出現嚴重問題：

```powershell
npm install next@15.5.18 eslint-config-next@15.5.18
npm run build
npm run deploy
```
