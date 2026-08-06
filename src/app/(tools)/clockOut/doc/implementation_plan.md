# 下班倒數（clockOut）實作計畫

> 遊戲化的下班倒數工具：把「等下班」變成一場每天都在練等的 RPG。
> 使用者設定上班 / 下班時間，畫面以「EXP 經驗值進度條」即時呈現距離下班的進度，
> 進度滿載時以水豚君「下班啦」達成畫面獎勵使用者。

---

## 開發三階段總覽

| 階段        | 內容               | 產出                      | 狀態          |
| ----------- | ------------------ | ------------------------- | ------------- |
| **Phase 1** | 需求規劃（本文件） | `implementation_plan.md`  | ✅ 進行中     |
| **Phase 2** | UI/UX 設計         | Claude Artifact 互動 Demo | ✅ 完成       |
| **Phase 3** | 正式實作           | 頁面功能 + 元件 + store   | ✅ 第一版完成 |

> Phase 2 Demo（復古電玩像素風）：https://claude.ai/code/artifact/4dad1f63-f509-4194-b7f9-1ccbb4322e64
> 原始檔：`doc/ui-demo.html`

---

## 一、功能需求（Requirements）

### 1.1 使用者輸入（最小完整集合）

僅需 **2 個時間**，缺一不可：

| 欄位             | 格式                             | 用途                         | 必填 |
| ---------------- | -------------------------------- | ---------------------------- | ---- |
| 工時（分鐘）     | 設定一次                         | 進度分母來源之一             | ✅   |
| 午休（分鐘）     | 設定一次                         | 進度分母來源之一             | ✅   |
| 上班時間 `HH:mm` | 每天填/打卡（記住上次）          | 進度條起點（0%）             | ✅   |
| 下班時間 `HH:mm` | **自動算出**，可手動覆寫（加班） | 進度條終點（100%）+ 倒數目標 | ✅   |

> **模型定案（Phase 3）**：改採「工時 + 午休設定一次 + 每天上班時間」。
> `下班（自動） = 上班 + 工時 + 午休`；使用者可手動調整下班（臨時加班/早退），
> 該覆寫僅對今日有效（存日期，隔天自動歸位）。固定班因「記住上班時間」而零日常輸入；
> 彈性/輪班班可用「🟢 現在打卡」一鍵設定上班。現在時間由系統自動抓取。

### 1.2 核心計算

```
剩餘時間 = 下班時間 − 現在時間
進度百分比 = (現在 − 上班) / (下班 − 上班) × 100%
```

驗證範例（上班 09:00、下班 17:50、現在 17:10）：
`(17:10−09:00) / (17:50−09:00) = 490/530 ≈ 92.45%` ✅

### 1.3 顯示內容（未達下班時）

```
現在時間 13:32（次要，小字）
距離下班還有  4 小時 23 分鐘   ← 極致放大，畫面主角
EXP [▓▓▓░░░░░]  50.8%
鼓勵語：進度過半，摸魚更心安 🐟   ← 每 1% 換一句
```

### 1.4 達成下班（進度 ≥ 100%）

- 全螢幕呈現水豚君達成圖：`/images/clockOut/clockout_done.png`（頭頂橘子、揹包小跑步、「下班啦」）
- 搭配撒花 / 特效 / 可選音效
- 進度條顯示 `100% ・ 自由之身 🕊️`

---

## 二、資料模型（Data Model）

localStorage key：`clockOut:settings`

持久化（Zustand persist，`useClockOutStore`）：

```ts
{
  workMinutes: number; // 工時（分鐘）設定一次
  lunchMinutes: number; // 午休（分鐘）設定一次
  clockInTime: string; // 上班時間 "HH:mm"（記住上次）
  overrideEndTime: string | null; // 今日手動下班時間
  overrideDate: string | null; // override 對應日期 "YYYY-MM-DD"（隔天失效）
  configured: boolean; // 是否完成首次設定
}
```

> 下班（實際） = `overrideDate === 今日 ? overrideEndTime : computeEndTime(clockIn, work, lunch)`。
> 現在時間 `now` 由頁面每秒 tick 的 local state 管理（不持久化），`visibilitychange` 重新校時。

---

## 三、EXP 進度條視覺規格（復古 MMORPG 風）

目標：還原參考圖（楓之谷 / RO 經驗條風格），純 CSS 實作。

