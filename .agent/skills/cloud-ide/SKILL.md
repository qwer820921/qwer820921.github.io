---
name: GitHub Codespaces 雲端開發
description: 使用 GitHub Codespaces 作為雲端 IDE 的完整指南，涵蓋開啟方式、DevContainer 配置、AI Agent 整合、手機開發流程與 MCP 擴展
---

# GitHub Codespaces 雲端開發

透過 GitHub Codespaces 在任何裝置（包括手機）上取得完整的開發環境，包含終端機、AI Agent 與 MCP 擴展。

---

## 1. 概念總覽

```
你的裝置（電腦 / 手機 / 平板）
  │
  └─→ 瀏覽器
       │
       └─→ GitHub Codespaces（雲端 VM）
            │
            ├── VS Code 編輯器（完整版）
            ├── 終端機（bash / zsh）
            ├── Node.js / Docker / Git（預裝）
            ├── GitHub Copilot（AI Agent）
            └── MCP Server（可擴展）
```

**核心優勢**：你的手機不需要任何開發工具，所有運算都發生在 GitHub 的雲端虛擬機上。

---

## 2. 開啟 Codespaces

### 方法一：從 GitHub 頁面開啟

1. 前往 Repo 頁面（例如 `https://github.com/qwer820921/qwer820921.github.io`）
2. 點擊綠色 **`<> Code`** 按鈕
3. 切到 **`Codespaces`** 標籤頁
4. 點擊 **`Create codespace on main`**
5. 等待 1-2 分鐘，雲端 VS Code 自動開啟

### 方法二：網址快捷方式

| 網址                                             | 用途                               |
| ------------------------------------------------ | ---------------------------------- |
| `github.dev/你的帳號/Repo名`                     | 輕量編輯器（純文字編輯，無終端機） |
| `github.com/你的帳號/Repo名` → Code → Codespaces | 完整 IDE（有終端機、可跑指令）     |

> ⚠️ `github.dev` 是輕量版，不能跑終端機指令。要跑 `npm run dev` 或 `docker compose up` 必須用完整的 Codespaces。

### 方法三：手機上開啟

1. 手機瀏覽器打開 `https://github.com/你的帳號/Repo名`
2. 點 **`<> Code`** → **`Codespaces`** → **`Create codespace on main`**
3. 建議將瀏覽器切換成**桌面版網頁模式**以獲得更好的操作體驗

---

## 3. 免費額度與計費

| GitHub 方案 | 每月免費額度 | 機器規格             |
| ----------- | ------------ | -------------------- |
| **Free**    | **120 小時** | 2 核心 CPU、8 GB RAM |
| Pro         | 180 小時     | 2 核心 CPU、8 GB RAM |
| Team        | 依組織方案   | 可選 4/8/16/32 核心  |

### 節省額度技巧

- **用完請關閉**：Codespace 閒置 30 分鐘後會自動暫停，但建議手動停止
- **停止方式**：左下角 `Codespaces` → `Stop Current Codespace`
- **刪除不用的**：到 `https://github.com/codespaces` 管理所有 Codespace

---

## 4. DevContainer 配置（自動化環境）

在 Repo 中新增 `.devcontainer/devcontainer.json`，Codespaces 開啟時會自動按照此設定建立環境。

### 範例：Next.js 專案

```json
{
  "name": "Next.js Dev",
  "image": "mcr.microsoft.com/devcontainers/javascript-node:18",
  "postCreateCommand": "npm ci",
  "forwardPorts": [3000],
  "customizations": {
    "vscode": {
      "extensions": [
        "GitHub.copilot",
        "GitHub.copilot-chat",
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode"
      ],
      "settings": {
        "editor.formatOnSave": true,
        "editor.defaultFormatter": "esbenp.prettier-vscode"
      }
    }
  }
}
```

### 範例：使用 Docker Compose 的專案

```json
{
  "name": "Docker Dev",
  "dockerComposeFile": "../docker-compose.yml",
  "service": "web",
  "workspaceFolder": "/app",
  "forwardPorts": [3000],
  "customizations": {
    "vscode": {
      "extensions": ["GitHub.copilot", "GitHub.copilot-chat"]
    }
  }
}
```

### 設定說明

| 欄位                | 用途                                               |
| ------------------- | -------------------------------------------------- |
| `image`             | 使用的 Docker 映像（Microsoft 提供多種預配置映像） |
| `postCreateCommand` | Codespace 建立後自動執行的指令（例如安裝依賴）     |
| `forwardPorts`      | 自動轉發的 Port（讓你在瀏覽器中存取 dev server）   |
| `extensions`        | 自動安裝的 VS Code 插件                            |

---

## 5. AI Agent 整合

### 5.1 GitHub Copilot（內建）

Codespaces 中可以直接使用 GitHub Copilot，它提供：

