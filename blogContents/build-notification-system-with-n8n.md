---
title: "【開發自動化】使用 n8n 打造跨平台通知系統：GitHub 提交自動同步至 LINE 與 Discord"
date: "2026-02-09"
author: "子yee"
description: "一份詳盡的指南，教您如何利用 n8n 構建一個自動化工作流，將 GitHub 提交即時同步至 LINE 與 Discord，提升團隊協作效率。"
category: "Automation"
tags: ["n8n", "Automation", "GitHub", "LINE", "Discord", "Webhook", "CI/CD"]
---

## 1. Overview

在現代軟體開發團隊中，即時且高效的溝通對於保持開發流程順暢至關重要。當團隊成員在 GitHub 上提交程式碼、開啟 Pull Request 或合併分支時，如果能即時將這些關鍵事件同步到常用的通訊平台（如 LINE 或 Discord），將能顯著提升團隊的協作效率和資訊透明度。然而，手動轉發這些通知既耗時又容易出錯。

本文件將深入探討如何利用 n8n 這個強大的開源低程式碼自動化平台，從零開始構建一個跨平台的通知系統。我們將學習如何配置 GitHub Webhook 作為觸發器，透過 n8n 進行數據處理和格式轉換，最終將結構化的訊息推播至 LINE 群組和 Discord 頻道。這不僅能實現開發活動的自動化通知，還能為團隊節省寶貴的時間，讓開發者更專注於程式碼本身。

## 2. Architecture / Design

本通知系統的核心架構基於 n8n 的事件驅動模型，透過 GitHub Webhook 觸發工作流，並將處理後的數據分發到多個通訊平台。整個工作流設計旨在實現高效率、可擴展性和易於維護性。

### 2.1 工作流架構 (Workflow Architecture)

整個自動化工作流將分為以下三個主要階段：

#### 2.1.1 觸發階段 (Trigger Phase)

此階段的目標是接收來自 GitHub 的事件通知，並將其作為 n8n 工作流的起始點。

- **GitHub Webhook Node**：
  - 在 n8n 工作流中配置一個 Webhook 節點，它將生成一個唯一的 URL。這個 URL 將被配置到 GitHub 倉庫的 Webhook 設定中。
  - GitHub Webhook 應監聽特定的事件，例如 `push`（程式碼提交）、`pull_request`（拉取請求的創建、更新、合併）或 `issues`（問題的創建、更新）。本指南主要關注 `push` 事件。
  - 為了確保安全性，GitHub Webhook 應配置一個 Secret Token。n8n 的 Webhook 節點可以驗證這個 Secret，以確保請求確實來自 GitHub，防止惡意請求 [1]。

#### 2.1.2 資料處理階段 (Processing Phase)

接收到 GitHub 的原始 Webhook Payload 後，此階段負責提取關鍵資訊、進行必要的格式轉換，並根據需求進行過濾。

- **Set Node / Code Node**：
  - GitHub Webhook 發送的 JSON Payload 包含了大量的資訊。我們需要使用 n8n 的 `Set` 節點或 `Code` 節點來提取對通知有用的關鍵欄位，例如：
    - **作者 (Author)**：提交程式碼的使用者名稱或顯示名稱。
    - **提交訊息 (Commit Message)**：最新的提交訊息。
    - **分支 (Branch)**：發生提交的分支名稱（例如 `refs/heads/main`，需要提取 `main`）。
    - **倉庫名稱 (Repo Name)**：發生事件的 GitHub 倉庫名稱。
    - **提交連結 (Commit URL)**：指向 GitHub 上該提交的連結。
    - **時間戳 (Timestamp)**：提交發生的時間，通常是 ISO 8601 格式，需要轉換為更易讀的在地化格式。
  - `Code` 節點提供了更大的靈活性，可以使用 JavaScript 進行複雜的數據轉換和邏輯判斷，例如將多個提交訊息合併為一個摘要。
- **Filter Node (選配)**：
  - 並非所有 GitHub 事件都需要發送通知。例如，您可能只關心 `main` 分支的提交，或者只在 Pull Request 被合併時才發送通知。`Filter` 節點可以根據提取的數據設置條件，只允許符合特定條件的數據繼續流向後續的通知節點，從而減少通知噪音。

#### 2.1.3 發送階段 (Distribution Phase)

經過處理和過濾的數據將被格式化，並發送到目標通訊平台。

