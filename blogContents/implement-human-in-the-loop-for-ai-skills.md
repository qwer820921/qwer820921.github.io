---
title: "【安全機制】為 AI Skill 添加「人類授權層 (Human-in-the-loop)」與權限控制"
date: "2026-02-11"
description: "深入探討如何在 Agentic AI 系統中實作 Human-in-the-loop (HITL) 機制，透過 Middleware 攔截、異步審批工作流與權限控制，確保 AI Skill 執行的安全性與合規性。"
category: "AI Security"
tags:
  [
    "AI Agent",
    "Human-in-the-loop",
    "HITL",
    "Middleware",
    "Approval Workflow",
    "Security",
    "Access Control",
    "LLM",
    "Agentic AI",
  ]
---

# 【安全機制】為 AI Skill 添加「人類授權層 (Human-in-the-loop)」與權限控制

**作者：** Manus AI
**日期：** 2026年2月11日

---

## 1. Overview

隨著 AI Agent 的能力日益增強，它們被賦予了執行複雜任務和存取敏感系統的權限。然而，這也帶來了新的安全挑戰：如何確保 AI Agent 不會執行危險、不當或未經授權的操作？例如，一個 AI Agent 可能會錯誤地刪除資料庫、進行未經批准的金融交易，或者在遊戲中執行破壞性行為。傳統的程式安全機制不足以完全應對 LLM 可能產生的「幻覺（Hallucination）」或「提示詞注入（Prompt Injection）」攻擊 [1]。

為了解決這些問題，**「人類授權層（Human-in-the-loop, HITL）」**成為 Agentic AI 系統中不可或缺的安全機制。HITL 旨在將人類的判斷和監督整合到自動化流程的關鍵決策點，特別是在 AI Agent 嘗試執行高風險或敏感操作之前 [2]。它透過引入一個「確認機制」，確保所有可能產生重大影響的 AI Skill 執行都必須經過人類的明確批准。

本文件將深入探討如何在 AI Skill 的執行流程中實作一個強健的 HITL 機制。我們將介紹如何利用 **Middleware（中介層）**模式攔截 AI 的工具呼叫（Tool Call），建立一個**異步審批工作流（Asynchronous Approval Workflow）**，並整合外部通知系統（如 LINE Notify 或 Discord Webhook）來實現遠端批准。這不僅能大幅提升 AI 應用的安全性與責任歸屬，也能滿足企業在金融、醫療等受監管行業的合規性要求。

## 2. Architecture / Design

實作 Human-in-the-loop (HITL) 機制的核心在於在 AI Agent 決定執行一個 Skill 與該 Skill 實際執行之間，插入一個可控的「審批閘門」。這個閘門需要能夠攔截請求、通知人類、等待批准，並在收到批准後才放行執行。以下是其架構設計的核心模式 [3]。

### 2.1 攔截器模式 (The Interceptor Pattern)

- **核心思想**：在 AI Agent 框架（如 LangChain、Semantic Kernel）中，當 AI 決定呼叫一個外部工具或執行一個 Native Function 時，不應立即執行。而是在這個「呼叫」與「執行」之間，插入一個自定義的攔截器（Interceptor）或過濾器（Filter） [4]。
- **Middleware/Filters**：這個攔截器作為一個中介層，負責檢查即將執行的 Skill 是否被標記為「敏感」或「需要人工審批」。如果符合條件，它將阻止 Skill 的直接執行。
- **掛起狀態 (State Suspension)**：當攔截器阻止執行時，AI Agent 的當前執行狀態（包括其思考過程、上下文、即將執行的 Skill 及其參數）需要被**持久化（Check-pointing）**。Agent 的執行將被暫停，進入等待（Pending）模式，直到收到人類的審批結果 [5]。

### 2.2 異步審批工作流 (Asynchronous Approval Workflow)

這是 HITL 機制的關鍵部分，它定義了人類介入的流程：

