# AdSense 審查改善計畫

目標：通過 Google AdSense「缺乏價值的內容」審查。  
送審記錄：第一次送審被拒（2026-06-16），原因：缺乏價值的內容。

---

## 必做項目（完成後再送審）

### 1. 新增 Privacy Policy 頁面

**為什麼：** Footer 的「隱私政策」連結目前指向 `/protected`（登入牆），AdSense 審查員點下去看不到任何隱私政策。Google 政策要求必須揭露廣告資料使用方式。

**要做什麼：**

1. 在 `src/constants/routes.ts` 新增常數：

   ```ts
   PRIVACY: "/privacy",
   CONTACT: "/contact",
   ```

2. 新建 `src/app/(general)/privacy/page.tsx`（純 Server Component，靜態 HTML）：

   - 標題：子yee 萬事屋 隱私權政策
   - 內容段落需涵蓋：
     - 資料收集說明（Google Analytics、AdSense cookie）
     - 廣告服務說明（Google AdSense 使用 cookie 投放個人化廣告）
     - 第三方連結聲明
     - 使用者選擇權（可關閉個人化廣告）
     - 聯絡方式
   - 不需要 `"use client"`，純靜態

3. 修改 `src/components/common/footer.tsx` 第 15 行：
   ```tsx
   // 改前
   <a href="/protected" ...>隱私政策</a>
   // 改後
   <a href="/privacy" ...>隱私政策</a>
   ```

---

### 2. 新增 Contact 頁面

**為什麼：** AdSense 審查需要確認背後有真實的人在維護。沒有聯絡方式的網站被視為「無主」站台。

**要做什麼：**

1. 新建 `src/app/(general)/contact/page.tsx`（純 Server Component）：

   - 標題：聯絡我們
   - 內容：email（qwer820921@gmail.com）、業務說明（技術合作、文章授權等）
   - 可以簡單，但必須有真實 email 可點擊（`mailto:` 連結）

2. 在 `src/config/routes.ts` 的「常用」群組加入 Contact 路由：

   ```ts
   { path: ROUTES.CONTACT, name: "聯絡我們", showInNavbar: true },
   ```

   這樣 Navbar 會自動出現「聯絡我們」連結。

3. 在 `src/components/common/footer.tsx` 加入 Contact 連結，和隱私政策並排：
   ```tsx
   <a href="/contact" ...>聯絡我們</a>
   ```

---

### 3. 修復 About 頁面的「立即聯繫我們」按鈕

**為什麼：** `src/app/(general)/about/components/aboutPage.tsx` 第 240 行的 CTA 按鈕是無效的 `<button>`，點下去沒有任何動作。審查員看到等同於「聯絡功能壞掉」。

**要做什麼：**

修改 `src/app/(general)/about/components/aboutPage.tsx` 第 238–242 行：

```tsx
// 改前
<button className={styles.ctaButton}>立即聯繫我們</button>

// 改後
<a href="/contact" className={styles.ctaButton}>立即聯繫我們</a>
```

同時在 import 加入 Next.js `Link`（或直接用 `<a>`，因為是靜態跳轉即可）。

---

### 4. 為主要工具 / 遊戲頁面加入說明文字

**為什麼：** 工具和遊戲頁面的 pre-rendered HTML 幾乎只有 UI 骨架，沒有可閱讀的 text content。AdSense 爬蟲掃完 40+ 頁後，有實質文字的只有 27 篇部落格，整站顯得「內容稀薄」。

**目標：** 為以下 5 個頁面加入 150–300 字的靜態說明區塊（放在 Server Component 層，確保 HTML 內有文字）。

#### 4a. 發票對獎 `/invoice`

- 位置：`src/app/(tools)/invoice/page.tsx`（在現有 Client Component 上方加靜態 `<section>`）
- 說明內容：台灣統一發票對獎機制說明、每兩個月開獎、如何使用本工具輸入發票號碼對獎

#### 4b. QR Code 產生器 `/qrCodeGenerator`

- 位置：`src/app/(tools)/qrCodeGenerator/page.tsx`
- 說明內容：QR Code 用途介紹、本工具支援的格式（URL、文字）、如何下載使用

#### 4c. AI 圖片去背 `/bgRemover`

- 位置：`src/app/(tools)/bgRemover/page.tsx`
- 說明內容：AI 辨識原理簡述、支援的圖片格式、隱私說明（所有處理在瀏覽器本地完成，不上傳伺服器）

#### 4d. 數獨 `/sudoku`

- 位置：`src/app/(games)/sudoku/page.tsx`
- 說明內容：數獨規則說明、難度等級介紹、遊戲操作方式

#### 4e. 2048 數位拼圖 `/game2048`

- 位置：`src/app/(games)/game2048/page.tsx`
- 說明內容：遊戲起源（2014 年 Gabriele Cirulli）、規則、操作方式（方向鍵 / 滑動）

**實作模式（以發票對獎為例）：**

