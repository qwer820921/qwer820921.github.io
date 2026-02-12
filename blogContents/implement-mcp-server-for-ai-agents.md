---
title: "【Agentic AI】實作 Model Context Protocol (MCP) 標準的 AI 代理"
date: "2026-02-10"
author: "子yee"
description: "深入教學如何建構符合 Model Context Protocol (MCP) 標準的 AI 代理伺服器，實現 AI 安全存取本地 SQL Server 資料庫，提升開發效率與資料隱私。"
category: "AI Application"
tags:
  [
    "Agentic AI",
    "MCP",
    "Model Context Protocol",
    "AI Agent",
    "SQL Server",
    "Local Data",
    "Claude Desktop",
    "RAG",
    "Security",
  ]
---

## 1. Overview

隨著大型語言模型（LLM）在各領域的應用日益普及，如何讓這些強大的 AI 代理安全、高效地與本地資料和工具互動，成為了業界關注的焦點。傳統上，開發者需要手動複製貼上資料，或透過複雜的 API 整合來橋接 AI 與本地系統，這不僅效率低下，也存在潛在的資料安全風險。為了解決這一挑戰，Model Context Protocol (MCP) 應運而生，它是一個開放標準，旨在為 AI 應用程式與外部資料源及工具之間建立安全、雙向的連接 [1]。

本文件將深入探討 MCP 的核心概念與架構，並提供一份實戰指南，教您如何從零開始建構一個符合 MCP 標準的 AI 代理伺服器（MCP Server）。我們將以整合本地 SQL Server 資料庫為例，展示如何定義 Tools 讓 AI 能夠安全地查詢資料、獲取資料表結構，而無需每次手動操作。透過實作 MCP Server，您可以讓 Claude Desktop、IDE 中的 AI 助手（如 Cursor 或 VS Code Copilot）直接存取您的本地數據，極大提升開發效率，同時確保資料隱私與安全性。

## 2. Architecture / Design

Model Context Protocol (MCP) 採用 Client-Host-Server 的架構模型，旨在提供一個標準化的框架，讓 AI 應用程式（Host）能夠與外部資料和能力（Server）進行整合 [2]。

### 2.1 Client-Host-Server 模型

- **Host (AI 工具)**：這是使用者直接互動的 AI 應用程式，例如 Anthropic 的 Claude Desktop、整合 AI 功能的 IDE（如 Cursor 或 Visual Studio Code），或是其他支援 MCP 的 AI 代理平台。Host 負責向使用者呈現 AI 的回應，並在需要時透過 MCP Client 向 MCP Server 發送請求。
- **Client (MCP Client)**：通常內建於 Host 應用程式中，負責處理與 MCP Server 的通訊細節。它會根據 Host 的需求，將 AI 生成的 Tool Call 請求轉換為符合 MCP 規範的訊息，並發送給 MCP Server。同時，它也會接收 MCP Server 的回應，並將結果傳回給 Host。
- **Server (MCP Server)**：這是由開發者實作的應用程式，運行在本地環境中。MCP Server 的核心職責是連接到本地資料源（如 SQL Server、檔案系統、API）或本地工具，並將這些能力以標準化的 Resources 和 Tools 形式暴露給 MCP Client。它接收來自 Client 的請求，執行相應的操作，並將結果返回 [3]。

### 2.2 MCP 的三大核心概念

MCP 透過以下三個核心概念，實現 AI 代理與外部世界的互動：

- **Resources (資源)**：Resources 代表 AI 可以讀取的靜態資料，例如文件、程式碼檔案、日誌檔、配置檔等。當 AI 需要額外的上下文資訊來理解問題或生成回應時，它可以請求讀取這些 Resources。MCP Server 負責提供這些 Resources 的內容 [4]。
- **Tools (工具)**：Tools 代表 AI 可以呼叫的動態操作或功能，例如執行 SQL 查詢、呼叫本地 API、寫入檔案、執行腳本等。Tools 允許 AI 不僅僅是「讀取」資訊，還能「執行」操作，從而實現更強大的 Agentic 能力。每個 Tool 都會有明確的輸入參數和預期的輸出格式 [5]。
- **Prompts (提示)**：Prompts 是預定義的提示模板，它們指導 AI 如何理解和使用 MCP Server 提供的 Resources 和 Tools。這些 Prompts 通常包含對 Server 功能的描述、Tools 的使用說明、以及如何處理特定情境的指引。透過 Prompts，開發者可以精確地控制 AI 與 Server 的互動方式，確保 AI 能夠正確地利用本地能力 [6]。

