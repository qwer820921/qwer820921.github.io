# Implementation Plan - RWD Layout Optimization (Split-Screen View)

本計畫旨在改善「10 分鐘信箱」在大螢幕上的空間利用率，將資訊展示與收件清單由「垂直堆疊」改為「橫向併排」。

## 佈局結構變更

### 1. 柵格系統最終配置 (Bootstrap Grid)
- **主要容器**：單一主 `<Row>`。
- **左側欄 (`Col lg={6}`)**：包含臨時地址、更換按鈕及計時器。
- **右側欄 (`Col lg={6}`)**：包含收件匣標題與信件清單。
- **對等設計**：採用 6:6 比例確保兩側資訊具備對等的視覺權重。

### 2. 智慧型定位 (Sticky Tracking)
- **大螢幕模式**：為左側卡片加入 `position: sticky; top: 2rem;`，確保捲動收件匣時，信箱地址與倒數計時始終保持在視窗頂部。
- **行動裝置模式**：取消 sticky 效果，回歸標準的上下捲動結構。

### 3. CSS 實作 (`tenMinEmail.module.css`)
- 使用 `@media (min-width: 992px)` 鎖定大螢幕環境。
- 在大螢幕下移除 `justify-content-center`，使用全寬佈局。

## 預期效果
- **大螢幕**：左 1/2 (資訊) vs 右 1/2 (收件匣)，版面平衡且減少空白浪費。
- **手機端**：保持原有的單欄流暢體驗。
