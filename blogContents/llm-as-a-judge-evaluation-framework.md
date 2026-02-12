---
title: "【AI 評測領域】LLM-as-a-Judge：如何用 AI 來面試 AI？"
date: "2026-02-06"
author: "子yee"
description: "深入探討 LLM-as-a-Judge 評測框架，教學如何利用高階 LLM 作為考官，自動評估其他 LLM 的輸出品質，實現 AI 應用從原型到產品的關鍵飛躍。"
category: "AI Evaluation"
tags:
  [
    "LLM-as-a-Judge",
    "AI Evaluation",
    "Prompt Engineering",
    "LLM",
    "GPT-4o",
    "Claude 3.5 Sonnet",
    "Rubrics",
    "G-Eval",
    "AI Testing",
  ]
---

## 1. Overview

在大型語言模型（LLM）應用開發的生命週期中，一個核心且持續存在的挑戰是如何**客觀、高效地評估模型輸出品質**。當我們開發出一個「股票分析 AI」或「遊戲數值 AI」時，如何知道它今天的回答是否比昨天更準確、更符合預期？傳統的人工檢查方法不僅耗時、成本高昂，而且容易受到主觀判斷的影響，難以大規模應用 [1]。這使得 LLM 應用從「玩具專案」跨入「產品級應用」的過程充滿不確定性。

為了解決這一痛點，**「LLM-as-a-Judge」**（將 LLM 作為評審）的評測框架應運而生。其核心思想是利用一個能力更強、更穩定的 LLM（例如 GPT-4o 或 Claude 3.5 Sonnet）作為「考官」，自動評估另一個待測 LLM（例如 Llama 3 或 Phi-4）的輸出品質 [2]。這種方法將評測過程自動化，使得開發者能夠在每次模型更新、提示詞調整或數據集變化後，快速獲得量化的性能反饋，從而實現持續整合與持續部署（CI/CD）的 AI 開發流程。

本文件將深入探討 LLM-as-a-Judge 的概念、架構與實作細節。我們將學習如何設定精確的評分標準（Rubrics），並透過程式碼自動化評測流程，最終產出可視化的測試報告。這不僅是 AI 評測領域的重大突破，更是將 LLM 應用推向產品級成熟度的必經之路。

## 2. Architecture / Design

LLM-as-a-Judge 框架的核心在於將評測任務本身也視為一個 LLM 應用，其中包含明確的角色分工和評測流程。其架構設計旨在模擬人類評審的判斷過程，但以自動化、標準化的方式執行 [3]。

### 2.1 核心角色定義

在 LLM-as-a-Judge 框架中，主要有三個關鍵角色：

- **Candidate (應試者)**：
  - **定義**：這是我們希望評估其輸出品質的 LLM 模型、特定的提示詞（Prompt）或整個 AI 應用程式。它可以是較小的、開源的模型（如 Llama 3、Phi-4），或者是針對特定任務微調的模型。
  - **職責**：根據給定的輸入（例如一個問題、一個任務描述），生成一個輸出（例如一個答案、一份報告）。
- **Judge (考官)**：
  - **定義**：一個能力更強、更穩定的 LLM 模型，負責對 Candidate 的輸出進行評估。通常選擇市場上最先進、表現最佳的模型，如 GPT-4o、Claude 3.5 Sonnet [4]。
  - **職責**：接收 Candidate 的輸入、Candidate 的輸出，以及一套明確的評分標準（Rubrics），然後根據這些資訊給出評分和評分理由（通常以思維鏈 Chain-of-Thought 的形式）。
- **Reference (參考答案 - 可選)**：
  - **定義**：對於某些任務，可能存在一個人類編寫的黃金標準答案或一組正確的事實數據。這可以作為 Judge 評估時的額外參考資訊。
  - **職責**：提供客觀的基準，幫助 Judge 更準確地判斷 Candidate 輸出的正確性或品質。並非所有評測場景都必須提供 Reference。

### 2.2 評測模式

LLM-as-a-Judge 可以支援多種評測模式，以適應不同的評估需求：

- **Single Output Scoring (單點評分)**：
  - **描述**：Judge LLM 接收一個輸入、一個 Candidate 輸出和一套 Rubrics，然後根據 Rubrics 對該輸出進行獨立評分（例如 1 到 5 分）。
  - **適用場景**：評估輸出的連貫性、完整性、語氣、風格等主觀品質。
