---
description: 建立新功能頁面的標準化流程（含路由、SEO、元件、樣式）
---

# 建立新功能頁面 Workflow

## 使用範例

```
/create-new-page

英文名稱：pomodoro
中文名稱：番茄鐘
所屬模組：工具
```

或簡潔寫法：

```
/create-new-page 建立一個叫 pomodoro（番茄鐘）的工具頁面
```

> 使用者會提供：**英文名稱**、**中文名稱**、**所屬模組**
>
> 模組對照表（對應 `src/config/routes.ts` 的 `type` 與 App Router 路由分組）：
>
> | 模組 type | App Router 資料夾 | 說明                                  |
> | --------- | ----------------- | ------------------------------------- |
> | 常用      | `(general)`       | 一般頁面：about、blog、novels         |
> | 遊戲      | `(games)`         | 遊戲類：2048、數獨、塔防等            |
> | 工具      | `(tools)`         | 工具類：animator、eatWhat、invoice 等 |
> | 投資      | `(investment)`    | 投資工具：stockInfo、crypto           |
> | 媒體      | `(media)`         | 媒體播放器：ytMusic、soundcloudPlayer |
> | 帳戶      | `(auth)`          | 認證相關：login                       |
>
> 若使用者指定的模組不在上表中，代表需要**建立新模組**，見下方「新模組額外步驟」。

---

## 前置變數定義

根據使用者輸入，釐清以下變數（以範例 `myFeature` / `我的功能` / `工具` 說明）：

| 變數             | 範例值       | 說明                                       |
| ---------------- | ------------ | ------------------------------------------ |
| `{englishName}`  | `myFeature`  | 英文名稱（camelCase）                      |
| `{EnglishName}`  | `MyFeature`  | PascalCase 版（用於元件 export 名稱）      |
| `{ENGLISH_NAME}` | `MY_FEATURE` | UPPER_SNAKE_CASE 版（用於路由常數）        |
| `{chineseName}`  | `我的功能`   | 中文名稱                                   |
| `{moduleType}`   | `工具`       | 模組 type（常用/遊戲/工具/投資/媒體/帳戶） |
| `{moduleFolder}` | `(tools)`    | App Router 資料夾名                        |

---

## Step 1：新增路由常數

**檔案**：`src/constants/routes.ts`

在 `ROUTES` 物件中新增一行：

```ts
{ENGLISH_NAME}: "/{englishName}", // {chineseName}
```

> 按字母順序或模組分類插入。

---

## Step 2：新增路由設定

**檔案**：`src/config/routes.ts`

在對應 `type: "{moduleType}"` 的 `routeConfig` 陣列中新增：

```ts
{ path: ROUTES.{ENGLISH_NAME}, name: "{chineseName}", showInNavbar: true },
```

> 預設 `showInNavbar: true`。如使用者有指定其他 `RouteConfig` 參數（`protected`、`exact`、`icon`）則一併加入。

---

## Step 3：新增 SEO 設定

**檔案**：`src/constants/seoMap.ts`

新增一筆 SEO entry：

```ts
[ROUTES.{ENGLISH_NAME}]: {
  title: "子yee 萬事屋 | {chineseName} - 簡短副標題",
  description: "一段 50~100 字的頁面描述，包含核心功能與關鍵字。",
  keywords: "子yee 萬事屋, {chineseName}, 相關關鍵字1, 相關關鍵字2",
},
```

> SEO 內容由 AI 根據功能名稱自行發揮合理內容。

---

## Step 4：建立頁面目錄與檔案

在 `src/app/{moduleFolder}/{englishName}/` 下建立以下結構：

```
src/app/{moduleFolder}/{englishName}/
├── page.tsx
├── components/
│   └── {englishName}Page.tsx
├── doc/ (用以存放實作計畫與相關開發討論文件)
│   └── implementation_plan.md
├── store/ (可選)
│   └── use{EnglishName}Store.ts
├── types/
│   └── index.ts
└── styles/
    └── {englishName}.module.css
```

