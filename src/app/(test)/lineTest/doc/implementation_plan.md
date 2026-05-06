# LINE 串接整合 PoC — 實作計畫

> **目標**：以 GAS + Google Sheets 作為輕量後端與資料庫，驗證「Web 會員系統 × LINE 生態系深度綁定」的完整架構可行性。通知模組可真實打通 LINE Messaging API，後續只需替換 GAS 層為正式後端即可上線。

> **文件狀態**（2025-05）：Phase 1–5 已完成，Phase 6（Web 端常規登入 + 密碼重設）為 SA 1-2 待補項目。

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
│  ├── getBookings()                             │
│  ├── createBooking()                           │
│  ├── cancelBooking()                           │
│  ├── rescheduleBooking()                       │
│  ├── sendNotification() ────────────────────► LINE Messaging API
│  │                      ────────────────────► Gmail (MailApp)
│  ├── loginWithEmail()        ← [待實作]
│  ├── sendResetEmail()        ← [待實作]
│  └── resetPassword()         ← [待實作]
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
│  ├── NotificationLog  推播發送歷程             │
│  └── PasswordResetTokens  重設密碼 Token ← [待實作]
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

### LINE 入口流程（已完成）

```
LINE@ 圖文選單（token=xxx）
    │
    │  GET /lineTest?token=xxx
    ▼
┌─────────────────────────┐
│  LandingPage            │  顯示登陸頁，點擊「立即預約」啟動流程
└────────┬────────────────┘
         │ 點擊觸發 initialize(token)
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
│  FriendCheckLoader      │  POST GAS → checkFriendship（loading 態）
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
│  DashboardPage          │  預約清單，可取消/改期，進入 BookingPage
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  BookingPage            │  POST GAS → createBooking
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Module 4: Notification │  POST GAS → sendNotification
│  BookingSuccessPage     │  → LINE Push + Gmail
└─────────────────────────┘
```

### Web 端常規登入流程（待實作 — SA 1-2）

