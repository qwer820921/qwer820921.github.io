# 10 分鐘信箱 (Ten-Minute Email) 開發文檔

本工具是一套基於 **Next.js** 與 **Cloudflare Workers** 實作的臨時信箱系統，具備現代化的明亮磨砂玻璃視覺與卓越的 RWD 響應式體驗。

## 📂 文檔導覽

| 文件                                                  | 說明                                                      |
| ----------------------------------------------------- | --------------------------------------------------------- |
| [**主開發計畫**](./implementation_plan.md)            | 包含系統架構、狀態管理邏輯與最終實作規格。                |
| [**RWD 佈局計畫**](./implementation_plan_rwd.md)      | 詳細記錄 6:6 分欄設計、Sticky 定位與大螢幕優化細節。      |
| [**彈窗 UX 優化**](./implementation_plan_modal_ux.md) | 記錄明亮磨砂玻璃設計、內置捲動機制以及 CSS 權重優化方案。 |
| [**後端建置指南**](./backend_setup.md)                | 包含 Cloudflare Worker 代理程式碼與 Upstash Redis 配置。  |

---

## 🚀 技術亮項

### 1. 代理模式 (Proxy Pattern)

為了繞過 CORS 限制並保護隱私，所有與 Mail.tm 的溝通均透過 Cloudflare Worker 達成，並使用 Upstash Redis 暫存信箱密碼，實現靜態網頁也能擁有的後端持久化體驗。

### 2. 明亮磨砂視覺 (Light Glassmorphism)

最終捨棄了傳統的深色模式，改用 `rgba(255, 255, 255, 0.75)` 背景與 `30px` 背景模糊。文字採用 `#1e293b`（深石板藍），確保在透視感下的導讀性達到最優。

### 3. 高性能輪詢

實作了 **Visibility API** 整合，只有當分頁處理「可見」狀態時才會發起輪詢請求，大幅節省資源並避免不必要的後端負擔。

### 4. 內置滾動機制 (Internal Scrolling)

針對行動端與長信件優化，彈窗高度限制在 `90vh`，並透過 Flexbox 佈局確保 Header 與 Footer 始終固定，僅讓內文區捲動。

---

## 🛠️ 維護備註

- 修改樣式時請優先鎖定 `tenMinEmail.module.css` 中的 `.modalDialog` 父選擇器，以維持「無 !important」的 CSS 覆蓋規則。
- 若需調整分欄比例，請修改 `TenMinEmailPage.tsx` 中的 `Col lg={6}` 配置。
