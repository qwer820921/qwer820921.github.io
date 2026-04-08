# Implementation Plan - QRCode產生器 (旗艦版)

本計畫將建立一個極致強大的 QR Code 產生工具，整合動態短網址服務並運用 `@g-plane/awesome-qr` 解鎖像素級的視覺特效。
(後續開發改用相容性更佳、支援靜態部署無 native binding 依賴的問題，替換為 `qr-code-styling`)

## 1. 核心技術架構
- **UI 佈局**：Bootstrap 5 Grid + Accordion (管控多樣設定參數)。
- **樣式方案**：CSS Modules (`.module.css`) (Modern Light Glassmorphism)。
- **核心圖形引擎**：`qr-code-styling` (替代 awesome-qr) 負責前端渲染。
- **狀態管理**：Zustand (純記憶體狀態，綁定所有樣式與輸入變數)。

---

## 2. 模組功能佈局

### A. 左側超級控制台 (Settings Accordion)

**【板塊 1：資料類型選擇 (Data Types)】**
提供自定義前綴字串的表單切換：
1. **URL (含動態模式)**：可選靜態或「建立動態追蹤碼 (呼叫 API)」。
2. **Wi-Fi 網路**：輸入 SSID / 密碼 / 加密方式 (WPA/WEP/None)。
3. **電子名片 (vCard)**：輸入姓名 / 電話 / 職稱 / Email 等，一鍵存入通訊錄。
4. **Email / SMS**：預設收件人與主旨/內容。

**【板塊 2：視覺特效與材質 (Visual Effects)】**
提供比原生更炫酷的渲染模式：
1. **背景融合技術**：支援上傳圖片，QR Code 會以半透明方式與背景合而為一。
2. **前景漸層 (Gradients)**：放棄單一純色，可選「線性漸層 (Linear)」或「放射漸層 (Radial)」。
3. **資料點風格 (Dot Styles)**：下拉選單提供不同繪製演算 (正方塊, 圓點 Liquid, 平滑流線)。
4. **Logo 疊加**：正中央品牌標誌 (會自動將容錯率升至 H)。

**【板塊 3：基礎參數與匯出 (Export Options)】**
- **容錯率 (Error Correction)**：L(7%) / M(15%) / Q(25%) / H(30%)。
- **邊緣留白 (Quiet Zone)**：調整周圍白邊。
- **匯出尺寸設定**：提供 `Range Slider` 讓使用者拉動決定像素 (例如 500px ~ 4000px)。

---

### B. 右側即時預覽與動態資訊 (Preview & Dynamic Content)

- **即時視覺回饋**：左側任何參數改變，右側 Canvas 或 Image 標籤即刻更新。
- **下載按鈕**：依據左側設定的格式與尺寸匯出。
- **動態資訊直出 (拋棄式管理)**：
  - 當啟動 URL 的「動態模式」產生後，預覽圖下方自動展開管理區塊。
  - 直接顯示：短網址、Short ID。
  - 直接提供更新表單 (`POST /api/qr/update`)。不依賴持久化，免維護無壓力。

---

## 3. 預計檔案結構
- `src/app/(tools)/qrCodeGenerator/page.tsx`
- `src/app/(tools)/qrCodeGenerator/components/qrCodeGeneratorPage.tsx`
- `src/app/(tools)/qrCodeGenerator/components/QRControlPanel.tsx` (合併表單與樣式設定)
- `src/app/(tools)/qrCodeGenerator/components/QRPreview.tsx` (Canvas / Export 處理)
- `src/app/(tools)/qrCodeGenerator/styles/qrCodeGenerator.module.css`
- `src/app/(tools)/qrCodeGenerator/store/useQRStore.ts` (龐大的參數綜合體)
- `src/app/(tools)/qrCodeGenerator/services/qrApi.ts`

---

## 4. UI 視覺風格
- **明亮磨砂玻璃 (Light Glassmorphism)**：預覽區塊懸浮在半透明白色基底上。控制台採用柔和的折疊面板減少擁擠感，操作直覺流暢。

---

## 5. 驗證計畫
- [x] Data Types：驗證 vCard 與 Wi-Fi 格式字串是否有效組成。
- [x] Engine：確保背景圖片與 Logo 上傳後，能正確融合輸出為二維碼。
- [x] 下載測試：測試 PNG 圖檔匯出。
- [x] 動態更新連通：`POST /api/qr/update` 是否能順利於畫面上直更直出。
