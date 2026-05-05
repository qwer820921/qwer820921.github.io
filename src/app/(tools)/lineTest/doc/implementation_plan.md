# LINE 串接整合 PoC — 實作計畫

> **目標**：以 GAS + Google Sheets 作為輕量後端與資料庫，驗證「Web 會員系統 × LINE 生態系深度綁定」的完整架構可行性。通知模組可真實打通 LINE Messaging API，後續只需替換 GAS 層為正式後端即可上線。

---

## 一、整體技術架構

```
┌────────────────────────────────────────────────┐
│  Next.js 前端（/lineTest）                      │
│                                                │
│  services/tokenGuard.ts                        │
│  services/authService.ts      ─── fetch() ───► │
│  services/notificationService.ts               │
└────────────────────────────────────────────────┘
                    │
                    │  HTTPS POST
                    │  { action: "...", ...params }
                    ▼
┌────────────────────────────────────────────────┐
│  Google Apps Script (GAS) Web App              │
│  doPost(e) → switch(action)                    │
│                                                │
│  ├── validateToken()                           │
│  ├── findMemberByLineUserId()                  │
│  ├── bindLineUserId()                          │
│  ├── checkFriendship()                         │
│  ├── createBooking()                           │
│  ├── cancelBooking()                           │
│  ├── rescheduleBooking()                       │
│  └── sendNotification()  ───────────────────► LINE Messaging API
│                          ───────────────────► Gmail (MailApp)
└────────────────────────────────────────────────┘
                    │
                    │  SpreadsheetApp
                    ▼
┌────────────────────────────────────────────────┐
│  Google Sheets（資料庫）                        │
│                                                │
│  ├── Members       會員資料                    │
│  ├── Tokens        圖文選單 Token 白名單        │
│  ├── Bookings      預約紀錄                    │
│  └── NotificationLog  推播發送歷程             │
└────────────────────────────────────────────────┘
```

---

## 二、技術選型

| 項目          | 選擇                               | 說明                             |
| ------------- | ---------------------------------- | -------------------------------- |
| 前端框架      | Next.js App Router                 | 專案既有架構                     |
| 狀態管理      | Zustand                            | 專案既有慣例（co-located store） |
| UI            | React Bootstrap                    | 專案既有慣例                     |
| 後端 / API    | Google Apps Script                 | doPost Web App，免費、免部署     |
| 資料庫        | Google Sheets                      | 視覺化 DB，Debug 極快            |
| 通知（LINE）  | LINE Messaging API                 | GAS `UrlFetchApp` 直接呼叫       |
| 通知（Email） | GAS `MailApp`                      | 備援通道，送給總部與美容師       |
| LINE 身分取得 | URL Query Mock → 正式版換 LIFF SDK | PoC 階段以 token 映射 lineUserId |

---

## 三、系統流程總覽

```
LINE@ 圖文選單
    │
    │  GET /lineTest?token=xxx
    ▼
┌─────────────────────────┐
│  Module 1: Token Guard  │  POST GAS → validateToken
└────────┬────────────────┘
         │ 通過，取得 lineUserId
         ▼
┌─────────────────────────┐
│  Module 2: Auth Service │  POST GAS → findMemberByLineUserId
└────────┬────────────────┘
         │
    ┌────┴─────┐
    │          │
  已綁定     未綁定
    │          │
    │    ┌─────▼──────────────────┐
    │    │  BindingForm           │  輸入 Email / 密碼
    │    │  POST GAS → bindLineUserId
    │    └─────┬──────────────────┘
    │          │ 綁定完成，取得 Session
    └────┬─────┘
         ▼
┌─────────────────────────┐
│  Module 3: Friend Guard │  POST GAS → checkFriendship
└────────┬────────────────┘
         │
    ┌────┴─────┐
    │          │
  已加友     未加友
    │          │
    │    ┌─────▼──────────────────┐
    │    │  FriendInvitePage      │  引導加好友
    │    └─────┬──────────────────┘
    │          │ 「我已加入好友」→ 再次 checkFriendship
    └────┬─────┘
         ▼
┌─────────────────────────┐
│  BookingPage            │  POST GAS → createBooking
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Module 4: Notification │  POST GAS → sendNotification
│                         │  → LINE Push + Gmail
└─────────────────────────┘
```

---

## 四、Google Sheets 資料表設計

### Members

