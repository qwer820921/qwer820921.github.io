# clockOut 炫耀分享功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `clockOut` 頁面新增「複製圖片」「複製文案」兩個分享按鈕，讓使用者可以把當下的下班倒數畫面或文字摘要複製到剪貼簿分享出去。

**Architecture:** 新增兩個純函式 util（`shareText.ts` 組文案、`shareImage.ts` 用 `html-to-image` 擷取 DOM 並寫入剪貼簿/退回下載）與一個展示型元件 `ShareControls.tsx`；改造 `clockOut.module.css` 讓左上角「上班設定」與右上角「分享按鈕」共用一個定位容器，桌面絕對定位在左右兩角、手機置中並排。

**Tech Stack:** Next.js (React 19 + TypeScript) 既有的 `clockOut` 工具頁；新增 npm 依賴 `html-to-image`。

**Spec:** `docs/superpowers/specs/2026-08-07-clockout-share-design.md`

## Global Constraints

- 複製圖片範圍僅 `.screen` 節點目前渲染的內容，不含設定/分享按鈕本身、底部圖例文字、頁面背景。
- 圖片複製到剪貼簿失敗（不支援/被拒絕）時**自動退回下載**該 PNG，檔名格式固定為 `clockout-YYYYMMDD-HHmm.png`；下載只是備援，不是主要功能，不另外提供下載按鈕。
- 文案**不含**宣傳連結。
- EXP 條固定 20 格，以 `▓`（實）/`░`（空）表示，格數 = `Math.round(pct / 100 * 20)`。
- 鼓勵語一律用 `CHEERS[Math.floor(pct)]`（`utils/cheers.ts` 既有的 `cheerFor()`）或 `BEFORE_CHEER`，不可自行改寫對應句子。
- 專案目前沒有安裝任何測試框架，本次**不引入**測試框架；驗證以手動腳本（`npx tsx`）+ 手動瀏覽器檢查為主。
- 只新增一個 npm 依賴：`html-to-image`。不新增圖示套件（沿用現有 emoji 文字按鈕風格，直接重用既有 `.clockInBtn` 樣式）。

---

### Task 1: 分享文案組字 `shareText.ts`

**Files:**
- Create: `src/app/(tools)/clockOut/utils/shareText.ts`
- Verify（暫存腳本，驗證完即刪除，不 commit）: `src/app/(tools)/clockOut/utils/_verify-share-text.ts`

**Interfaces:**
- Consumes：`ClockState`（`../types`）、`fmtHM`（`./timeUtils`）、`cheerFor` / `BEFORE_CHEER`（`./cheers`）— 皆為既有匯出，簽章不變。
- Produces：
  - `renderAsciiBar(pct: number, width?: number): string`
  - `buildShareText(state: ClockState, nowMin: number, clockInTime: string, effectiveEnd: string): string`
  - 這兩個函式會被 Task 4 的 `clockOutPage.tsx` 呼叫（只用 `buildShareText`）。

- [ ] **Step 1: 寫驗證腳本（此時 `shareText.ts` 還不存在，預期會失敗）**

建立 `src/app/(tools)/clockOut/utils/_verify-share-text.ts`：