### 2.3 SQL Server 整合工作流

當 AI 代理需要與本地 SQL Server 互動時，其工作流如下：

1.  **AI 意圖識別**：使用者向 AI 提出一個需要查詢本地資料庫的問題（例如：「查詢 `Orders` 表中最近 10 筆訂單的資訊」）。
2.  **Tool Call 生成**：AI 代理（Host）根據其內部的邏輯和 MCP Server 提供的 Tools 描述，判斷需要呼叫哪個 Tool（例如 `query_database`），並生成相應的 Tool Call 請求，包含必要的參數（例如 SQL 查詢語句）。
3.  **請求發送**：MCP Client 將 Tool Call 請求封裝為符合 MCP 規範的訊息，透過本地網路發送給 MCP Server。
4.  **Server 執行 Tool**：MCP Server 接收到請求後，解析 Tool Call，並執行對應的 Tool 邏輯。例如，它會連接到本地 SQL Server，執行 AI 提供的 SQL 查詢。
5.  **結果返回**：SQL Server 返回查詢結果給 MCP Server。MCP Server 將結果格式化，並透過 MCP Client 返回給 AI 代理。
6.  **AI 回應生成**：AI 代理接收到查詢結果後，將其整合到其上下文中，生成一個自然語言的回應給使用者。

## 3. Prerequisites

要實作一個整合 SQL Server 的 MCP Server，您需要具備以下環境和知識：

- **Node.js 環境**：建議使用 LTS 版本，因為 MCP Server 通常會使用 TypeScript/JavaScript 進行開發。
- **TypeScript 知識**：MCP SDK 通常以 TypeScript 提供，熟悉 TypeScript 將有助於開發和理解程式碼。
- **SQL Server 實例**：一個可訪問的本地 SQL Server 實例，包含您希望 AI 存取的資料庫和資料表。
- **SQL Server 連接資訊**：包括伺服器位址、資料庫名稱、使用者名稱和密碼。
- **MCP SDK**：安裝官方提供的 `@modelcontextprotocol/sdk` 套件。
- **基礎網路知識**：理解本地網路通訊和埠號。
- **AI 工具**：一個支援 MCP 的 AI Host 應用程式，例如 Claude Desktop 或 VS Code 的 AI 擴充功能，用於測試您的 MCP Server。

## 4. Implementation / Code Example

本節將提供一個使用 TypeScript 和 Node.js 實作 MCP Server 的範例，該 Server 將暴露三個 Tools，允許 AI 代理與本地 SQL Server 進行互動：`list_tables` (列出所有資料表)、`describe_table` (描述特定資料表的 Schema) 和 `query_database` (執行 SQL 查詢)。

### 4.1 專案初始化

首先，創建一個新的 Node.js 專案並安裝必要的套件：

```bash
mkdir mcp-sql-server-agent
cd mcp-sql-server-agent
npm init -y
npm install typescript @types/node @modelcontextprotocol/sdk mssql @types/mssql dotenv
npx tsc --init
```

在 `tsconfig.json` 中，確保 `target` 設置為 `es2020` 或更高，`module` 設置為 `commonjs` 或 `esnext`。

### 4.2 配置 SQL Server 連接

創建 `.env` 檔案來儲存敏感的資料庫連接資訊：

```dotenv
SQL_SERVER_HOST=localhost
SQL_SERVER_PORT=1433
SQL_SERVER_DATABASE=YourDatabaseName
SQL_SERVER_USER=YourUsername
SQL_SERVER_PASSWORD=YourPassword
```

### 4.3 實作 MCP Server (`src/server.ts`)