| 欄位       | 型別    | 說明                             |
| ---------- | ------- | -------------------------------- |
| id         | string  | UUID                             |
| email      | string  | 登入用 Email                     |
| password   | string  | 明文（PoC），正式版換 bcrypt     |
| lineUserId | string  | LINE userId，空白代表純 Web 用戶 |
| name       | string  | 顯示名稱                         |
| isFriend   | boolean | 是否已加 LINE@ 好友              |
| createdAt  | string  | ISO 8601                         |

### Tokens

| 欄位       | 型別   | 說明                        |
| ---------- | ------ | --------------------------- |
| token      | string | 圖文選單帶入的 token 值     |
| lineUserId | string | 此 token 對應的 LINE userId |
| expiresAt  | string | ISO 8601，空白代表永不過期  |

### Bookings

| 欄位      | 型別   | 說明                                |
| --------- | ------ | ----------------------------------- |
| id        | string | UUID                                |
| memberId  | string | 對應 Members.id                     |
| date      | string | YYYY-MM-DD                          |
| time      | string | HH:mm                               |
| service   | string | 服務項目                            |
| note      | string | 備註                                |
| status    | string | confirmed / cancelled / rescheduled |
| createdAt | string | ISO 8601                            |

### NotificationLog

| 欄位        | 型別   | 說明                                           |
| ----------- | ------ | ---------------------------------------------- |
| timestamp   | string | ISO 8601                                       |
| type        | string | confirmed / reminder / cancelled / rescheduled |
| lineUserId  | string | 推播對象                                       |
| emailTo     | string | Email 收件人（逗號分隔）                       |
| lineStatus  | string | LINE API 回應狀態                              |
| emailStatus | string | MailApp 發送狀態                               |
| payload     | string | JSON stringify 完整 payload                    |

---

## 五、GAS Web App 實作（完整骨架）