```ts
import { buildShareText, renderAsciiBar } from "./shareText";
import type { ClockState } from "../types";

let failed = false;

function assertEqual(actual: string, expected: string, label: string) {
  if (actual !== expected) {
    failed = true;
    console.error(`FAIL: ${label}`);
    console.error("expected:", JSON.stringify(expected));
    console.error("actual  :", JSON.stringify(actual));
  } else {
    console.log(`PASS: ${label}`);
  }
}

assertEqual(
  renderAsciiBar(92.45283018867924),
  "▓".repeat(18) + "░".repeat(2),
  "renderAsciiBar 92.45%"
);
assertEqual(renderAsciiBar(0), "░".repeat(20), "renderAsciiBar 0%");
assertEqual(renderAsciiBar(100), "▓".repeat(20), "renderAsciiBar 100%");
assertEqual(
  renderAsciiBar(7.58),
  "▓▓" + "░".repeat(18),
  "renderAsciiBar 7.58%"
);

const workState: ClockState = {
  status: "work",
  pct: 92.45283018867924,
  remainingMin: 40,
  cap: "距離下班還有",
  exp: 0,
};
assertEqual(
  buildShareText(workState, 17 * 60 + 10, "09:00", "17:50"),
  [
    "現在時間是 17:10。",
    "",
    "距離您 17:50 下班，還有 40 分鐘。",
    "",
    "下班倒數進度",
    "EXP [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░] 92.45%",
    "倒數計時，心跳加速 💓",
  ].join("\n"),
  "buildShareText 上班中（40 分鐘）"
);

const workLongState: ClockState = {
  status: "work",
  pct: 7.58,
  remainingMin: 501,
  cap: "距離下班還有",
  exp: 0,
};
assertEqual(
  buildShareText(workLongState, 9 * 60 + 39, "09:00", "18:00"),
  [
    "現在時間是 09:39。",
    "",
    "距離您 18:00 下班，還有 8 小時 21 分鐘。",
    "",
    "下班倒數進度",
    "EXP [▓▓░░░░░░░░░░░░░░░░░░] 7.58%",
    "行事曆看起來… 很滿，先無視 📅",
  ].join("\n"),
  "buildShareText 上班中（8小時21分）"
);

const beforeState: ClockState = {
  status: "before",
  pct: 0,
  remainingMin: 30,
  cap: "距離上班還有",
  exp: 0,
};
assertEqual(
  buildShareText(beforeState, 8 * 60 + 30, "09:00", "18:00"),
  [
    "現在時間是 08:30。",
    "",
    "距離 09:00 上班，還有 30 分鐘。",
    "",
    "下班倒數進度",
    "EXP [░░░░░░░░░░░░░░░░░░░░] 0.00%",
    "還沒開工，享受最後的自由 😌",
  ].join("\n"),
  "buildShareText 尚未開工"
);

const doneState: ClockState = {
  status: "done",
  pct: 100,
  remainingMin: 0,
  cap: "狀態",
  exp: 0,
};
assertEqual(
  buildShareText(doneState, 18 * 60 + 5, "09:00", "18:00"),
  [
    "現在時間是 18:05。",
    "",
    "18:00 已下班，自由了！🕊️",
    "",
    "下班倒數進度",
    "EXP [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] 100.00%",
    "下班啦！你自由了 🕊️",
  ].join("\n"),
  "buildShareText 已下班"
);

if (failed) {
  console.error("\n有測試案例失敗");
  process.exit(1);
} else {
  console.log("\n全部通過");
}
```

- [ ] **Step 2: 執行腳本，確認失敗（模組不存在）**

Run: `npx tsx "src/app/(tools)/clockOut/utils/_verify-share-text.ts"`
Expected: 報錯 `Cannot find module './shareText'`（因為 `shareText.ts` 還沒建立）。

- [ ] **Step 3: 實作 `shareText.ts`**

建立 `src/app/(tools)/clockOut/utils/shareText.ts`：

```ts
import { ClockState } from "../types";
import { fmtHM } from "./timeUtils";
import { cheerFor, BEFORE_CHEER } from "./cheers";

const BAR_WIDTH = 20;

export const renderAsciiBar = (
  pct: number,
  width: number = BAR_WIDTH
): string => {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  return "▓".repeat(filled) + "░".repeat(width - filled);
};

const fmtRemaining = (remainingMin: number): string => {
  const h = Math.floor(remainingMin / 60);
  const m = Math.round(remainingMin % 60);
  return h > 0 ? `${h} 小時 ${m} 分鐘` : `${m} 分鐘`;
};

export const buildShareText = (
  state: ClockState,
  nowMin: number,
  clockInTime: string,
  effectiveEnd: string
): string => {
  const nowStr = fmtHM(nowMin);
  const bar = renderAsciiBar(state.pct);
  const pctStr = state.pct.toFixed(2);

  let situation: string;
  let cheer: string;

  if (state.status === "before") {
    situation = `距離 ${clockInTime} 上班，還有 ${fmtRemaining(state.remainingMin)}。`;
    cheer = BEFORE_CHEER;
  } else if (state.status === "done") {
    situation = `${effectiveEnd} 已下班，自由了！🕊️`;
    cheer = cheerFor(100);
  } else {
    situation = `距離您 ${effectiveEnd} 下班，還有 ${fmtRemaining(state.remainingMin)}。`;
    cheer = cheerFor(state.pct);
  }

  return [
    `現在時間是 ${nowStr}。`,
    "",
    situation,
    "",
    "下班倒數進度",
    `EXP [${bar}] ${pctStr}%`,
    cheer,
  ].join("\n");
};
```

