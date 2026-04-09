# Copilot Instructions — 子yee 萬事屋

## 專案資訊

- **框架**：Next.js 15 (App Router, Static Export)
- **語言**：TypeScript (strict mode)
- **UI**：React 19 + Bootstrap 5.3 + react-bootstrap
- **樣式**：Bootstrap CSS + CSS Modules (.module.css)，**禁止使用 Tailwind CSS 和 SCSS**
- **部署**：GitHub Pages (靜態匯出)
- **GitHub**：https://github.com/qwer820921/qwer820921.github.io

## 部署指令

當使用者要求部署至 GitHub Pages 時，請直接在終端機執行：

```bash
npm run deploy
```

這會自動執行 `npm run build`（靜態匯出至 `out/`）+ `gh-pages -d out -t`（推送至 gh-pages 分支）。

## 開發指令

```bash
npm run dev      # 本地開發伺服器
npm run build    # 靜態匯出
npm run lint     # ESLint 檢查
```

## Docker 開發（可選）

```bash
docker compose up -d --build   # 啟動 Docker 開發環境 (Port 3001)
docker compose down            # 停止
```

## 程式碼規範

- 佈局必須使用 Bootstrap Grid（`<Container>`, `<Row>`, `<Col>`），禁止 inline style 佈局
- Client Components 必須加 `"use client"`
- 樣式使用 CSS Modules (`.module.css`)，不使用 Tailwind、不使用 SCSS
- JSX 中的特殊字元必須用 HTML Entity 跳脫（如 `&quot;`）
- 禁止手動加 `eslint-disable` 註解