- **LINE Node (LINE Notify 或 Messaging API)**：
  - **LINE Notify**：適用於向個人或群組發送簡單的文字通知。需要先在 LINE Notify 網站上獲取 Access Token。n8n 的 HTTP Request 節點或專用的 LINE Notify 節點可以發送請求。
  - **LINE Messaging API**：如果需要更豐富的訊息格式（如圖片、模板訊息）或與 LINE Bot 互動，則需要使用 LINE Messaging API。這通常涉及建立 LINE Bot，並使用 n8n 的 HTTP Request 節點發送 POST 請求到 Messaging API 的端點 [2]。
  - 訊息內容應簡潔明瞭，支援表情符號可以提升可讀性。
- **Discord Node**：
  - **Discord Webhook**：這是向 Discord 頻道發送通知最簡單且推薦的方式。在 Discord 頻道設定中創建 Webhook，獲取其 URL。n8n 的 Discord 節點或 HTTP Request 節點可以向此 URL 發送 POST 請求 [3]。
  - **Embed 訊息**：Discord Webhook 支援發送 Embed 訊息，這是一種結構化、視覺豐富的訊息格式，可以包含標題、描述、顏色、圖片、作者資訊和連結，極大地提升了通知的專業性和可讀性。

### 2.2 技術棧與工具

| 類別           | 推薦技術/工具                                     | 描述                                               |
| :------------- | :------------------------------------------------ | :------------------------------------------------- |
| **自動化平台** | n8n (Self-hosted 或 Cloud)                        | 核心自動化引擎，提供低程式碼介面和豐富的整合節點。 |
| **事件來源**   | GitHub Webhook                                    | 觸發工作流的事件源，監聽程式碼倉庫的活動。         |
| **通訊平台**   | LINE Messaging API / LINE Notify, Discord Webhook | 訊息發送的終端，支援個人、群組或頻道通知。         |
| **邏輯處理**   | JavaScript (n8n Code Node)                        | 用於複雜的數據轉換、條件判斷和自定義邏輯。         |
| **安全性**     | 環境變數 (Environment Variables)                  | 儲存 API Key, Secret 等敏感資訊，避免硬編碼。      |

## 3. Prerequisites

在開始構建這個通知系統之前，請確保您具備以下條件：

- **n8n 實例**：一個正在運行且可訪問的 n8n 實例（可以是本地 Docker 部署、雲端託管或 n8n Cloud）。
- **GitHub 帳戶與倉庫**：一個 GitHub 帳戶和您希望監聽的程式碼倉庫，並具備配置 Webhook 的權限。
- **LINE 帳戶**：
  - 如果使用 LINE Notify，需要一個 LINE 帳戶來獲取 Access Token。
  - 如果使用 LINE Messaging API，需要一個 LINE Developers 帳戶來創建 Messaging API Channel。
- **Discord 帳戶與伺服器/頻道**：一個 Discord 帳戶和您希望發送通知的伺服器/頻道，並具備創建 Webhook 的權限。
- **基礎 JSON 知識**：理解 JSON 數據結構，因為 GitHub Webhook Payload 和 API 請求/響應都是 JSON 格式。

## 4. Implementation / Code Example

以下將提供一個簡化的 n8n 工作流配置範例，展示如何將 GitHub `push` 事件同步到 Discord。LINE 的整合方式類似，主要差異在於 API 請求的格式。

### 4.1 GitHub Webhook 配置

1.  在 n8n 中創建一個新的工作流，並添加一個 **Webhook** 節點。
2.  將 Webhook 節點的 **Webhook URL** 複製下來。
3.  在您的 GitHub 倉庫中，導航到 `Settings` -> `Webhooks` -> `Add webhook`。
4.  **Payload URL**：貼上從 n8n 複製的 Webhook URL。
5.  **Content type**：選擇 `application/json`。
6.  **Secret**：輸入一個安全的 Secret Token（例如使用密碼生成器生成），並將其記錄下來。這個 Secret 也將在 n8n Webhook 節點中配置。
7.  **Which events would you like to trigger this webhook?**：選擇 `Just the push event`。
8.  點擊 `Add webhook`。

### 4.2 n8n 工作流範例 (Discord 通知)

