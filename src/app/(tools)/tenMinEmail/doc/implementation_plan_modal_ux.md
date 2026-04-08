# Implementation Plan - Email Detail UI/UX Modernization

本計畫旨在將信件詳情彈窗 (Modal) 優化為更具現代感、清新且高導讀性的 UI。

## UI/UX 最終方案

### 1. 明亮磨砂玻璃 (Light Glassmorphism)
- **背景**：`rgba(255, 255, 255, 0.75)` 背景 + `30px` 模糊。
- **文字**：深色模式文字（石板藍 `#1e293b`），在透明背景下提供最優對比度。
- **亮感優化**：提高 Header 與 Footer 的白色不透明度，增強視覺層次。

### 2. 資訊區域 (Metadata Badges)
- **極簡主義**：取消 Bootstrap Icons，減少視覺雜訊。
- **對等排版**：使用對稱的 6:6 卡片展示「發件人」與「收件時間」。
- **主題色點綴**：標籤（Label）採用青藍色 (`#00f2fe`)，增加品牌辨識度。

### 3. 滾動機制與高度限制
- **防止體溢出**：彈窗總高度限定為 `90vh`。
- **內置捲動**：Header、Metadata 與 Footer 採用固定布局 (`flex-shrink: 0`)，僅信件內文區 (`mailContent`) 具備獨立捲動條。
- **自訂樣式**：使用 8px 寬度的灰階磨砂感捲動條。

### 4. 品質工程
- **CSS 權重**：使用 `.modalDialog` 父選擇器覆蓋 Bootstrap，達成「無 !important」的乾淨樣式碼。

## 預期效果
- 提供如「實體紙張」般的輕盈閱讀感，且在大螢幕與長信件下依然保持操作區域（關閉按鈕、資訊標籤）固定。
