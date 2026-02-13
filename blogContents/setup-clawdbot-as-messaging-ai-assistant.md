---
title: "【開源專案推薦】告別網頁視窗！將 Clawdbot 變成你的專屬 LINE/Telegram AI 開發助理"
date: "2026-02-13"
description: "深入教學如何將 Clawdbot (OpenClaw) 部署為本地 AI 開發助理，透過 LINE/Telegram 遠端操控，實現隱私優先的自動化工作流。"
category: "AI Agent"
tags: ["Clawdbot", "Moltbot", "OpenClaw", "AI Agent", "Telegram Bot", "LINE Bot", "Local AI", "MCP"]
---

## 1. Overview: 為什麼我們需要一個有「手」和「眼睛」的 AI Agent？

在 2026 年，AI 的發展已超越了單純的「聊天機器人」範疇。我們不再滿足於 AI 僅能回答問題，而是渴望它能像一個真正的助理，具備「手」來執行任務，擁有「眼睛」來感知環境。這正是 **Clawdbot (現已演進為 Moltbot，並整合至 OpenClaw 生態系)** 的核心理念 [1]。

傳統的 AI 助理，無論是 ChatGPT 或其他雲端服務，都受限於瀏覽器或 App 的介面，且無法直接存取你的本地檔案系統或執行程式碼。Clawdbot 透過 **Model Context Protocol (MCP)** [2] 協定，賦予 AI 直接與本地硬體、軟體和資料互動的能力。這意味著，你的 AI 不僅能理解你的指令，還能：

- **執行程式碼**：自動部署專案、運行測試、修復 Bug。
- **存取本地資料**：查詢你的 SQL 資料庫、讀取本地文件、分析遊戲日誌。
- **操控硬體**：監控 CPU 負載、控制智慧家電（透過 Home Assistant 等整合）。

更重要的是，這一切都在你的本地電腦上發生，確保了資料的絕對隱私與主權。想像一下，你出門在外，只需透過手機上的 LINE 或 Telegram 發送一條訊息，家裡的電腦就能自動完成你交辦的任務，這就是 Clawdbot 帶來的「無介面」生產力革命。

## 2. 環境搭建：如何在本地端快速啟動 Clawdbot

Clawdbot 的部署非常靈活，你可以選擇使用 Docker 容器化部署，或是直接在 Node.js 環境中運行。以下我們將以 Node.js 環境為例，引導你快速啟動你的專屬 AI 助理。

### 2.1 前置需求

在開始之前，請確保你的系統已安裝以下軟體：

- **Node.js**: 版本 20 或更高。
- **pnpm**: 作為套件管理器，推薦使用 `npm install -g pnpm` 安裝。
- **Git**: 用於複製 Clawdbot 專案程式碼。
- **AI API Key**: 你需要一個大型語言模型 (LLM) 的 API Key，例如 Anthropic Claude 3.5 Sonnet 或 OpenAI GPT-4o。這些將作為 Clawdbot 的「大腦」。

### 2.2 步驟 A：複製專案並安裝依賴

首先，開啟你的終端機 (Terminal) 或命令提示字元 (Command Prompt)，執行以下指令來複製 Clawdbot 的開源專案並安裝所需的依賴套件：

```bash
git clone https://github.com/OpenClaw/Clawdbot.git
cd Clawdbot
pnpm install
```

### 2.3 步驟 B：配置 `.env` 檔案

Clawdbot 透過 `.env` 檔案來管理環境變數，包括你的 AI API Key 和通訊軟體的相關設定。請在專案根目錄下創建一個名為 `.env` 的檔案，並填入以下內容。請務必將 `YOUR_ANTHROPIC_API_KEY` 或 `YOUR_OPENAI_API_KEY` 替換為你實際的 API Key。