- **Pairwise Comparison (兩兩比較)**：
  - **描述**：Judge LLM 接收一個輸入和兩個不同 Candidate 模型（或不同提示詞版本）的輸出，然後判斷哪一個輸出更好，或者兩者是否相同 [5]。
  - **適用場景**：比較不同模型或提示詞版本之間的相對性能，特別適用於 A/B 測試。
- **Binary Classification (二元判斷)**：
  - **描述**：Judge LLM 判斷 Candidate 輸出是否符合特定的二元標準（例如 Pass/Fail、True/False）。
  - **適用場景**：評估輸出的事實正確性、安全性（是否包含有害內容）、格式遵循度等客觀標準。

### 2.3 自動化評測工作流 (Automated Evaluation Workflow)

一個典型的 LLM-as-a-Judge 自動化評測工作流包含以下步驟：

1.  **準備測試數據集 (Prepare Test Dataset)**：收集一組代表真實使用場景的輸入數據（例如使用者問題、任務描述）。對於需要 Reference 的評測，也需準備對應的黃金標準答案。
2.  **Candidate 模型生成輸出 (Candidate Generation)**：
    - 將測試數據集中的每個輸入傳遞給待評測的 Candidate LLM。
    - 收集 Candidate LLM 針對每個輸入生成的輸出。
3.  **Judge 模型評分 (Judge Evaluation)**：
    - 對於測試數據集中的每個輸入-輸出對，將以下資訊傳遞給 Judge LLM：
      - 原始輸入 (Original Input)
      - Candidate LLM 的輸出 (Candidate Output)
      - 詳細的評分標準 (Rubrics)
      - （可選）參考答案 (Reference Answer)
    - Judge LLM 根據這些資訊，生成一個結構化的評分（例如 JSON 格式），其中包含分數和解釋其判斷的理由（Chain-of-Thought）[6]。
4.  **數據彙整與分析 (Data Aggregation & Analysis)**：
    - 收集所有 Judge LLM 生成的評分結果。
    - 計算各種評測指標的平均分、分佈等統計數據。
    - 分析 Judge LLM 給出的理由，找出 Candidate 模型的優點和缺點。
5.  **報告生成與可視化 (Report Generation & Visualization)**：
    - 將分析結果整理成易讀的報告，例如包含雷達圖、趨勢圖、分數分佈圖等，直觀展示 Candidate 模型的性能。
    - 這份報告可以作為開發者改進模型的依據。
6.  **迭代優化 (Iterative Optimization)**：
    - 根據評測報告的結果，開發者調整 Candidate 模型的提示詞、參數或甚至進行微調。
    - 重複上述步驟，直到 Candidate 模型的性能達到預期目標。

## 3. 評分標準 (Evaluation Rubrics) 設計

設計一套清晰、客觀且全面的評分標準（Rubrics）是 LLM-as-a-Judge 成功的關鍵。Rubrics 應該明確地告訴 Judge LLM「什麼是好的輸出」，以及不同分數等級的具體含義 [7]。

### 3.1 Rubric 結構

一個有效的 Rubric 通常包含以下要素：

- **Criterion (評測標準)**：定義評估的維度，例如「邏輯連貫性」、「數據準確度」、「語氣合適性」、「格式遵循度」等。
- **Scale (評分量表)**：定義每個標準的評分範圍（例如 1-5 分），並為每個分數等級提供詳細的描述。例如：
  - **5 分 (優秀)**：輸出完全符合要求，無可挑剔。
  - **3 分 (一般)**：輸出基本符合要求，但存在一些小瑕疵。
  - **1 分 (差)**：輸出完全不符合要求，或包含嚴重錯誤。
- **Examples (範例)**：提供給 Judge LLM 的 Few-shot 範例，展示在不同分數等級下，一個「好」的輸出和一個「壞」的輸出分別是什麼樣子。這有助於 Judge LLM 更好地理解評分標準 [8]。

### 3.2 關鍵評測指標

針對 LLM 的輸出，常見的評測指標包括：

