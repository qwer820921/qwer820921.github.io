# bookingEngine Plan

> **模組定位**：PoC 測試頁，用於驗證完整預約流程（SA 第二章）。
> **後端**：沿用既有 GAS Script + Google Sheets（同一份試算表，同一個部署 URL）。
> **班表資料**：無 HQ Admin，採 Mock 資料直接填入 Sheets。
> **前端路徑**：`src/app/(test)/lineTest/`（整合於 lineTest 模組，共用 session / gasClient）

---

## 零、背景與前提條件

### 既有資源（勿重複建立）

| 資源                 | 說明                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------ |
| Google Sheets 試算表 | 與 lineTest 共用同一份                                                               |
| GAS Script           | 與 lineTest 共用，只需新增 function，重新部署即可                                    |
| `gasClient.ts`       | 位於 `src/app/(test)/lineTest/services/gasClient.ts`，bookingEngine 直接 import 使用 |
| `Bookings` 工作表    | 已存在，需確認欄位相容性（見 §1.6）                                                  |

### 既有工作表（不動）

- `Members`
- `Bookings`（需新增欄位，見 §1.6）
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
S001 | 深層清潔 | 60 | 30 | 1200 | 專業儀器深層疏通毛孔，改善粉刺與膚況
S002 | TSD 肌底重建 | 90 | 30 | 2800 | 品牌旗艦療程，強化皮膚底層修復與緊緻
S003 | 保濕補水 | 45 | 30 | 980 | 密集補水安撫，適合乾燥或日曬後肌膚
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

### 1.4 `Schedules`（排班表）

> 一列 = 某美容師某天的**一段**上班時間。  
> 同一天可有多列，代表分段班（例如上午班 + 下午班，午休自然空出）。  
> 某天無任何列 = 該日不上班，不開放預約。  
> 未來後台管理直接寫入此表即可，無需另外維護例外規則。

**第一列：**

```
scheduleId | beauticianId | date | startTime | endTime
```

**欄位說明：**

| 欄位           | 型別   | 格式                          | 說明                                   |
| -------------- | ------ | ----------------------------- | -------------------------------------- |
| `scheduleId`   | string | `SC001`…                      | 主鍵                                   |
| `beauticianId` | string | 對應 Beauticians.beauticianId |                                        |
| `date`         | string | `YYYY-MM-DD`                  | 上班日期，直覺明確                     |
| `startTime`    | string | `HH:mm`（24 小時制）          | 這段上班的開始時間                     |
| `endTime`      | string | `HH:mm`（24 小時制）          | 這段上班的結束時間                     |

**完整 Mock 資料（涵蓋 2026-05-07 ~ 2026-05-20，含分段班示範）：**

```
SC001  | B001 | 2026-05-07 | 09:00 | 12:00
SC002  | B001 | 2026-05-07 | 14:00 | 18:00
SC003  | B001 | 2026-05-08 | 09:00 | 12:00
SC004  | B001 | 2026-05-08 | 14:00 | 18:00
SC005  | B001 | 2026-05-11 | 09:00 | 12:00
SC006  | B001 | 2026-05-11 | 14:00 | 18:00
SC007  | B001 | 2026-05-12 | 09:00 | 12:00
SC008  | B001 | 2026-05-12 | 14:00 | 18:00
SC009  | B001 | 2026-05-13 | 09:00 | 12:00
SC010  | B001 | 2026-05-13 | 14:00 | 18:00
SC011  | B001 | 2026-05-14 | 09:00 | 12:00
SC012  | B001 | 2026-05-14 | 14:00 | 18:00
SC013  | B001 | 2026-05-15 | 09:00 | 12:00
SC014  | B001 | 2026-05-15 | 14:00 | 18:00
SC015  | B002 | 2026-05-08 | 10:00 | 19:00
SC016  | B002 | 2026-05-09 | 10:00 | 17:00
SC017  | B002 | 2026-05-11 | 10:00 | 19:00
SC018  | B002 | 2026-05-13 | 10:00 | 19:00
SC019  | B002 | 2026-05-15 | 10:00 | 19:00
SC020  | B002 | 2026-05-16 | 10:00 | 17:00
SC021  | B003 | 2026-05-07 | 09:00 | 15:00
SC022  | B003 | 2026-05-09 | 09:00 | 15:00
SC023  | B003 | 2026-05-12 | 09:00 | 18:00
SC024  | B003 | 2026-05-14 | 09:00 | 18:00
SC025  | B003 | 2026-05-16 | 09:00 | 15:00
```