```js
const SHEET_ID = "YOUR_SPREADSHEET_ID";
const LINE_CHANNEL_TOKEN = "YOUR_LINE_CHANNEL_ACCESS_TOKEN";

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const { action, ...params } = body;

  const handlers = {
    validateToken: () => validateToken(params),
    findMemberByLineUserId: () => findMemberByLineUserId(params),
    bindLineUserId: () => bindLineUserId(params),
    checkFriendship: () => checkFriendship(params),
    createBooking: () => createBooking(params),
    cancelBooking: () => updateBookingStatus(params, "cancelled"),
    rescheduleBooking: () => rescheduleBooking(params),
    sendNotification: () => sendNotification(params),
  };

  const result = handlers[action]
    ? handlers[action]()
    : { success: false, error: "unknown action" };

  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// ── 工具函式 ────────────────────────────────────

function getSheet(name) {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
}

function sheetToObjects(sheet) {
  const [headers, ...rows] = sheet.getDataRange().getValues();
  return rows.map((row) =>
    Object.fromEntries(headers.map((h, i) => [h, row[i]]))
  );
}

function generateId() {
  return Utilities.getUuid();
}

// ── Module 1：Token 驗證 ──────────────────────────

function validateToken({ token }) {
  if (!token) return { valid: false, reason: "missing" };

  const rows = sheetToObjects(getSheet("Tokens"));
  const record = rows.find((r) => r.token === token);

  if (!record) return { valid: false, reason: "invalid" };
  if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true, lineUserId: record.lineUserId };
}

// ── Module 2：雙軌身分綁定 ───────────────────────

function findMemberByLineUserId({ lineUserId }) {
  const members = sheetToObjects(getSheet("Members"));
  const member = members.find((m) => m.lineUserId === lineUserId) || null;
  return { member };
}

function bindLineUserId({ email, password, lineUserId }) {
  const sheet = getSheet("Members");
  const members = sheetToObjects(sheet);
  const existing = members.find((m) => m.email === email);

  if (existing) {
    // 既有 Web 帳號：驗證密碼後綁定
    if (existing.password !== password) {
      return { success: false, error: "密碼錯誤" };
    }
    // 更新 lineUserId 欄位
    const rowIndex = members.indexOf(existing) + 2; // +2 for header & 1-index
    const headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0];
    const lineUserIdCol = headers.indexOf("lineUserId") + 1;
    sheet.getRange(rowIndex, lineUserIdCol).setValue(lineUserId);

    const session = buildSession(existing, lineUserId);
    return { success: true, session };
  }

  // 全新用戶：建立帳號並直接綁定
  const newMember = {
    id: generateId(),
    email,
    password,
    lineUserId,
    name: email.split("@")[0],
    isFriend: false,
    createdAt: new Date().toISOString(),
  };
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map((h) => newMember[h] ?? ""));

  const session = buildSession(newMember, lineUserId);
  return { success: true, session };
}

function buildSession(member, lineUserId) {
  return {
    memberId: member.id,
    email: member.email,
    lineUserId,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  };
}

// ── Module 3：好友狀態檢查 ───────────────────────

function checkFriendship({ lineUserId }) {
  const members = sheetToObjects(getSheet("Members"));
  const member = members.find((m) => m.lineUserId === lineUserId);
  return { isFriend: member ? member.isFriend === true : false };
}

// ── 預約相關 ─────────────────────────────────────

function createBooking({ memberId, date, time, service, note }) {
  const sheet = getSheet("Bookings");
  const id = generateId();
  const booking = {
    id,
    memberId,
    date,
    time,
    service,
    note,
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map((h) => booking[h] ?? ""));
  return { success: true, booking };
}

function updateBookingStatus({ bookingId }, status) {
  const sheet = getSheet("Bookings");
  const bookings = sheetToObjects(sheet);
  const idx = bookings.findIndex((b) => b.id === bookingId);
  if (idx === -1) return { success: false, error: "預約不存在" };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const statusCol = headers.indexOf("status") + 1;
  sheet.getRange(idx + 2, statusCol).setValue(status);
  return { success: true };
}

function rescheduleBooking({ bookingId, newDate, newTime }) {
  const sheet = getSheet("Bookings");
  const bookings = sheetToObjects(sheet);
  const idx = bookings.findIndex((b) => b.id === bookingId);
  if (idx === -1) return { success: false, error: "預約不存在" };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = idx + 2;
  sheet.getRange(row, headers.indexOf("date") + 1).setValue(newDate);
  sheet.getRange(row, headers.indexOf("time") + 1).setValue(newTime);
  sheet.getRange(row, headers.indexOf("status") + 1).setValue("rescheduled");
  return { success: true };
}

// ── Module 4：通知服務 ────────────────────────────

function sendNotification({ type, lineUserId, memberEmail, booking, extra }) {
  const linePayload = buildLinePayload(type, booking, extra);
  const emailPayload = buildEmailPayload(type, memberEmail, booking, extra);

  let lineStatus = "skipped";
  let emailStatus = "skipped";

  // LINE Push
  try {
    const res = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
      method: "post",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_CHANNEL_TOKEN}`,
      },
      payload: JSON.stringify({ to: lineUserId, messages: [linePayload] }),
    });
    lineStatus =
      res.getResponseCode() === 200
        ? "success"
        : `error:${res.getResponseCode()}`;
  } catch (err) {
    lineStatus = `error:${err.message}`;
  }

  // Email（給總部與美容師）
  try {
    MailApp.sendEmail({
      to: emailPayload.to,
      subject: emailPayload.subject,
      body: emailPayload.body,
    });
    emailStatus = "success";
  } catch (err) {
    emailStatus = `error:${err.message}`;
  }

  // 寫入 NotificationLog
  const logSheet = getSheet("NotificationLog");
  logSheet.appendRow([
    new Date().toISOString(),
    type,
    lineUserId,
    emailPayload.to,
    lineStatus,
    emailStatus,
    JSON.stringify({ linePayload, emailPayload }),
  ]);

  return { success: true, lineStatus, emailStatus };
}

function buildLinePayload(type, booking, extra) {
  const titleMap = {
    confirmed: "預約確認 ✅",
    reminder: "預約提醒 🔔",
    cancelled: "預約取消 ❌",
    rescheduled: "預約改期 📅",
  };
  const contents = [
    { type: "text", text: titleMap[type], weight: "bold", size: "xl" },
    {
      type: "text",
      text: `日期：${extra?.newDate ?? booking.date}`,
      size: "sm",
    },
    {
      type: "text",
      text: `時間：${extra?.newTime ?? booking.time}`,
      size: "sm",
    },
    { type: "text", text: `服務：${booking.service}`, size: "sm" },
  ];
  return {
    type: "flex",
    altText: titleMap[type],
    contents: {
      type: "bubble",
      body: { type: "box", layout: "vertical", contents },
    },
  };
}

