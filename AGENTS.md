# AGENTS.md — 子yee 萬事屋 (qwer820921.github.io)

> 本檔案定義 AI 助手在此專案中的開發規範與慣例。所有對程式碼的修改都應遵循以下準則。

---

## 1. 專案概覽

| 項目         | 說明                                                             |
| ------------ | ---------------------------------------------------------------- |
| **專案名稱** | 子yee 萬事屋                                                     |
| **類型**     | 個人多功能平台（工具、遊戲、投資、媒體、部落格）                 |
| **框架**     | Next.js 15 (App Router, Static Export)                           |
| **語言**     | TypeScript (strict mode)                                         |
| **UI 框架**  | React 19 + **Bootstrap 5.3** + **react-bootstrap 2.x**           |
| **狀態管理** | Zustand（各功能模組內 co-located stores）                        |
| **樣式方案** | Bootstrap CSS + CSS Modules (`.module.css`)；**不使用 Tailwind** |
| **部署**     | GitHub Pages (`output: "export"`, `gh-pages`)                    |
| **Linting**  | ESLint 9 + Prettier + Husky + lint-staged                        |

---

## 2. 技術棧規範

### 2.1 絕對禁止

- ❌ **禁止使用 Tailwind CSS** — 專案沒有安裝，也不應安裝
- ❌ **禁止使用 inline style 進行佈局** — 佈局一律使用 Bootstrap Grid
- ❌ **禁止使用 SCSS** — 目前專案未安裝 sass，樣式檔一律使用 `.css` 或 `.module.css`
- ❌ **禁止在 `layout.tsx` 以外的地方重複 `import "bootstrap/dist/css/bootstrap.min.css"`**

### 2.2 UI 佈局規範（Bootstrap Grid）

> ⚠️ **最重要的規則**：所有頁面佈局必須使用 **Bootstrap Grid 系統**

```tsx
// ✅ 正確：使用 react-bootstrap Grid 元件
import { Container, Row, Col } from "react-bootstrap";

export default function MyPage() {
  return (
    <Container>
      <Row>
        <Col xs={12} md={8}>
          主要內容
        </Col>
        <Col xs={12} md={4}>
          側邊欄
        </Col>
      </Row>
    </Container>
  );
}

// ❌ 錯誤：使用 flexbox 或 grid 手動佈局
<div style={{ display: "flex", gap: "16px" }}>...</div>;
```

- 使用 `<Container>`, `<Row>`, `<Col>` 或對應的 class (`container`, `row`, `col-*`)
- 響應式斷點使用 Bootstrap 的 `xs`, `sm`, `md`, `lg`, `xl`, `xxl`
- `ClientLayout.tsx` 中的 `<main>` 已設定 `container-fluid`，頁面內部可直接使用 `<Row>` / `<Col>`

### 2.3 樣式撰寫規範

| 場景                    | 使用方式                                                     |
| ----------------------- | ------------------------------------------------------------ |
| 頁面級樣式              | `PageName.module.css`，放在 `styles/` 或元件同層目錄         |
| 全域樣式                | `src/app/globals.css`                                        |
| Bootstrap 元件樣式      | 直接使用 `react-bootstrap` 元件的 `variant`, `size` 等 props |
| 自訂覆蓋 Bootstrap 主題 | 參見 `.agent/skills/bootstrap-styling/SKILL.md`              |
| 元件間距 / padding      | 優先使用 Bootstrap spacing utilities (`mb-3`, `p-4`, etc.)   |

### 2.4 React 元件規範

- 使用 **函式元件 + Hooks**，不使用 class components
- Client Components 必須在檔案頂端加上 `"use client"`
- 動態載入重量級元件使用 `next/dynamic`（參考 `ClientLayout.tsx` 模式）
- 元件命名使用 **PascalCase**，檔案名使用 **camelCase**（如 `aboutPage.tsx` export `AboutPage`）

---

## 3. 目錄結構

```
src/
├── app/                          # Next.js App Router 路由
│   ├── layout.tsx                # 根 Layout（匯入 Bootstrap CSS）
│   ├── ClientLayout.tsx          # Client Layout（Navbar, Footer, 條件渲染）
│   ├── ClientRoot.tsx            # Client Root Wrapper
│   ├── globals.css               # 全域樣式
│   ├── page.tsx                  # 首頁
│   ├── HomePageContent.tsx       # 首頁客戶端元件
│   ├── (auth)/                   # 認證相關頁面
│   ├── (games)/                  # 遊戲類：2048、數獨、塔防、水彩排序等
│   │   └── [game]/
│   │       ├── components/       # 頁面元件
│   │       ├── store/            # Zustand store（co-located）
│   │       └── styles/           # 頁面專屬樣式
│   ├── (general)/                # 一般頁面：about、blog、novels
│   ├── (investment)/             # 投資工具：stockInfo、crypto
│   ├── (media)/                  # 媒體播放器：ytMusic、soundcloudPlayer
│   └── (tools)/                  # 工具類：animator、eatWhat、invoice、instaStoryEditor
├── components/                   # 共用元件
│   ├── buttons/                  # 按鈕元件
│   ├── common/                   # 通用元件（navbar, footer, bootstrapClient 等）
│   ├── formItems/                # 表單元件（reactSelect 等）
│   └── modals/                   # Modal 元件
├── config/                       # 路由設定、YouTube 設定
├── constants/                    # 靜態常數（routes, seoMap, intervals）
├── contexts/                     # React Context（AuthContext）
├── services/                     # API 服務層（chatApi）
├── types/                        # TypeScript 型別定義
└── utils/                        # 工具函式
```