> **解讀**：B001（小美）週四五上午 + 下午分段班（12:00–14:00 午休空出）；B002（小芳）週五六單班；B003（小琳）週四六單班。

---

### 1.5 `SystemParams`（系統參數）

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

> `cancel_deadline_hours`：預留欄位，PoC 不實作取消功能，GAS 與前端均不讀取此值。

---

### 1.6 `Bookings`（沿用既有工作表，確認欄位）

> 此工作表已存在，GAS 在 bookingEngine 流程中會寫入新預約。  
> 請確認現有欄位包含以下所有欄位；如缺少欄位，請在最右側追加。

**應有的完整欄位（第一列）：**

```
bookingId | lineUserId | beauticianId | serviceId | storeId | date | startTime | endTime | duration | status | note | createdAt
```

**欄位說明：**

| 欄位           | 型別   | 格式                          | 說明                                                             |
| -------------- | ------ | ----------------------------- | ---------------------------------------------------------------- |
| `bookingId`    | string | UUID v4                       | 由 GAS 產生，主鍵                                                |
| `lineUserId`   | string | LINE userId 或 email          | 識別預約人；web 登入時填 email                                   |
| `beauticianId` | string | 對應 Beauticians.beauticianId |                                                                  |
| `serviceId`    | string | 對應 Services.serviceId       |                                                                  |
| `storeId`      | string | 對應 Stores.storeId           |                                                                  |
| `date`         | string | `YYYY-MM-DD`                  | 預約日期                                                         |
| `startTime`    | string | `HH:mm`                       | 預約開始時間                                                     |
| `endTime`      | string | `HH:mm`                       | 佔用結束時間（startTime + duration + buffer，由 GAS 計算後寫入） |
| `duration`     | number | 整數（分鐘）                  | 服務本體時長（不含 buffer），供 `getSchedule` 切割 booked / buffer 段用 |
| `status`       | string | `confirmed` / `cancelled`     | 預約狀態                                                         |
| `note`         | string | 任意文字或空白                | 顧客備註，由確認頁輸入，可為空                                   |
| `createdAt`    | string | ISO 8601                      | 建立時間，由 GAS 寫入                                            |

> **若欄位已存在但部分欄位缺少**（如 `beauticianId`、`serviceId`、`storeId`），請在標題列補上缺少的欄位，既有資料列對應格留空即可。

---

## 二、GAS 擴充規格

> 在既有 GAS Script 中新增下列函式，並在 `doPost` 的 `actionMap` 中加入對應的 key。

### 2.1 `doPost` actionMap 新增項目

在既有 `actionMap` 物件中加入以下 6 行：

```js
getServices:    () => getServices(),
getStores:      () => getStores(),
getBeauticians: () => getBeauticians(params),
getSystemParam: () => getSystemParam(params),
getSchedule:    () => getSchedule(params),
createBookingV2: () => createBookingV2(params),
```

> **開發期間**：`createBookingV2` 暫與舊 `createBooking` 並存，避免舊 `BookingPage.tsx` 在新流程完成前壞掉。  
> **新流程完成後**（舊 `BookingPage.tsx` 移除時）：刪除舊 `createBooking`，將 `createBookingV2` 改名為 `createBooking`，`actionMap` key 與 `bookingService.ts` 的呼叫一併更新，最終只保留一個乾淨的 `createBooking`。

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

### 2.7 `getSchedule(params)`

**請求參數：**

| 參數           | 型別   | 必填 | 說明                                                 |
| -------------- | ------ | ---- | ---------------------------------------------------- |
| `beauticianId` | string | 是   |                                                      |

> `windowDays` 由後端從 `SystemParams.booking_window_days` 讀取，前端不傳。

**回傳格式：**

