# 品牌官網 + LINE 自助預約平台 - 功能討論紀錄

## 1. 專案背景與目標

根據 Outline 文件 ([連結](https://outline.homebillsystem.com/s/e937de5f-5b95-44c7-89aa-daa70fb79309))，目標是建立一個中型商業 SaaS 預約平台。為了達成快速開發與彈性擴充，系統配置與分析資料將以 NoSQL (JSON) 格式儲存於 Google Sheets。

## 2. 資料儲存設計 (NoSQL on Google Sheets)

### 2.1 Sheet 配置

- **Sheet 名稱**: `BookingSystem_NoSQL`
- **儲存模式**: 垂直結構 (Vertical Mapping)，每一列代表一個功能模組或文件章節。

### 2.2 表格欄位 (Schema)

| 欄位                | 說明           | 範例內容                                          |
| :------------------ | :------------- | :------------------------------------------------ |
| **Col A (key)**     | 模組唯一識別碼 | `missingCoreModules`                              |
| **Col B (order)**   | 排序權重       | `1`                                               |
| **Col C (content)** | JSON 字串內容  | `{"title": "一、缺少的核心模組", "items": [...]}` |

### 2.3 預計儲存的 13 個核心模組 (預覽)

| Key                    | 順序 | 說明                       |
| :--------------------- | :--- | :------------------------- |
| `missingCoreModules`   | 1    | 一、缺少的核心模組         |
| `requiredFeatures`     | 2    | 二、真正需要的功能         |
| `requiredArchitecture` | 3    | 三、真正需要的架構         |
| `missingTasks`         | 4    | 四、你缺少的完整工項       |
| `notificationFrontend` | 5    | 五、通知系統 Frontend 工項 |
| `missingDbTables`      | 6    | 六、DB 少的資料表          |
| `operationalIssues`    | 7    | 七、真正營運後會發生的問題 |
| `matureSystemFeatures` | 8    | 八、真正成熟系統一定有     |
| `qaSupplement`         | 9    | 九、QA 也要補              |
| `saSuggestions`        | 10   | 十、主任 SA 真正建議       |
| `designProposal`       | 11   | 十一、如果是我會這樣設計   |
| `workHours`            | 12   | 十二、真正完整工時         |
| `conclusion`           | 13   | 十三、這就是為什麼         |

## 3. GAS (Google Apps Script) 端介面設計

### 3.1 動作類型 (Actions)

預計在 `doPost` 中實作以下 Action：

1.  **`getBookingOutline`**
    - 說明：取得所有模組資料。
    - 邏輯：讀取 `BookingSystem_NoSQL` 所有的列，按 `order` 排序後轉為 JSON Array 回傳。
2.  **`updateBookingModule`**
    - 參數：`key` (String), `content` (JSON Object)
    - 說明：更新特定模組的 JSON 內容。
    - 邏輯：根據 `key` 搜尋對應列，更新 Col C。
3.  **`upsertBookingModule`**
    - 參數：`key`, `order`, `content`
    - 說明：若 Key 存在則更新，不存在則新增（支援未來的 14, 15, 16 標題）。

## 4. 前端整合設計 (`gasClient.ts`)

### 4.1 資料型別定義

```typescript
interface OutlineModule {
  key: string;
  order: number;
  content: any; // 實際 JSON 結構
}
```

### 4.2 呼叫範例

```typescript
// 取得所有資料
const data = await gasCall<OutlineModule[]>("getBookingOutline");

// 更新特定標題內容
await gasCall("updateBookingModule", {
  key: "missingCoreModules",
  content: { ...newData },
});
```

## 5. 待辦工項與開發時序

1. [ ] **GAS 環境準備**：在 Google Sheet 中建立 `BookingSystem_NoSQL` 工作表並填入標頭。
2. [ ] **GAS 程式碼撰寫**：實作 `get` 與 `update` 邏輯並部署為 Web App。
3. [ ] **前端 Service 介接**：在 `gasClient.ts` 中新增對應的 function。
4. [ ] **UI 實作**：根據 13 個標題建立動態渲染的 Dashboard。

---

_最後更新日期：2026-05-11 22:15_
