# 即時預約引擎（bookingEngine）— 實作計畫

> **模組定位**：PoC 測試頁，用於驗證完整預約流程（SA 第二章）。
> **後端**：沿用既有 GAS Script + Google Sheets（同一份試算表，同一個部署 URL）。
> **班表資料**：無 HQ Admin，採 Mock 資料直接填入 Sheets。
> **前端路徑**：`src/app/(test)/bookingEngine/`

---

## 零、背景與前提條件

### 既有資源（勿重複建立）

| 資源                 | 說明                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------ |
| Google Sheets 試算表 | 與 lineTest 共用同一份                                                               |
| GAS Script           | 與 lineTest 共用，只需新增 function，重新部署即可                                    |
| `gasClient.ts`       | 位於 `src/app/(test)/lineTest/services/gasClient.ts`，bookingEngine 直接 import 使用 |
| `Bookings` 工作表    | 已存在，需確認欄位相容性（見 §1.8）                                                  |

### 既有工作表（不動）

- `Members`
- `Bookings`（需新增欄位，見 §1.8）
- `PasswordResetTokens`

---

## 一、Google Sheets 工作表規格

> **重要**：第一列為欄位標題，欄位名稱必須與下方「第一列」完全一致（大小寫、無空白），GAS 以 `toObjects()` 函式讀取 header 作為 key。

---

### 1.1 `Services`（療程）

**第一列（按此順序建立欄位）：**

```
serviceId | name | duration | buffer | price | description
```

**欄位說明：**

| 欄位          | 型別   | 格式            | 說明                               |
| ------------- | ------ | --------------- | ---------------------------------- |
| `serviceId`   | string | `S001`, `S002`… | 主鍵，手動編號                     |
| `name`        | string | 中文            | 療程名稱，顯示於前端               |
| `duration`    | number | 整數（分鐘）    | 療程本體時長，不含 buffer          |
| `buffer`      | number | 整數（分鐘）    | 療程結束後的緩衝時間（打掃、休息） |
| `price`       | number | 整數（NTD）     | 定價，顯示於確認 Modal             |
| `description` | string | 中文短句        | 簡述，顯示於選擇卡片               |

**完整 Mock 資料（第 2 列起）：**

```
S001 | 深層清潔 | 60 | 15 | 1200 | 專業儀器深層疏通毛孔，改善粉刺與膚況
S002 | TSD 肌底重建 | 90 | 15 | 2800 | 品牌旗艦療程，強化皮膚底層修復與緊緻
S003 | 保濕補水 | 45 | 15 | 980 | 密集補水安撫，適合乾燥或日曬後肌膚
```

---

### 1.2 `Stores`（服務據點）

**第一列：**

```
storeId | name | address | phone
```

**欄位說明：**

| 欄位      | 型別   | 格式              | 說明                 |
| --------- | ------ | ----------------- | -------------------- |
| `storeId` | string | `ST001`, `ST002`… | 主鍵                 |
| `name`    | string | 中文              | 據點名稱，顯示於前端 |
| `address` | string | 中文地址          | 完整地址             |
| `phone`   | string | `0X-XXXX-XXXX`    | 聯絡電話             |

**完整 Mock 資料：**

```
ST001 | 台北總部 | 台北市大安區忠孝東路四段 100 號 3 樓 | 02-2345-6789
ST002 | 新北分店 | 新北市板橋區文化路一段 200 號 2 樓 | 02-8901-2345
```

---

### 1.3 `Beauticians`（美容師）

**第一列：**

```
beauticianId | name | storeId | skillServiceIds | bio
```

**欄位說明：**

| 欄位              | 型別   | 格式                | 說明                                                 |
| ----------------- | ------ | ------------------- | ---------------------------------------------------- |
| `beauticianId`    | string | `B001`, `B002`…     | 主鍵                                                 |
| `name`            | string | 中文                | 姓名，顯示於前端                                     |
| `storeId`         | string | 對應 Stores.storeId | 主要駐點；跨店限制：同一美容師單日僅能在一個據點服務 |
| `skillServiceIds` | string | 逗號分隔，無空白    | 能執行的療程 ID，例如 `S001,S002,S003`               |
| `bio`             | string | 中文短句            | 簡介，顯示於選擇卡片                                 |

**完整 Mock 資料：**

```
B001 | 小美 | ST001 | S001,S002,S003 | 美容資歷 8 年，擅長深層清潔與 TSD 療程
B002 | 小芳 | ST001 | S001,S003 | 清潔護膚專家，細心溫柔，適合敏感肌
B003 | 小琳 | ST002 | S002,S003 | TSD 認證師資，新北分店主理美容師
```

---

### 1.4 `WeeklySchedules`（週固定班表）

> 每一列 = 某美容師在某星期幾的固定工作時段。  
> 同一美容師可有多列（多個上班日）。  
> `dayOfWeek`：`0`=週日, `1`=週一, `2`=週二, `3`=週三, `4`=週四, `5`=週五, `6`=週六