```typescript
import { Server, Tool, RequestHandler } from "@modelcontextprotocol/sdk";
import * as mssql from "mssql";
import * as dotenv from "dotenv";

dotenv.config(); // 加載 .env 檔案

// SQL Server 配置
const sqlConfig: mssql.config = {
  user: process.env.SQL_SERVER_USER,
  password: process.env.SQL_SERVER_PASSWORD,
  server: process.env.SQL_SERVER_HOST || "localhost", // 您 SQL Server 的 IP 或主機名
  port: parseInt(process.env.SQL_SERVER_PORT || "1433"),
  database: process.env.SQL_SERVER_DATABASE,
  options: {
    encrypt: false, // For Azure SQL Database, set true
    trustServerCertificate: true, // Change to false for production
  },
};

// 創建一個 SQL Server 連接池
let pool: mssql.ConnectionPool | undefined;

async function getSqlConnection() {
  if (!pool || !pool.connected) {
    try {
      pool = new mssql.ConnectionPool(sqlConfig);
      await pool.connect();
      console.log("Connected to SQL Server");
    } catch (err) {
      console.error("SQL Server Connection Failed:", err);
      throw new Error("Failed to connect to SQL Server");
    }
  }
  return pool;
}

// 1. Tool: 列出所有資料表
const listTablesTool: Tool = {
  name: "list_tables",
  description: "列出當前資料庫中所有可用的資料表名稱。",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  returns: {
    type: "array",
    items: {
      type: "string",
    },
  },
};

const listTablesHandler: RequestHandler<typeof listTablesTool> = async () => {
  const pool = await getSqlConnection();
  const request = pool.request();
  const result = await request.query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_CATALOG = @databaseName"
  );
  return result.recordset.map((row) => row.TABLE_NAME);
};

// 2. Tool: 描述特定資料表的 Schema
const describeTableTool: Tool = {
  name: "describe_table",
  description: "獲取指定資料表的欄位名稱、資料類型和是否允許為空。",
  parameters: {
    type: "object",
    properties: {
      tableName: {
        type: "string",
        description: "要描述的資料表名稱。",
      },
    },
    required: ["tableName"],
  },
  returns: {
    type: "array",
    items: {
      type: "object",
      properties: {
        columnName: { type: "string" },
        dataType: { type: "string" },
        isNullable: { type: "boolean" },
      },
    },
  },
};

const describeTableHandler: RequestHandler<typeof describeTableTool> = async ({
  tableName,
}) => {
  const pool = await getSqlConnection();
  const request = pool.request();
  request.input("tableName", mssql.NVarChar, tableName);
  const result = await request.query(
    `SELECT COLUMN_NAME as columnName, DATA_TYPE as dataType, IS_NULLABLE as isNullable
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME = @tableName AND TABLE_CATALOG = @databaseName`
  );
  return result.recordset.map((row) => ({
    columnName: row.columnName,
    dataType: row.dataType,
    isNullable: row.isNullable === "YES",
  }));
};

// 3. Tool: 執行 SQL 查詢 (唯讀)
const queryDatabaseTool: Tool = {
  name: "query_database",
  description: "執行一個 SQL SELECT 查詢並返回結果。僅支援 SELECT 語句。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "要執行的 SQL SELECT 查詢語句。",
      },
    },
    required: ["query"],
  },
  returns: {
    type: "array",
    items: {
      type: "object", // 返回任意 JSON 物件陣列
    },
  },
};

const queryDatabaseHandler: RequestHandler<typeof queryDatabaseTool> = async ({
  query,
}) => {
  if (!query.trim().toLowerCase().startsWith("select")) {
    throw new Error("Only SELECT queries are allowed for security reasons.");
  }
  const pool = await getSqlConnection();
  const request = pool.request();
  // 注意：這裡直接執行查詢，實際生產環境應考慮更嚴格的 SQL 注入防護和權限控制。
  // 建議使用參數化查詢或預處理語句來處理使用者輸入。
  const result = await request.query(query);
  return result.recordset;
};

async function main() {
  const server = new Server();

  // 註冊 Tools
  server.registerTool(listTablesTool, listTablesHandler);
  server.registerTool(describeTableTool, describeTableHandler);
  server.registerTool(queryDatabaseTool, queryDatabaseHandler);

  // 啟動 Server
  const port = 3000; // 您可以自定義埠號
  await server.start(port);
  console.log(`MCP Server started on port ${port}`);

  // 為了讓 AI 代理知道如何使用這些 Tools，您需要提供 Prompts。
  // 這些 Prompts 通常會被 AI Host 應用程式讀取並用於引導 AI 的行為。
  // 範例 Prompt (這部分通常在 AI Host 端配置，或透過 MCP Server 的 Resource 暴露):
  console.log("\n--- 範例 AI Prompt ---");
  console.log(
    "你是一個專業的資料庫分析師。當使用者需要查詢本地 SQL Server 資料時，請使用以下工具："
  );
  console.log("- `list_tables()`: 列出所有資料表。");
  console.log(
    "- `describe_table(tableName: string)`: 獲取特定資料表的 Schema。"
  );
  console.log("- `query_database(query: string)`: 執行 SQL SELECT 查詢。");
  console.log(
    "請務必先使用 `list_tables` 和 `describe_table` 來理解資料庫結構，然後再執行 `query_database`。"
  );
  console.log("--- 範例 AI Prompt ---");
}

main().catch(console.error);
```