1.  **AI 觸發敏感操作 (Trigger)**：AI Agent 根據其推理結果，產生一個需要執行敏感操作的意圖，例如 `SellStock(symbol="AAPL", amount=100)` 或 `DeleteDatabase(dbName="Production")`。
2.  **攔截與識別 (Intercept & Identify)**：
    - 攔截器捕獲到這個 Skill 呼叫。它會檢查該 Skill 的元數據（Metadata），例如 `[RiskLevel("High")]` 或 `[RequiresApproval(true)]`，判斷其是否需要人工審批。
    - 如果需要審批，攔截器會提取 Skill 的詳細資訊（名稱、參數、AI 的推理過程等），並將其與當前 Agent 的會話 ID 一起儲存到一個**持久化層（Persistence Layer）**中。
3.  **發送通知 (Notify)**：
    - 系統會透過一個通知服務，向預定義的管理者或審批人發送審批請求。通知可以透過多種管道發送，例如：
      - **LINE Notify**：發送包含操作詳情和「批准/拒絕」按鈕的訊息。
      - **Discord Webhook**：發送嵌入式訊息（Embed Message），提供互動式按鈕。
      - **Email/Slack**：發送包含審批連結的通知。
    - 通知中應包含一個唯一的**審批 ID (Approval ID)**，用於後續的回調。
4.  **人類審批 (Human Approval)**：
    - 管理者收到通知後，審閱 AI 提出的操作請求。基於對業務影響、風險和 AI 推理的理解，管理者決定「批准」或「拒絕」該操作。
    - 管理者透過點擊通知中的按鈕或訪問特定的審批介面，提交審批結果。
5.  **接收回調與恢復 (Receive Callback & Resume)**：
    - 系統接收到來自通知服務的回調（Callback），其中包含審批 ID 和審批結果（批准/拒絕）。
    - 系統根據審批 ID 從持久化層中檢索出之前掛起的 Agent 狀態。
    - 如果審批結果是「批准」，Agent 的執行將從掛起點恢復，並執行原定的 Skill。如果審批結果是「拒絕」，則 Skill 執行被中止，Agent 可能會收到一個錯誤訊息，並根據其邏輯重新規劃或通知使用者 [6]。

### 2.3 權限控制與角色管理

除了 HITL，細粒度的權限控制也是確保 AI Agent 安全的關鍵：

- **基於角色的存取控制 (RBAC)**：定義不同的使用者角色（例如：開發者、業務經理、安全審計員），並為每個角色分配不同的審批權限。例如，只有特定的安全團隊成員才能批准資料庫刪除操作。
- **操作敏感度分級**：為每個 Skill 定義一個敏感度級別（例如：低、中、高）。只有達到特定敏感度級別的 Skill 才需要觸發 HITL 流程。
- **審批策略**：可以設定多級審批（例如：需要兩人同時批准）或基於金額的審批（例如：交易金額超過 $10000 需要批准）。

## 3. Prerequisites

要實作一個帶有 HITL 的 AI Skill 安全機制，您需要具備以下環境和知識：

- **AI Agent 框架**：熟悉您選擇的 AI Agent 框架，例如 LangChain、LangGraph、Semantic Kernel 或自定義 Agent 框架。
- **程式語言**：熟悉 Python (LangChain/LangGraph) 或 C# (Semantic Kernel) 等程式語言。
- **Web 服務開發**：需要具備開發 Web API 的能力，用於接收通知服務的回調。
- **持久化層**：熟悉資料庫（如 PostgreSQL, MongoDB）或鍵值儲存（如 Redis）的使用，用於儲存 Agent 狀態和審批請求。
- **通知服務 API**：了解 LINE Notify、Discord Webhook 或其他通知服務的 API 整合。
- **非同步程式設計**：理解 `async/await` 等非同步程式設計模式，以處理異步審批工作流。

## 4. Implementation / Code Example

本節將提供一個概念性的 Python 程式碼範例，展示如何在一個簡化的 AI Agent 框架中實作 HITL。我們將模擬一個 `SellStock` Skill，並在執行前觸發人工審批。