**第一列：**

```
scheduleId | beauticianId | dayOfWeek | startTime | endTime
```

**欄位說明：**

| 欄位           | 型別   | 格式                          | 說明                       |
| -------------- | ------ | ----------------------------- | -------------------------- |
| `scheduleId`   | string | `WS001`…                      | 主鍵                       |
| `beauticianId` | string | 對應 Beauticians.beauticianId |                            |
| `dayOfWeek`    | number | `0`~`6`                       | 整數，0=週日               |
| `startTime`    | string | `HH:mm`（24 小時制）          | 工作開始時間，例如 `09:00` |
| `endTime`      | string | `HH:mm`（24 小時制）          | 工作結束時間，例如 `18:00` |

**完整 Mock 資料（12 列）：**

```
WS001 | B001 | 1 | 09:00 | 18:00
WS002 | B001 | 2 | 09:00 | 18:00
WS003 | B001 | 3 | 09:00 | 18:00
WS004 | B001 | 4 | 09:00 | 18:00
WS005 | B001 | 5 | 09:00 | 18:00
WS006 | B002 | 1 | 10:00 | 19:00
WS007 | B002 | 3 | 10:00 | 19:00
WS008 | B002 | 5 | 10:00 | 19:00
WS009 | B002 | 6 | 10:00 | 17:00
WS010 | B003 | 2 | 09:00 | 18:00
WS011 | B003 | 4 | 09:00 | 18:00
WS012 | B003 | 6 | 09:00 | 15:00
```

> **解讀**：小美（B001）週一到週五 09:00–18:00；小芳（B002）週一三五 10:00–19:00、週六縮短；小琳（B003）週二四六，週六到 15:00。

---

### 1.5 `ExceptionSchedules`（單日例外班表）

> 當某日有此記錄時，**優先於** WeeklySchedules 生效。  
> `type=off`：全天公休，不開放預約。  
> `type=custom`：當日使用自訂時段取代週班表。

**第一列：**

```
exceptionId | beauticianId | date | type | startTime | endTime
```

**欄位說明：**

| 欄位           | 型別   | 格式                          | 說明                            |
| -------------- | ------ | ----------------------------- | ------------------------------- |
| `exceptionId`  | string | `ES001`…                      | 主鍵                            |
| `beauticianId` | string | 對應 Beauticians.beauticianId |                                 |
| `date`         | string | `YYYY-MM-DD`                  | 例外生效的日期                  |
| `type`         | string | `off` 或 `custom`             | `off`=全天休；`custom`=自訂時段 |
| `startTime`    | string | `HH:mm` 或空白                | 僅 `type=custom` 時填寫         |
| `endTime`      | string | `HH:mm` 或空白                | 僅 `type=custom` 時填寫         |

**完整 Mock 資料（示範 3 列）：**

```
ES001 | B001 | 2026-05-12 | off    |       |
ES002 | B001 | 2026-05-20 | custom | 13:00 | 18:00
ES003 | B002 | 2026-05-15 | off    |       |
```

> `type=off` 的 startTime / endTime 欄位留空即可。

---

### 1.6 `Holidays`（國定假日）

> 凡是 Holidays 中有的日期，所有美容師該日皆不開放預約（優先級最高）。

**第一列：**

```
date | description
```

**欄位說明：**

| 欄位          | 型別   | 格式         | 說明                         |
| ------------- | ------ | ------------ | ---------------------------- |
| `date`        | string | `YYYY-MM-DD` | 假日日期                     |
| `description` | string | 中文         | 假日名稱，供閱讀，不影響邏輯 |

**完整 Mock 資料（2026 年，9 列）：**

```
2026-01-01 | 元旦
2026-02-17 | 農曆春節
2026-02-18 | 農曆春節
2026-02-19 | 農曆春節
2026-04-04 | 兒童節
2026-04-05 | 清明節
2026-06-19 | 端午節
2026-09-25 | 中秋節
2026-10-10 | 國慶日
```

---

### 1.7 `SystemParams`（系統參數）

**第一列：**

```
key | value
```

**欄位說明：**

| 欄位    | 型別   | 說明                                     |
| ------- | ------ | ---------------------------------------- |
| `key`   | string | 參數名稱，唯一值                         |
| `value` | string | 參數值（統一用字串儲存，GAS 依需求轉型） |

**完整 Mock 資料（2 列）：**

```
booking_window_days   | 30
cancel_deadline_hours | 24
```

---

### 1.8 `Bookings`（沿用既有工作表，確認欄位）

> 此工作表已存在，GAS 在 bookingEngine 流程中會寫入新預約。  
> 請確認現有欄位包含以下所有欄位；如缺少欄位，請在最右側追加。

**應有的完整欄位（第一列）：**

```
bookingId | lineUserId | beauticianId | serviceId | storeId | date | startTime | endTime | status | createdAt
```