| 指標名稱                  | 描述                                                       | 評測方式                                                     |
| :------------------------ | :--------------------------------------------------------- | :----------------------------------------------------------- |
| **Faithfulness (忠實度)** | 輸出內容是否完全基於提供的原始上下文或資料，沒有產生幻覺。 | Judge 檢查輸出中的每個事實性陳述是否能在原始輸入中找到依據。 |
| **Relevance (相關性)**    | 輸出內容是否直接、完整地回答了使用者的問題或完成了任務。   | Judge 判斷輸出是否偏離主題，或是否遺漏了關鍵資訊。           |
| **Correctness (正確性)**  | 輸出中包含的事實性數據、邏輯判斷是否準確無誤。             | Judge 根據 Reference 或其自身知識判斷事實性錯誤。            |
| **Coherence (連貫性)**    | 輸出內容的邏輯是否清晰、流暢，各部分之間是否有良好的銜接。 | Judge 評估輸出的組織結構、段落銜接和整體可讀性。             |
| **Conciseness (簡潔性)**  | 輸出是否在不犧牲資訊完整性的前提下，盡可能地簡潔明瞭。     | Judge 判斷輸出是否存在冗餘、重複或不必要的細節。             |
| **Safety (安全性)**       | 輸出是否包含有害、偏見、歧視或不當的內容。                 | Judge 檢查輸出是否違反預設的安全準則。                       |

## 4. Prerequisites

要實作 LLM-as-a-Judge 評測框架，您需要具備以下環境和知識：

- **Python 環境**：建議使用 Python 3.9 或更高版本。
- **LLM API 存取**：需要至少兩個 LLM 的 API 存取權限：一個作為 Judge（通常是最強的模型，如 GPT-4o），另一個作為 Candidate（待測模型）。
- **LLM 框架知識**：熟悉 LangChain、DSPy 或 Semantic Kernel 等 LLM 開發框架，以便於構建 Candidate 和 Judge 的互動邏輯。
- **數據處理能力**：能夠處理測試數據集，包括輸入、輸出和可選的參考答案。
- **評估框架**：了解並可能需要使用專門的 LLM 評估框架，如 G-Eval、Prometheus 或 DeepEval。
- **數據可視化工具**：熟悉 Matplotlib、Seaborn 或其他數據可視化庫，用於生成評測報告。

## 5. Implementation / Code Example

本節將提供一個概念性的 Python 程式碼範例，展示如何使用 LLM-as-a-Judge 評估一個簡單的「股票分析 AI」的回答品質。我們將使用一個較小的模型作為 Candidate，並使用 GPT-4o 作為 Judge。

### 5.1 專案初始化與安裝

```bash
mkdir llm-judge-example
cd llm-judge-example
pip install openai python-dotenv # 假設使用 OpenAI API
```

### 5.2 配置 LLM API 金鑰

創建 `.env` 檔案來儲存您的 API 金鑰：

```dotenv
OPENAI_API_KEY=your_openai_api_key_here
```

### 5.3 核心程式碼 (`evaluate_stock_ai.py`)

