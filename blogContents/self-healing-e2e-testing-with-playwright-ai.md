---
title: "【自動化測試】使用 Playwright + AI Agent 實現「自癒 (Self-Healing)」的 E2E 測試"
date: "2026-02-12"
author: "子yee"
description: "深入探討如何結合 Playwright 與 AI Agent，實現 E2E 測試腳本的自動修復，大幅降低因 UI 變動導致的測試維護成本，邁向產品級 AI 應用。"
category: "自動化測試 & AI"
tags:
  [
    "Playwright",
    "E2E Testing",
    "Self-Healing",
    "AI Agent",
    "LLM",
    "Test Automation",
    "Frontend Testing",
  ]
---

## 1. Overview

在現代敏捷開發流程中，端到端（End-to-End, E2E）測試是確保軟體品質不可或缺的一環。然而，傳統 E2E 測試面臨一個核心挑戰：**脆弱性 (Fragility)**。當使用者介面（UI）進行微小改動，例如 CSS 類名變更、DOM 結構調整或元素屬性更新時，依賴於靜態 Selector 的測試腳本往往會失效，導致測試失敗（Flaky Tests）[1]。這不僅耗費大量時間進行手動維護，也嚴重拖慢了持續整合/持續部署（CI/CD）的效率。根據業界報告，測試維護成本甚至可能佔據總測試時間的 50% 以上 [2]。

為了解決這一痛點，**AI-Driven Testing** 應運而生，其中「自癒 (Self-Healing)」測試技術正成為新的焦點。本文件將深入探討如何結合強大的瀏覽器自動化工具 Playwright 與 AI Agent，實現 E2E 測試腳本的自動修復。當測試因 UI 變動而失敗時，AI Agent 將介入分析當前頁面結構，推論出新的元素定位方式，並自動修復測試腳本，從而大幅降低測試維護成本，提升測試的穩定性與可靠性。這不僅是從「玩具專案」跨入「產品級應用」的必經之路，更是將 AI 實際應用於開發流程自動化的重要里程碑。

## 2. Architecture / Design

實現自癒 E2E 測試的關鍵在於構建一個能夠在測試失敗時介入、分析並修復的智能系統。其核心架構涉及 Playwright 的測試攔截機制、上下文提取、AI 推理以及自動修復與驗證循環 [3]。

### 2.1 核心組件

- **Playwright Test Runner**：負責執行 E2E 測試腳本，並在測試失敗時提供錯誤上下文。
- **Test Failure Interceptor (測試失敗攔截器)**：在 Playwright 測試框架中，透過 Hook 或自定義 Reporter 監聽測試失敗事件，特別是元素定位失敗（如 `TimeoutError` 或 `ElementNotFound`）。
- **Context Extractor (上下文提取器)**：當測試失敗時，負責從瀏覽器環境中提取關鍵資訊，包括：
  - **原始 Selector**：導致失敗的舊 Selector（例如 `button.submit-v1`）。
  - **DOM Snapshot**：失敗時的完整頁面 HTML 結構。
  - **Accessibility Tree (可訪問性樹)**：比原始 DOM 更具語意化的結構，包含元素的角色、名稱和狀態，對於 AI 理解元素意圖至關重要 [4]。
  - **截圖 (Screenshot)**：視覺化地呈現失敗時的頁面狀態，輔助 AI 或人工判斷。
- **AI Healer (LLM Agent)**：這是自癒系統的核心。它是一個基於大型語言模型（LLM）的 AI Agent，負責接收上下文資訊，並進行推理以找出新的、有效的元素定位方式。LLM 的強大語意理解能力使其能夠從多維度數據中推斷出元素的真實意圖，而非僅僅依賴於靜態屬性 [5]。
- **Auto-Fixer (自動修復器)**：根據 AI Healer 提供的建議，執行修復操作。這可以透過兩種方式實現：
  - **運行時修復**：將新的 Selector 動態注入到當前測試運行中，讓測試得以繼續執行。這對於 CI/CD 流程的即時恢復非常有用。
  - **持久化修復**：生成一個建議的程式碼修改（例如，一個新的 `locator` 定義），並自動創建一個 Pull Request (PR) 或直接修改測試腳本文件，供開發者審核和合併 [6]。