**欄位說明：**

| 欄位           | 型別   | 格式                          | 說明                                                    |
| -------------- | ------ | ----------------------------- | ------------------------------------------------------- |
| `bookingId`    | string | UUID v4                       | 由 GAS 產生，主鍵                                       |
| `lineUserId`   | string | LINE userId 或 email          | 識別預約人；web 登入時填 email                          |
| `beauticianId` | string | 對應 Beauticians.beauticianId |                                                         |
| `serviceId`    | string | 對應 Services.serviceId       |                                                         |
| `storeId`      | string | 對應 Stores.storeId           |                                                         |
| `date`         | string | `YYYY-MM-DD`                  | 預約日期                                                |
| `startTime`    | string | `HH:mm`                       | 預約開始時間                                            |
| `endTime`      | string | `HH:mm`                       | 預約結束時間（startTime + duration，由 GAS 計算後寫入） |
| `status`       | string | `confirmed` / `cancelled`     | 預約狀態                                                |
| `createdAt`    | string | ISO 8601                      | 建立時間，由 GAS 寫入                                   |

> **若欄位已存在但部分欄位缺少**（如 `beauticianId`、`serviceId`、`storeId`），請在標題列補上缺少的欄位，既有資料列對應格留空即可。

---

## 二、GAS 擴充規格

> 在既有 GAS Script 中新增下列函式，並在 `doPost` 的 `actionMap` 中加入對應的 key。

### 2.1 `doPost` actionMap 新增項目

在既有 `actionMap` 物件中加入以下 6 行：

```js
getServices:     () => getServices(),
getStores:       () => getStores(),
getBeauticians:  () => getBeauticians(params),
getSystemParam:  () => getSystemParam(params),
getAvailableDays:  () => getAvailableDays(params),
getAvailableSlots: () => getAvailableSlots(params),
createBookingV2:   () => createBookingV2(params),
```

> `createBookingV2` 與 lineTest 既有的 `createBooking` 邏輯不同（多了療程 / 美容師欄位），故以 `V2` 區分，避免衝突。

---

### 2.2 工具函式（新增於 Script 最上方）

```js
// 將 HH:mm 字串轉為今日的分鐘數（方便比較）
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

// 分鐘數轉 HH:mm 字串
function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}
```

---

### 2.3 `getServices()`

**回傳格式：**

```json
{
  "success": true,
  "services": [
    {
      "serviceId": "S001",
      "name": "深層清潔",
      "duration": 60,
      "buffer": 15,
      "price": 1200,
      "description": "..."
    }
  ]
}
```

**實作：**

```js
function getServices() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Services");
  const rows = toObjects(sheet);
  const services = rows.map((r) => ({
    serviceId: r.serviceId,
    name: r.name,
    duration: Number(r.duration),
    buffer: Number(r.buffer),
    price: Number(r.price),
    description: r.description,
  }));
  return { success: true, services };
}
```

---

### 2.4 `getStores()`

**回傳格式：**

```json
{
  "success": true,
  "stores": [
    { "storeId": "ST001", "name": "台北總部", "address": "...", "phone": "..." }
  ]
}
```

**實作：**

```js
function getStores() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Stores");
  const rows = toObjects(sheet);
  return { success: true, stores: rows };
}
```

---

### 2.5 `getBeauticians(params)`

**請求參數：**

| 參數        | 型別   | 必填 | 說明                       |
| ----------- | ------ | ---- | -------------------------- |
| `storeId`   | string | 否   | 過濾指定據點的美容師       |
| `serviceId` | string | 否   | 過濾具備此療程技能的美容師 |

**回傳格式：**

```json
{
  "success": true,
  "beauticians": [
    {
      "beauticianId": "B001",
      "name": "小美",
      "storeId": "ST001",
      "skillServiceIds": "S001,S002,S003",
      "bio": "..."
    }
  ]
}
```

**實作：**

```js
function getBeauticians(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Beauticians");
  let rows = toObjects(sheet);

  if (params.storeId) {
    rows = rows.filter((r) => r.storeId === params.storeId);
  }
  if (params.serviceId) {
    rows = rows.filter((r) => {
      const skills = r.skillServiceIds.split(",").map((s) => s.trim());
      return skills.includes(params.serviceId);
    });
  }
  return { success: true, beauticians: rows };
}
```

---

### 2.6 `getSystemParam(params)`

**請求參數：**

| 參數  | 型別   | 必填 | 說明     |
| ----- | ------ | ---- | -------- |
| `key` | string | 是   | 參數名稱 |

**回傳格式：**

```json
{ "success": true, "value": "30" }
```

**實作：**

```js
function getSystemParam(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("SystemParams");
  const rows = toObjects(sheet);
  const row = rows.find((r) => r.key === params.key);
  if (!row) return { success: false, error: "param not found" };
  return { success: true, value: row.value };
}
```

---