- [ ] **Step 4: 重新執行腳本，確認全部通過**

Run: `npx tsx "src/app/(tools)/clockOut/utils/_verify-share-text.ts"`
Expected: 印出 6 行 `PASS: ...` 與最後 `全部通過`，結束碼 0。

- [ ] **Step 5: 刪除暫存驗證腳本**

```bash
rm "src/app/(tools)/clockOut/utils/_verify-share-text.ts"
```

- [ ] **Step 6: Commit**

```bash
git add src/app/\(tools\)/clockOut/utils/shareText.ts
git commit -m "feat: clockOut 新增分享文案組字 buildShareText"
```

---

### Task 2: 圖片擷取與剪貼簿/下載 `shareImage.ts`

**Files:**
- Create: `src/app/(tools)/clockOut/utils/shareImage.ts`
- Modify: `package.json`, `package-lock.json`（新增依賴）

**Interfaces:**
- Consumes：`html-to-image` 的 `toBlob(node: HTMLElement, options?) => Promise<Blob | null>`。
- Produces：
  - `export type ShareImageResult = "clipboard" | "download";`
  - `copyScreenAsImage(node: HTMLElement): Promise<ShareImageResult>` — Task 4 的 `ShareControls.tsx` 會呼叫這個函式，失敗時會 `throw`。

- [ ] **Step 1: 安裝依賴**

```bash
npm install html-to-image
```

- [ ] **Step 2: 實作 `shareImage.ts`**

建立 `src/app/(tools)/clockOut/utils/shareImage.ts`：

```ts
import { toBlob } from "html-to-image";

export type ShareImageResult = "clipboard" | "download";

const pad = (n: number): string => String(n).padStart(2, "0");

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
```

- [ ] **Step 3: 型別檢查**