```json
{
  "success": true,
  "schedule": [
    { "date": "2026-05-03", "isPast": true,  "segments": [] },
    {
      "date": "2026-05-07",
      "isPast": false,
      "segments": [
        { "startTime": "09:00", "endTime": "10:00", "status": "booked"    },
        { "startTime": "10:00", "endTime": "10:30", "status": "buffer"    },
        { "startTime": "10:30", "endTime": "12:00", "status": "available" },
        { "startTime": "14:00", "endTime": "18:00", "status": "available" }
      ]
    }
  ]
}
```

> - 陣列第一筆固定從**本週週日**開始（補日期頭），讓前端日曆格子從週日對齊
> - `isPast: true` 的日期 segments 固定為 `[]`
> - 相鄰 segment 之間若有空白（如 12:00~14:00）代表午休，前端不渲染
> - `status` 三種值：`"available"` 可預約 ／ `"booked"` 已被預約（服務本體）／ `"buffer"` 緩衝時間
> - 三段邊界完全對齊，無 `+1/-1` 分鐘補丁

**實作（完整）：**

```js
function getSchedule(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const beauticianId = params.beauticianId;

  // 從 SystemParams 讀取，Admin 改 Sheets 即生效，前端無需傳入
  const windowDays =
    Number(getSystemParam({ key: "booking_window_days" }).value) || 30;

  // 台灣國定假日（Google Calendar，自動更新，不需維護 Holidays 工作表）
  const twHolidayCalendar = CalendarApp.getCalendarById(
    "zh.taiwan#holiday@group.v.calendar.google.com"
  );

  // 批次讀取，避免迴圈中重複讀表
  const allSchedules = toObjects(ss.getSheetByName("Schedules"))
    .filter((r) => r.beauticianId === beauticianId);
  const allBookings = toObjects(ss.getSheetByName("Bookings"))
    .filter((r) => r.beauticianId === beauticianId && r.status === "confirmed");

  // 補頭：找本週週日
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());

  const totalDays = today.getDay() + windowDays;
  const schedule = [];

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dateStr = Utilities.formatDate(d, "Asia/Taipei", "yyyy-MM-dd");
    const isPast = d.getTime() < today.getTime();

    // 補頭日期
    if (isPast) {
      schedule.push({ date: dateStr, isPast: true, segments: [] });
      continue;
    }

    // 國定假日（查 Google Calendar）
    const holidays = twHolidayCalendar
      ? twHolidayCalendar.getEventsForDay(d)
      : [];
    if (holidays.length > 0) {
      schedule.push({ date: dateStr, isPast: false, segments: [] });
      continue;
    }

    // 取得當日所有上班時段（多列 = 分段班），依開始時間排序
    const workShifts = allSchedules
      .filter((r) => r.date === dateStr)
      .map((r) => ({ start: r.startTime, end: r.endTime }))
      .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

    // 無排班列 = 該日不上班
    if (workShifts.length === 0) {
      schedule.push({ date: dateStr, isPast: false, segments: [] });
      continue;
    }

    // 取當日已確認預約，依開始時間排序（保留 duration 供切割 booked/buffer 段）
    const dayBookings = allBookings
      .filter((b) => b.date === dateStr)
      .map((b) => ({ start: b.startTime, end: b.endTime, duration: Number(b.duration) }))
      .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

    // 依預約切割各段工作時段（三種狀態：available / booked / buffer）
    const segments = [];
    for (const shift of workShifts) {
      const shiftStartMin = timeToMinutes(shift.start);
      const shiftEndMin = timeToMinutes(shift.end);

      const shiftBookings = dayBookings.filter(
        (b) =>
          timeToMinutes(b.start) < shiftEndMin &&
          timeToMinutes(b.end) > shiftStartMin
      );

      if (shiftBookings.length === 0) {
        segments.push({ startTime: shift.start, endTime: shift.end, status: "available" });
        continue;
      }

      let cursor = shiftStartMin;
      for (const booking of shiftBookings) {
        const bStart = timeToMinutes(booking.start);
        const bServiceEnd = bStart + booking.duration; // service 結束（不含 buffer）
        const bEnd = timeToMinutes(booking.end);       // 含 buffer 的實際佔用結束

        if (cursor < bStart) {
          segments.push({
            startTime: minutesToTime(cursor),
            endTime: minutesToTime(bStart),
            status: "available",
          });
        }
        segments.push({
          startTime: minutesToTime(bStart),
          endTime: minutesToTime(bServiceEnd),
          status: "booked",
        });
        if (bServiceEnd < bEnd) {
          segments.push({
            startTime: minutesToTime(bServiceEnd),
            endTime: minutesToTime(bEnd),
            status: "buffer",
          });
        }
        cursor = bEnd;
      }
      if (cursor < shiftEndMin) {
        segments.push({
          startTime: minutesToTime(cursor),
          endTime: minutesToTime(shiftEndMin),
          status: "available",
        });
      }
    }

    schedule.push({ date: dateStr, isPast: false, segments });
  }

  return { success: true, schedule };
}
```