### 2.7 `getAvailableDays(params)`

**請求參數：**

| 參數           | 型別   | 必填 | 說明                          |
| -------------- | ------ | ---- | ----------------------------- |
| `beauticianId` | string | 是   |                               |
| `serviceId`    | string | 是   | 用於計算 duration + buffer    |
| `windowDays`   | number | 是   | 往後幾天（前端傳入，預設 30） |

**回傳格式：**

```json
{
  "success": true,
  "days": [
    { "date": "2026-05-07", "available": false },
    { "date": "2026-05-08", "available": true },
    ...
  ]
}
```

**實作（完整）：**

```js
function getAvailableDays(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const beauticianId = params.beauticianId;
  const serviceId = params.serviceId;
  const windowDays = Number(params.windowDays) || 30;

  // 取得療程資訊
  const services = toObjects(ss.getSheetByName("Services"));
  const service = services.find((s) => s.serviceId === serviceId);
  if (!service) return { success: false, error: "service not found" };
  const duration = Number(service.duration);
  const buffer = Number(service.buffer);

  // 取得所有相關資料（批次，避免迴圈中重複讀表）
  const allWeekly = toObjects(ss.getSheetByName("WeeklySchedules")).filter(
    (r) => r.beauticianId === beauticianId
  );
  const allExceptions = toObjects(
    ss.getSheetByName("ExceptionSchedules")
  ).filter((r) => r.beauticianId === beauticianId);
  const allHolidays = toObjects(ss.getSheetByName("Holidays"));
  const allBookings = toObjects(ss.getSheetByName("Bookings")).filter(
    (r) => r.beauticianId === beauticianId && r.status === "confirmed"
  );

  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < windowDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = Utilities.formatDate(d, "Asia/Taipei", "yyyy-MM-dd");
    const dayOfWeek = d.getDay(); // 0=Sun

    // 1. 國定假日？
    if (allHolidays.some((h) => h.date === dateStr)) {
      days.push({ date: dateStr, available: false });
      continue;
    }

    // 2. 單日例外？
    const exception = allExceptions.find((e) => e.date === dateStr);
    let workStart = null;
    let workEnd = null;

    if (exception) {
      if (exception.type === "off") {
        days.push({ date: dateStr, available: false });
        continue;
      }
      // type=custom
      workStart = exception.startTime;
      workEnd = exception.endTime;
    } else {
      // 3. 週固定班表
      const weekly = allWeekly.find((w) => Number(w.dayOfWeek) === dayOfWeek);
      if (!weekly) {
        days.push({ date: dateStr, available: false });
        continue;
      }
      workStart = weekly.startTime;
      workEnd = weekly.endTime;
    }

    // 4. 計算是否有空槽
    const startMin = timeToMinutes(workStart);
    const endMin = timeToMinutes(workEnd);
    const dayBookings = allBookings.filter((b) => b.date === dateStr);

    let hasSlot = false;
    let slotMin = startMin;
    while (slotMin + duration <= endMin) {
      const slotEnd = slotMin + duration + buffer;
      const conflict = dayBookings.some((b) => {
        const bStart = timeToMinutes(b.startTime);
        const bEnd = bStart + duration + buffer;
        return slotMin < bEnd && slotEnd > bStart;
      });
      if (!conflict) {
        hasSlot = true;
        break;
      }
      slotMin += duration + buffer;
    }

    days.push({ date: dateStr, available: hasSlot });
  }

  return { success: true, days };
}
```

---

### 2.8 `getAvailableSlots(params)`

**請求參數：**

| 參數           | 型別   | 必填 | 說明         |
| -------------- | ------ | ---- | ------------ |
| `beauticianId` | string | 是   |              |
| `serviceId`    | string | 是   |              |
| `date`         | string | 是   | `YYYY-MM-DD` |

**回傳格式：**

```json
{
  "success": true,
  "slots": [
    { "startTime": "09:00", "endTime": "10:00", "available": true },
    { "startTime": "10:15", "endTime": "11:15", "available": false }
  ]
}
```

> `available: false` 表示該時段已被預約，前端顯示為灰色 disabled 按鈕。

**實作（完整）：**