### 4.1 模擬 AI Agent 框架與 Skill 定義

```python
import uuid
import time
import json
from enum import Enum
from typing import Dict, Any, Callable, Optional

# 模擬外部通知服務 (例如 LINE Notify 或 Discord Webhook)
# 在實際應用中，這裡會發送 HTTP 請求到 LINE/Discord API
def send_approval_notification(approval_id: str, action_details: Dict[str, Any]):
    print(f"\n--- 發送審批通知 ---")
    print(f"審批 ID: {approval_id}")
    print(f"請求操作: {action_details['skill_name']}")
    print(f"參數: {json.dumps(action_details['params'], indent=2)}")
    print(f"請訪問此連結批准或拒絕: http://your-approval-service.com/approve/{approval_id}")
    print(f"---------------------")

# 模擬一個持久化層來儲存掛起的請求
# 在實際應用中，這會是 Redis 或資料庫
pending_approvals: Dict[str, Dict[str, Any]] = {}

class ApprovalStatus(Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"

class AISkill:
    def __init__(self, name: str, func: Callable, requires_approval: bool = False):
        self.name = name
        self.func = func
        self.requires_approval = requires_approval

    def execute(self, **kwargs):
        print(f"執行 Skill: {self.name} with params: {kwargs}")
        return self.func(**kwargs)

class AIAgent:
    def __init__(self, name: str):
        self.name = name
        self.skills: Dict[str, AISkill] = {}

    def add_skill(self, skill: AISkill):
        self.skills[skill.name] = skill

    async def execute_skill(self, skill_name: str, **kwargs) -> Any:
        skill = self.skills.get(skill_name)
        if not skill:
            raise ValueError(f"Skill '{skill_name}' not found.")

        if skill.requires_approval:
            print(f"\n[Agent] Skill '{skill_name}' 需要人工審批。")
            approval_id = str(uuid.uuid4())
            action_details = {
                "skill_name": skill_name,
                "params": kwargs,
                "agent_name": self.name,
                "status": ApprovalStatus.PENDING.value,
                "timestamp": time.time()
            }
            pending_approvals[approval_id] = action_details
            send_approval_notification(approval_id, action_details)

            # 模擬等待人類審批
            print(f"[Agent] 等待人類審批 (ID: {approval_id})...")
            while pending_approvals[approval_id]["status"] == ApprovalStatus.PENDING.value:
                await asyncio.sleep(2) # 每 2 秒檢查一次

            if pending_approvals[approval_id]["status"] == ApprovalStatus.APPROVED.value:
                print(f"[Agent] Skill '{skill_name}' 已獲批准，正在執行...")
                result = skill.execute(**kwargs)
                del pending_approvals[approval_id] # 清理
                return result
            else:
                print(f"[Agent] Skill '{skill_name}' 被拒絕或過期，中止執行。")
                del pending_approvals[approval_id] # 清理
                return f"操作 '{skill_name}' 被拒絕或過期。"
        else:
            print(f"[Agent] Skill '{skill_name}' 無需審批，直接執行。")
            return skill.execute(**kwargs)

# 模擬一個後端服務來處理審批回調
# 在實際應用中，這會是一個 Flask/FastAPI/ASP.NET Core 的 endpoint
async def simulate_approval_service(approval_id: str, status: ApprovalStatus):
    if approval_id in pending_approvals:
        pending_approvals[approval_id]["status"] = status.value
        print(f"\n[Approval Service] 審批 ID {approval_id} 狀態更新為 {status.value}")
    else:
        print(f"[Approval Service] 錯誤: 審批 ID {approval_id} 不存在或已處理。")

# 實際的 Skill 函數
def sell_stock_func(symbol: str, amount: int):
    print(f"--- 執行 SellStock: 賣出 {amount} 股 {symbol} ---")
    # 這裡會是實際的交易邏輯
    return f"成功賣出 {amount} 股 {symbol}。"

def get_stock_price_func(symbol: str):
    print(f"--- 執行 GetStockPrice: 獲取 {symbol} 股價 ---")
    # 這裡會是實際的股價查詢邏輯
    return f"{symbol} 當前股價為 $175.50。"

# 主程式邏輯
import asyncio

async def main():
    my_agent = AIAgent("FinancialAgent")

    # 添加需要審批的 Skill
    my_agent.add_skill(AISkill("SellStock", sell_stock_func, requires_approval=True))
    # 添加無需審批的 Skill
    my_agent.add_skill(AISkill("GetStockPrice", get_stock_price_func, requires_approval=False))

    print("\n--- 測試無需審批的 Skill ---")
    price_result = await my_agent.execute_skill("GetStockPrice", symbol="MSFT")
    print(f"結果: {price_result}")

    print("\n--- 測試需要審批的 Skill ---")
    # 模擬 AI 嘗試賣出股票
    sell_task = asyncio.create_task(my_agent.execute_skill("SellStock", symbol="GOOG", amount=50))

    # 模擬人類在收到通知後進行批准
    await asyncio.sleep(5) # 等待通知發送
    # 假設我們知道審批 ID (從 pending_approvals 中獲取第一個)
    if pending_approvals:
        first_approval_id = list(pending_approvals.keys())[0]
        print(f"\n[Main] 模擬人類批准操作 (ID: {first_approval_id})...")
        await simulate_approval_service(first_approval_id, ApprovalStatus.APPROVED)

    sell_result = await sell_task
    print(f"結果: {sell_result}")

    print("\n--- 測試需要審批但被拒絕的 Skill ---")
    reject_task = asyncio.create_task(my_agent.execute_skill("SellStock", symbol="AMZN", amount=10))
    await asyncio.sleep(5)
    if pending_approvals:
        second_approval_id = list(pending_approvals.keys())[0]
        print(f"\n[Main] 模擬人類拒絕操作 (ID: {second_approval_id})...")
        await simulate_approval_service(second_approval_id, ApprovalStatus.REJECTED)
    reject_result = await reject_task
    print(f"結果: {reject_result}")

if __name__ == "__main__":
    asyncio.run(main())
```