---

### 2.8 `createBookingV2(params)`

**請求參數：**

| 參數           | 型別   | 必填 | 說明                             |
| -------------- | ------ | ---- | -------------------------------- |
| `lineUserId`   | string | 是   | LINE userId 或 web session email |
| `beauticianId` | string | 是   |                                  |
| `serviceId`    | string | 是   |                                  |
| `storeId`      | string | 是   |                                  |
| `date`         | string | 是   | `YYYY-MM-DD`                     |
| `startTime`    | string | 是   | `HH:mm`                          |
| `note`         | string | 否   | 顧客備註，空白時傳空字串         |

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
  const { lineUserId, beauticianId, serviceId, storeId, date, startTime, note = "" } =
    params;

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 取得療程時長，計算 endTime（含 buffer，代表美容師實際佔用時間）
  const services = toObjects(ss.getSheetByName("Services"));
  const service = services.find((s) => s.serviceId === serviceId);
  if (!service) return { success: false, error: "找不到療程" };
  const duration = Number(service.duration);  // service 本體時長
  const buffer = Number(service.buffer);       // buffer 時長
  const endTime = minutesToTime(timeToMinutes(startTime) + duration + buffer);

  // Double-check：直接查詢 Bookings，確認無時段衝突（防 race condition）
  const existingBookings = toObjects(ss.getSheetByName("Bookings")).filter(
    (r) => r.beauticianId === beauticianId && r.date === date && r.status === "confirmed"
  );
  const newStart = timeToMinutes(startTime);
  const newEnd = timeToMinutes(endTime);
  const hasConflict = existingBookings.some((b) => {
    const bStart = timeToMinutes(b.startTime);
    const bEnd = timeToMinutes(b.endTime);
    return newStart < bEnd && newEnd > bStart;
  });
  if (hasConflict) {
    return { success: false, error: "已有人於該時段預約，請更換時段" };
  }

  // 產生 UUID（GAS 內建）
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
    duration,           // service 本體時長（不含 buffer），供 getSchedule 切割用
    "confirmed",
    note,
    new Date().toISOString(),
  ]);

  return { success: true, bookingId };
}
```

---

## 三、前端型別定義（`types/index.ts`）

> 路徑：`src/app/(test)/lineTest/types/bookingEngine.ts`（獨立新檔，不修改既有 `index.ts`）  
> 原因：`index.ts` 已有 lineTest 舊流程型別（`Booking`、`BookingForm` 等），兩套結構不同，混在同一檔容易混淆。  
>
> **清理備忘（新流程穩定後執行）**：  
> 1. 確認舊 `BookingPage.tsx` 已移除，`index.ts` 中的 `BookingForm`、`Booking`、`NotifyPayload` 已無任何 import  
> 2. 從 `index.ts` 刪除上述舊型別  
> 3. 若 `index.ts` 最終只剩 lineTest flow 控制用型別（`LineTestStep`、`AuthSession` 等），可視情況合併或繼續分離

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

/** 單一時段區段（依預約切割後的結果） */
export interface ScheduleSegment {
  startTime: string;  // HH:mm
  endTime: string;    // HH:mm
  status: "available" | "booked" | "buffer";
  // available = 可預約；booked = 已被預約（服務本體）；buffer = 緩衝時間（不可預約）
}

/** 單日班表資料 */
export interface ScheduleDay {
  date: string;       // YYYY-MM-DD，陣列第一筆固定為本週週日
  isPast: boolean;    // true=補頭日期，前端灰底不可點
  segments: ScheduleSegment[]; // 空陣列=休假或非上班日
}

export interface ScheduleResponse {
  success: boolean;
  schedule: ScheduleDay[];
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

  // 選擇結果
  selectedService: Service | null;
  selectedStore: Store | null;
  selectedBeautician: Beautician | null;
  selectedDate: string | null;
  selectedSegment: ScheduleSegment | null; // 使用者點選的時段區段，startTime 即為預約開始時間
  note: string;

  // 後端資料 cache
  services: Service[];
  stores: Store[];
  beauticians: Beautician[];
  schedule: ScheduleDay[];

  // Modal 控制
  showSlotModal: boolean;
  showConfirmModal: boolean;

  // UI 狀態
  loading: boolean;
  error: string | null;

  // Actions
  setStep: (step: BookingEngineStep) => void;
  selectService: (service: Service) => void;
  selectStore: (store: Store) => void;
  selectBeautician: (b: Beautician) => void;
  selectDate: (date: string) => void;
  selectSegment: (segment: ScheduleSegment) => void;
  setServices: (services: Service[]) => void;
  setStores: (stores: Store[]) => void;
  setBeauticians: (beauticians: Beautician[]) => void;
  setSchedule: (schedule: ScheduleDay[]) => void;
  openSlotModal: () => void;
  closeSlotModal: () => void;
  openConfirmModal: () => void;
  closeConfirmModal: () => void;
  setNote: (note: string) => void;
  setLoading: (v: boolean) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
}
```