### 3.1 新功能目錄慣例

新增功能頁面時，遵循以下結構：

```
src/app/(category)/featureName/
├── page.tsx                      # Next.js page（Server Component 薄殼）
├── components/
│   └── featureNamePage.tsx       # 主要 Client Component
├── store/                        # Zustand store（若需要）
│   └── useFeatureStore.ts
└── styles/
    └── featureName.module.css    # 頁面專屬樣式
```

---

## 4. 狀態管理

- **全域認證狀態**：使用 `AuthContext`（`src/contexts/AuthContext.tsx`）
- **功能模組狀態**：使用 **Zustand**，store 檔案 co-located 在功能目錄的 `store/` 下
  - 命名格式：`useXxxStore.ts` 或 `xxxStore.ts`
- **簡易元件狀態**：直接使用 `useState` / `useReducer`

---

## 5. 部署與建置

```bash
npm run dev          # 本地開發
npm run build        # 靜態匯出至 out/
npm run deploy       # 部署至 GitHub Pages
npm run lint         # ESLint 檢查
```

- `next.config.ts` 設定 `output: "export"`（靜態匯出，無 SSR）
- 生產環境 `assetPrefix` 指向 `https://qwer820921.github.io/`
- **所有頁面必須是可靜態匯出的**，不可使用 `getServerSideProps` 或 API Routes

---

## 6. 程式碼風格與 ESLint 規範

此專案設計有嚴格的靜態檢查，且 Next.js 在 `npm run build` 時會將所有 ESLint Error 視為 Fatal Error 並中斷建置。所有 AI 在撰寫程式碼時請嚴格遵守以下約定：

- **JSX 字元跳脫 (Escaping)**：在 React JSX 中輸出字串時，若包含 `>`、`"`、`'`、`}` 等特殊符號，請務必使用 HTML Entity（如 `&quot;`）。嚴禁直接寫出未跳脫的字元（如 `<span>"</span>`），否則會觸發 `react/no-unescaped-entities` 導致無法編譯。
- **嚴禁手動隨意加上 `eslint-disable`**：專案全局已設定好合適的規則放寬（例如針對 `any` 的放寬），切勿預設插入 `// eslint-disable-next-line` 註解，以免反而觸發 `Unused eslint-disable directive` 警告。請信任專案預設的 linter 設定。
- **未使用的 Catch 變數**：在 `try-catch` 中若不需要使用 Error 物件，必須使用 TypeScript 現代語法 `catch { ... }`，不准寫成 `catch (e)` 但卻沒用到，以免觸發 `no-unused-vars`。
- **TypeScript 嚴格模式**：遵循 TS strict mode，盡量定義明確型別，減少 `any` 的直接使用（除非是動態資料如 JSON 處理）。
- **自動排版與匯入**：匯入順序原則為 React/Next → 第三方套件 → 專案內部模組 → 樣式。代碼排版使用 Prettier（透過 Husky hooks 自動執行）。
- **檔案結尾**：檔案結尾需保留一個空行。

---

## 7. 相關 Skills

| Skill                  | 路徑                                       | 說明                                       |
| ---------------------- | ------------------------------------------ | ------------------------------------------ |
| Bootstrap 樣式主題覆蓋 | `.agent/skills/bootstrap-styling/SKILL.md` | 如何透過自訂 CSS 覆蓋 Bootstrap 預設主題色 |

---

## 8. 已知慣例與注意事項

- Bootstrap CSS 在 `layout.tsx` 統一匯入一次（`import "bootstrap/dist/css/bootstrap.min.css"`）
- Bootstrap JS 功能透過 `BootstrapClient` 元件動態載入（`ClientLayout.tsx`）
- 特定頁面（如 `clickAscension`, `novels/reader`）會隱藏 Navbar/Footer
- SEO metadata 定義在各 `page.tsx` 的 `export const metadata`
- 路由 SEO 資料集中管理在 `src/constants/seoMap.ts`