以下是一個簡化的 n8n 工作流 JSON 配置，您可以直接導入到 n8n 中。這個工作流會監聽 GitHub 的 `push` 事件，提取關鍵資訊，並發送一個格式化的 Embed 訊息到 Discord。

```json
{
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "/github-webhook",
        "responseMode": "lastNode",
        "options": {
          "rawBody": "true",
          "webhookSet": "true",
          "webhookId": "{{ $node.Webhook.id }}",
          "webhookSecret": "{{ $env.GITHUB_WEBHOOK_SECRET }}" // 從環境變數獲取 Secret
        }
      },
      "name": "GitHub Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [240, 300]
    },
    {
      "parameters": {
        "values": [
          {
            "name": "repoName",
            "value": "{{ $json.body.repository.name }}"
          },
          {
            "name": "pusherName",
            "value": "{{ $json.body.pusher.name }}"
          },
          {
            "name": "commitMessage",
            "value": "{{ $json.body.head_commit.message }}"
          },
          {
            "name": "commitUrl",
            "value": "{{ $json.body.head_commit.url }}"
          },
          {
            "name": "branchName",
            "value": "{{ $json.body.ref.split(\'/\').pop() }}"
          },
          {
            "name": "timestamp",
            "value": "{{ new Date($json.body.head_commit.timestamp).toLocaleString(\'zh-TW\', { timeZone: \'Asia/Taipei\' }) }}"
          }
        ]
      },
      "name": "Extract Data",
      "type": "n8n-nodes-base.set",
      "typeVersion": 1,
      "position": [460, 300]
    },
    {
      "parameters": {
        "url": "{{ $env.DISCORD_WEBHOOK_URL }}", // 從環境變數獲取 Discord Webhook URL
        "jsonBody": true,
        "body": {
          "embeds": [
            {
              "title": "🚀 [{{ $json.repoName }}] 新的程式碼提交",
              "description": "**分支:** `{{ $json.branchName }}`\n**作者:** {{ $json.pusherName }}\n**訊息:** {{ $json.commitMessage }}\n**時間:** {{ $json.timestamp }}",
              "color": 5814783, // 綠色
              "url": "{{ $json.commitUrl }}",
              "footer": {
                "text": "由 GitHub Webhook 觸發"
              }
            }
          ]
        }
      },
      "name": "Send Discord Notification",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 3,
      "position": [680, 300]
    }
  ],
  "connections": {
    "GitHub Webhook": {
      "main": [[{ "node": "Extract Data", "index": 0 }]]
    },
    "Extract Data": {
      "main": [[{ "node": "Send Discord Notification", "index": 0 }]]
    }
  }
}
```

### 4.3 環境變數配置

在 n8n 實例的環境變數中，設定以下變數：

- `GITHUB_WEBHOOK_SECRET`：您在 GitHub Webhook 中設定的 Secret Token。
- `DISCORD_WEBHOOK_URL`：您在 Discord 頻道中創建的 Webhook URL。

### 4.4 LINE Notify 整合範例 (使用 HTTP Request 節點)

如果您想整合 LINE Notify，可以添加另一個 HTTP Request 節點：

```json
{
  "parameters": {
    "url": "https://notify-api.line.me/api/notify",
    "httpMethod": "POST",
    "sendHeaders": true,
    "headerData": [
      {
        "name": "Authorization",
        "value": "Bearer {{ $env.LINE_NOTIFY_TOKEN }}"
      },
      {
        "name": "Content-Type",
        "value": "application/x-www-form-urlencoded"
      }
    ],
    "sendBody": true,
    "bodyParameters": [
      {
        "name": "message",
        "value": "= 🚀 [{{ $json.repoName }}] 有新的提交！\n👤 作者：{{ $json.pusherName }}\n📝 訊息：{{ $json.commitMessage }}\n🔗 連結：{{ $json.commitUrl }}\n時間：{{ $json.timestamp }}"
      }
    ]
  },
  "name": "Send LINE Notification",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 3,
  "position": [680, 450]
}
```

同樣，您需要在 n8n 環境變數中設定 `LINE_NOTIFY_TOKEN`。

## 5. Parameters / API Reference

此處主要列出 GitHub Webhook Payload 的關鍵欄位，以及 LINE Notify 和 Discord Webhook 的 API 參數。

### 5.1 GitHub `push` Event Payload 關鍵欄位 [4]