```python
import os
import json
from dotenv import load_dotenv
from openai import OpenAI
from typing import List, Dict, Any

load_dotenv()

# 配置 OpenAI 客戶端
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# 1. 定義評分標準 (Rubrics)
# 這裡的 Rubric 會被直接傳遞給 Judge LLM
EVALUATION_RUBRIC = """
你是一個專業的股票分析師，請根據以下標準評估 AI 提供的股票分析報告：

評分標準 (請以 JSON 格式輸出):
{
  "logic_score": "1-5", // 邏輯性：1分(差) - 5分(優秀)
  "data_accuracy": "Pass/Fail", // 數據準確度：是否包含錯誤數據
  "completeness": "1-5", // 完整性：1分(差) - 5分(優秀)
  "reasoning": "string", // 評分理由，詳細說明每個分數的依據
  "overall_verdict": "string" // 總體評價
}

請根據以下股票分析報告和原始問題進行評估。

原始問題: {question}
AI 分析報告: {ai_response}

請嚴格按照 JSON 格式輸出評分，並提供詳細的理由。
"""

# 2. 模擬 Candidate LLM (股票分析 AI)
# 在實際應用中，這會是一個真實的 LLM 調用，可能是較小的模型或特定提示詞
def candidate_stock_analyzer(question: str) -> str:
    # 這裡模擬一個簡單的 LLM 回應，可能包含一些不準確或不完整的資訊
    if "AAPL" in question:
        return "蘋果公司 (AAPL) 是一家科技巨頭，其股價受到 iPhone 銷量和服務收入的影響。最近的財報顯示 iPhone 銷量略有下降，但服務收入增長強勁。預計未來股價將保持穩定，但長期增長潛力有限。" # 故意寫得有點模糊
    elif "TSLA" in question:
        return "特斯拉 (TSLA) 是電動車市場的領導者，但面臨來自傳統車廠的激烈競爭。其股價波動較大，受馬斯克言論和生產目標影響。最近的生產數據顯示增長放緩，但新工廠投產可能帶來轉機。" # 故意寫得有點通用
    else:
        return "我無法提供關於該股票的詳細分析。"

# 3. Judge LLM 進行評估
def judge_llm_evaluation(question: str, ai_response: str) -> Dict[str, Any]:
    judge_prompt = EVALUATION_RUBRIC.format(question=question, ai_response=ai_response)

    try:
        response = client.chat.completions.create(
            model="gpt-4o", # 使用最強的模型作為考官
            messages=[
                {"role": "system", "content": "你是一個嚴格且公正的股票分析師評審。"},
                {"role": "user", "content": judge_prompt}
            ],
            response_format={"type": "json_object"}, # 強制輸出 JSON 格式
            temperature=0.0 # 確保評分穩定性
        )
        evaluation_result = json.loads(response.choices[0].message.content)
        return evaluation_result
    except Exception as e:
        print(f"Judge LLM 評估失敗: {e}")
        return {"error": str(e), "reasoning": "Judge LLM 無法生成有效評分"}

# 4. 運行評測工作流
async def main():
    test_cases = [
        {"question": "請分析蘋果公司 (AAPL) 的近期股價走勢和未來預期。", "expected_data_accuracy": "Pass"},
        {"question": "請分析特斯拉 (TSLA) 的競爭優勢和市場挑戰。", "expected_data_accuracy": "Pass"},
        {"question": "請分析 Google (GOOG) 的雲端業務發展。", "expected_data_accuracy": "Fail"}, # 預期 Candidate 無法提供詳細分析
    ]

    all_evaluations = []

    print("--- 開始 LLM-as-a-Judge 評測 ---")
    for i, test_case in enumerate(test_cases):
        question = test_case["question"]
        print(f"\n[測試案例 {i+1}] 問題: {question}")

        # Candidate LLM 生成回應
        candidate_response = candidate_stock_analyzer(question)
        print(f"[Candidate AI] 回應: {candidate_response}")

        # Judge LLM 進行評估
        evaluation = judge_llm_evaluation(question, candidate_response)
        print(f"[Judge AI] 評估結果: {json.dumps(evaluation, indent=2)}")
        all_evaluations.append(evaluation)

    print("\n--- 評測報告摘要 ---")
    total_logic_score = 0
    pass_data_accuracy = 0
    total_completeness_score = 0
    evaluated_count = 0

    for eval_result in all_evaluations:
        if "logic_score" in eval_result and isinstance(eval_result["logic_score"], (int, str)):
            try:
                total_logic_score += int(eval_result["logic_score"])
                evaluated_count += 1
            except ValueError:
                pass # 忽略無效分數

        if eval_result.get("data_accuracy") == "Pass":
            pass_data_accuracy += 1

        if "completeness" in eval_result and isinstance(eval_result["completeness"], (int, str)):
            try:
                total_completeness_score += int(eval_result["completeness"])
            except ValueError:
                pass # 忽略無效分數

    if evaluated_count > 0:
        print(f"平均邏輯性分數: {total_logic_score / evaluated_count:.2f}")
        print(f"數據準確度通過率: {pass_data_accuracy / len(test_cases):.2%}")
        print(f"平均完整性分數: {total_completeness_score / evaluated_count:.2f}")
    else:
        print("沒有有效的評估結果。")

    print("--- 評測完成 ---")

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
```

### 5.4 程式碼說明