```js
function getAvailableSlots(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const { beauticianId, serviceId, date } = params;

  // 取得療程資訊
  const services = toObjects(ss.getSheetByName("Services"));
  const service = services.find((s) => s.serviceId === serviceId);
  if (!service) return { success: false, error: "service not found" };
  const duration = Number(service.duration);
  const buffer = Number(service.buffer);

  // 國定假日
  const holidays = toObjects(ss.getSheetByName("Holidays"));
  if (holidays.some((h) => h.date === date))
    return { success: true, slots: [] };

  // 單日例外
  const exceptions = toObjects(ss.getSheetByName("ExceptionSchedules"));
  const exception = exceptions.find(
    (e) => e.beauticianId === beauticianId && e.date === date
  );

  let workStart, workEnd;
  if (exception) {
    if (exception.type === "off") return { success: true, slots: [] };
    workStart = exception.startTime;
    workEnd = exception.endTime;
  } else {
    // 週固定班表
    const d = new Date(date + "T00:00:00+08:00");
    const dayOfWeek = d.getDay();
    const weekly = toObjects(ss.getSheetByName("WeeklySchedules"));
    const schedule = weekly.find(
      (w) =>
        w.beauticianId === beauticianId && Number(w.dayOfWeek) === dayOfWeek
    );
    if (!schedule) return { success: true, slots: [] };
    workStart = schedule.startTime;
    workEnd = schedule.endTime;
  }

  // 生成候選時段
  const startMin = timeToMinutes(workStart);
  const endMin = timeToMinutes(workEnd);
  const candidates = [];
  let slotMin = startMin;
  while (slotMin + duration <= endMin) {
    candidates.push(slotMin);
    slotMin += duration + buffer;
  }

  // 取當日已確認預約
  const bookings = toObjects(ss.getSheetByName("Bookings")).filter(
    (b) =>
      b.beauticianId === beauticianId &&
      b.date === date &&
      b.status === "confirmed"
  );

  // 判斷每個候選是否被佔用
  const slots = candidates.map((slotMin) => {
    const slotEnd = slotMin + duration;
    const occupied = bookings.some((b) => {
      const bStart = timeToMinutes(b.startTime);
      const bEnd = bStart + duration + buffer;
      return slotMin < bEnd && slotMin + duration > bStart;
    });
    return {
      startTime: minutesToTime(slotMin),
      endTime: minutesToTime(slotEnd),
      available: !occupied,
    };
  });

  return { success: true, slots };
}
```

---

### 2.9 `createBookingV2(params)`

**請求參數：**

| 參數           | 型別   | 必填 | 說明                             |
| -------------- | ------ | ---- | -------------------------------- |
| `lineUserId`   | string | 是   | LINE userId 或 web session email |
| `beauticianId` | string | 是   |                                  |
| `serviceId`    | string | 是   |                                  |
| `storeId`      | string | 是   |                                  |
| `date`         | string | 是   | `YYYY-MM-DD`                     |
| `startTime`    | string | 是   | `HH:mm`                          |

**回傳格式（成功）：**

```json
{ "success": true, "bookingId": "uuid-v4" }
```

**回傳格式（時段衝突）：**

```json
{ "success": false, "error": "已有人於該時段預約，請更換時段" }
```

**實作（含 concurrency double-check）：**

```js
function createBookingV2(params) {
  const { lineUserId, beauticianId, serviceId, storeId, date, startTime } =
    params;

  // Double-check：重新計算可用時段
  const slotsResult = getAvailableSlots({ beauticianId, serviceId, date });
  if (!slotsResult.success) return { success: false, error: "slots error" };

  const targetSlot = slotsResult.slots.find((s) => s.startTime === startTime);
  if (!targetSlot || !targetSlot.available) {
    return { success: false, error: "已有人於該時段預約，請更換時段" };
  }

  // 取得 duration 算 endTime
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const services = toObjects(ss.getSheetByName("Services"));
  const service = services.find((s) => s.serviceId === serviceId);
  const duration = Number(service.duration);
  const endTime = minutesToTime(timeToMinutes(startTime) + duration);

  // 產生 UUID（GAS 無內建，用時間戳 + 隨機數替代）
  const bookingId = Utilities.getUuid();

  // 寫入 Bookings
  const sheet = ss.getSheetByName("Bookings");
  sheet.appendRow([
    bookingId,
    lineUserId,
    beauticianId,
    serviceId,
    storeId,
    date,
    startTime,
    endTime,
    "confirmed",
    new Date().toISOString(),
  ]);

  return { success: true, bookingId };
}
```

> **注意**：`Utilities.getUuid()` 是 GAS 內建函式，直接可用，無需引入套件。

---

## 三、前端型別定義（`types/index.ts`）

> 路徑：`src/app/(test)/bookingEngine/types/index.ts`  
> 完整覆寫（初始為空，現在需要完整型別）。