| 欄位路徑                | 類型     | 描述                                                          |
| :---------------------- | :------- | :------------------------------------------------------------ |
| `repository.name`       | `string` | 倉庫名稱。                                                    |
| `pusher.name`           | `string` | 提交者的使用者名稱。                                          |
| `head_commit.message`   | `string` | 最新提交的訊息。                                              |
| `head_commit.url`       | `string` | 最新提交的 GitHub URL。                                       |
| `head_commit.timestamp` | `string` | 最新提交的時間戳 (ISO 8601 格式)。                            |
| `ref`                   | `string` | 觸發事件的引用 (例如 `refs/heads/main`，需要解析出分支名稱)。 |

### 5.2 LINE Notify API 參數 [5]

| 參數名稱           | 類型     | 描述                                |
| :----------------- | :------- | :---------------------------------- |
| `message`          | `string` | 要發送的訊息內容。支援換行符 `\n`。 |
| `imageThumbnail`   | `string` | 圖片縮圖的 URL (可選)。             |
| `imageFullsize`    | `string` | 圖片完整尺寸的 URL (可選)。         |
| `stickerPackageId` | `number` | 貼圖包 ID (可選)。                  |
| `stickerId`        | `number` | 貼圖 ID (可選)。                    |

### 5.3 Discord Webhook API 參數 (部分常用) [6]

| 參數名稱               | 類型            | 描述                                                              |
| :--------------------- | :-------------- | :---------------------------------------------------------------- |
| `content`              | `string`        | 主要訊息內容 (可選，與 `embeds` 同時存在時為額外文字)。           |
| `username`             | `string`        | 發送訊息時顯示的名稱 (可選)。                                     |
| `avatar_url`           | `string`        | 發送訊息時顯示的頭像 URL (可選)。                                 |
| `embeds`               | `Array<Object>` | 包含一個或多個 Embed 物件的陣列，用於發送結構化、視覺豐富的訊息。 |
| `embeds[].title`       | `string`        | Embed 的標題。                                                    |
| `embeds[].description` | `string`        | Embed 的描述內容，支援 Markdown。                                 |
| `embeds[].color`       | `number`        | Embed 左側邊框的顏色 (十進制整數)。                               |
| `embeds[].url`         | `string`        | 點擊標題時跳轉的 URL。                                            |
| `embeds[].footer.text` | `string`        | Embed 底部文字。                                                  |

## 6. Notes & Best Practices

1.  **安全性優先**：
    - **Webhook Secret**：務必在 GitHub 和 n8n Webhook 節點中配置並驗證 Secret Token。這可以防止未經授權的請求觸發您的工作流。
    - **API Keys/Tokens**：所有敏感資訊（如 LINE Notify Token, Discord Webhook URL）都應儲存在 n8n 的環境變數中，而不是直接硬編碼在工作流中。這不僅提高了安全性，也方便了環境切換。
2.  **訊息內容優化**：
    - **簡潔明瞭**：通知訊息應包含足夠的資訊，但又不能過於冗長。提取最關鍵的資訊（作者、提交訊息、連結）即可。
    - **平台特性**：充分利用各平台的特性。例如，Discord 支援 Embed 訊息，可以讓通知更具視覺吸引力；LINE 支援貼圖，可以在特定情境下增加趣味性。
    - **在地化時間**：將時間戳轉換為團隊成員所在時區的在地化格式，提升可讀性。
3.  **避免通知噪音**：
    - **過濾機制**：使用 n8n 的 `IF` 節點或 `Filter` 節點來設定條件，例如只通知特定分支的提交、只通知合併的 Pull Request，或排除某些自動化帳戶的提交。這可以避免過多的通知淹沒團隊成員。
    - **合併提交**：對於頻繁的小型提交，可以考慮在 GitHub 上使用 Squash and Merge 或 Rebase and Merge 策略，減少單獨的提交通知。
4.  **錯誤處理與監控**：
    - **Error Trigger**：在 n8n 工作流中配置錯誤處理機制。例如，當通知發送失敗時，可以觸發另一個工作流來發送錯誤報告給管理員，或嘗試重試。
    - **日誌記錄**：n8n 提供了工作流執行的日誌。定期檢查日誌，確保工作流正常運行，並及時發現和解決問題。
