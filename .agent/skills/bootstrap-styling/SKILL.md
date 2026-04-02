---
name: Bootstrap 樣式主題覆蓋
description: 如何透過自訂 CSS 覆蓋 Bootstrap 5 的預設主題色，以及未來遷移至 SCSS 的指引
---

# Bootstrap 樣式主題覆蓋

> 本 Skill 說明如何在不使用 SCSS 的前提下，透過 CSS Custom Properties 覆蓋 Bootstrap 5 的預設主題色。
> 同時提供未來遷移至 SCSS 方案的完整指引。

---

## 目前狀態

| 項目       | 說明                                       |
| ---------- | ------------------------------------------ |
| Bootstrap  | `^5.3.6`（透過 npm 安裝）                  |
| 匯入方式   | `import "bootstrap/dist/css/bootstrap.min.css"` 於 `layout.tsx` |
| 樣式檔格式 | `.css` / `.module.css`（**未安裝 sass**）  |
| 覆蓋方式   | CSS Custom Properties（CSS 變數）          |

---

## 方法一：用 CSS Custom Properties 覆蓋主題色（目前方案）

Bootstrap 5.3+ 全面使用 CSS Custom Properties，可以直接在 `globals.css` 中覆蓋。

### 1. 覆蓋全域主題色

在 `src/app/globals.css` 中，**於 Bootstrap CSS 匯入之後**的樣式中加入覆蓋：

```css
/* src/app/globals.css */

/* ====== Bootstrap 主題色覆蓋 ====== */
:root {
  /* 主色 (Primary) */
  --bs-primary: #6366f1;
  --bs-primary-rgb: 99, 102, 241;

  /* 次色 (Secondary) */
  --bs-secondary: #8b5cf6;
  --bs-secondary-rgb: 139, 92, 246;

  /* 成功色 (Success) */
  --bs-success: #10b981;
  --bs-success-rgb: 16, 185, 129;

  /* 危險色 (Danger) */
  --bs-danger: #ef4444;
  --bs-danger-rgb: 239, 68, 68;

  /* 警告色 (Warning) */
  --bs-warning: #f59e0b;
  --bs-warning-rgb: 245, 158, 11;

  /* 資訊色 (Info) */
  --bs-info: #06b6d4;
  --bs-info-rgb: 6, 182, 212;

  /* 連結色 */
  --bs-link-color: #6366f1;
  --bs-link-hover-color: #4f46e5;
  --bs-link-color-rgb: 99, 102, 241;
  --bs-link-hover-color-rgb: 79, 70, 229;
}
```

> ⚠️ 注意載入順序：`layout.tsx` 中 `import "./globals.css"` 在 `import "bootstrap/dist/css/bootstrap.min.css"` **之前**，
> 因此 `globals.css` 中的 `:root` 變數**會被 Bootstrap 的 `:root` 覆蓋**。
>
> **解決方法**：提高選擇器權重或使用 `!important`：

```css
/* 方案 A：提高權重 */
:root:root {
  --bs-primary: #6366f1;
  --bs-primary-rgb: 99, 102, 241;
}

/* 方案 B：調整 layout.tsx 中的 import 順序 */
/* 在 layout.tsx 中，將 globals.css 移到 bootstrap 之後 */
```

**建議方案**：調整 `layout.tsx` 中的 import 順序：

```tsx
// src/app/layout.tsx — 推薦的匯入順序
import "bootstrap/dist/css/bootstrap.min.css"; // 1️⃣ 先載入 Bootstrap
import "./globals.css";                         // 2️⃣ 再載入自訂覆蓋
```

### 2. 覆蓋按鈕樣式

```css
/* 覆蓋 .btn-primary 的背景色與邊框色 */
.btn-primary {
  --bs-btn-bg: #6366f1;
  --bs-btn-border-color: #6366f1;
  --bs-btn-hover-bg: #4f46e5;
  --bs-btn-hover-border-color: #4338ca;
  --bs-btn-active-bg: #4338ca;
  --bs-btn-active-border-color: #3730a3;
  --bs-btn-disabled-bg: #6366f1;
  --bs-btn-disabled-border-color: #6366f1;
}

.btn-outline-primary {
  --bs-btn-color: #6366f1;
  --bs-btn-border-color: #6366f1;
  --bs-btn-hover-bg: #6366f1;
  --bs-btn-hover-border-color: #6366f1;
  --bs-btn-active-bg: #4f46e5;
  --bs-btn-active-border-color: #4338ca;
}
```

### 3. 覆蓋 Navbar 樣式

```css
/* 自訂 Navbar 背景（專案已有 .navbar-pastel-blue） */
.navbar-pastel-blue {
  --bs-navbar-bg: linear-gradient(135deg, #e0e7ff 0%, #ede9fe 100%);
  background: linear-gradient(135deg, #e0e7ff 0%, #ede9fe 100%);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  border-bottom: 1px solid rgba(139, 92, 246, 0.1);
}
```

### 4. 覆蓋 Modal / Card 等元件

```css
/* Modal */
.modal-content {
  --bs-modal-bg: #ffffff;
  --bs-modal-border-color: rgba(0, 0, 0, 0.1);
  --bs-modal-border-radius: 1rem;
  --bs-modal-box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
}

/* Card */
.card {
  --bs-card-bg: #ffffff;
  --bs-card-border-color: rgba(0, 0, 0, 0.08);
  --bs-card-border-radius: 0.75rem;
  --bs-card-box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
```

