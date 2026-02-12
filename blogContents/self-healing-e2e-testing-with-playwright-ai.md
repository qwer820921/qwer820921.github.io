---
title: "【自動化測試】使用 Playwright + AI Agent 實現「自癒 (Self-Healing)」的 E2E 測試"
date: "2026-02-12"
author: "子yee"
description: "深入探討如何結合 Playwright 與 AI Agent，實現 E2E 測試腳本的自動修復，大幅降低因 UI 變動導致的測試維護成本。"
category: "Automated Testing"
tags:
  [
    "Playwright",
    "E2E Testing",
    "AI Agent",
    "Self-Healing",
    "AI-Driven Testing",
    "Test Automation",
    "LLM",
  ]
---

## 1. Overview

端到端（End-to-End, E2E）測試是確保軟體品質的關鍵環節，它模擬使用者行為，驗證整個應用程式流程的正確性。然而，傳統的 E2E 測試，特別是基於 UI 元素選擇器（Selector）的測試，面臨著一個普遍的挑戰：**脆弱性（Fragility）**。當前端 UI 進行改版、元素 ID 或 Class 名稱發生變化時，測試腳本中的 Selector 就會失效，導致測試失敗，即便底層功能並未受損。這種情況不僅耗費大量的時間進行手動修復，也嚴重影響了開發團隊對自動化測試的信心和效率 [1]。

為了解決這一痛點，**AI-Driven Testing** 的概念應運而生，其中「自癒（Self-Healing）」測試是其核心能力之一。本文件將深入探討如何結合現代化的 E2E 測試框架 Playwright 與強大的 AI Agent（特別是大型語言模型 LLM），實現 E2E 測試腳本的自動修復。我們將學習如何構建一個智能系統，當測試因 Selector 變動而失敗時，AI Agent 能夠自動分析 DOM 結構變化，識別正確的目標元素，並「自我修復」測試腳本，從而大幅降低測試維護成本，提升測試的穩定性和可靠性。

## 2. Architecture / Design

實現 Playwright E2E 測試的「自癒」能力，其核心在於建立一個智能的 AI Agent，能夠在測試失敗時介入，分析問題並提供解決方案。這是一個結合了測試執行、錯誤偵測、AI 分析與修復的閉環工作流。

### 2.1 AI 自癒測試工作流 (Workflow Architecture)

整個 AI 自癒測試的工作流可以分為以下幾個主要階段：

#### 2.1.1 執行與偵測階段 (Execution & Detection)

此階段負責執行標準的 E2E 測試，並在測試失敗時捕獲相關的錯誤資訊。

- **Playwright Test Runner**：使用 Playwright 執行預先編寫的 E2E 測試腳本。Playwright 提供了強大的瀏覽器自動化能力，支援多種瀏覽器和並行測試 [2]。
- **Failure Listener / Error Interceptor**：在 Playwright 測試框架中，我們可以設置一個監聽器或錯誤攔截器，專門捕獲因 Selector 失效而導致的測試失敗。常見的錯誤類型包括 `TimeoutError`（元素在指定時間內未出現）或 `SelectorNotFound`（無法找到匹配的元素）。當這些錯誤發生時，觸發 AI 修復流程。

#### 2.1.2 AI 分析與修復階段 (AI Analysis & Repair)

這是自癒測試的核心，AI Agent 在此階段介入，分析失敗原因並嘗試修復。

- **上下文提取 (Context Extraction)**：當測試失敗時，需要向 AI Agent 提供足夠的上下文資訊，以便其進行分析：
  - **DOM Snapshot**：獲取測試失敗時的頁面完整 DOM 結構（HTML）。為了減少傳輸和 LLM Token 消耗，可以考慮只獲取相關區域的 DOM，或轉換為更精簡的 **Accessibility Tree** 結構 [3]。
  - **原始 Selector 與預期操作**：提供導致失敗的原始 Selector（例如 `page.locator('#login-button')`）以及預期的操作（例如 `click()`、`fill('input[name=