- **`EVALUATION_RUBRIC`**：這是一個多行字串，定義了給 Judge LLM 的評分標準。它明確要求 Judge 以 JSON 格式輸出，並包含 `logic_score`、`data_accuracy`、`completeness`、`reasoning` 和 `overall_verdict` 等欄位。這是 LLM-as-a-Judge 的核心，將人類的評分邏輯轉化為 AI 可理解的指令 [7]。
- **`candidate_stock_analyzer`**：模擬一個待評測的股票分析 AI。在實際應用中，這會是一個對您自己開發的 LLM 應用程式的 API 調用，或者是一個使用較小模型（如 Llama 3）的推理過程。
- **`judge_llm_evaluation`**：這是 Judge LLM 的核心功能。它使用 `gpt-4o` 作為考官，接收原始問題和 Candidate 的回應，並根據 `EVALUATION_RUBRIC` 進行評估。`response_format={"type": "json_object"}` 強制 LLM 輸出 JSON 格式，確保結果的可解析性 [6]。`temperature=0.0` 則用於減少 Judge LLM 的隨機性，使其評分更穩定。
- **`main` 函數**：定義了一組測試案例，並循環執行評測工作流。它首先呼叫 `candidate_stock_analyzer` 獲取回應，然後將回應傳遞給 `judge_llm_evaluation` 進行評分。最後，它彙總並列印出評測報告摘要。

## 6. Parameters / API Reference

本節將基於上述範例，抽象出實作 LLM-as-a-Judge 時可能涉及的關鍵參數和介面。

### 6.1 `EVALUATION_RUBRIC` 結構 (傳遞給 Judge LLM 的提示詞)

| 欄位名稱          | 類型  | 描述                                               |
| :---------------- | :---- | :------------------------------------------------- |
| `logic_score`     | `int` | 評估輸出的邏輯性，通常為 1-5 分。                  |
| `data_accuracy`   | `str` | 評估數據的準確度，通常為 "Pass" 或 "Fail"。        |
| `completeness`    | `int` | 評估輸出的完整性，通常為 1-5 分。                  |
| `reasoning`       | `str` | Judge LLM 給出評分的詳細理由（Chain-of-Thought）。 |
| `overall_verdict` | `str` | Judge LLM 對輸出的總體評價。                       |

### 6.2 `candidate_stock_analyzer` 介面 (概念性)

| 參數名稱   | 類型  | 描述                               |
| :--------- | :---- | :--------------------------------- |
| `question` | `str` | 使用者提出的股票分析問題。         |
| **返回值** | `str` | Candidate LLM 生成的股票分析報告。 |

### 6.3 `judge_llm_evaluation` 介面

| 參數名稱      | 類型             | 描述                                             |
| :------------ | :--------------- | :----------------------------------------------- |
| `question`    | `str`            | 原始問題，作為 Judge LLM 評估的上下文。          |
| `ai_response` | `str`            | Candidate LLM 生成的分析報告。                   |
| **返回值**    | `Dict[str, Any]` | Judge LLM 根據 Rubric 生成的 JSON 格式評估結果。 |

## 7. Notes & Best Practices

1.  **選擇合適的 Judge LLM**：始終選擇當前能力最強、最穩定的 LLM 作為 Judge。其推理能力和遵循指令的能力直接影響評測結果的可靠性。GPT-4o 或 Claude 3.5 Sonnet 是目前較好的選擇 [4]。
2.  **設計清晰的 Rubrics**：評分標準必須極其清晰、具體，並包含詳細的評分量表描述和範例。模糊的 Rubrics 會導致 Judge LLM 評分不一致或不準確 [7]。
3.  **強制結構化輸出**：要求 Judge LLM 以 JSON 或其他結構化格式輸出評分結果，這便於後續的程式化解析和數據分析。利用 `response_format` 參數（如 OpenAI API）可以有效實現這一點 [6]。
4.  **利用 Chain-of-Thought (CoT)**：在提示詞中要求 Judge LLM 提供其評分理由（Reasoning）。這不僅增加了評測過程的透明度，也幫助開發者理解 Candidate 模型失敗的原因，從而更好地進行調試和改進 [6]。
5.  **溫度參數設置**：將 Judge LLM 的 `temperature` 參數設置為 0.0 或接近 0，以減少其生成結果的隨機性，確保評分的一致性和穩定性。
6.  **評測數據集的代表性**：確保測試數據集能夠全面覆蓋 Candidate LLM 的預期使用場景和邊界情況。數據集的品質直接影響評測結果的有效性。
7.  **人類校驗 (Human Validation)**：即使是 LLM-as-a-Judge，也建議定期進行小規模的人工校驗，以確保 Judge LLM 的評分與人類專家的判斷保持一致。這有助於發現 Judge LLM 可能存在的偏見或理解偏差 [1]。
8.  **成本與效率平衡**：使用最強的 LLM 作為 Judge 可能會產生較高的 API 成本。在實際應用中，可以考慮分層評測：先用較便宜的 Judge 進行初步篩選，再用最強的 Judge 進行關鍵評估，或者對評測頻率進行控制。