### 4.4 編譯與運行

```bash
npx tsc
node dist/server.js
```

### 4.5 與 AI Host 整合 (以 Claude Desktop 為例)

1.  **配置 `claude_desktop_config.json`**：
    在您的使用者目錄下（例如 `~/.claude_desktop/claude_desktop_config.json`），添加以下配置，指向您的 MCP Server：

    ```json
    {
      "mcp_servers": [
        {
          "name": "Local SQL Server Agent",
          "url": "http://localhost:3000", // 您的 MCP Server 運行地址和埠號
          "description": "提供對本地 SQL Server 資料庫的查詢和結構檢視能力。"
        }
      ]
    }
    ```

2.  **重啟 Claude Desktop**：確保配置生效。
3.  **與 AI 互動**：現在，您可以在 Claude Desktop 中向 AI 提問，例如：「我的本地資料庫裡有哪些資料表？」或「請查詢 `Products` 表中價格大於 100 的所有產品。」AI 將會自動呼叫您的 MCP Server 提供的 Tools 來獲取答案。

## 5. Parameters / API Reference

MCP Server 的 API 參考主要體現在其暴露的 Tools 定義上。這些 Tools 的 `name`、`description`、`parameters` 和 `returns` 結構，共同構成了 AI 代理理解和使用這些功能的介面。

### 5.1 MCP SDK 核心介面

| 介面/類別        | 描述                                                             |
| :--------------- | :--------------------------------------------------------------- |
| `Server`         | MCP Server 的主類別，用於註冊 Tools 和啟動 Server。              |
| `Tool`           | 定義一個 AI 可呼叫的工具，包含名稱、描述、輸入參數和預期返回值。 |
| `RequestHandler` | 處理 Tool 呼叫的非同步函數，接收 Tool 的參數並返回結果。         |
| `Resource`       | 定義一個 AI 可讀取的靜態資源，包含名稱、描述和內容。             |

### 5.2 本地 SQL Server Agent 暴露的 Tools

| Tool 名稱        | 描述                                                     | 輸入參數                                       | 返回值                                                                 |
| :--------------- | :------------------------------------------------------- | :--------------------------------------------- | :--------------------------------------------------------------------- |
| `list_tables`    | 列出當前資料庫中所有可用的資料表名稱。                   | 無                                             | `Array<string>` (資料表名稱陣列)                                       |
| `describe_table` | 獲取指定資料表的欄位名稱、資料類型和是否允許為空。       | `tableName: string` (要描述的資料表名稱)       | `Array<{ columnName: string, dataType: string, isNullable: boolean }>` |
| `query_database` | 執行一個 SQL SELECT 查詢並返回結果。僅支援 SELECT 語句。 | `query: string` (要執行的 SQL SELECT 查詢語句) | `Array<Object>` (查詢結果的 JSON 物件陣列)                             |

## 6. Notes & Best Practices

1.  **安全性至上**：
    - **最小權限原則**：為 MCP Server 連接 SQL Server 的帳戶配置最小必要的權限，例如只讀取特定資料庫或資料表，避免使用 `sa` 帳戶。
    - **SQL 注入防護**：在 `query_database` Tool 中，直接執行 AI 生成的 SQL 查詢存在 SQL 注入風險。在生產環境中，應嚴格限制 AI 只能生成預定義的查詢模板，或使用參數化查詢來處理使用者輸入，絕不能直接拼接字串 [7]。
    - **資料量限制**：在 `query_database` Tool 的實作中，應限制查詢結果的行數（例如使用 `TOP 100`），以防止 AI 請求過大的數據量導致上下文溢出或性能問題。
    - **網路隔離**：考慮將 MCP Server 部署在受保護的內部網路中，僅允許受信任的 AI Host 應用程式訪問。
2.  **錯誤處理與日誌**：
    - 在每個 Tool 的 `RequestHandler` 中，應包含完善的錯誤處理機制，捕獲資料庫連接失敗、查詢語法錯誤等異常，並返回清晰的錯誤訊息給 AI 代理。
    - 實作詳細的日誌記錄，記錄 AI 代理的 Tool Call 請求、執行結果和任何錯誤，以便於調試和審計。