```ts
// ---- 後端資料型別 ----

export interface Service {
  serviceId: string;
  name: string;
  duration: number; // 分鐘
  buffer: number; // 分鐘
  price: number; // NTD
  description: string;
}

export interface Store {
  storeId: string;
  name: string;
  address: string;
  phone: string;
}

export interface Beautician {
  beauticianId: string;
  name: string;
  storeId: string;
  skillServiceIds: string; // 逗號分隔原始字串
  bio: string;
}

export interface TimeSlot {
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  available: boolean;
}

export interface DayAvailability {
  date: string; // YYYY-MM-DD
  available: boolean;
}

// ---- 前端狀態型別 ----

export type BookingEngineStep =
  | "selectService"
  | "selectStore"
  | "selectBeautician"
  | "calendar"
  | "success";

export interface BookingEngineState {
  // 導覽
  step: BookingEngineStep;

  // 系統參數（前端可調整）
  windowDays: number;

  // 選擇結果
  selectedService: Service | null;
  selectedStore: Store | null;
  selectedBeautician: Beautician | null;
  selectedDate: string | null;
  selectedSlot: TimeSlot | null;

  // 後端資料 cache
  services: Service[];
  stores: Store[];
  beauticians: Beautician[];
  availableDays: DayAvailability[];
  timeSlots: TimeSlot[];

  // Modal 控制
  showSlotModal: boolean;
  showConfirmModal: boolean;

  // UI 狀態
  loading: boolean;
  error: string | null;

  // Actions
  setStep: (step: BookingEngineStep) => void;
  setWindowDays: (n: number) => void;
  selectService: (service: Service) => void;
  selectStore: (store: Store) => void;
  selectBeautician: (b: Beautician) => void;
  selectDate: (date: string) => void;
  selectSlot: (slot: TimeSlot) => void;
  setServices: (services: Service[]) => void;
  setStores: (stores: Store[]) => void;
  setBeauticians: (beauticians: Beautician[]) => void;
  setAvailableDays: (days: DayAvailability[]) => void;
  setTimeSlots: (slots: TimeSlot[]) => void;
  openSlotModal: () => void;
  closeSlotModal: () => void;
  openConfirmModal: () => void;
  closeConfirmModal: () => void;
  setLoading: (v: boolean) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
}
```

---

## 四、Zustand Store（`store/useBookingEngineStore.ts`）

> 路徑：`src/app/(test)/bookingEngine/store/useBookingEngineStore.ts`

```ts
import { create } from "zustand";
import {
  BookingEngineState,
  BookingEngineStep,
  Service,
  Store,
  Beautician,
  TimeSlot,
  DayAvailability,
} from "../types";

const initialState = {
  step: "selectService" as BookingEngineStep,
  windowDays: 30,
  selectedService: null,
  selectedStore: null,
  selectedBeautician: null,
  selectedDate: null,
  selectedSlot: null,
  services: [],
  stores: [],
  beauticians: [],
  availableDays: [],
  timeSlots: [],
  showSlotModal: false,
  showConfirmModal: false,
  loading: false,
  error: null,
};

export const useBookingEngineStore = create<BookingEngineState>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),
  setWindowDays: (windowDays) => set({ windowDays }),
  selectService: (selectedService) =>
    set({ selectedService, step: "selectStore" }),
  selectStore: (selectedStore) =>
    set({ selectedStore, step: "selectBeautician" }),
  selectBeautician: (selectedBeautician) =>
    set({ selectedBeautician, step: "calendar" }),
  selectDate: (selectedDate) => set({ selectedDate }),
  selectSlot: (selectedSlot) => set({ selectedSlot }),
  setServices: (services) => set({ services }),
  setStores: (stores) => set({ stores }),
  setBeauticians: (beauticians) => set({ beauticians }),
  setAvailableDays: (availableDays) => set({ availableDays }),
  setTimeSlots: (timeSlots) => set({ timeSlots }),
  openSlotModal: () => set({ showSlotModal: true }),
  closeSlotModal: () => set({ showSlotModal: false, selectedSlot: null }),
  openConfirmModal: () => set({ showConfirmModal: true }),
  closeConfirmModal: () => set({ showConfirmModal: false }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}));
```

---

## 五、前端服務層（`services/bookingService.ts`）

> 路徑：`src/app/(test)/bookingEngine/services/bookingService.ts`  
> 直接 import lineTest 的 gasClient，共用同一個 GAS URL。

```ts
import { gasCall } from "../../lineTest/services/gasClient";
import {
  Service,
  Store,
  Beautician,
  TimeSlot,
  DayAvailability,
} from "../types";

export async function fetchServices(): Promise<Service[]> {
  const res = await gasCall<{ success: boolean; services: Service[] }>(
    "getServices"
  );
  return res.success ? res.services : [];
}

export async function fetchStores(): Promise<Store[]> {
  const res = await gasCall<{ success: boolean; stores: Store[] }>("getStores");
  return res.success ? res.stores : [];
}

export async function fetchBeauticians(
  storeId: string,
  serviceId: string
): Promise<Beautician[]> {
  const res = await gasCall<{ success: boolean; beauticians: Beautician[] }>(
    "getBeauticians",
    { storeId, serviceId }
  );
  return res.success ? res.beauticians : [];
}

export async function fetchAvailableDays(
  beauticianId: string,
  serviceId: string,
  windowDays: number
): Promise<DayAvailability[]> {
  const res = await gasCall<{ success: boolean; days: DayAvailability[] }>(
    "getAvailableDays",
    { beauticianId, serviceId, windowDays }
  );
  return res.success ? res.days : [];
}

export async function fetchAvailableSlots(
  beauticianId: string,
  serviceId: string,
  date: string
): Promise<TimeSlot[]> {
  const res = await gasCall<{ success: boolean; slots: TimeSlot[] }>(
    "getAvailableSlots",
    { beauticianId, serviceId, date }
  );
  return res.success ? res.slots : [];
}

export async function submitBooking(params: {
  lineUserId: string;
  beauticianId: string;
  serviceId: string;
  storeId: string;
  date: string;
  startTime: string;
}): Promise<{ success: boolean; bookingId?: string; error?: string }> {
  return gasCall("createBookingV2", params);
}
```