### 5. Dark Mode 覆蓋

```css
[data-bs-theme="dark"] {
  --bs-body-bg: #0f172a;
  --bs-body-color: #e2e8f0;
  --bs-primary: #818cf8;
  --bs-primary-rgb: 129, 140, 248;
}
```

---

## 方法二：遷移至 SCSS 覆蓋（未來方案）

若未來決定引入 SCSS 以獲得更強大的主題自訂能力，依照以下步驟操作：

### Step 1：安裝 sass

```bash
npm install --save-dev sass
```

### Step 2：建立自訂 SCSS 檔案

```
src/
└── styles/
    ├── _variables.scss       # Bootstrap 變數覆蓋
    └── bootstrap-custom.scss # 主入口
```

### Step 3：定義變數覆蓋 (`_variables.scss`)

```scss
// src/styles/_variables.scss
// 在 @import bootstrap 之前定義，用來覆蓋預設值

// ====== 主題色 ======
$primary:   #6366f1;
$secondary: #8b5cf6;
$success:   #10b981;
$danger:    #ef4444;
$warning:   #f59e0b;
$info:      #06b6d4;
$light:     #f8fafc;
$dark:      #1e293b;

// ====== 色彩映射表 ======
$theme-colors: (
  "primary":   $primary,
  "secondary": $secondary,
  "success":   $success,
  "danger":    $danger,
  "warning":   $warning,
  "info":      $info,
  "light":     $light,
  "dark":      $dark,
);

// ====== 字型 ======
$font-family-sans-serif: "Inter", "Noto Sans TC", system-ui, -apple-system, sans-serif;

// ====== 圓角 ======
$border-radius:    0.5rem;
$border-radius-sm: 0.375rem;
$border-radius-lg: 0.75rem;

// ====== 間距 ======
$spacer: 1rem;

// ====== 其他 ======
$enable-negative-margins: true;
$enable-shadows: true;
```

### Step 4：建立主入口 (`bootstrap-custom.scss`)

```scss
// src/styles/bootstrap-custom.scss

// 1. 先載入自訂變數
@import "variables";

// 2. 載入 Bootstrap（使用自訂變數）
@import "bootstrap/scss/bootstrap";

// 3. 載入額外的自訂樣式（可選）
// @import "custom-components";
// @import "custom-utilities";
```

### Step 5：更新 `layout.tsx`

```tsx
// 將原本的
import "bootstrap/dist/css/bootstrap.min.css";
// 改為
import "@/styles/bootstrap-custom.scss";
```

### Step 6：選擇性匯入（效能優化）

若只需要部分 Bootstrap 功能，可改用選擇性匯入：

```scss
// src/styles/bootstrap-custom.scss（最佳化版本）

@import "variables";

// Bootstrap 核心
@import "bootstrap/scss/functions";
@import "bootstrap/scss/variables";
@import "bootstrap/scss/variables-dark";
@import "bootstrap/scss/maps";
@import "bootstrap/scss/mixins";
@import "bootstrap/scss/utilities";

// 只匯入需要的元件
@import "bootstrap/scss/root";
@import "bootstrap/scss/reboot";
@import "bootstrap/scss/type";
@import "bootstrap/scss/containers";
@import "bootstrap/scss/grid";
@import "bootstrap/scss/buttons";
@import "bootstrap/scss/card";
@import "bootstrap/scss/modal";
@import "bootstrap/scss/navbar";
@import "bootstrap/scss/nav";
@import "bootstrap/scss/forms";
@import "bootstrap/scss/spinners";
@import "bootstrap/scss/list-group";
@import "bootstrap/scss/close";
@import "bootstrap/scss/badge";
@import "bootstrap/scss/alert";
@import "bootstrap/scss/dropdown";
@import "bootstrap/scss/transitions";
@import "bootstrap/scss/helpers";
@import "bootstrap/scss/utilities/api";
```

---

## 常用 Bootstrap CSS 變數速查

| 分類     | 變數名                           | 用途             |
| -------- | -------------------------------- | ---------------- |
| 主色     | `--bs-primary`, `--bs-primary-rgb` | 主要品牌色       |
| 次色     | `--bs-secondary`, `--bs-secondary-rgb` | 次要品牌色   |
| 背景     | `--bs-body-bg`, `--bs-body-color` | 頁面背景與文字色 |
| 字型     | `--bs-body-font-family`          | 全域字型         |
| 圓角     | `--bs-border-radius`             | 預設圓角大小     |
| 間距     | `--bs-gutter-x`, `--bs-gutter-y` | Grid 間距        |
| 連結     | `--bs-link-color`, `--bs-link-hover-color` | 連結色彩   |
| 陰影     | `--bs-box-shadow`, `--bs-box-shadow-sm` | 盒陰影       |

---

## 注意事項

1. **CSS 變數方式的限制**：無法覆蓋 Bootstrap 的 Sass `map` 結構（如自動產生的 `bg-primary-subtle` 等 utilities）。若需要這些功能，請遷移至 SCSS 方案。
2. **`react-bootstrap` 元件**：`variant="primary"` 等 prop 會套用 Bootstrap 的 CSS class，因此覆蓋 CSS 變數即可影響這些元件。
3. **CSS Module 中的覆蓋**：在 `.module.css` 中覆蓋 Bootstrap class 時，需使用 `:global()` 包裝：

```css
/* MyPage.module.css */
.pageWrapper :global(.btn-primary) {
  --bs-btn-bg: #6366f1;
}
```