## 8. 為什麼選擇這種方式？

將 LLM 作為評審（LLM-as-a-Judge）是 AI 應用開發從「玩具」走向「產品」的關鍵一步，其核心價值在於：

1.  **實現 AI 評測的自動化與規模化**：傳統的人工評測耗時耗力，難以應對快速迭代的 LLM 應用。LLM-as-a-Judge 能夠在數分鐘內完成數百甚至數千個輸出的評測，極大地提升了評測效率，使得開發者能夠在每次代碼提交後都運行完整的評測，實現持續整合與持續部署（CI/CD）的 AI 開發流程 [1]。
2.  **提供客觀且一致的評分標準**：人類評審容易受到疲勞、情緒和主觀判斷的影響，導致評分不一致。而經過精心設計提示詞的 Judge LLM，能夠始終如一地遵循預設的 Rubrics 進行評分，提供更客觀、更穩定的評測結果 [7]。
3.  **加速模型迭代與優化**：透過自動化評測，開發者可以快速獲得關於模型性能的量化反饋。Judge LLM 提供的詳細評分理由（Chain-of-Thought）能夠幫助開發者精確定位 Candidate 模型的弱點，從而更有針對性地調整提示詞、模型參數或進行微調，加速模型的迭代和優化過程 [6]。
4.  **降低評測成本**：雖然使用高階 LLM 作為 Judge 會產生 API 費用，但相較於聘請大量人類專家進行大規模評測，其總體成本通常會顯著降低。這使得中小型團隊也能負擔得起高品質的 AI 評測 [1]。
5.  **提升產品級應用的信心**：在將 AI 應用部署到生產環境之前，開發者需要對其性能有足夠的信心。LLM-as-a-Judge 提供了一個可靠的、可重複的評測框架，確保每次發布的模型都達到了預期的品質標準，從而提升了產品的穩定性和使用者滿意度。

---

**參考資料**

- [1] Monte Carlo Data. (2025, November 7). _LLM-As-Judge: 7 Best Practices & Evaluation Templates_. Retrieved from https://www.montecarlodata.com/blog-llm-as-judge/
- [2] Confident AI. (n.d.). _LLM-as-a-Judge Simply Explained: The Complete Guide to Run LLM Evaluations_. Retrieved from https://www.confident-ai.com/blog/why-llm-as-a-judge-is-the-best-llm-evaluation-method
- [3] Evidently AI. (2025, July 23). _LLM-as-a-judge: a complete guide to using LLMs for evaluations_. Retrieved from https://www.evidentlyai.com/llm-guide/llm-as-a-judge
- [4] arXiv. (2024, November 23). _A Survey on LLM-as-a-Judge_. Retrieved from https://arxiv.org/html/2411.15594v1
- [5] Reddit. (2026, January 6). _BEST LLM-as-a-Judge Practices from 2025_. Retrieved from https://www.reddit.com/r/LangChain/comments/1q59at8/best_llmasajudge_practices_from_2025/
- [6] Confident AI. (2025, October 10). _G-Eval Simply Explained: LLM-as-a-Judge for LLM Evaluation_. Retrieved from https://www.confident-ai.com/blog/g-eval-the-definitive-guide
- [7] Towards Data Science. (2025, June 19). _LLM-as-a-Judge: A Practical Guide_. Retrieved from https://towardsdatascience.com/llm-as-a-judge-a-practical-guide/
- [8] Microsoft Learn. (2024, June 24). _Evaluating the performance of LLM summarization prompts with G-Eval_. Retrieved from https://learn.microsoft.com/en-us/ai/playbook/technology-guidance/generative-ai/working-with-llms/evaluation/g-eval-metric-for-summarization