---

## 六、UI 元件規格

### 6.1 主控元件 `components/bookingEnginePage.tsx`

```tsx
"use client";
import React, { useEffect } from "react";
import { useBookingEngineStore } from "../store/useBookingEngineStore";
import { fetchServices } from "../services/bookingService";
import SelectServicePage from "./SelectServicePage";
import SelectStorePage from "./SelectStorePage";
import SelectBeauticianPage from "./SelectBeauticianPage";
import CalendarPage from "./CalendarPage";
import BookingSuccessPage from "./BookingSuccessPage";

const BookingEnginePage: React.FC = () => {
  const { step, setServices, setLoading } = useBookingEngineStore();

  useEffect(() => {
    setLoading(true);
    fetchServices()
      .then(setServices)
      .finally(() => setLoading(false));
  }, []);

  switch (step) {
    case "selectService":
      return <SelectServicePage />;
    case "selectStore":
      return <SelectStorePage />;
    case "selectBeautician":
      return <SelectBeauticianPage />;
    case "calendar":
      return <CalendarPage />;
    case "success":
      return <BookingSuccessPage />;
  }
};

export default BookingEnginePage;
```

---

### 6.2 `SelectServicePage.tsx`

- 從 store 取 `services`（已在主控 useEffect 載入）
- 以 `Card` 列表顯示每個療程（名稱、時長、定價、簡述）
- 點擊 → 呼叫 `store.selectService(service)`（自動切換至 selectStore）
- 頂部麵包屑：`療程 > 據點 > 美容師`（當前步驟加粗）

---

### 6.3 `SelectStorePage.tsx`

- 進入時呼叫 `fetchStores()` → `store.setStores()`
- 以 `Card` 列表顯示每個據點（名稱、地址、電話）
- 點擊 → `store.selectStore(store)`（切換至 selectBeautician）
- 「← 返回療程」→ `store.setStep("selectService")`

---

### 6.4 `SelectBeauticianPage.tsx`

- 進入時呼叫 `fetchBeauticians(selectedStore.storeId, selectedService.serviceId)` → `store.setBeauticians()`
- 以 `Card` 列表顯示美容師（名稱、簡介）
- 點擊 → `store.selectBeautician(b)`（切換至 calendar）
- 「← 返回據點」→ `store.setStep("selectStore")`

---

### 6.5 `CalendarPage.tsx`

**行為：**

- 進入時呼叫 `fetchAvailableDays(beauticianId, serviceId, windowDays)` → `store.setAvailableDays()`
- `windowDays` 變更時重新呼叫

**日曆顯示（自製，不引入外部套件）：**

- 以月為單位，顯示 `windowDays` 範圍內的日期
- 日期格子：
  - 超出 windowDays 範圍 → 不渲染
  - `available: false` 或過去日期 → 灰底，cursor: not-allowed，不可點
  - `available: true` → 白底，hover 加淡綠色，cursor: pointer，可點
  - 今天 → 日期數字加底線

**點擊可用日期：**

1. `store.selectDate(date)`
2. 呼叫 `fetchAvailableSlots(beauticianId, serviceId, date)` → `store.setTimeSlots()`
3. `store.openSlotModal()`

**右上角 windowDays 輸入框：**

- `<Form.Control type="number" min={1} max={60} value={windowDays} />`
- onChange → `store.setWindowDays(n)`，觸發重新 fetch

**頁首顯示選擇摘要：**

```
療程：深層清潔 (60 min) ｜ 據點：台北總部 ｜ 美容師：小美
```

**「← 返回美容師」→ `store.setStep("selectBeautician")`**

**掛載 SlotModal 與 ConfirmModal（始終渲染，依 showSlotModal / showConfirmModal 控制顯示）**

---

### 6.6 `SlotModal.tsx`

**Props（從 store 讀取，不需 prop drilling）**

**顯示：**

- `show={showSlotModal}` 對應 `store.showSlotModal`
- 標題：`{selectedDate} 可預約時段`
- 時段以 `Button` 格格排列（每排 3 個）：
  - `available: true` → `variant="outline-success"`，可點
  - `available: false` → `variant="secondary"` + disabled，顯示「已預約」
- 點擊可用時段：
  1. `store.selectSlot(slot)`
  2. `store.closeSlotModal()`
  3. `store.openConfirmModal()`