- **Verification & Reporting (驗證與報告)**：修復後，需要重新執行相關測試步驟以驗證新 Selector 的有效性。同時，生成詳細的自癒報告，記錄修復過程、原始錯誤、AI 建議和修復結果。

### 2.2 自癒工作流 (Workflow)

下圖展示了 AI 驅動的自癒 E2E 測試的完整工作流：

```mermaid
graph TD
    A[測試執行] --> B{元素定位失敗?}
    B -- 是 --> C[觸發失敗攔截器]
    C --> D[提取上下文: DOM, Accessibility Tree, 截圖, 原始 Selector]
    D --> E[發送上下文至 AI Healer (LLM Agent)]
    E --> F{AI 推理: 找出新 Selector}
    F -- 成功 --> G[使用新 Selector 重試測試步驟]
    G -- 成功 --> H[生成修復報告 & 建議更新原始碼 (PR)]
    G -- 失敗 --> I[標記為無法自癒, 報告失敗]
    F -- 失敗 --> I
    B -- 否 --> J[測試繼續執行]
    H --> K[人工審核 & 合併]
    I --> L[人工介入]
```

**詳細步驟：**

1.  **測試執行與失敗偵測**：Playwright 執行測試腳本。當遇到 `locator.click()`、`locator.fill()` 等操作因元素找不到而拋出 `TimeoutError` 或 `ElementNotFound` 時，自癒機制被觸發。
2.  **上下文數據收集**：
    - 攔截器捕獲錯誤，並在錯誤發生時，立即獲取當前頁面的完整 DOM 結構、Accessibility Tree 數據，以及一個頁面截圖。這些數據連同原始的 Selector 一起被打包成上下文資訊 [7]。
    - 例如，原始 Selector 可能是 `page.locator("button.submit-v1")`，但 `submit-v1` 類名已變更。
3.  **AI 推理與新 Selector 生成**：
    - 上下文資訊被發送給 AI Healer (LLM Agent)。
    - LLM 接收到類似這樣的 Prompt：「原本要找 `button.submit-v1`，但在目前的 DOM 中找不到。請根據提供的 Accessibility Tree 和 DOM 結構，找出最像『提交按鈕』的新定位方式。請優先使用 Playwright 推薦的 Locator 策略，如 `getByRole`、`getByText`。」
    - LLM 分析這些數據，理解元素的語意角色（例如，它是一個「提交」按鈕），並推斷出一個新的、更穩健的 Selector，例如 `page.getByRole("button", { name: "Submit" })` 或 `page.getByText("提交")` [8]。
4.  **執行與驗證**：
    - Playwright 使用 AI 建議的新 Selector 重新嘗試執行失敗的測試步驟。
    - 如果重試成功，則表示自癒成功。測試流程可以繼續。
5.  **報告與修復**：
    - 自癒成功後，系統會生成一份詳細的報告，記錄原始錯誤、AI 建議的新 Selector，以及修復結果。這份報告可以作為開發者審核的依據。
    - 對於持久化修復，系統可以自動生成一個程式碼補丁或 PR，建議將測試腳本中的舊 Selector 更新為 AI 找到的新 Selector [6]。
    - 如果 AI 無法找到有效的新 Selector，或者重試後仍然失敗，則標記為無法自癒，並報告原始測試失敗，可能需要人工介入。

## 3. Prerequisites

要實作 Playwright + AI Agent 的自癒 E2E 測試，您需要具備以下環境和知識：