### 4.1 `page.tsx`（Server Component 薄殼）

```tsx
import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import {EnglishName}Page from "./components/{englishName}Page";

// 抓取頁面的 SEO 設定
const seo = seoMap[ROUTES.{ENGLISH_NAME}];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.{ENGLISH_NAME}}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/img11.jpg",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/img11.jpg"],
  },
};

export default function Page() {
  return <{EnglishName}Page />;
}
```

### 4.2 `components/{englishName}Page.tsx`（主要 Client Component）

```tsx
"use client";
import React from "react";
import { Container, Row, Col } from "react-bootstrap";
import styles from "../styles/{englishName}.module.css";

const {EnglishName}Page: React.FC = () => {
  return (
    <Container className={styles.container}>
      <Row>
        <Col xs={12}>
          <h1 className="mb-4">{chineseName}</h1>
          <p>頁面內容開發中...</p>
        </Col>
      </Row>
    </Container>
  );
};

export default {EnglishName}Page;
```

### 4.3 `types/index.ts`

```ts
// {chineseName} 相關型別定義
```

> 初始為空檔案，僅保留註解，待開發時新增型別。

### 4.4 `store/use{EnglishName}Store.ts`（可選）

若該頁面功能較複雜或有跨元件狀態管理需求，建議透過 Zustand 建立 co-located store：

```ts
import { create } from "zustand";

interface {EnglishName}State {
  // 狀態與方法
}

export const use{EnglishName}Store = create<{EnglishName}State>((set) => ({
  // 初始狀態與 setter
}));
```

### 4.5 `doc/implementation_plan.md`（開發文件）

此資料夾用於存放專案開發期間產生的實作計畫與討論結果。

- **情境 A（已有事前討論）**：若在執行此 Workflow 前，我們已經完成了需求討論且系統產生過 `implementation_plan.md`，則必須將該份舊文件遷移或複製到此路徑下保存。
- **情境 B（直接建立）**：若無事前討論直接執行此 Workflow，則此處建立一份空的 `implementation_plan.md`，留作未來紀錄使用。

### 4.6 `styles/{englishName}.module.css`

```css
/* {chineseName} 頁面樣式 */

.container {
  padding-top: 2rem;
  padding-bottom: 2rem;
}
```

---

## 新模組額外步驟（僅當模組不存在時）

若使用者指定的模組 `type` 不在既有分組中：

### A. 建立新的 App Router 分組資料夾

在 `src/app/` 下建立新的 route group 資料夾，命名為 `({newModuleFolder})`。

### B. 在 `src/config/routes.ts` 新增完整分組

在 `routes` 陣列中新增一筆新的 `RouteGroup`：

```ts
{
  type: "{新模組中文名}",
  icon: "/images/icon/{newModule}_icon.webp",
  routeConfig: [
    { path: ROUTES.{ENGLISH_NAME}, name: "{chineseName}", showInNavbar: true },
  ],
},
```

> 圖示檔案路徑先填入預設格式，後續再補上實際圖檔。

---

## 驗證清單

完成所有步驟後，確認以下事項：

- [ ] `src/constants/routes.ts` — 新常數已加入且有中文註解
- [ ] `src/config/routes.ts` — 新路由已加入正確模組分組
- [ ] `src/constants/seoMap.ts` — SEO entry 已加入
- [ ] `page.tsx` — Server Component，匯出 `metadata`
- [ ] `components/{englishName}Page.tsx` — Client Component，有 `"use client"` 宣告
- [ ] `types/index.ts` — 型別檔已建立
- [ ] (可選) `store/use{EnglishName}Store.ts` — 若有複雜狀態需管理，Zustand store 已建立
- [ ] `doc/implementation_plan.md` — 已確認遷移了系統產生的計畫文件 (如果有)，或已建立初始模板
- [ ] `styles/{englishName}.module.css` — CSS Module 樣式檔已建立
- [ ] 執行 `npm run build` 確認無編譯錯誤