### 4.2 程式碼說明

- **`send_approval_notification`**：模擬向外部通知服務發送請求，其中包含審批 ID 和操作詳情。在實際應用中，這會是一個 HTTP POST 請求到 LINE Notify 或 Discord Webhook API。
- **`pending_approvals`**：一個字典，模擬持久化層，用於儲存所有待審批的請求。鍵是唯一的 `approval_id`，值是包含 Skill 名稱、參數、狀態等資訊的字典。
- **`AISkill` 類別**：代表一個 AI Agent 可以執行的技能。新增了 `requires_approval` 屬性來標記該 Skill 是否需要人工審批。
- **`AIAgent` 類別**：`execute_skill` 方法是核心。當 `skill.requires_approval` 為 `True` 時，它會生成一個 `approval_id`，將請求資訊儲存到 `pending_approvals`，並呼叫 `send_approval_notification`。然後進入一個循環，等待 `pending_approvals` 中對應請求的狀態更新。
- **`simulate_approval_service`**：模擬一個後端 API 端點，接收來自通知服務的回調，並更新 `pending_approvals` 中請求的狀態。
- **`main` 函數**：展示了如何創建 Agent、添加 Skill，並測試需要審批和無需審批的 Skill。它還模擬了人類批准和拒絕的過程。

## 5. Parameters / API Reference

本節將基於上述範例，抽象出實作 HITL 機制時可能涉及的關鍵參數和介面。

### 5.1 `AISkill` 類別參數

| 參數名稱            | 類型       | 描述                                                |
| :------------------ | :--------- | :-------------------------------------------------- |
| `name`              | `str`      | 技能的唯一名稱。                                    |
| `func`              | `Callable` | 技能實際執行的程式碼函數。                          |
| `requires_approval` | `bool`     | (可選) 指示該技能是否需要人工審批，預設為 `False`。 |