| 元素 | 規格                                                                       |
| ---- | -------------------------------------------------------------------------- |
| 底槽 | 近黑深色、細邊框、方正（非圓角膠囊）、矮長條                               |
| 填充 | 亮萊姆綠**垂直漸層**（上亮 `#a4e800` → 下深 `#5a9e00`）                    |
| 光澤 | 上緣 inset 高光亮線，營造玻璃反光質感                                      |
| 疊字 | 左「EXP」、中央數值 `[XX.XX%]`，白字 + 黑色 `text-shadow` 描邊，pixel 字感 |
| 動畫 | 進度變化平滑過渡（`transition: width`）                                    |

---

## 四、邊界情境（Edge Cases）

| 情境                                            | 處理方式                                                |
| ----------------------------------------------- | ------------------------------------------------------- |
| 尚未設定時間（首次進入）                        | 跳出設定 modal，引導輸入上/下班時間                     |
| 現在 < 上班時間                                 | 進度 0%，顯示「距離上班還有 …」或「尚未開工」           |
| 現在 ≥ 下班時間                                 | 進度 100%，觸發水豚達成畫面                             |
| 跨午夜下班（下班 < 上班，如大夜班 22:00–06:00） | 計算需支援跨日；MVP 可先標註「Phase 3 處理」            |
| 重整頁面                                        | 設定存 localStorage，時間即時重算，不歸零               |
| 分頁切回 / 睡眠喚醒                             | 監聽 `visibilitychange` 重新校時，避免倒數卡住          |
| SSR / Hydration                                 | 時間邏輯放 `useEffect`，避免 Next.js hydration mismatch |

---

## 五、鼓勵語系統（每 1% 一句）

> Phase 2 定案：**移除稱號系統**，改為「每 1% 一句鼓勵語」（0%~100% 共 101 句），
> 依 `Math.floor(進度%)` 索引。社畜幽默風、貼合一天作息（早上暖機 → 午休 → 下午睏 →
> 下班衝刺）。台詞完整清單見 `doc/ui-demo.html` 的 `CHEERS` 陣列。
> 「尚未開工」另有專屬台詞：「還沒開工，享受最後的自由 😌」。

---

## 六、元件結構（Phase 3 實作規劃）

```
src/app/(tools)/clockOut/
├── page.tsx                         # Server Component（已建立）
├── components/
│   ├── clockOutPage.tsx             # 主容器：判斷設定狀態、tick 計時
│   ├── TimeSettingModal.tsx         # 上/下班時間設定
│   ├── CountdownDisplay.tsx         # 現在時間 + 剩餘時間文字
│   ├── ExpBar.tsx                   # EXP 經驗值進度條
│   ├── RankBadge.tsx                # 稱號顯示
│   └── ClockOutCelebration.tsx      # 水豚達成畫面 + 特效
├── store/useClockOutStore.ts        # Zustand（設定 + now tick）
├── types/index.ts                   # ClockOutSettings / ClockOutState
├── utils/timeUtils.ts               # 剩餘時間 / 進度 / 稱號計算（純函式，可測）
└── styles/clockOut.module.css       # 版面 + EXP 條樣式
```

---

## 七、Phase 3 任務拆解

1. [ ] `types/index.ts` — 定義 `ClockOutSettings`、`ClockOutState`
2. [ ] `utils/timeUtils.ts` — 純函式：`getRemaining()`、`getProgress()`、`getRank()`（含跨午夜）
3. [ ] `store/useClockOutStore.ts` — 設定持久化 + 每秒 tick
4. [ ] `TimeSettingModal` — 首次引導 / 修改時間
5. [ ] `ExpBar` — 還原復古經驗條樣式
6. [ ] `CountdownDisplay` + `RankBadge` — 文字資訊區
7. [ ] `ClockOutCelebration` — 水豚達成畫面 + 撒花
8. [ ] `clockOutPage` 組裝 + `visibilitychange` 校時
9. [ ] 響應式 / 深色模式
10. [ ] `npm run build` 驗證

---

## 八、開發紀錄

- 2026-08-06：完成需求討論，定案「上/下班雙時間輸入」規則、EXP 條樣式、水豚達成畫面；建立本計畫。素材 `clockout_done.png` 已置於 `public/images/clockOut/`。