- 右上角 × / 「關閉」→ `store.closeSlotModal()`
- 若 `timeSlots` 全為 false → 顯示提示「本日時段已全數預約，請選擇其他日期」

---

### 6.7 `ConfirmModal.tsx`

**顯示：**

- `show={showConfirmModal}`
- 標題：「確認預約」
- 摘要列表：

  | 項目     | 值                 |
  | -------- | ------------------ |
  | 療程     | 深層清潔           |
  | 時長     | 60 分鐘            |
  | 美容師   | 小美               |
  | 服務據點 | 台北總部           |
  | 日期     | 2026-05-08（週五） |
  | 時段     | 09:00 – 10:00      |
  | 定價     | NT$ 1,200          |

- 按鈕：「確認預約」/ 「取消」
- 「確認預約」：
  1. `setLoading(true)`
  2. 呼叫 `submitBooking({...})`（lineUserId 從 session 取，無 session 則填 "guest"）
  3. 成功 → `store.closeConfirmModal()` → `store.setStep("success")`
  4. 失敗 → `store.setError(error)` → 顯示 `Alert variant="danger"` → `closeConfirmModal()` → `openSlotModal()`（讓使用者重選）→ 重新 fetch 時段
- 「取消」→ `store.closeConfirmModal()` → `store.openSlotModal()`（回到時段選擇）

---

### 6.8 `BookingSuccessPage.tsx`

- 顯示 ✅ 圖示 + 「預約成功」標題
- 顯示預約摘要（同 ConfirmModal 內容）
- 按鈕「返回日曆」→ `store.setStep("calendar")` + 重新 fetch availableDays

---

## 七、實作順序

### Phase 1 — Google Sheets 建立（手動操作）

1. 開啟既有 Google Sheets 試算表（與 lineTest 同一份）
2. 新增以下 7 個工作表分頁，名稱完全如下（大小寫一致）：
   - `Services`
   - `Stores`
   - `Beauticians`
   - `WeeklySchedules`
   - `ExceptionSchedules`
   - `Holidays`
   - `SystemParams`
3. 每張工作表依 §1.1–§1.7 的「第一列」填入欄位名稱
4. 依 Mock 資料填入資料列
5. 確認 `Bookings` 工作表的欄位符合 §1.8 規格（如缺欄位請追加）

### Phase 2 — GAS 擴充

1. 在既有 GAS Script 中加入 §2.2 工具函式（`timeToMinutes`、`minutesToTime`）
2. 新增 §2.3–§2.9 的 6 個函式
3. 在 `doPost` 的 `actionMap` 中加入 §2.1 的 7 行
4. 重新部署（選「新建版本」，URL 不變）
5. 以 Postman 或 curl 測試各 action 回傳是否正確

### Phase 3 — 前端型別 + Store

1. 覆寫 `types/index.ts`（§三）
2. 建立 `store/useBookingEngineStore.ts`（§四）

### Phase 4 — 前端服務層

1. 建立 `services/bookingService.ts`（§五）

### Phase 5 — UI 元件（依序）

1. `bookingEnginePage.tsx`（§6.1）
2. `SelectServicePage.tsx`（§6.2）
3. `SelectStorePage.tsx`（§6.3）
4. `SelectBeauticianPage.tsx`（§6.4）
5. `CalendarPage.tsx`（§6.5）
6. `SlotModal.tsx`（§6.6）
7. `ConfirmModal.tsx`（§6.7）
8. `BookingSuccessPage.tsx`（§6.8）

### Phase 6 — 整合測試

- 完整走一次：選療程 → 據點 → 美容師 → 選日期 → 選時段 → 確認 → 成功
- 測試 windowDays 調整
- 模擬衝突：在另一分頁 Bookings 手動寫入一筆預約，確認該時段在 SlotModal 顯示灰色
- 執行 `npm run build` 確認無編譯錯誤

---

## 八、驗證清單

- [ ] 7 張 Sheets 工作表已建立，欄位名稱與 Mock 資料正確
- [ ] `Bookings` 工作表欄位已補齊至 §1.8 規格
- [ ] GAS 7 個新 action 已部署，Postman 測試通過
- [ ] `getAvailableDays` 正確排除假日與例外
- [ ] `getAvailableSlots` 正確顯示已預約時段為 `available: false`
- [ ] `createBookingV2` concurrency check 正確攔截衝突並回傳中文錯誤
- [ ] `types/index.ts` 型別完整
- [ ] `useBookingEngineStore` 所有 state 與 action 齊全
- [ ] `bookingService.ts` import 路徑指向 lineTest 的 `gasClient.ts`
- [ ] 日曆正確顯示有空（白）/ 無空（灰）日期
- [ ] windowDays 調整後日曆重新 fetch
- [ ] SlotModal 已預約時段顯示灰色 disabled
- [ ] 衝突時自動刷新時段並重開 SlotModal
- [ ] `npm run build` 無錯誤