3.  **Prompts 優化**：
    - 為 AI 代理提供清晰、詳細的 Prompts，明確說明每個 Tool 的功能、輸入輸出和使用限制。例如，強調 `query_database` 僅支援 `SELECT` 語句。
    - 引導 AI 代理在執行查詢前，先使用 `list_tables` 和 `describe_table` 來理解資料庫結構，以減少錯誤的 Tool Call。
4.  **性能考量**：
    - 使用資料庫連接池來管理 SQL Server 連接，避免頻繁建立和關閉連接，提升性能。
    - 對於複雜或耗時的查詢，考慮在 Tool 內部進行優化，或提供非同步的 Tool 執行機制。
5.  **版本控制與可維護性**：
    - 將 MCP Server 的程式碼納入版本控制系統，並遵循良好的程式碼編寫規範。
    - 隨著資料庫結構或 AI 代理需求的變化，定期更新和維護 MCP Server 的 Tools 定義和實作。

## 7. 為什麼選擇這種方式？

在 AI 代理與本地資料互動的場景中，選擇實作 Model Context Protocol (MCP) 標準的 AI 代理伺服器，具有以下不可替代的優勢：

1.  **標準化與互通性**：MCP 作為一個開放標準，確保了您的 MCP Server 可以與任何支援 MCP 的 AI Host 應用程式（如 Claude Desktop、Cursor、VS Code 等）無縫協作 [1]。這避免了為每個 AI 工具開發獨立整合的重複工作，極大地提升了互通性和開發效率。
2.  **資料隱私與安全性**：透過 MCP，您的敏感本地資料無需上傳到雲端或第三方服務。AI 代理僅透過本地運行的 MCP Server 進行互動，資料始終保留在您的控制之下。MCP Server 可以實作精細的權限控制和資料過濾，確保 AI 代理只能存取其被授權的資料和執行被允許的操作，有效防範資料洩露風險 [8]。
3.  **增強 AI 上下文與準確性**：AI 代理可以透過 MCP Server 即時獲取最新的本地資料，這為其提供了遠超訓練資料的豐富上下文。這種「即時 RAG」能力使得 AI 能夠生成更精確、更相關的回應，特別是在處理不斷變化的業務數據或個人筆記時 [9]。
4.  **消除手動操作，提升效率**：MCP 讓 AI 代理能夠自動執行查詢、分析和操作本地數據，從而消除了開發者手動複製貼上、切換應用程式的繁瑣步驟。這將顯著提升開發、數據分析和日常工作的效率。
5.  **Agentic AI 的基石**：MCP 是構建真正 Agentic AI 的關鍵基礎設施之一。它賦予 AI 代理「行動」的能力，使其不僅能理解和生成文本，還能與真實世界的工具和數據進行有意義的互動，開啟了 AI 應用程式的全新可能性。

---

**參考資料**

- [1] Anthropic. (2024, November 25). _Introducing the Model Context Protocol_. Retrieved from https://www.anthropic.com/news/model-context-protocol
- [2] Model Context Protocol. (n.d.). _Architecture - Model Context Protocol (MCP)_. Retrieved from https://modelcontextprotocol.info/specification/draft/architecture/
- [3] Model Context Protocol. (n.d.). _Specification - Model Context Protocol_. Retrieved from https://modelcontextprotocol.io/specification/2025-11-25
- [4] Model Context Protocol. (n.d.). _Architecture overview - Model Context Protocol_. Retrieved from https://modelcontextprotocol.io/docs/learn/architecture
- [5] Codilime. (2026, February 1). _Model Context Protocol (MCP) explained: A practical technical guide_. Retrieved from https://codilime.com/blog/model-context-protocol-explained/
- [6] Medium. (2026, January 10). _Build Your First MCP Server with Plain and TypeScript_. Retrieved from https://medium.com/@thecraftman/build-your-first-mcp-server-with-plain-and-typescript-6dd13494b95e
- [7] Microsoft Learn. (2026, January 27). _Quickstart: Use SQL MCP Server with Visual Studio Code locally_. Retrieved from https://learn.microsoft.com/en-us/azure/data-api-builder/mcp/quickstart-visual-studio-code
- [8] Elastic. (n.d.). _What is the Model Context Protocol (MCP)?_. Retrieved from https://www.elastic.co/what-is/mcp
- [9] Medium. (2025, July 27). _Building an MCP Server for Databases: A Simple Guide for Beginners_. Retrieved from https://medium.com/@ambhargava.cts/building-an-mcp-server-for-databases-a-simple-guide-for-beginners-859ba77bc4c9