```dotenv
# AI Provider Configuration
# 請選擇一個 AI Provider 並填入其 API Key
# ANTHROPIC_API_KEY=YOUR_ANTHROPIC_API_KEY
# OPENAI_API_KEY=YOUR_OPENAI_API_KEY

# Clawdbot Server Configuration
PORT=3000
ALLOWED_USERS=your_telegram_user_id,your_line_user_id # 允許使用 AI 助理的使用者 ID，用逗號分隔

# Telegram Bot Configuration (如果使用 Telegram)
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN

# LINE Bot Configuration (如果使用 LINE)
LINE_CHANNEL_ACCESS_TOKEN=YOUR_LINE_CHANNEL_ACCESS_TOKEN
LINE_CHANNEL_SECRET=YOUR_LINE_CHANNEL_SECRET
```

### 2.4 步驟 C：啟動 Clawdbot

配置完成後，你就可以啟動 Clawdbot 了。在終端機中執行：

```bash
pnpm start
```

如果一切順利，你將會看到 Clawdbot 伺服器啟動的訊息。此時，你的本地 AI 助理已經準備就緒，等待與通訊軟體對接。

## 3. 通訊對接：示範串接 Telegram / LINE

將 Clawdbot 與通訊軟體對接，是實現遠端操控的關鍵。以下我們將以 Telegram 和 LINE 為例，示範如何進行串接。

### 3.1 為什麼選擇通訊軟體？

- **隨時隨地**：無論你在哪裡，只要手機有網路，就能與你的 AI 助理互動。
- **非同步操作**：你可以發送一個耗時的任務，然後關閉手機，AI 會在完成後通知你。
- **多裝置支援**：在手機、平板、電腦上都能無縫使用。

### 3.2 Telegram Bot 串接流程

1.  **創建 Telegram Bot**: 在 Telegram 中搜尋 `@BotFather`，發送 `/newbot` 指令，按照指示創建一個新的 Bot，並取得 `HTTP API Token`。將此 Token 填入 `.env` 檔案的 `TELEGRAM_BOT_TOKEN` 欄位。
2.  **獲取你的 Telegram User ID**: 在 Telegram 中搜尋 `@userinfobot`，發送 `/start` 指令，它會回覆你的 User ID。將此 ID 填入 `.env` 檔案的 `ALLOWED_USERS` 欄位。
3.  **設定 Webhook**: Clawdbot 啟動後，會自動監聽 Telegram 的訊息。你需要確保你的 Clawdbot 伺服器可以被 Telegram 訪問到。如果你在本地開發，可以使用 `ngrok` 等工具將本地服務暴露到公網。

### 3.3 LINE Bot 串接流程