---

## 四、Zustand Store（`store/useBookingEngineStore.ts`）

> 路徑：`src/app/(test)/lineTest/store/useBookingEngineStore.ts`

```ts
import { create } from "zustand";
import {
  BookingEngineState,
  BookingEngineStep,
  Service,
  Store,
  Beautician,
  ScheduleSegment,
  ScheduleDay,
} from "../types";

const initialState = {
  step: "selectService" as BookingEngineStep,
  selectedService: null,
  selectedStore: null,
  selectedBeautician: null,
  selectedDate: null,
  selectedSegment: null,
  note: "",
  services: [],
  stores: [],
  beauticians: [],
  schedule: [],
  showSlotModal: false,
  showConfirmModal: false,
  loading: false,
  error: null,
};

export const useBookingEngineStore = create<BookingEngineState>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),
  selectService: (selectedService) =>
    set({ selectedService, step: "selectStore" }),
  selectStore: (selectedStore) =>
    set({ selectedStore, step: "selectBeautician" }),
  selectBeautician: (selectedBeautician) =>
    set({ selectedBeautician, step: "calendar" }),
  selectDate: (selectedDate) => set({ selectedDate }),
  selectSegment: (selectedSegment) => set({ selectedSegment }),
  setServices: (services) => set({ services }),
  setStores: (stores) => set({ stores }),
  setBeauticians: (beauticians) => set({ beauticians }),
  setSchedule: (schedule) => set({ schedule }),
  openSlotModal: () => set({ showSlotModal: true }),
  closeSlotModal: () => set({ showSlotModal: false, selectedSegment: null }),
  openConfirmModal: () => set({ showConfirmModal: true }),
  closeConfirmModal: () => set({ showConfirmModal: false }),
  setNote: (note) => set({ note }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}));
```

---

## 五、前端服務層（`services/bookingService.ts`）

> 路徑：`src/app/(test)/lineTest/services/bookingService.ts`  
> 與 gasClient 同目錄，直接 import，共用同一個 GAS URL。

```ts
import { gasCall } from "./gasClient";
import {
  Service,
  Store,
  Beautician,
  ScheduleDay,
} from "../types/index";

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

export async function fetchSchedule(
  beauticianId: string
): Promise<ScheduleDay[]> {
  const res = await gasCall<{ success: boolean; schedule: ScheduleDay[] }>(
    "getSchedule",
    { beauticianId }
  );
  return res.success ? res.schedule : [];
}

export async function submitBooking(params: {
  lineUserId: string;
  beauticianId: string;
  serviceId: string;
  storeId: string;
  date: string;
  startTime: string;
  note: string;
}): Promise<{ success: boolean; bookingId?: string; error?: string }> {
  return gasCall("createBookingV2", params);
}
```

---

## 六、UI 元件規格