function buildEmailPayload(type, memberEmail, booking, extra) {
  const subjectMap = {
    confirmed: `新預約通知`,
    reminder: `預約提醒（明日）`,
    cancelled: `預約取消通知`,
    rescheduled: `預約改期通知`,
  };
  return {
    to: "headquarters@example.com,beautician@example.com",
    subject: `${subjectMap[type]} - ${memberEmail} (${extra?.newDate ?? booking.date} ${extra?.newTime ?? booking.time})`,
    body: `會員：${memberEmail}\n服務：${booking.service}\n日期：${extra?.newDate ?? booking.date}\n時間：${extra?.newTime ?? booking.time}\n狀態：${type}\n備註：${booking.note || "無"}`,
  };
}
```

---

## 六、前端 services 層（呼叫 GAS）

所有 service 函式統一透過一個 `gasClient` 包裝，只需設定一個 GAS Web App URL：

### services/gasClient.ts

```ts
const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL!;

export async function gasCall<T>(
  action: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" }, // GAS 需要 text/plain 避免 CORS preflight
    body: JSON.stringify({ action, ...params }),
  });
  if (!res.ok) throw new Error(`GAS error: ${res.status}`);
  return res.json();
}
```

> GAS CORS 注意：`Content-Type: text/plain` 可繞過 preflight，是呼叫 GAS doPost 的標準前端做法。

### services/tokenGuard.ts

```ts
import { gasCall } from "./gasClient";
import type { TokenValidationResult } from "../types";

export async function validateToken(
  token: string | null
): Promise<TokenValidationResult> {
  return gasCall<TokenValidationResult>("validateToken", { token });
}
```

### services/authService.ts

```ts
import { gasCall } from "./gasClient";
import type { Member, AuthSession } from "../types";

export const findMemberByLineUserId = (lineUserId: string) =>
  gasCall<{ member: Member | null }>("findMemberByLineUserId", { lineUserId });

export const bindLineUserId = (
  email: string,
  password: string,
  lineUserId: string
) =>
  gasCall<{ success: boolean; session: AuthSession | null; error?: string }>(
    "bindLineUserId",
    { email, password, lineUserId }
  );

export const checkFriendship = (lineUserId: string) =>
  gasCall<{ isFriend: boolean }>("checkFriendship", { lineUserId });
```

### services/notificationService.ts

```ts
import { gasCall } from "./gasClient";
import type { NotifyPayload } from "../types";

export const notificationService = {
  notifyBookingConfirmed: (p: NotifyPayload) =>
    gasCall("sendNotification", { type: "confirmed", ...flattenPayload(p) }),

  notifyReminder: (p: NotifyPayload) =>
    gasCall("sendNotification", { type: "reminder", ...flattenPayload(p) }),

  notifyBookingCancelled: (p: NotifyPayload) =>
    gasCall("sendNotification", { type: "cancelled", ...flattenPayload(p) }),

  notifyBookingRescheduled: (
    p: NotifyPayload,
    newDate: string,
    newTime: string
  ) =>
    gasCall("sendNotification", {
      type: "rescheduled",
      ...flattenPayload(p),
      extra: { newDate, newTime },
    }),
};

function flattenPayload(p: NotifyPayload) {
  return { lineUserId: p.lineUserId, memberEmail: p.email, booking: p.booking };
}
```

---

## 七、型別定義（types/index.ts）

```ts
export type LineTestStep =
  | "validating"
  | "token_error"
  | "auth"
  | "binding"
  | "friend_check"
  | "friend_invite"
  | "booking"
  | "booking_success";

export interface TokenValidationResult {
  valid: boolean;
  reason?: "missing" | "expired" | "invalid";
  lineUserId?: string;
}

export interface Member {
  id: string;
  email: string;
  lineUserId?: string;
  name: string;
  isFriend: boolean;
  createdAt: string;
}

export interface AuthSession {
  memberId: string;
  email: string;
  lineUserId: string;
  expiresAt: number;
}

export interface BookingForm {
  date: string;
  time: string;
  service: string;
  note: string;
}

export interface Booking extends BookingForm {
  id: string;
  memberId: string;
  status: "confirmed" | "cancelled" | "rescheduled";
  createdAt: string;
}

export interface NotifyPayload {
  memberId: string;
  lineUserId: string;
  email: string;
  booking: Booking;
}
```

---

## 八、Zustand Store（store/useLineTestStore.ts）

```ts
interface LineTestState {
  step: LineTestStep;
  setStep: (step: LineTestStep) => void;

  rawToken: string | null;
  tokenError: string | null;
  lineUserId: string | null;

  session: AuthSession | null;
  setSession: (session: AuthSession | null) => void;

  isFriend: boolean;
  setIsFriend: (val: boolean) => void;

  currentBooking: Booking | null;
  setCurrentBooking: (booking: Booking | null) => void;