- **Node.js 環境**：用於運行 Playwright 測試。
- **Playwright 基礎知識**：熟悉 Playwright 的 API、Locator 策略、Test Runner 和 Hook 機制。
- **LLM API 存取**：需要一個可用的 LLM 服務（如 OpenAI GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro）及其 API 金鑰。
- **Python 基礎**：如果 AI Healer 邏輯在 Python 中實現，則需要 Python 開發環境。
- **Web 技術基礎**：HTML、CSS、DOM 結構、Accessibility Tree 的基本理解。
- **測試框架知識**：熟悉您使用的測試框架（如 Playwright Test）。

## 4. Implementation / Code Example

本節將提供一個概念性的程式碼範例，展示如何在 Playwright 測試中整合 AI Healer。此範例將著重於自癒的核心邏輯，實際的 LLM 互動和持久化修復會更為複雜。

### 4.1 模擬 AI Healer 服務 (`ai-healer.ts`)

```typescript
// ai-healer.ts
import { Page } from "@playwright/test";

interface HealingContext {
  originalSelector: string; // 原始失敗的 Selector
  domSnapshot: string; // 失敗時的 DOM 快照
  accessibilityTree: string; // 失敗時的 Accessibility Tree
  screenshotBase64: string; // 失敗時的截圖 (Base64 編碼)
  errorMessage: string; // 原始錯誤訊息
}

interface HealingSuggestion {
  newSelector: string; // AI 建議的新 Selector
  confidence: number; // AI 對建議的信心程度 (0-1)
  reason: string; // AI 建議的理由
}

export class AiHealerService {
  // 模擬與 LLM API 互動
  async suggestNewSelector(
    context: HealingContext
  ): Promise<HealingSuggestion | null> {
    console.log("AI Healer: Analyzing failure context...");
    // 實際應用中，這裡會調用 LLM API，將 context 作為 Prompt 輸入
    // LLM 會分析 DOM, Accessibility Tree, 錯誤訊息，並根據其訓練數據推斷出新的 Selector
    // 為了範例簡潔，我們這裡模擬一個簡單的邏輯

    if (context.originalSelector.includes("submit-v1")) {
      // 模擬 AI 根據 Accessibility Tree 找到新的 Selector
      return {
        newSelector: 'role=button[name="Submit"]',
        confidence: 0.95,
        reason:
          "Original selector was a class name that likely changed. Found a semantic match using accessibility role and name.",
      };
    } else if (context.originalSelector.includes("login-btn")) {
      return {
        newSelector: 'text="Login"',
        confidence: 0.88,
        reason: "Original ID changed, but text content remained consistent.",
      };
    }
    return null; // AI 無法提供建議
  }

  // 模擬將修復建議寫入報告或創建 PR
  async reportHealing(
    originalSelector: string,
    newSelector: string,
    reason: string
  ): Promise<void> {
    console.log(
      `AI Healer Report: Successfully healed selector from '${originalSelector}' to '${newSelector}'. Reason: ${reason}`
    );
    // 實際應用中，這裡會將修復資訊記錄到數據庫、發送通知或創建 PR
  }
}
```

### 4.2 Playwright 自癒測試 Hook (`playwright.config.ts` 或單獨的 `setup/teardown` 文件)