> **非破壞性原則**：bookingEngine 整合進 lineTest 時，僅允許修改以下一個地方：
> - `lineTestPage.tsx`：將 `case "booking": return <BookingPage />` 換成 `return <BookingEnginePage />`
>
> 其餘所有既有檔案（`useLineTestStore`、`DashboardPage`、`authService`、`types/index.ts` 等）**維持不動**。  
> bookingEngine 以獨立 store（`useBookingEngineStore`）管理自身狀態，不干擾 lineTest 既有流程。
>
> **命名衝突說明**：`components/BookingSuccessPage.tsx` 已被舊流程佔用，  
> bookingEngine 的成功頁命名為 `BookingEngineSuccessPage.tsx` 以避免衝突。

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
import BookingEngineSuccessPage from "./BookingEngineSuccessPage";

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
      return <BookingEngineSuccessPage />;
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

- 進入時呼叫 `fetchSchedule(beauticianId)` → `store.setSchedule()`
- 顯示天數由後端 `SystemParams.booking_window_days` 決定，前端無需控制

**日曆顯示（自製，不引入外部套件）：**

- 以週為單位渲染，陣列第一筆固定為本週週日，格子從週日對齊
- 日期格子：
  - `isPast: true` → 灰底，cursor: not-allowed，不可點（補頭日期）
  - `segments` 為空陣列 → 灰底，不可點（休假 / 非上班日）
  - `segments` 有資料 → 白底，hover 加淡綠色，cursor: pointer，可點
  - 今天 → 日期數字加底線

**點擊可用日期：**

1. `store.selectDate(date)`
2. `store.openSlotModal()`（直接開，不需再呼叫 API，segments 已在 schedule 內）

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
- 標題：`{selectedDate} 班表`
- 從 `store.schedule` 找出 `selectedDate` 的 `segments`，依序渲染時段區塊：
  - `status: "available"` → 綠色區塊，可點擊
  - `status: "booked"` → 深灰色區塊，顯示「已預約」，不可點
  - `status: "buffer"` → 淡灰色區塊，顯示「緩衝時間」，不可點
  - 相鄰 segment 之間若有空白（如 12:00~14:00 無 segment）→ 渲染「午休」淡灰色區塊
- 點擊 `status: "available"` 區塊：
  1. `store.selectSegment(segment)`
  2. `store.closeSlotModal()`
  3. `store.openConfirmModal()`
- 右上角 × / 「關閉」→ `store.closeSlotModal()`
- 若所有 segments 的 `status` 皆非 `"available"` → 顯示「本日時段已全數預約，請選擇其他日期」

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
  | 時段     | 09:00 – 10:00（服務結束時間，不含 30 min buffer）|
  | 定價     | NT$ 1,200          |

- 備註輸入欄（選填）：
  - `<Form.Control as="textarea" rows={2} placeholder="（選填）備註給美容師的訊息" />`
  - onChange → `store.setNote(value)`

- 按鈕：「確認預約」/ 「取消」
- 「確認預約」：
  1. `setLoading(true)`
  2. 呼叫 `submitBooking({...note: store.note})`（lineUserId 從 lineTest session 取）
  3. 成功 → `store.closeConfirmModal()` → `store.setStep("success")`
  4. 失敗 → `store.setError(error)` → 顯示 `Alert variant="danger"` → `closeConfirmModal()` → `openSlotModal()`（讓使用者重選）→ 重新 fetch 時段
- 「取消」→ `store.closeConfirmModal()` → `store.openSlotModal()`（回到時段選擇）

---

### 6.8 `BookingEngineSuccessPage.tsx`

> 注意：命名為 `BookingEngineSuccessPage` 以避免與既有 `BookingSuccessPage.tsx`（舊 lineTest 流程）衝突。

- 顯示 ✅ 圖示 + 「預約成功」標題
- 顯示預約摘要（同 ConfirmModal 內容）
- 按鈕「返回日曆」→ `store.setStep("calendar")` + 重新呼叫 `fetchSchedule`

---

## 七、實作順序

### Phase 1 — Google Sheets 建立（手動操作）

1. 開啟既有 Google Sheets 試算表（與 lineTest 同一份）
2. 新增以下 5 個工作表分頁，名稱完全如下（大小寫一致）：
   - `Services`
   - `Stores`
   - `Beauticians`
   - `Schedules`
   - `SystemParams`