  // 從 URL token 啟動整個流程
  initialize: (token: string | null) => Promise<void>;
}
```

`initialize` 的執行邏輯：

```
1. setStep("validating")
2. gasCall validateToken(token)
3. 失敗 → setStep("token_error")
4. 成功 → 取得 lineUserId → gasCall findMemberByLineUserId
5. 有 member → setSession → setStep("friend_check")
6. 無 member → setStep("binding")
```

---

## 九、主元件狀態機（components/lineTestPage.tsx）

```
step === "validating"      → <LoadingSpinner />
step === "token_error"     → <TokenErrorPage />
step === "auth"            → (中間態，initialize 內部自動跳過)
step === "binding"         → <BindingForm />
step === "friend_check"    → <LoadingSpinner />
step === "friend_invite"   → <FriendInvitePage />
step === "booking"         → <BookingPage />
step === "booking_success" → <BookingSuccessPage />
```

---

## 十、完整檔案結構

```
src/app/(tools)/lineTest/
├── page.tsx
├── components/
│   ├── lineTestPage.tsx
│   ├── TokenErrorPage.tsx
│   ├── AuthPage.tsx
│   ├── BindingForm.tsx
│   ├── FriendInvitePage.tsx
│   ├── BookingPage.tsx
│   ├── BookingSuccessPage.tsx
│   └── NotificationDemoPanel.tsx
├── services/
│   ├── gasClient.ts              ← GAS 呼叫統一入口
│   ├── tokenGuard.ts
│   ├── authService.ts
│   └── notificationService.ts
├── store/
│   └── useLineTestStore.ts
├── types/
│   └── index.ts
├── doc/
│   └── implementation_plan.md
└── styles/
    └── lineTest.module.css
```

> `mock/` 資料夾已移除，資料層全部由 GAS + Sheets 承擔。

---

## 十一、Demo 測試情境

| 情境                    | Sheets Tokens 設定                          | 預期流程                                                |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------- |
| 已綁定 + 已加好友       | token-001 → Alice（isFriend=true）          | Token → 自動登入 → 好友確認 → 預約 → LINE 推播          |
| 未綁定新用戶 + 未加好友 | token-002 → 新 lineUserId（isFriend=false） | Token → 綁定表單 → 綁定 → 引導加好友 → 預約 → LINE 推播 |
| 無效 token              | Tokens 表無此筆                             | Token 驗證失敗頁                                        |
| 缺少 token              | 無 query                                    | Token 驗證失敗頁                                        |

---

## 十二、環境變數設定

`.env.local`：

```
NEXT_PUBLIC_GAS_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
```

---

## 十三、實作順序建議

```
Phase 1  GAS 後端
  [ ] 建立 Google Sheets（四個工作表 + 欄位標題）
  [ ] 填入初始測試資料（Tokens、Members）
  [ ] 部署 GAS doPost Web App（執行身分：我、存取：所有人）
  [ ] 用 Postman / curl 測試各 action

Phase 2  前端基礎架構
  [ ] types/index.ts
  [ ] services/gasClient.ts
  [ ] store/useLineTestStore.ts

Phase 3  四個核心 Services
  [ ] services/tokenGuard.ts
  [ ] services/authService.ts
  [ ] services/notificationService.ts

Phase 4  UI 元件（按流程順序）
  [ ] TokenErrorPage.tsx
  [ ] BindingForm.tsx
  [ ] FriendInvitePage.tsx
  [ ] BookingPage.tsx + BookingSuccessPage.tsx
  [ ] NotificationDemoPanel.tsx（手動觸發四種通知）

Phase 5  主路由樞紐串通
  [ ] lineTestPage.tsx（接線、狀態機完整串通）

Phase 6  驗收
  [ ] 跑完四個測試情境
  [ ] 確認 LINE 真實收到推播
  [ ] 確認 NotificationLog 有寫入紀錄
  [ ] npm run build 無錯誤
```

---

## 十四、正式上線替換清單

| GAS / Sheets PoC             | 正式版替換方案                     |
| ---------------------------- | ---------------------------------- |
| GAS doPost                   | Next.js API Routes 或 Node.js 後端 |
| Google Sheets                | PostgreSQL / Supabase              |
| 明文密碼                     | bcrypt hash                        |
| GAS `UrlFetchApp` → LINE API | 後端直接呼叫 LINE Messaging API    |
| GAS `MailApp`                | Nodemailer / Resend                |
| URL Query lineUserId         | LIFF SDK `liff.getProfile()`       |
| GAS Web App URL（公開）      | 有 JWT 驗證的私有 API              |