```
網站會員中心入口（非 LINE）
    │
    ▼
┌─────────────────────────┐
│  WebLoginPage           │  信箱 + 密碼表單（待新增元件）
└────────┬────────────────┘
         │ POST GAS → loginWithEmail
    ┌────┴─────┐
    │          │
  成功       失敗（密碼錯誤）
    │          │
    │    顯示錯誤訊息
    ▼
DashboardPage（帶 session）

忘記密碼流程：
WebLoginPage → 點「忘記密碼」→ ResetPasswordPage
  → 輸入 Email → POST GAS → sendResetEmail
  → 用戶收 Email → 點連結 → ResetPasswordConfirmPage
  → 輸入新密碼 → POST GAS → resetPassword
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

> ⚠️ **Google Sheets 日期時間格式注意**：Sheets 的日期欄位有時會回傳 ISO datetime 字串（需取前 10 碼）；時間欄位會帶 `1899-12-30T` 前綴（需取 `split("T")[1].substring(0,5)`）。前端的 `DashboardPage` 已實作 `fmtDate` / `fmtTime` 轉換 helper 處理此問題。

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

### PasswordResetTokens（待建立 — SA 1-2）

| 欄位      | 型別    | 說明                      |
| --------- | ------- | ------------------------- |
| token     | string  | UUID，Email 連結帶入      |
| email     | string  | 申請重設的會員 Email      |
| expiresAt | string  | ISO 8601（建議 1 小時後） |
| used      | boolean | 是否已使用                |

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
    getBookings: () => getBookings(params),
    cancelBooking: () => updateBookingStatus(params, "cancelled"),
    rescheduleBooking: () => rescheduleBooking(params),
    sendNotification: () => sendNotification(params),
    // 待實作 SA 1-2
    loginWithEmail: () => loginWithEmail(params),
    sendResetEmail: () => sendResetEmail(params),
    resetPassword: () => resetPassword(params),
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
    if (existing.password !== password) {
      return { success: false, error: "密碼錯誤" };
    }
    const rowIndex = members.indexOf(existing) + 2;
    const headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0];
    const lineUserIdCol = headers.indexOf("lineUserId") + 1;
    sheet.getRange(rowIndex, lineUserIdCol).setValue(lineUserId);

    const session = buildSession(existing, lineUserId);
    return { success: true, session };
  }

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

// ── Module 2-B：Web 端常規登入（待實作 SA 1-2）──

function loginWithEmail({ email, password }) {
  const members = sheetToObjects(getSheet("Members"));
  const member = members.find((m) => m.email === email);

  if (!member) return { success: false, error: "帳號不存在" };
  if (member.password !== password)
    return { success: false, error: "密碼錯誤" };

  const session = buildSession(member, member.lineUserId || "");
  return { success: true, session };
}

function sendResetEmail({ email }) {
  const members = sheetToObjects(getSheet("Members"));
  const member = members.find((m) => m.email === email);
  if (!member) return { success: false, error: "帳號不存在" };

  const token = generateId();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const sheet = getSheet("PasswordResetTokens");
  sheet.appendRow([token, email, expiresAt, false]);

  const resetUrl = `YOUR_DOMAIN/lineTest/reset-password?token=${token}`;
  MailApp.sendEmail({
    to: email,
    subject: "密碼重設連結",
    body: `請點擊以下連結重設密碼（連結 1 小時內有效）：\n${resetUrl}`,
  });

  return { success: true };
}

function resetPassword({ token, newPassword }) {
  const sheet = getSheet("PasswordResetTokens");
  const records = sheetToObjects(sheet);
  const record = records.find((r) => r.token === token && !r.used);

  if (!record) return { success: false, error: "連結無效或已使用" };
  if (new Date(record.expiresAt) < new Date()) {
    return { success: false, error: "連結已過期" };
  }

  const memberSheet = getSheet("Members");
  const members = sheetToObjects(memberSheet);
  const idx = members.findIndex((m) => m.email === record.email);
  if (idx === -1) return { success: false, error: "帳號不存在" };

  const headers = memberSheet
    .getRange(1, 1, 1, memberSheet.getLastColumn())
    .getValues()[0];
  memberSheet
    .getRange(idx + 2, headers.indexOf("password") + 1)
    .setValue(newPassword);

  // 標記 token 已使用
  const resetHeaders = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0];
  sheet
    .getRange(records.indexOf(record) + 2, resetHeaders.indexOf("used") + 1)
    .setValue(true);

  return { success: true };
}

// ── Module 3：好友狀態檢查 ───────────────────────

function checkFriendship({ lineUserId }) {
  const members = sheetToObjects(getSheet("Members"));
  const member = members.find((m) => m.lineUserId === lineUserId);
  return { isFriend: member ? member.isFriend === true : false };
}

// ── 預約相關 ─────────────────────────────────────

function getBookings({ memberId }) {
  const sheet = getSheet("Bookings");
  const bookings = sheetToObjects(sheet);
  const result = bookings.filter((b) => b.memberId === memberId);
  return { bookings: result };
}

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
    confirmed: "新預約通知",
    reminder: "預約提醒（明日）",
    cancelled: "預約取消通知",
    rescheduled: "預約改期通知",
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

所有 service 函式統一透過一個 `gasClient` 包裝。

> ⚠️ 目前 `gasClient.ts` 的 GAS URL 為硬編碼，正式版應改為 `process.env.NEXT_PUBLIC_GAS_URL`。

### services/gasClient.ts

```ts
// 目前為硬編碼，待移至 .env.local
const GAS_URL = "https://script.google.com/macros/s/AKfycb.../exec";