### 5.2 `AIAgent` 類別方法

| 方法名稱        | 參數                        | 描述                                                               |
| :-------------- | :-------------------------- | :----------------------------------------------------------------- |
| `add_skill`     | `skill: AISkill`            | 向 Agent 添加一個技能。                                            |
| `execute_skill` | `skill_name: str, **kwargs` | 執行指定名稱的技能，並傳遞參數。如果需要審批，則會觸發 HITL 流程。 |

### 5.3 審批請求數據結構 (儲存在 `pending_approvals` 中)

| 欄位名稱 | 類型 | 描述 |
| :-------------- | :-------- | :------------------------------------------------------------------- |\n| `approval_id` | `str` | 唯一的審批請求 ID。 |
| `skill_name` | `str` | 請求執行的技能名稱。 |
| `params` | `Dict` | 技能執行所需的參數。 |
| `agent_name` | `str` | 發出請求的 AI Agent 名稱。 |
| `status` | `str` | 審批狀態 (`PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`)。 |
| `timestamp` | `float` | 請求發出的時間戳。 |

### 5.4 外部通知服務介面 (概念性)

| 方法名稱                     | 參數                                              | 描述                                           |
| :--------------------------- | :------------------------------------------------ | :--------------------------------------------- |
| `send_approval_notification` | `approval_id: str, action_details: Dict`          | 向管理者發送審批通知，包含操作詳情和審批連結。 |
| `(Webhook Endpoint)`         | `approval_id: str, status: str, approver_id: str` | 接收來自通知服務的回調，更新審批狀態。         |

## 6. Notes & Best Practices

1.  **明確定義風險等級**：在設計 AI Skill 時，應明確標記其潛在的風險等級和是否需要人工審批。這可以透過 Metadata 標籤（如 `[RiskLevel("High")]`）或獨立的配置檔來實現 [7]。
2.  **異步與持久化**：HITL 流程本質上是異步的，AI Agent 的執行必須能夠掛起並在稍後恢復。因此，將 Agent 的狀態和待審批請求持久化到可靠的儲存（如 Redis、資料庫）至關重要，以防止系統重啟或故障導致狀態丟失 [5]。
3.  **安全性考量**：
    - **審批連結的安全性**：審批連結應具有時效性、唯一性，並可能需要額外的身份驗證，以防止未經授權的批准。避免在 URL 中暴露敏感資訊。
    - **回調驗證**：接收審批結果的回調端點必須驗證請求的來源和簽名，確保其來自合法的通知服務，防止偽造的審批請求 [8]。
    - **最小權限原則**：通知服務和審批服務應僅擁有執行其職責所需的最小權限。
4.  **使用者體驗**：
    - **清晰的通知內容**：通知訊息應包含足夠的上下文資訊，讓審批人快速理解 AI 意圖和潛在影響，以便做出明智的決策。
    - **多管道通知**：提供多種通知管道（LINE, Discord, Email, Slack），確保管理者能及時收到審批請求。
    - **審批介面簡潔**：審批介面應簡潔明瞭，提供明確的「批准」和「拒絕」選項，並可選填理由。
5.  **錯誤處理與超時**：
    - **超時機制**：為審批請求設定超時時間。如果超過一定時間未收到批准，請求應自動被拒絕或標記為過期，並通知 AI Agent。
    - **重試機制**：考慮在通知發送失敗時實作重試機制。
6.  **可觀測性**：記錄所有審批請求、狀態變更和最終結果，以便進行審計、追蹤和問題排查 [9]。

## 7. 為什麼選擇這種方式？

在企業級 AI 應用中引入 Human-in-the-loop (HITL) 與權限控制機制，不僅是技術上的最佳實踐，更是業務與法律合規性的必然要求。這種方式的核心價值體現在以下幾個方面：