```tsx
// src/app/(tools)/invoice/page.tsx
import InvoicePage from "./components/InvoicePage"; // 現有 client component

export default function Page() {
  return (
    <>
      <section
        style={{ padding: "1.5rem", maxWidth: "800px", margin: "0 auto" }}
      >
        <h1>台灣統一發票對獎工具</h1>
        <p>
          台灣統一發票每兩個月開獎一次，獎項從特別獎 1000 萬元到兌獎 200
          元不等。
          本工具讓您輸入發票號碼，自動比對當期中獎號碼，快速確認是否中獎。
        </p>
        <p>
          使用方式：輸入您的八位數發票號碼後，系統會自動比對財政部公布的最新中獎號碼，
          並顯示對應的獎項金額。支援同時輸入多張發票。
        </p>
      </section>
      <InvoicePage />
    </>
  );
}
```

---

## 加分項目（等待審查期間持續做）

### 5. 首頁加入網站介紹段落

**為什麼：** 首頁目前是 Hero Banner + 卡片格狀工具列表，幾乎沒有段落文字，搜尋引擎和審查員難以判斷網站主題。

**要做什麼：**

在 `src/app/page.tsx`（Server Component）中，在 `<HomePageContent>` 之前插入一段靜態介紹，或是在 `HomePageContent` 的 Hero 下方加靜態 `<section>`：

```tsx
// 在 src/app/page.tsx 的 return 中加入靜態文字段落
<section style={{ padding: "1rem 2rem", maxWidth: "800px", margin: "0 auto" }}>
  <p>
    子yee 萬事屋是一個技術部落格與實用工具集，涵蓋 AI 應用開發、前端架構、
    資安技術等深度文章，以及台股資訊查詢、圖片處理、發票對獎等日常工具，
    還有多款瀏覽器小遊戲供休閒娛樂。
  </p>
</section>
```

---

### 6. 隱藏測試頁面不被爬蟲索引

**為什麼：** `src/config/routes.ts` 中「測試」群組包含 `/lineTest`（LINE 串接測試）和 `/workPlan`（工時計畫），這些是開發測試用途的未完成頁面，出現在 Navbar 和 Sitemap 中會讓審查員對整站品質扣分。

**要做什麼（兩種方式擇一）：**

方案 A：在兩個 page.tsx 加 noindex（推薦，不影響現有路由）：

```tsx
// src/app/(test)/lineTest/page.tsx 和 workPlan/page.tsx
export const metadata = {
  robots: { index: false, follow: false },
};
```

方案 B：在 `src/config/routes.ts` 將「測試」群組的 `showInNavbar` 全部改為 `false`，讓它們從 Navbar 消失，降低曝光。

---

### 7. 修正 Footer 靜態導出的年份問題

**為什麼：** `src/components/common/footer.tsx` 第 14 行使用 `new Date().getFullYear()`，在靜態導出下這個值在 build time 就固定了，不影響功能，但若長期沒 rebuild 會顯示舊年份，細節影響可信度。

**要做什麼：**

改為寫死範圍（或改成 Client Component 動態顯示）：

```tsx
// 改前
&copy; 2024 – {new Date().getFullYear()} 子yee 萬事屋
// 改後（最簡單）
&copy; 2024 – 2026 子yee 萬事屋
```

同時在這一行補上「聯絡我們」連結：

```tsx
| <a href="/contact" ...>聯絡我們</a>
| <a href="/privacy" ...>隱私政策</a>
```

---

### 8. 部落格文章補充個人觀點段落

**為什麼：** 現有文章結構高度制式化（1. Overview → 2. Architecture → 3. Implementation），容易被判定為 AI 生成內容。加入個人實作心得、踩過的坑、或實際截圖，能增加原創性判分。

**要做什麼：**

在字數較少（< 1000 字）的文章末尾加入「實作心得」或「延伸思考」段落，例如：

```md
## 實作心得

實際導入這套架構時，最大的挑戰是 ... （個人經驗描述）
```

優先處理的文章（按主題重要性排序）：

- `blogContents/implement-mcp-server-for-ai-agents.md`
- `blogContents/synthetic-data-generation-and-validation.md`
- `blogContents/self-healing-e2e-testing-with-playwright-ai.md`

---

## 執行順序

```
Phase 1（送審前必做）
  ├── 項目 1：新增 Privacy Policy 頁面
  ├── 項目 2：新增 Contact 頁面
  ├── 項目 3：修復 About 頁面 CTA 按鈕
  └── 項目 4：5 個頁面加說明文字

Phase 2（等待審查期間）
  ├── 項目 5：首頁加介紹段落
  ├── 項目 6：隱藏測試頁面
  ├── 項目 7：修正 Footer
  └── 項目 8：部落格補充個人觀點
```

---

## 送審記錄

| 次數 | 日期       | 結果 | 備註                |
| ---- | ---------- | ---- | ------------------- |
| 1    | 2026-06-16 | 拒絕 | 缺乏價值的內容      |
| 2    | （待送）   | —    | 完成 Phase 1 後送審 |