```typescript
// playwright.config.ts (部分配置)
import { defineConfig, test as baseTest, expect, Page } from "@playwright/test";
import { AiHealerService } from "./ai-healer";

// 擴展 Playwright 的 test 對象，注入自癒邏輯
const test = baseTest.extend<{
  aiHealer: AiHealerService;
  selfHealingPage: Page;
}>({
  aiHealer: async ({}, use) => {
    await use(new AiHealerService());
  },

  selfHealingPage: async ({ page, aiHealer }, use) => {
    // 覆寫 page.locator 方法，注入自癒邏輯
    const originalLocator = page.locator;
    page.locator = (selector: string, options?: any) => {
      const locator = originalLocator.call(page, selector, options);

      // 攔截 locator 的操作，例如 click, fill 等
      const originalClick = locator.click;
      locator.click = async (clickOptions?: any) => {
        try {
          await originalClick.call(locator, clickOptions);
        } catch (error: any) {
          if (
            error.name === "TimeoutError" ||
            error.message.includes("element was not found")
          ) {
            console.warn(
              `Test failure detected for selector: '${selector}'. Attempting self-healing...`
            );

            // 收集上下文
            const domSnapshot = await page.content();
            const accessibilityTree = await page.accessibility.snapshot(); // 獲取 Accessibility Tree
            const screenshotBuffer = await page.screenshot({
              encoding: "base64",
            });

            const healingSuggestion = await aiHealer.suggestNewSelector({
              originalSelector: selector,
              domSnapshot: domSnapshot,
              accessibilityTree: JSON.stringify(accessibilityTree, null, 2),
              screenshotBase64: screenshotBuffer,
              errorMessage: error.message,
            });

            if (healingSuggestion && healingSuggestion.newSelector) {
              console.log(
                `AI Healer suggested new selector: '${healingSuggestion.newSelector}'`
              );
              const newLocator = originalLocator.call(
                page,
                healingSuggestion.newSelector
              );
              try {
                await newLocator.click(clickOptions); // 使用新 Selector 重試
                await aiHealer.reportHealing(
                  selector,
                  healingSuggestion.newSelector,
                  healingSuggestion.reason
                );
                console.log(
                  `Self-healing successful for '${selector}' using '${healingSuggestion.newSelector}'.`
                );
                return; // 自癒成功，測試繼續
              } catch (retryError: any) {
                console.error(
                  `Self-healing failed even with new selector '${healingSuggestion.newSelector}':`,
                  retryError
                );
              }
            }
            // 如果自癒失敗或沒有建議，重新拋出原始錯誤
            throw error;
          } else {
            throw error; // 其他錯誤直接拋出
          }
        }
      };
      // 可以對其他方法 (fill, type, check 等) 進行類似的覆寫
      return locator;
    };
    await use(page);
  },
});

export { test, expect };

export default defineConfig({
  testDir: "./tests",
  // ... 其他配置
});
```

### 4.3 範例測試文件 (`tests/example.spec.ts`)

```typescript
// tests/example.spec.ts
import { test, expect } from "../playwright.config"; // 從擴展後的 test 導入

test("should login successfully with self-healing", async ({
  selfHealingPage,
}) => {
  await selfHealingPage.goto("https://example.com/login"); // 假設登錄頁面

  // 模擬一個可能變動的 Selector
  await selfHealingPage.locator("#username-input").fill("testuser");
  await selfHealingPage
    .locator('[data-test-id="password-field"]')
    .fill("password123");

  // 假設這個按鈕的 Selector 經常變動
  await selfHealingPage.locator("button.login-btn-v1").click();

  await expect(selfHealingPage.locator(".welcome-message")).toBeVisible();
  await expect(selfHealingPage.url()).toContain("/dashboard");
});

test("should submit form with self-healing", async ({ selfHealingPage }) => {
  await selfHealingPage.goto("https://example.com/form"); // 假設表單頁面

  await selfHealingPage.locator("#name").fill("John Doe");
  await selfHealingPage.locator("#email").fill("john.doe@example.com");

  // 假設這個提交按鈕的 Selector 經常變動
  await selfHealingPage.locator("button.submit-form-v2").click();

  await expect(selfHealingPage.locator(".success-message")).toHaveText(
    "Form submitted successfully!"
  );
});
```

**如何運行：**

1.  將上述程式碼保存到對應的文件中。
2.  確保 `playwright.config.ts` 正確導入了 `ai-healer.ts`。
3.  運行 `npx playwright test`。

當 `button.login-btn-v1` 或 `button.submit-form-v2` 這些 Selector 實際不存在時，測試會觸發自癒邏輯，並嘗試使用 AI 建議的新 Selector 繼續執行。

## 5. Parameters / API Reference

### 5.1 `AiHealerService` 介面