Run: `npx tsc --noEmit`
Expected: 無輸出（無型別錯誤）。此函式牽涉真實 DOM/剪貼簿行為，完整功能驗證留到 Task 4 整合進頁面後用瀏覽器手動測試。

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json "src/app/(tools)/clockOut/utils/shareImage.ts"
git commit -m "feat: clockOut 新增 copyScreenAsImage（html-to-image 擷取 + 剪貼簿/下載）"
```

---

### Task 3: 頂部控制列改版（CSS + 版面容器）

**Files:**
- Modify: `src/app/(tools)/clockOut/styles/clockOut.module.css:28-34`（`.clockInCorner` 區塊）
- Modify: `src/app/(tools)/clockOut/styles/clockOut.module.css:88-99`（手機媒體查詢區塊）
- Modify: `src/app/(tools)/clockOut/components/clockOutPage.tsx:74-77`

**Interfaces:**
- Produces：CSS class `styles.topControls`、`styles.shareCorner`，Task 4 的 `ShareControls.tsx` 會用到 `styles.shareCorner`（外層容器）與既有的 `styles.clockInBtn`（按鈕樣式，沿用不改）。
- `SettingsControl.tsx` 本身**不需要修改**：它渲染的 `<div className={styles.clockInCorner}>` 維持原樣，只是 `.clockInCorner` 這個 class 的 CSS 定義從「絕對定位在左上角」改成「由外層 `.topControls` 決定定位、自己只負責 `position: relative`（讓內部彈窗能相對定位）」。

- [ ] **Step 1: 改 CSS，把 `.clockInCorner` 的絕對定位交給新的 `.topControls`**

在 `src/app/(tools)/clockOut/styles/clockOut.module.css`，把：

```css
/* ===== 上班時間快速設定（左上角） ===== */
.clockInCorner {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 30;
}
```

改成：

```css
/* ===== 頂部控制列（左：上班設定／右：分享） ===== */
.topControls {
  position: absolute;
  inset: 12px 12px auto 12px;
  z-index: 30;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  pointer-events: none;
}
.clockInCorner,
.shareCorner {
  position: relative;
  pointer-events: auto;
}
.shareCorner {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
```

（`.topControls` 用 `pointer-events: none` 讓左右按鈕之間的空白區域不會擋到底下 `.console` 的點擊，兩個子容器各自設回 `pointer-events: auto`。）

- [ ] **Step 2: 改窄螢幕媒體查詢**

在同一份 CSS 檔案裡，把：

```css
/* 窄螢幕：改為置中在螢幕上方，避免蓋到主畫面 */
@media (max-width: 640px) {
  .clockInCorner {
    position: static;
    align-self: center;
    z-index: 30;
  }
  .clockInPop {
    left: 50%;
    transform: translateX(-50%);
  }
}
```

改成：

```css
/* 窄螢幕：改為置中在螢幕上方，避免蓋到主畫面 */
@media (max-width: 640px) {
  .topControls {
    position: static;
    inset: auto;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 8px;
    align-self: center;
    pointer-events: auto;
  }
  .shareCorner {
    flex-direction: row;
    align-items: center;
  }
  .clockInPop {
    left: 50%;
    transform: translateX(-50%);
  }
}
```

- [ ] **Step 3: 在 `clockOutPage.tsx` 加上共用容器**

在 `src/app/(tools)/clockOut/components/clockOutPage.tsx`，把：

```tsx
      <Container className={styles.container}>
        <SettingsControl />

        <div className={styles.console}>
```

改成：

```tsx
      <Container className={styles.container}>
        <div className={styles.topControls}>
          <SettingsControl />
        </div>

        <div className={styles.console}>
```

（`ShareControls` 會在 Task 4 加進 `.topControls` 裡，這一步先確保既有設定按鈕在新容器下行為不變。）

- [ ] **Step 4: 手動驗證既有設定按鈕行為不變**

```bash
npm run dev
```

打開 `http://localhost:3000/clockOut`（實際 port 依終端機輸出為準），確認：
- 桌面寬度：「🕘 上班設定」按鈕仍在畫面左上角，點擊可正常展開/收合設定彈窗，彈窗內容可正常互動（不會被 `pointer-events: none` 擋住）。
- 瀏覽器寬度縮到 ≤640px：按鈕變成置中在主控台上方，不會跟 `.console` 重疊。
- 瀏覽器 DevTools console 沒有新增錯誤或警告。

- [ ] **Step 5: Commit**

```bash
git add "src/app/(tools)/clockOut/styles/clockOut.module.css" "src/app/(tools)/clockOut/components/clockOutPage.tsx"
git commit -m "refactor: clockOut 頂部控制列改用共用定位容器，為分享按鈕預留右上角"
```

---

### Task 4: 分享按鈕元件 `ShareControls.tsx` 與整合

**Files:**
- Create: `src/app/(tools)/clockOut/components/ShareControls.tsx`
- Modify: `src/app/(tools)/clockOut/components/clockOutPage.tsx`

**Interfaces:**
- Consumes：
  - `copyScreenAsImage(node: HTMLElement): Promise<ShareImageResult>`（Task 2，`../utils/shareImage`）
  - `buildShareText(state, nowMin, clockInTime, effectiveEnd): string`（Task 1，`../utils/shareText`）
  - `styles.shareCorner` / `styles.clockInBtn`（Task 3 CSS）
- Produces：`ShareControls` 元件，props `{ screenRef: React.RefObject<HTMLDivElement | null>; shareText: string }`。

- [ ] **Step 1: 實作 `ShareControls.tsx`**

建立 `src/app/(tools)/clockOut/components/ShareControls.tsx`：

```tsx
"use client";
import React, { useState } from "react";
import styles from "../styles/clockOut.module.css";
import { copyScreenAsImage } from "../utils/shareImage";

interface Props {
  screenRef: React.RefObject<HTMLDivElement | null>;
  shareText: string;
}

const SUCCESS_MS = 2000;
const ERROR_MS = 3000;

const ShareControls: React.FC<Props> = ({ screenRef, shareText }) => {
  const [imageMsg, setImageMsg] = useState<string | null>(null);
  const [textMsg, setTextMsg] = useState<string | null>(null);

  const flash = (
    setMsg: React.Dispatch<React.SetStateAction<string | null>>,
    msg: string,
    duration: number
  ) => {
    setMsg(msg);
    setTimeout(() => setMsg(null), duration);
  };

  const handleCopyImage = async () => {
    if (!screenRef.current) return;
    try {
      const result = await copyScreenAsImage(screenRef.current);
      flash(
        setImageMsg,
        result === "clipboard" ? "✓ 已複製" : "已下載圖片",
        SUCCESS_MS
      );
    } catch {
      flash(setImageMsg, "截圖失敗", ERROR_MS);
    }
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      flash(setTextMsg, "✓ 已複製", SUCCESS_MS);
    } catch {
      flash(setTextMsg, "複製失敗，請手動選取", ERROR_MS);
    }
  };

  return (
    <div className={styles.shareCorner}>
      <button
        type="button"
        className={styles.clockInBtn}
        aria-label="複製圖片"
        onClick={handleCopyImage}
      >
        {imageMsg ?? "📷 複製圖片"}
      </button>
      <button
        type="button"
        className={styles.clockInBtn}
        aria-label="複製文案"
        onClick={handleCopyText}
      >
        {textMsg ?? "📝 複製文案"}
      </button>
    </div>
  );
};

export default ShareControls;
```

- [ ] **Step 2: 在 `clockOutPage.tsx` 接上 `screenRef`、`shareText` 與 `ShareControls`**

在 `src/app/(tools)/clockOut/components/clockOutPage.tsx`，import 區塊（第 14-16 行後）加入：

```tsx
import ShareControls from "./ShareControls";
import { buildShareText } from "../utils/shareText";
```

第 22 行 `const prevDone = useRef(false);` 後面加一行：

```tsx
  const screenRef = useRef<HTMLDivElement>(null);
```

第 55 行 `const state = computeClockState(nowMin, clockInTime, effectiveEnd);` 後面加一行：

```tsx
  const shareText = buildShareText(state, nowMin, clockInTime, effectiveEnd);
```

把 Task 3 產出的：

```tsx
        <div className={styles.topControls}>
          <SettingsControl />
        </div>
```

改成：

```tsx
        <div className={styles.topControls}>
          <SettingsControl />
          <ShareControls screenRef={screenRef} shareText={shareText} />
        </div>
```

把：

```tsx
          <div className={styles.screen}>
```

改成：

```tsx
          <div className={styles.screen} ref={screenRef}>
```

- [ ] **Step 3: 型別與建置檢查**

Run: `npx tsc --noEmit`
Expected: 無型別錯誤。若 `screenRef` 型別跟 `copyScreenAsImage(node: HTMLElement)` 的參數型別對不上，依編譯器實際錯誤訊息調整（例如在 `handleCopyImage` 內已經用 `if (!screenRef.current) return;` 縮窄過型別，通常不需要再改）。

Run: `npm run build`
Expected: build 成功（這會一併跑過 Next.js 的完整型別檢查與 lint）。

- [ ] **Step 4: 手動驗證三種狀態的複製圖片/複製文案**

```bash
npm run dev
```

打開 `http://localhost:3000/clockOut`，用左上角「上班設定」把上班時間、工時、午休調整成可以重現以下三種狀態，每種狀態都各點一次「📷 複製圖片」「📝 複製文案」：

1. **上班中**：確認按鈕短暫顯示「✓ 已複製」（或不支援時顯示「已下載圖片」），貼到系統剪貼簿可用的地方（例如網址列或聊天視窗）確認圖片/文字內容跟畫面一致。
2. **尚未開工**：把上班時間設成比現在晚，確認畫面狀態變成「尚未開工」後複製圖片/文案正常，文案內容符合 `buildShareText` 的 before 分支。
3. **已下班**：把下班時間手動調整成比現在早（觸發加班覆寫），確認畫面變「已下班」、跳出慶祝動畫；點掉慶祝動畫後複製圖片/文案，確認圖片包含 `.doneInline` 水豚提示區塊。

若使用 `gstack` skill 或其他無頭瀏覽器工具，至少確認：頁面無 console 錯誤、點擊按鈕後按鈕文字有依預期切換成「✓ 已複製」/「已下載圖片」/錯誤訊息、`shareText` 內容符合 Task 1 驗證過的格式。

- [ ] **Step 5: 手機寬度驗證**

瀏覽器縮到 ≤640px（或用 DevTools 裝置模擬），確認「🕘 上班設定」「📷 複製圖片」「📝 複製文案」三顆按鈕置中並排在主控台上方，過窄時自動換行，不會跟 `.console` 重疊或互相蓋住。

- [ ] **Step 6: Commit**

```bash
git add "src/app/(tools)/clockOut/components/ShareControls.tsx" "src/app/(tools)/clockOut/components/clockOutPage.tsx"
git commit -m "feat: clockOut 新增複製圖片/複製文案分享按鈕"
```