1.  **確保關鍵操作的安全性與責任歸屬**：AI Agent 雖然強大，但仍可能產生錯誤或被惡意利用。透過 HITL，所有可能導致資料損失、財務損失或違反政策的敏感操作，都必須經過人類的明確授權。這將責任歸屬從 AI 轉移到人類決策者，極大地降低了企業風險 [1]。
2.  **防範 AI 幻覺與提示詞注入攻擊**：即使是最先進的 LLM 也可能產生不準確或不恰當的內容（幻覺），或者被惡意使用者透過提示詞注入來繞過安全限制。HITL 作為最後一道防線，能夠在這些情況下阻止 AI 執行有害指令，保護系統免受潛在威脅 [10]。
3.  **滿足合規性與審計要求**：在金融、醫療、製造等高度監管的行業中，許多操作都必須有明確的審批記錄和人類決策的痕跡。HITL 機制提供了完整的審批日誌，確保了操作的可追溯性和合規性，這對於企業通過審計至關重要 [9]。
4.  **提升 AI 系統的信任度與使用者接受度**：當使用者知道 AI Agent 的關鍵決策會有人類監督時，他們對 AI 系統的信任度會顯著提高。這種透明度和控制感有助於推動 AI 技術在企業中的廣泛採用 [2]。
5.  **實現 AI 與人類的協同優化**：HITL 不僅僅是安全機制，它也是一個持續改進的循環。人類的審批行為可以作為反饋數據，用於訓練和優化 AI Agent 的決策模型，使其在未來能夠更準確地判斷哪些操作需要人工介入，哪些可以自動執行，從而實現 AI 與人類的協同進化 [11]。

---

**參考資料**

- [1] Orkes. (2025, August 18). _Human-in-the-Loop in Agentic Workflows: From Definition to Implementation_. Retrieved from https://orkes.io/blog/human-in-the-loop/
- [2] Zapier. (2025, November 12). _Human-in-the-loop in AI workflows: Meaning and patterns_. Retrieved from https://zapier.com/blog/human-in-the-loop/
- [3] Medium. (2025, September 11). _Human-in-the-Loop Middleware: Bringing Oversight into AI Agents_. Retrieved from https://medium.com/ai-artistry/human-in-the-loop-middleware-bringing-oversight-into-ai-agents-64eb16dd999d
- [4] Microsoft Learn. (2025, November 11). _Human-in-the-Loop with AG-UI_. Retrieved from https://learn.microsoft.com/en-us/agent-framework/integrations/ag-ui/human-in-the-loop
- [5] Docs by LangChain. (n.d.). _Interrupts_. Retrieved from https://docs.langchain.com/oss/python/langgraph/interrupts
- [6] Flowhunt.io. (2025, November 11). _Human in the Loop Middleware in Python: Building Safe AI Agents_. Retrieved from https://www.flowhunt.io/blog/human-in-the-loop-middleware-python-safe-ai-agents/
- [7] Microsoft Learn. (2025, February 19). _Semantic Kernel Filters_. Retrieved from https://learn.microsoft.com/en-us/semantic-kernel/concepts/enterprise-readiness/filters
- [8] GitHub. (n.d.). _Human Oversight for Autonomous AI Agents using Azure Logic Apps_. Retrieved from https://github.com/microsoft/agents-humanoversight
- [9] Medium. (2025, May 7). _Human-in-the-Loop with LangGraph: A Beginner's Guide_. Retrieved from https://sangeethasaravanan.medium.com/human-in-the-loop-with-langgraph-a-beginners-guide-8a32b7f45d6e
- [10] Reddit. (2024, August 28). _Why does langchain use breakpoints for Human-in-the-loop actions?_. Retrieved from https://www.reddit.com/r/LangChain/comments/1f33w2y/why_does_langchain_use_breakpoints_for/
- [11] LangChain. (n.d.). _Human-in-the-loop using server API_. Retrieved from https://docs.langchain.com/langsmith/add-human-in-the-loop