| 方法名稱             | 參數類型                 | 返回值類型                           | 描述                                        |
| :------------------- | :----------------------- | :----------------------------------- | :------------------------------------------ |
| `suggestNewSelector` | `HealingContext`         | `Promise<HealingSuggestion \| null>` | 接收失敗上下文，返回 AI 建議的新 Selector。 |
| `reportHealing`      | `string, string, string` | `Promise<void>`                      | 記錄自癒成功事件，用於報告和分析。          |

### 5.2 `HealingContext` 介面

| 欄位名稱            | 類型     | 描述                                            |
| :------------------ | :------- | :---------------------------------------------- |
| `originalSelector`  | `string` | 導致測試失敗的原始 Selector。                   |
| `domSnapshot`       | `string` | 測試失敗時的頁面完整 HTML 內容。                |
| `accessibilityTree` | `string` | 測試失敗時的頁面 Accessibility Tree JSON 結構。 |
| `screenshotBase64`  | `string` | 測試失敗時的頁面截圖 (Base64 編碼)。            |
| `errorMessage`      | `string` | 原始的錯誤訊息。                                |

### 5.3 `HealingSuggestion` 介面

| 欄位名稱      | 類型     | 描述                                  |
| :------------ | :------- | :------------------------------------ |
| `newSelector` | `string` | AI 建議用於定位元素的新 Selector。    |
| `confidence`  | `number` | AI 對此建議的信心程度 (0 到 1 之間)。 |
| `reason`      | `string` | AI 提供的新 Selector 的理由。         |

## 6. Notes & Best Practices

1.  **AI Healer 的選擇與成本**：選擇合適的 LLM 作為 AI Healer 至關重要。GPT-4o 或 Claude 3.5 Sonnet 等高階模型在理解複雜上下文和推理方面表現優異，但 API 成本相對較高。對於內部應用或對成本敏感的場景，可以考慮使用開源模型（如 Llama 3）進行微調部署 [9]。
2.  **上下文的豐富性**：提供給 AI Healer 的上下文越豐富，其推理的準確性越高。除了 DOM Snapshot，Accessibility Tree 和截圖對於 AI 理解元素的語意和視覺上下文至關重要 [4]。
3.  **Prompt Engineering**：精心設計給 AI Healer 的 Prompt。明確指示 AI 優先使用 Playwright 推薦的 Locator 策略（如 `getByRole`、`getByText`），並提供 Few-shot 範例來引導其輸出格式和推理邏輯 [8]。
4.  **安全與權限**：如果 AI Healer 能夠修改程式碼，必須確保其操作受到嚴格控制。建議透過 PR 流程進行人工審核，而不是直接提交到主分支。對於運行時修復，也應有明確的日誌記錄和監控 [6]。
5.  **性能考量**：每次測試失敗都調用 LLM API 會引入額外的延遲。可以考慮緩存 AI 的修復建議，或只在特定條件下（例如，首次失敗時）觸發自癒機制。對於大型專案，可以將自癒邏輯部署為獨立的微服務 [10]。
6.  **報告與可觀察性**：詳細的自癒報告對於理解測試穩定性和 AI Healer 的表現至關重要。報告應包含原始錯誤、AI 建議、修復結果、耗時等資訊，並可整合到 CI/CD 儀表板中 [3]。
7.  **漸進式導入**：不要期望一次性將所有測試都轉換為自癒模式。可以從最脆弱、最常失敗的測試開始，逐步導入自癒機制，並持續監控其效果。
8.  **與傳統 Locator 結合**：自癒機制應作為傳統 Locator 策略的補充，而非完全替代。優先使用穩定的、語意化的 Locator（如 `getByRole`、`getByTestId`），當這些 Locator 失效時再啟動自癒 [11]。

## 7. 為什麼選擇這種方式？

將 Playwright 與 AI Agent 結合實現自癒 E2E 測試，代表了自動化測試領域的重大進步，其價值體現在多個層面：