1.  **創建 LINE Developers 帳號**: 訪問 [LINE Developers](https://developers.line.biz/zh-hant/) 網站，創建一個新的 Provider 和 Messaging API Channel。
2.  **獲取 Channel Access Token 與 Channel Secret**: 在你的 Messaging API Channel 設定頁面中，找到 `Channel Access Token (Long-lived)` 和 `Channel Secret`。將它們填入 `.env` 檔案的 `LINE_CHANNEL_ACCESS_TOKEN` 和 `LINE_CHANNEL_SECRET` 欄位。
3.  **獲取你的 LINE User ID**: 透過 LINE Bot 發送訊息給你的 Bot，然後在 LINE Developers 的 Webhook 設定頁面中，可以找到發送訊息者的 User ID。將此 ID 填入 `.env` 檔案的 `ALLOWED_USERS` 欄位。
4.  **設定 Webhook**: 在 LINE Developers 的 Messaging API 設定頁面中，啟用 Webhook，並將你的 Clawdbot 伺服器的公開 URL (例如：`https://your-ngrok-url/webhook/line`) 填入 Webhook URL 欄位。

### 3.4 實戰範例：透過手機指令操控電腦

假設你已經成功串接 Telegram Bot，現在你可以打開 Telegram，向你的 Bot 發送訊息：

```
/exec ls -lh
```

你的 Clawdbot 會在本地電腦上執行 `ls -lh` 指令，並將結果透過 Telegram 回傳給你。這就是一個簡單的遠端指令執行範例。你可以進一步定義更複雜的 **MCP Tools**，讓 AI 執行更多任務，例如：

- 「幫我檢查專案 `my-app` 的測試是否通過。」
- 「將 `docs` 資料夾下的所有 Markdown 文件打包成 PDF。」
- 「分析昨天的伺服器日誌，找出所有錯誤訊息。」

## 4. 隱私優勢：對話紀錄與記憶 (MEMORY.md) 完全掌握在手

與 ChatGPT Plus 等雲端 AI 服務最大的差異在於，Clawdbot 確保了你的所有對話紀錄、學習記憶和個人偏好都完全儲存在你的本地電腦上。這不僅僅是技術上的差異，更是對「數位主權」的根本性回歸。

### 4.1 本地化的持久性記憶：`MEMORY.md` 與 `SOUL.md`

Clawdbot 採用了 **`MEMORY.md`** 和 **`SOUL.md`** 等本地文件來管理 AI 的記憶和個性 [3]。

- **`MEMORY.md`**: 儲存了 AI 與你的所有互動歷史、學習到的知識點和任務執行紀錄。這些記憶不會上傳到任何雲端伺服器，完全由你掌控。
- **`SOUL.md`**: 定義了 AI 的核心個性、價值觀和長期目標。這是 AI 成為你「數位孿生」的基礎，確保它能以最符合你期望的方式思考和行動。

### 4.2 與雲端服務的架構對比

| 特性 | Clawdbot (本地 AI) | ChatGPT Plus (雲端 AI) |
| :--- | :--- | :--- |
| **資料隱私** | 完全本地，使用者掌控 | 儲存於雲端，服務商可存取 |
| **執行能力** | 可直接執行本地程式碼、存取檔案 | 僅限於雲端環境，需透過插件/API 橋接 |
| **記憶持久性** | 本地文件管理，長效記憶 | 依賴雲端資料庫，有上下文限制 |
| **成本模式** | 硬體一次性投入，API 依用量計費 | 訂閱制 + API 依用量計費 |
| **客製化程度** | 高度客製化，可自由定義工具與行為 | 依賴平台提供的功能與插件 |

### 4.3 安全性建議：設定白名單 (Allowed Users)

為了防止未經授權的使用者透過通訊軟體操控你的 Clawdbot，務必在 `.env` 檔案中設定 `ALLOWED_USERS`。只有這些 User ID 發送的訊息，Clawdbot 才會響應。這是一個簡單但極其重要的安全措施。

## 5. 為什麼選擇這種方式？

將 Clawdbot 部署為你的專屬 LINE/Telegram AI 開發助理，不僅僅是為了方便，更是對未來 AI 互動模式的預演：

- **真正的個人化**：AI 不再是通用的服務，而是專屬於你的數位延伸，理解你的習慣，服務你的需求。
- **數據主權的回歸**：你的數據、你的記憶，完全由你掌控，無需擔心隱私洩露。
- **無縫的生產力**：無論身在何處，你的電腦都能成為你的 AI 代理，隨時待命，執行任務。

告別網頁視窗的束縛，迎接一個由你完全掌控的 AI 助理時代。Clawdbot 讓 AI 不再遙不可及，而是成為你指尖上的強大工具。

---

**參考資料**

- [1] OpenClaw Official. (2026). _Moltbot: The Next Generation of Local AI Agents_.
- [2] Anthropic. (2025). _Model Context Protocol (MCP) Specification v1.0_.
- [3] Peter Steinberger. (2025). _SOUL.md: What Makes an AI, Itself? Defining Continuity of Self in Local Agents_.
- [4] Meet 創業小聚. (2026, February 12). _「80%的App將消失！」YC專訪OpenClaw創辦人：AI革命不在雲端，而在你電腦裡_.