5.  **可擴展性**：
    - **模組化設計**：將數據處理和發送邏輯模組化，方便未來添加新的通訊平台（如 Slack, Telegram）或修改現有平台的訊息格式，而無需大幅修改整個工作流。
    - **通用訊息結構**：在數據處理階段，盡量將提取的數據轉換為一個通用的內部訊息結構，這樣在發送階段可以更容易地適配到不同的平台 API。

## 7. 為什麼選擇這種方式？

選擇使用 n8n 來構建 GitHub 到 LINE/Discord 的跨平台通知系統，是基於其在自動化、靈活性和開發者體驗上的綜合優勢：

1.  **低程式碼/無程式碼自動化**：n8n 提供了一個直觀的視覺化介面，讓開發者和非開發者都能輕鬆設計和部署複雜的自動化工作流，無需編寫大量程式碼。這大大降低了自動化門檻，加速了開發效率 [7]。
2.  **強大的整合能力**：n8n 內建了數百個應用程式和服務的整合節點，包括 GitHub、LINE、Discord 等主流平台。這使得串接不同系統變得輕而易舉，無需手動處理繁瑣的 API 認證和請求細節 [8]。
3.  **高度客製化與靈活性**：儘管是低程式碼平台，n8n 仍提供了 `Code` 節點，允許開發者使用 JavaScript 編寫自定義邏輯，進行複雜的數據轉換、條件判斷和錯誤處理。這確保了工作流能夠精確滿足團隊的特定需求 [9]。
4.  **事件驅動與即時響應**：透過 Webhook 觸發機制，n8n 能夠在 GitHub 事件發生時即時響應，確保通知的即時性。這對於需要快速反應的開發團隊來說至關重要。
5.  **可擴展性與維護性**：n8n 的模組化設計使得工作流易於擴展，可以輕鬆添加新的通知平台或調整現有邏輯。同時，視覺化的工作流介面也方便了團隊成員理解和維護自動化流程。

## 實作心得

用 n8n 做這套通知系統時，第一個讓我卡關的不是 n8n 本身，而是 GitHub Webhook 的接收問題。在本機開發時，GitHub 打過來的 Webhook 請求必須打到公開可訪問的 URL，本機的 localhost 接不到。解決方式是用 ngrok 先暴露本機端口，或是把 n8n 直接部署到雲端（用免費的 Railway 或 Render 跑 Docker image）。這個前置作業在各種教學文章裡常常被輕描淡寫，第一次做的人很容易在這邊繞半天。

LINE Notify 的部分有個地雷：2025 年 LINE 已宣布 LINE Notify 服務即將終止，如果要長期維運，建議直接改用 LINE Messaging API 的 push message，雖然設定複雜一點，但不會突然停服。Discord Webhook 相對穩定很多，是比較適合長期使用的選項。

n8n 的節點設計讓我最喜歡的是「If 節點」可以很乾淨地做分流：PR 事件走一條路，一般 commit 走另一條路，各自有不同的訊息格式。比起寫一大串 if-else 的 code，視覺化的工作流編輯反而更好維護，改格式的時候也不需要重新部署，直接在 UI 上改存就好。

---

**參考資料**

- [1] n8n.io. (n.d.). _Webhook and Discord: Automate Workflows with n8n_. Retrieved from https://n8n.io/integrations/webhook/and/discord/
- [2] n8n.io. (n.d.). _GitHub and Line: Automate Workflows with n8n_. Retrieved from https://n8n.io/integrations/github/and/line/
- [3] n8n.io. (n.d.). _Discord integrations | Workflow automation with n8n_. Retrieved from https://n8n.io/integrations/discord/
- [4] GitHub Docs. (n.d.). _Webhook events and payloads_. Retrieved from https://docs.github.com/en/webhooks-and-events/webhooks/webhook-events-and-payloads
- [5] LINE Notify. (n.d.). _API Document_. Retrieved from https://notify-bot.line.me/doc/en/
- [6] Discord Developer Portal. (n.d.). _Webhooks_. Retrieved from https://discord.com/developers/docs/resources/webhook
- [7] n8n.io. (n.d.). _What is n8n?_. Retrieved from https://n8n.io/what-is-n8n/
- [8] n8n.io. (n.d.). _Integrations_. Retrieved from https://n8n.io/integrations/
- [9] n8n.io. (n.d.). _Master n8n JSON & Data Transformation in 30 Minutes_. Retrieved from https://www.youtube.com/watch?v=tNHVxZ2qvII