1.  **大幅降低測試維護成本**：這是最直接也是最重要的效益。傳統 E2E 測試因 UI 變動而頻繁失效，導致測試工程師需要投入大量時間手動更新 Selector。自癒測試能夠自動處理這些變動，估計可節省高達 80% 的維護時間 [2]。
2.  **提升 CI/CD 流程的穩定性與效率**：測試失敗會阻礙 CI/CD 管線的推進。自癒測試能夠在不中斷流程的情況下自動修復，確保測試套件的綠燈率，加速軟體交付週期。
3.  **增強測試套件的韌性 (Resilience)**：自癒測試使得測試腳本能夠適應 UI 的演變，即使在快速迭代的開發環境中，也能保持其有效性。這意味著測試不再是開發的阻礙，而是品質的保障 [1]。
4.  **釋放測試工程師的生產力**：將重複且繁瑣的 Selector 維護工作交給 AI，測試工程師可以將更多精力投入到更具價值的活動中，例如探索性測試、測試策略設計和性能優化。
5.  **邁向更智能的測試自動化**：這不僅僅是自動化，更是智能化。AI Agent 的引入，使得測試系統能夠「理解」應用程式的語意，而不僅僅是執行預設指令。這是從基於規則的自動化向基於智能的自動化轉變的關鍵一步 [5]。
6.  **提升開發者信心**：穩定的測試套件能夠給開發團隊帶來更大的信心，鼓勵他們進行更大膽的重構和創新，因為他們知道有智能測試在背後提供保障。

---

**參考資料**

- [1] Ministry of Testing. (2024, September 24). _Creating self-healing automated tests with AI and Playwright_. Retrieved from https://www.ministryoftesting.com/articles/creating-self-healing-automated-tests-with-ai-and-playwright
- [2] QAWolf. (n.d.). _The 6 Types of AI Self-Healing in Test Automation_. Retrieved from https://www.qawolf.com/blog/self-healing-test-automation-types
- [3] BrowserStack. (2026, January 16). _Modern Test Automation with AI(LLM) and Playwright_. Retrieved from https://www.browserstack.com/guide/modern-test-automation-with-ai-and-playwright
- [4] Monday.com Engineering. (2026, February 3). _Every Playwright Needs a Director - How AI Agents Replace DOM Scraping with Component-Aware Static Analysis_. Retrieved from https://engineering.monday.com/every-playwright-needs-a-director-how-ai-agents-replace-dom-scraping-with-component-aware-static-analysis/
- [5] TestGuild. (2025, October 20). _Playwright AI Agents: Fix Broken Tests Automatically_. Retrieved from https://testguild.com/playwright-ai-agents/
- [6] Medium. (n.d.). _Build Your Own Playwright Test Healer with AI Agents_. Retrieved from https://medium.com/ganeshgaxy/build-your-own-playwright-test-healer-with-ai-agents-9d5a8d941c52
- [7] Reddit. (n.d.). _Exploring Self-Healing Playwright Automation with AI_. Retrieved from https://www.reddit.com/r/QualityAssurance/comments/1o67zw9/exploring_selfhealing_playwright_automation_with/
- [8] Autify. (2025, October 15). _How to Use AI With Your Playwright Tests: A Complete Guide_. Retrieved from https://autify.com/blog/playwright-ai
- [9] DZone. (2025, March 13). _AI-Driven Self-Healing Tests With Playwright, Cucumber, JS_. Retrieved from https://dzone.com/articles/ai-driven-self-healing-tests-playwright-cucumber-js
- [10] BrowserStack. (n.d.). _Use AI Self-Heal for your Playwright tests running on..._. Retrieved from https://www.browserstack.com/docs/automate/playwright/self-healing
- [11] Playwright.dev. (n.d.). _Playwright Test Agents_. Retrieved from https://playwright.dev/docs/test-agents
- [12] AgentQL. (2025, February 26). _Automated web application testing with AI and Playwright_. Retrieved from https://www.agentql.com/blog/2025-automated-testing-web-ai-playwright