| 功能             | 操作方式                                          |
| ---------------- | ------------------------------------------------- |
| **程式碼補全**   | 寫程式時自動建議（Tab 接受）                      |
| **Copilot Chat** | 側邊欄開啟對話視窗，詢問程式碼問題                |
| **終端機指令**   | 在 Chat 中說「幫我執行 lint」，Copilot 會建議指令 |
| **Agent 模式**   | Copilot Chat 中使用 `@workspace` 讓它分析整個專案 |

> ⚠️ GitHub Copilot 需要訂閱（$10/月），或者學生可以免費申請 GitHub Student Pack。

### 5.2 在 Codespaces 中使用 Agent 的實際流程

```
手機瀏覽器 → Codespaces (VS Code Web)
                │
                ├── 開啟 Copilot Chat 面板
                │    └── 你：「幫我修改首頁的標題文字」
                │    └── Copilot：分析專案 → 找到檔案 → 提供修改建議
                │
                ├── 開啟終端機
                │    └── npm run dev → Port 自動轉發 → 手機預覽
                │
                └── 完成後 → git commit + push
                              └── 觸發 GitHub Actions CI/CD → 自動部署
```

---

## 6. MCP 擴展（進階）

### 6.1 目前 Codespaces 對 MCP 的支援狀態

| 工具                | MCP 支援 | 說明                                                             |
| ------------------- | -------- | ---------------------------------------------------------------- |
| **GitHub Copilot**  | 有限     | 內建了部分 GitHub API 能力（PR、Issue），但不支援自訂 MCP Server |
| **Cursor Web**      | 尚不支援 | Cursor 目前僅桌面版支援 MCP                                      |
| **自建 MCP Server** | 可行     | 在 Codespaces 的終端機中啟動 MCP Server，再讓 Agent 連接         |

### 6.2 在 Codespaces 中使用外部服務的替代方案

由於 Codespaces 上的 MCP 支援仍在發展中，實務上常見的替代方式：

```
方案 A：CI/CD 流水線（最成熟）
──────────────────────────────
Codespaces 中編輯 → git push → GitHub Actions 自動部署
不需要 MCP，流程寫在 .github/workflows/*.yml 中

方案 B：CLI 工具（直接可用）
──────────────────────────────
Codespaces 的終端機中直接使用雲端平台的 CLI：
  - Zeabur：zeabur deploy
  - Vercel：vercel --prod
  - AWS：aws s3 sync
  - GCP：gcloud app deploy

方案 C：VS Code 插件
──────────────────────────────
在 devcontainer.json 中預裝雲端平台的 VS Code 插件：
  - Vercel for VS Code
  - AWS Toolkit
  - Azure Tools
```

---

## 7. 手機開發的完整工作流程

### 場景：在手機上修改程式碼並部署

```
Step 1: 開啟 Codespace
  手機瀏覽器 → github.com/你的Repo → Code → Codespaces → 開啟

Step 2: 編輯程式碼
  在 VS Code Web 中修改檔案
  （建議用橫向模式，打字更方便）

Step 3: 預覽結果
  終端機執行 npm run dev
  Codespaces 會提供一個臨時公開 URL 讓你預覽

Step 4: 提交變更
  終端機：git add . && git commit -m "fix: 修改標題" && git push

Step 5: 自動部署（如果有設定 CI/CD）
  GitHub Actions 偵測到 push → 自動建置 → 自動部署
```

### 手機操作小技巧

| 技巧             | 說明                                                           |
| ---------------- | -------------------------------------------------------------- |
| **桌面版網頁**   | 將手機瀏覽器切換為「桌面版網頁」模式，VS Code 完整功能才能使用 |
| **外接鍵盤**     | 有藍牙鍵盤的話體驗會好很多                                     |
| **語音輸入**     | 在 Copilot Chat 中用語音輸入描述需求，讓 AI 幫你寫程式碼       |
| **簡單修改為主** | 手機適合做「改文字、修 bug、調整設定」等小型任務               |

---

## 8. 注意事項

> ⚠️ **Codespaces 不是永久儲存空間**。所有改動必須 `git push` 回 GitHub，否則 Codespace 被刪除後變更就會消失。

> ⚠️ **Port 轉發**。Codespaces 中啟動的 dev server 不是 `localhost`，而是一個 GitHub 提供的臨時 URL（如 `https://xxx-3000.app.github.dev`）。這個 URL 預設是私有的，只有你能存取。

> ⚠️ **效能限制**。免費的 2 核心機器對於 Next.js 開發夠用，但不適合跑大型建置或 AI 模型推理等重計算任務。

> ⚠️ **與本機 Docker 開發的關係**。Codespaces 和你本機的 Docker 開發環境是完全獨立的。Codespaces 有自己的檔案系統和 Docker 引擎，不會影響你 Windows 上的任何設定。