export async function gasCall<T>(
  action: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" }, // text/plain 避免 CORS preflight
    body: JSON.stringify({ action, ...params }),
  });
  if (!res.ok) throw new Error(`GAS error: ${res.status}`);
  return res.json();
}
```

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

// 待實作 SA 1-2
export const loginWithEmail = (email: string, password: string) =>
  gasCall<{ success: boolean; session: AuthSession | null; error?: string }>(
    "loginWithEmail",
    { email, password }
  );

export const sendResetEmail = (email: string) =>
  gasCall<{ success: boolean; error?: string }>("sendResetEmail", { email });

export const resetPassword = (token: string, newPassword: string) =>
  gasCall<{ success: boolean; error?: string }>("resetPassword", {
    token,
    newPassword,
  });
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
// 實際狀態機 step（已與程式碼同步）
export type LineTestStep =
  | "landing" // 初始登陸頁
  | "validating" // Token 驗證中
  | "token_error" // Token 無效
  | "binding" // 新用戶綁定表單
  | "friend_check" // 好友狀態檢查中（loading）
  | "friend_invite" // 引導加好友
  | "dashboard" // 預約管理頁（已驗證用戶主頁）
  | "booking" // 填寫預約表單
  | "booking_success"; // 預約成功頁

export type TokenValidationResult =
  | { valid: true; lineUserId: string }
  | { valid: false; reason: "missing" | "expired" | "invalid" };

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
  name?: string; // 顯示會員姓名（2026-05 新增）
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
  setRawToken: (token: string | null) => void;

  tokenError: string | null;
  lineUserId: string | null;

  session: AuthSession | null;
  setSession: (session: AuthSession | null) => void;

  isFriend: boolean;
  setIsFriend: (val: boolean) => void;

  currentBooking: Booking | null;
  setCurrentBooking: (booking: Booking | null) => void;

  initialize: (token: string | null) => Promise<void>;
}
```

`initialize` 執行邏輯：

```
1. setStep("validating")
2. gasCall validateToken(token)
3. 失敗 → setStep("token_error")
4. 成功 → 取得 lineUserId
5. gasCall findMemberByLineUserId(lineUserId)
6. 有 member → setSession → setStep("friend_check")
7. 無 member → setStep("binding")
```

---

## 九、主元件狀態機（components/lineTestPage.tsx）

```
step === "landing"         → <LandingPage />            ← 初始頁，點擊啟動 initialize
step === "validating"      → <LoadingSpinner />
step === "token_error"     → <TokenErrorPage />
step === "binding"         → <BindingForm />
step === "friend_check"    → <FriendCheckLoader />       ← loading 態，自動跳轉
step === "friend_invite"   → <FriendInvitePage />
step === "dashboard"       → <DashboardPage />           ← 已驗證用戶主頁
step === "booking"         → <BookingPage />
step === "booking_success" → <BookingSuccessPage />
```

---

## 十、完整檔案結構（當前實際狀態）

```
src/app/(tools)/lineTest/
├── page.tsx                          ← Server Component，SEO metadata + Suspense
├── components/
│   ├── lineTestPage.tsx              ← 主狀態機路由器
│   ├── LandingPage.tsx               ← 登陸頁（LINE 認證入口）
│   ├── TokenErrorPage.tsx            ← Token 驗證失敗頁
│   ├── BindingForm.tsx               ← 信箱密碼綁定表單（新用戶）
│   ├── FriendCheckLoader.tsx         ← 好友狀態檢查 loading 頁
│   ├── FriendInvitePage.tsx          ← 引導加 LINE@ 好友
│   ├── BookingPage.tsx               ← 預約填寫表單
│   ├── BookingSuccessPage.tsx        ← 預約成功 + Demo 通知面板
│   ├── DashboardPage.tsx             ← 預約管理儀表板（清單/取消/改期）
│   ├── WebLoginPage.tsx              ← [待新增] Web 端常規登入
│   ├── ResetPasswordPage.tsx         ← [待新增] 忘記密碼申請頁
│   └── ResetPasswordConfirmPage.tsx  ← [待新增] 密碼重設確認頁
├── services/
│   ├── gasClient.ts                  ← GAS 呼叫統一入口（URL 待移至 env）
│   ├── tokenGuard.ts                 ← Token 驗證
│   ├── authService.ts                ← 身分認證（含待實作的 Web 登入）
│   └── notificationService.ts        ← LINE Push + Email 通知
├── store/
│   └── useLineTestStore.ts           ← Zustand 全局狀態
├── types/
│   └── index.ts                      ← 統一型別出口
├── styles/
│   └── lineTest.module.css
└── doc/
    └── implementation_plan.md
```

---

## 十一、Demo 測試情境