3. 每張工作表依 §1.1–§1.5 的「第一列」填入欄位名稱
4. 依 Mock 資料填入資料列
5. 確認 `Bookings` 工作表的欄位符合 §1.6 規格（如缺欄位請追加）
6. 確認 GAS 執行帳號的 Google Calendar 已訂閱「台湾节假日」行事曆

### Phase 2 — GAS 擴充

1. 在既有 GAS Script 中加入 §2.2 工具函式（`timeToMinutes`、`minutesToTime`）
2. 新增 §2.3–§2.9 的 6 個函式
3. 在 `doPost` 的 `actionMap` 中加入 §2.1 的 6 行
4. 重新部署（選「新建版本」，URL 不變）
5. 以 Postman 或 curl 測試各 action 回傳是否正確

### Phase 3 — 前端型別 + Store

1. 覆寫 `types/index.ts`（§三）
2. 建立 `store/useBookingEngineStore.ts`（§四）

### Phase 4 — 前端服務層

1. 建立 `services/bookingService.ts`（§五）

### Phase 5 — UI 元件（依序）

1. `BookingEnginePage.tsx`（§6.1）
2. `SelectServicePage.tsx`（§6.2）
3. `SelectStorePage.tsx`（§6.3）
4. `SelectBeauticianPage.tsx`（§6.4）
5. `CalendarPage.tsx`（§6.5）
6. `SlotModal.tsx`（§6.6）
7. `ConfirmModal.tsx`（§6.7）
8. `BookingEngineSuccessPage.tsx`（§6.8）
9. `lineTestPage.tsx`：`case "booking"` 換成 `<BookingEnginePage />`（唯一修改既有檔案的動作）

### Phase 6 — 整合測試

- 完整走一次：選療程 → 據點 → 美容師 → 選日期 → 選時段 → 確認 → 成功
- 修改 `SystemParams.booking_window_days` 數值，重新進入日曆頁，確認顯示天數正確變化
- 模擬衝突：在另一分頁 Bookings 手動寫入一筆預約，確認該時段在 SlotModal 顯示灰色
- 確認 buffer：預約寫入後，`endTime = startTime + duration + 30 min`，下一段可選時段從 buffer 結束後才開始
- 執行 `npm run build` 確認無編譯錯誤

---

## 八、驗證清單

- [ ] 5 張新 Sheets 工作表已建立（Services / Stores / Beauticians / Schedules / SystemParams），欄位名稱與 Mock 資料正確
- [ ] `Schedules` 工作表含分段班資料（同一天多列），可驗證午休空出邏輯
- [ ] `Bookings` 工作表欄位已補齊至 §1.6 規格
- [ ] GAS 6 個新 action 已部署，Postman 測試通過
- [ ] `getSchedule` 補頭日期正確（第一筆為本週週日）
- [ ] `getSchedule` 正確排除假日、例外班表、非上班日（segments 為空陣列）
- [ ] `getSchedule` 依預約正確切割 segments，already-booked 段標記 `available: false`
- [ ] `createBookingV2` concurrency check 正確攔截衝突並回傳中文錯誤
- [ ] `types/bookingEngine.ts` 型別完整，未修改既有 `types/index.ts`
- [ ] （清理，新流程穩定後）`index.ts` 舊型別（`BookingForm`、`Booking`、`NotifyPayload`）已無 import，可刪除
- [ ] `useBookingEngineStore` 所有 state 與 action 齊全
- [ ] `bookingService.ts` import 路徑指向 lineTest 的 `gasClient.ts`
- [ ] 日曆格子正確對齊週日，補頭日期灰底不可點
- [ ] 有 segments 的日期顯示白底可點，無 segments 灰底不可點
- [ ] 修改 `SystemParams.booking_window_days` 後重新呼叫 `fetchSchedule`，確認天數變化正確
- [ ] SlotModal 依 segments 渲染時段區塊，已預約段灰色不可點
- [ ] 衝突時自動重新呼叫 `fetchSchedule` 並重開 SlotModal
- [ ] ConfirmModal 備註欄可輸入並正確傳入 `createBookingV2`
- [ ] `Bookings` 工作表 `note` 欄位正確寫入（空白預約亦不報錯）
- [ ] `npm run build` 無錯誤