| 情境                    | Sheets Tokens 設定                          | 預期流程                                                     |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| 已綁定 + 已加好友       | token-001 → Alice（isFriend=true）          | Token → 自動登入 → 好友確認 → Dashboard → 預約 → LINE 推播   |
| 未綁定新用戶 + 未加好友 | token-002 → 新 lineUserId（isFriend=false） | Token → 綁定表單 → 引導加好友 → Dashboard → 預約 → LINE 推播 |
| 無效 token              | Tokens 表無此筆                             | Token 驗證失敗頁                                             |
| 缺少 token              | 無 query                                    | Token 驗證失敗頁                                             |
| Web 端登入（待實作）    | Members 有帳號                              | WebLoginPage → 信箱+密碼 → Dashboard                         |
| 忘記密碼（待實作）      | Members 有帳號                              | WebLoginPage → 忘記密碼 → Email → 重設連結 → 完成            |

---

## 十二、環境變數設定

`.env.local`：

```
NEXT_PUBLIC_GAS_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
```

> ⚠️ **目前 `gasClient.ts` 中 URL 為硬編碼**，需將真實 URL 移至 `.env.local` 並改回 `process.env.NEXT_PUBLIC_GAS_URL!`。

---

## 十三、實作進度

```
Phase 1  GAS 後端
  ✅ 建立 Google Sheets（四個工作表 + 欄位標題）
  ✅ 填入初始測試資料（Tokens、Members）
  ✅ 部署 GAS doPost Web App
  ✅ 各 action 基本驗證

Phase 2  前端基礎架構
  ✅ types/index.ts
  ✅ services/gasClient.ts
  ✅ store/useLineTestStore.ts

Phase 3  四個核心 Services
  ✅ services/tokenGuard.ts
  ✅ services/authService.ts
  ✅ services/notificationService.ts

Phase 4  UI 元件（LINE 入口流程）
  ✅ LandingPage.tsx
  ✅ TokenErrorPage.tsx
  ✅ BindingForm.tsx
  ✅ FriendCheckLoader.tsx
  ✅ FriendInvitePage.tsx
  ✅ BookingPage.tsx
  ✅ BookingSuccessPage.tsx（含 Demo 通知面板）
  ✅ DashboardPage.tsx（預約清單、取消、改期）

Phase 5  主路由樞紐串通
  ✅ lineTestPage.tsx（狀態機完整串通）

Phase 6  Web 端常規登入（SA 1-2 — 已完成）
  ✅ GAS：新增 loginWithEmail action
  ✅ GAS：新增 sendResetEmail action
  ✅ GAS：新增 resetPassword action
  ✅ Sheets：建立 PasswordResetTokens 工作表
  ✅ authService.ts：補齊三個 Web 登入相關 function
  ✅ LandingPage.tsx：無 token 時顯示「會員登入」按鈕 + Modal（登入／忘記密碼／已發送）
  ✅ ResetPasswordConfirmPage.tsx：讀取 URL resetToken 執行密碼重設
  ✅ lineTestPage.tsx 狀態機：偵測 resetToken query param → reset_password step
  ✅ types/index.ts：LineTestStep 補上 reset_password

Phase 7  LINE 通知補齊（SA 4-1）
  ✅ 前日提醒：以 DashboardPage Demo 面板手動觸發替代（PoC 階段）
  ⏭️ GAS 時間觸發器（dailyReminderJob）：暫緩，正式上線時再設定

Phase 8  收尾
  [ ] gasClient.ts：GAS URL 改為 process.env.NEXT_PUBLIC_GAS_URL
  [ ] 跑完全部測試情境（含 Web 登入 + 密碼重設）
  [ ] 確認 LINE 真實收到推播與前日提醒
  [ ] 確認 NotificationLog 有寫入紀錄
  [ ] npm run build 無錯誤
```

---

## 十四、正式上線替換清單

| GAS / Sheets PoC               | 正式版替換方案                     |
| ------------------------------ | ---------------------------------- |
| GAS doPost                     | Next.js API Routes 或 Node.js 後端 |
| Google Sheets                  | PostgreSQL / Supabase              |
| 明文密碼                       | bcrypt hash                        |
| GAS `UrlFetchApp` → LINE API   | 後端直接呼叫 LINE Messaging API    |
| GAS `MailApp`                  | Nodemailer / Resend                |
| URL Query lineUserId           | LIFF SDK `liff.getProfile()`       |
| GAS Web App URL（公開）        | 有 JWT 驗證的私有 API              |
| Zustand session（前端記憶體）  | httpOnly Cookie / Server Session   |
| 硬編碼 GAS URL in gasClient.ts | process.env.NEXT_PUBLIC_GAS_URL    |
