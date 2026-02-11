---
title: "【提示工程終結者】從 Prompt Engineering 轉向 DSPy (Declarative Self-improving Python)"
date: "2026-02-12"
description: "深入解析 DSPy 框架如何透過宣告式程式設計與自動優化機制，徹底改變 LLM 應用開發範式，告別手寫 Prompt 的脆弱性。"
category: "AI Development"
tags:
  [
    "DSPy",
    "Prompt Engineering",
    "LLM",
    "AI Optimization",
    "Declarative Programming",
    "Teleprompter",
    "AI System Design",
  ]
---

# 【提示工程終結者】從 Prompt Engineering 轉向 DSPy (Declarative Self-improving Python)

**作者：** Manus AI
**日期：** 2026年2月11日

---

## 1. Overview

在大型語言模型（LLM）應用開發的早期階段，「提示工程（Prompt Engineering）」是核心技能。開發者花費大量時間精心設計、迭代和微調提示詞（Prompt），以引導 LLM 產生期望的輸出。然而，這種手動的提示詞工程方法存在顯著的局限性：它**脆弱**、**難以維護**、**難以擴展**，且**缺乏系統性** [1]。當底層 LLM 模型更新、任務需求變化或需要遷移到不同模型時，手寫的提示詞往往會失效，導致巨大的維護成本。

進入 2026 年，業界對 LLM 應用開發的觀點已發生根本性轉變：「手寫 Prompt 是脆弱的」。由史丹佛大學提出的 **DSPy (Declarative Self-improving Python)** 框架，正是為了解決這一痛點而生。DSPy 允許開發者以宣告式（Declarative）的方式定義 LLM 應用程式的邏輯和任務模組，而不是直接編寫提示詞。它將提示詞的生成與優化交給了自動化的「編譯器（Compiler）」和「優化器（Optimizer）」，這些工具能夠透過少量的數據集，自動迭代出比人類手寫更強大、更穩健的提示詞結構 [2]。

本文件將深入解析 DSPy 的核心原理與架構，探討其如何透過 Signatures、Modules 和 Teleprompters 等抽象層，將 LLM 應用開發從藝術轉變為科學。我們將學習如何使用 Python 程式碼定義 AI 的任務模組，並透過 DSPy 的自動優化機制，實現 LLM 應用程式的自動化、可擴展和高性能開發，從而徹底告別傳統提示工程的困境。

## 2. Architecture / Design

DSPy 的核心設計理念是將 LLM 應用程式視為一個可編譯的系統，其架構圍繞著三個關鍵的抽象層：Signatures、Modules 和 Teleprompters (或稱 Optimizers)。這些抽象層共同構成了一個強大的框架，使得開發者能夠以宣告式的方式構建、優化和部署 LLM 應用 [3]。

### 2.1 DSPy 的三大抽象層

#### 2.1.1 Signatures (簽名)

- **定義**：Signature 是 DSPy 中最基礎的抽象，它以宣告式的方式定義了 LLM 任務的**輸入-輸出行為**。它描述了「**做什麼**」，而不是「**怎麼做**」 [4]。
- **功能**：一個 Signature 就像一個函數簽名，它明確指定了輸入欄位（input fields）和輸出欄位（output fields），以及它們的簡短描述。例如，一個問答任務的 Signature 可以是 `question -> answer`，其中 `question` 和 `answer` 都是帶有描述的字串。
- **優勢**：透過 Signature，開發者無需關心底層的提示詞具體措辭，只需專注於任務的邏輯定義。DSPy 會根據這個 Signature 自動生成最適合 LLM 的提示詞。

#### 2.1.2 Modules (模組)

- **定義**：Module 是 DSPy 中用於定義 LLM 應用程式**邏輯結構**的抽象。它將 LLM 應用程式分解為可組合、可重用的組件，類似於 PyTorch 中的 `nn.Module` [5]。
- **功能**：一個 Module 可以是一個簡單的 LLM 調用（例如 `dspy.Predict`），也可以是一個複雜的多步驟推理鏈（例如 `dspy.ChainOfThought`、`dspy.ReAct`）。開發者可以將多個 Module 組合起來，構建複雜的 LLM 管道（Pipeline）。
- **優勢**：Module 使得 LLM 應用程式的開發更加模組化和結構化。每個 Module 都有明確的輸入和輸出，易於測試、調試和重用。當底層 LLM 模型或策略需要更換時，只需替換相應的 Module 即可，而無需修改整個應用程式的邏輯。

#### 2.1.3 Teleprompters / Optimizers (優化器)

- **定義**：Teleprompter（在 DSPy 中也常稱為 Optimizer）是 DSPy 的核心創新之一，它是一個**自動化演算法**，負責根據給定的數據集和評估指標，自動優化 DSPy 程式中的提示詞和/或 LLM 權重 [6]。
- **功能**：Teleprompter 不會手動編寫提示詞，而是透過迭代和搜索，找到最能提升 LLM 應用程式性能的提示詞結構、Few-shot 範例、推理步驟等。常見的 Teleprompters 包括 `BootstrapFewShot`、`BayesianSignatureOptimizer` 等 [7]。
- **優勢**：Teleprompter 徹底解決了手動提示詞工程的痛點。它使得 LLM 應用程式能夠自我改進，自動適應不同的數據集和模型，從而實現更高的性能和更強的魯棒性。開發者只需提供少量帶標籤的數據和一個評估指標，Teleprompter 就能自動完成提示詞的優化工作。

### 2.2 DSPy 編譯工作流 (Compilation Workflow)

DSPy 的開發流程可以概括為一個「編譯」過程，類似於傳統軟體開發中的編譯器將高階語言轉換為機器碼：

1.  **定義程式 (Define Program)**：開發者使用 Python 程式碼，透過 DSPy 的 Signatures 和 Modules 來定義 LLM 應用程式的邏輯。這是一個宣告式的過程，專注於「做什麼」和「如何組合」。
2.  **定義指標 (Define Metric)**：開發者需要為應用程式定義一個或多個評估指標（Metric），用於衡量其性能。例如，對於問答系統，可以是答案的精確度、語意相似度或召回率。
3.  **編譯 (Compile)**：這是 DSPy 最獨特的一步。開發者選擇一個 Teleprompter（Optimizer），並提供一個小的訓練數據集和定義好的指標。Teleprompter 會在這個數據集上運行，透過迭代和搜索，自動生成或調整 DSPy 程式中所有 Modules 的內部提示詞、Few-shot 範例和推理步驟。最終，它會輸出一個「編譯後」的 DSPy 程式物件 [8]。
4.  **執行 (Execute)**：一旦程式被「編譯」完成，開發者就可以使用這個優化後的 DSPy 程式物件來處理新的輸入。此時，所有的提示詞和推理邏輯都已經被 Teleprompter 自動優化，應用程式將以最佳性能運行。

## 3. Prerequisites

要開始使用 DSPy 進行 LLM 應用開發，您需要具備以下環境和知識：

- **Python 環境**：建議使用 Python 3.9 或更高版本。
- **基礎 Python 程式設計知識**：熟悉 Python 的類別、函數和物件導向程式設計。
- **LLM 基礎知識**：理解大型語言模型的基本工作原理、提示詞工程的基本概念。
- **數據集概念**：理解訓練數據集、評估指標在機器學習中的作用。
- **安裝 DSPy**：透過 `pip install dspy-ai` 安裝 DSPy 框架。
- **LLM API 金鑰**：需要配置您選擇的 LLM 服務提供商的 API 金鑰，例如 OpenAI、Anthropic、Google Gemini 等。

## 4. Implementation / Code Example

本節將提供一個使用 DSPy 實現簡單問答系統的範例，展示如何定義 Signature、使用 Module，並透過 Teleprompter 進行自動優化。

### 4.1 專案初始化與安裝

```bash
mkdir dspy-qa-example
cd dspy-qa-example
pip install dspy-ai openai # 假設使用 OpenAI 作為 LLM
```

### 4.2 配置 LLM

創建 `.env` 檔案來儲存您的 OpenAI API 金鑰：

```dotenv
OPENAI_API_KEY=your_openai_api_key_here
```

然後在程式碼中配置 DSPy 使用該 LLM：

```python
import dspy
import os
from dotenv import load_dotenv

load_dotenv()

# 配置 LLM
llm = dspy.OpenAI(model=\"gpt-3.5-turbo\", api_key=os.getenv(\"OPENAI_API_KEY\"))
dspy.settings.configure(lm=llm)
```

### 4.3 定義 Signature

我們定義一個簡單的問答 Signature，它接收一個 `question` 並返回一個 `answer`。

```python
class BasicQA(dspy.Signature):
    \"\"\"根據問題提供簡潔的答案。\"\"\"
    question = dspy.InputField(desc=\"使用者提出的問題\")
    answer = dspy.OutputField(desc=\"問題的簡潔答案\")
```

### 4.4 定義 Module

對於這個簡單的問答任務，我們可以直接使用 `dspy.Predict` Module，它會根據 Signature 自動生成提示詞。

```python
class SimpleQAModule(dspy.Module):
    def __init__(self):
        super().__init__()
        self.predict = dspy.Predict(BasicQA) # 使用 BasicQA Signature

    def forward(self, question):
        return self.predict(question=question)
```

### 4.5 準備數據集與評估指標

DSPy 需要少量帶標籤的數據來進行優化。這裡我們創建一個小的範例數據集。評估指標則用於衡量答案的正確性。

```python
# 範例數據集 (通常來自真實世界的數據)
# 每個範例包含輸入 (question) 和期望的輸出 (answer)
qa_dataset = [
    dspy.Example(question=\"地球是圓的嗎？\", answer=\"是的，地球是圓的。\"),
    dspy.Example(question=\"水的化學式是什麼？\", answer=\"水的化學式是 H2O。\"),
    dspy.Example(question=\"誰發明了燈泡？\", answer=\"托馬斯·愛迪生。\"),
]

# 定義一個簡單的評估函數 (實際應用中會更複雜)
# 這裡我們只檢查答案是否包含關鍵詞
def simple_evaluate(pred_answer, gold_answer):
    return gold_answer.lower() in pred_answer.lower()

class MyEvaluator(dspy.evaluate.Evaluator):
    def __init__(self):
        super().__init__(metric=self.metric)

    def metric(self, example, pred, trace=None):
        # 這裡的 example 是 qa_dataset 中的一個 dspy.Example
        # pred 是 LLM 的預測結果
        # trace 是 DSPy 內部執行的軌跡 (用於調試)
        return simple_evaluate(pred.answer, example.answer)

my_evaluator = MyEvaluator()
```

### 4.6 使用 Teleprompter 進行優化

我們使用 `BootstrapFewShot` Teleprompter 來自動生成 Few-shot 範例，以優化 `SimpleQAModule`。

```python
from dspy.teleprompter import BootstrapFewShot

# 創建一個 Teleprompter
teleprompter = BootstrapFewShot(metric=my_evaluator.metric)

# 編譯/優化我們的 QA 模組
# 會在 qa_dataset 上運行，並嘗試找到最佳的 Few-shot 範例
optimized_qa_module = teleprompter.compile(SimpleQAModule(), trainset=qa_dataset)

# 顯示優化後的提示詞 (會包含自動生成的 Few-shot 範例)
print("\n--- 優化後的提示詞 (部分) ---")
print(optimized_qa_module.predict.extended_predictors[0].lm.history[-1].prompt)
```

### 4.7 執行優化後的模組

```python
# 使用優化後的模組進行推理
print("\n--- 使用優化後的模組進行推理 ---")
response = optimized_qa_module(question=\"太陽系的中心是什麼？\")
print(f\"問題: 太陽系的中心是什麼？\n答案: {response.answer}\")

response = optimized_qa_module(question=\"Python 的創始人是誰？\")
print(f\"問題: Python 的創始人是誰？\n答案: {response.answer}\")
```

### 4.8 完整程式碼 (`main.py`)

```python
import dspy
import os
import re
from dotenv import load_dotenv
from dspy.teleprompter import BootstrapFewShot

# 載入環境變數
load_dotenv()

# 1. 配置 LLM
llm = dspy.OpenAI(model=\"gpt-3.5-turbo\", api_key=os.getenv(\"OPENAI_API_KEY\"))
dspy.settings.configure(lm=llm)

# 2. 定義 Signature
class BasicQA(dspy.Signature):
    \"\"\"根據問題提供簡潔的答案。\"\"\"
    question = dspy.InputField(desc=\"使用者提出的問題\")
    answer = dspy.OutputField(desc=\"問題的簡潔答案\")

# 3. 定義 Module
class SimpleQAModule(dspy.Module):
    def __init__(self):
        super().__init__()
        self.predict = dspy.Predict(BasicQA)

    def forward(self, question):
        return self.predict(question=question)

# 4. 準備數據集與評估指標
qa_dataset = [
    dspy.Example(question=\"地球是圓的嗎？\", answer=\"是的，地球是圓的。\"),
    dspy.Example(question=\"水的化學式是什麼？\", answer=\"水的化學式是 H2O。\"),
    dspy.Example(question=\"誰發明了燈泡？\", answer=\"托馬斯·愛迪生。\"),
    dspy.Example(question=\"光速是多少？\", answer=\"約每秒 299,792,458 公尺。\"),
]

def simple_evaluate(pred_answer, gold_answer):
    return gold_answer.lower() in pred_answer.lower()

class MyEvaluator(dspy.evaluate.Evaluator):
    def __init__(self):
        super().__init__(metric=self.metric)

    def metric(self, example, pred, trace=None):
        return simple_evaluate(pred.answer, example.answer)

my_evaluator = MyEvaluator()

# 5. 使用 Teleprompter 進行優化
teleprompter = BootstrapFewShot(metric=my_evaluator.metric)
optimized_qa_module = teleprompter.compile(SimpleQAModule(), trainset=qa_dataset)

# 顯示優化後的提示詞 (會包含自動生成的 Few-shot 範例)
print("\n--- 優化後的提示詞 (部分) ---")
# 注意：這裡的索引可能需要根據實際運行情況調整，以獲取正確的提示詞
# 這是獲取 dspy.Predict 內部提示詞的一種方式
if optimized_qa_module.predict.extended_predictors:
    print(optimized_qa_module.predict.extended_predictors[0].lm.history[-1].prompt)
else:
    print("無法獲取優化後的提示詞，可能需要更多訓練數據或不同的 Teleprompter。")

# 6. 執行優化後的模組
print("\n--- 使用優化後的模組進行推理 ---")
response = optimized_qa_module(question=\"太陽系的中心是什麼？\")
print(f\"問題: 太陽系的中心是什麼？\n答案: {response.answer}\")

response = optimized_qa_module(question=\"Python 的創始人是誰？\")
print(f\"問題: Python 的創始人是誰？\n答案: {response.answer}\")

response = optimized_qa_module(question=\"萬有引力定律是誰提出的？\")
print(f\"問題: 萬有引力定律是誰提出的？\n答案: {response.answer}\")
```

## 5. Parameters / API Reference

DSPy 的 API 參考主要體現在其核心類別和函數上，這些構成了開發者構建和優化 LLM 應用程式的介面。

### 5.1 `dspy.Signature` 相關參數

| 參數/屬性     | 類型         | 描述                                                                 |
| :------------ | :----------- | :------------------------------------------------------------------- |
| `InputField`  | `dspy.Field` | 定義 Signature 的輸入欄位，可指定 `desc` (描述) 和 `prefix` (前綴)。 |
| `OutputField` | `dspy.Field` | 定義 Signature 的輸出欄位，可指定 `desc` (描述) 和 `prefix` (前綴)。 |

### 5.2 `dspy.Module` 相關類別

| 類別                  | 描述                                                           |
| :-------------------- | :------------------------------------------------------------- |
| `dspy.Predict`        | 最基本的 Module，根據 Signature 進行單次 LLM 預測。            |
| `dspy.ChainOfThought` | 實現思維鏈（Chain-of-Thought）推理，將複雜任務分解為多個步驟。 |
| `dspy.ReAct`          | 實現 ReAct（Reasoning and Acting）模式，結合推理和工具使用。   |
| `dspy.Retrieve`       | 實現檢索（Retrieval）功能，從外部知識庫獲取相關資訊。          |
| `dspy.Program`        | 用於組合多個 Module 形成一個完整的 LLM 應用程式。              |

### 5.3 `dspy.Teleprompter` (Optimizer) 相關類別

| 類別                         | 描述                                                      |
| :--------------------------- | :-------------------------------------------------------- |
| `BootstrapFewShot`           | 透過引導（Bootstrapping）生成 Few-shot 範例來優化提示詞。 |
| `BayesianSignatureOptimizer` | 使用貝葉斯優化來搜索最佳的 Signature 結構和提示詞。       |
| `SignatureOptimizer`         | 基礎的 Signature 優化器，用於調整提示詞的措辭。           |
| `Ensemble`                   | 組合多個優化後的程式，以提高魯棒性。                      |

### 5.4 `dspy.settings.configure` 參數

| 參數名稱 | 類型      | 描述                                                |
| :------- | :-------- | :-------------------------------------------------- |
| `lm`     | `dspy.LM` | 配置要使用的語言模型實例（例如 `dspy.OpenAI`）。    |
| `rm`     | `dspy.RM` | 配置要使用的檢索模型實例（例如 `dspy.ColBERTv2`）。 |

## 6. Notes & Best Practices

1.  **從 Signature 開始**：始終從清晰地定義任務的 Signature 開始。這是 DSPy 程式的基石，它明確了輸入和輸出，讓 DSPy 能夠自動生成提示詞 [4]。
2.  **模組化設計**：將複雜的 LLM 應用程式分解為小的、可管理的 Module。這不僅提高了程式碼的可讀性和可維護性，也使得每個 Module 都可以獨立優化 [5]。
3.  **數據集的重要性**：儘管 DSPy 減少了手動提示詞工程，但它仍然需要少量的高品質數據集來進行優化。這些數據集用於訓練 Teleprompter，使其能夠學習如何生成最佳的提示詞和 Few-shot 範例 [8]。
4.  **選擇合適的 Teleprompter**：不同的 Teleprompter 適用於不同的優化目標和場景。例如，`BootstrapFewShot` 適合於生成 Few-shot 範例，而 `BayesianSignatureOptimizer` 則更適合於搜索最佳的 Signature 結構 [7]。
5.  **迭代優化**：DSPy 的優化過程是迭代的。您可能需要嘗試不同的 Teleprompter、調整數據集或評估指標，以找到最佳的程式性能。
6.  **評估指標的精確性**：優化器的效果直接取決於評估指標的精確性。一個好的評估指標能夠準確地反映應用程式的性能，從而引導優化器找到更好的解決方案。
7.  **可解釋性與調試**：DSPy 提供了 `dspy.settings.trace()` 等工具，可以追蹤 LLM 的內部調用和提示詞生成過程，這對於理解和調試優化後的程式非常有幫助。

## 7. 為什麼選擇這種方式？

從傳統的手寫 Prompt Engineering 轉向 DSPy 框架，代表著 LLM 應用開發範式的重大演進，其優勢在於：

1.  **告別手寫 Prompt 的脆弱性**：傳統的手寫 Prompt 極易受到 LLM 模型更新、任務細節變化或不同模型之間差異的影響，導致測試失敗和高昂的維護成本。DSPy 透過將提示詞的生成自動化，使得應用程式對這些變化更具彈性，從根本上解決了 Prompt 的脆弱性問題 [1]。
2.  **實現 LLM 應用程式的自動化優化**：DSPy 的 Teleprompters 能夠根據數據集和評估指標，自動搜索和迭代出最佳的提示詞、Few-shot 範例和推理步驟。這意味著開發者不再需要憑藉直覺或經驗來猜測最佳提示詞，而是讓 AI 自己學習如何更好地完成任務，從而實現 LLM 應用程式的自我改進和性能最大化 [2]。
3.  **提升開發效率與可維護性**：DSPy 引入了 Signatures 和 Modules 等抽象層，使得 LLM 應用程式的開發更加模組化、結構化和宣告式。開發者可以像編寫傳統軟體一樣，定義清晰的任務邏輯和組件，這極大地提升了程式碼的可讀性、可重用性和可維護性 [3]。
4.  **增強 LLM 應用程式的魯棒性與可擴展性**：透過自動優化，DSPy 程式在面對不同的輸入數據或底層 LLM 模型時，能夠表現出更強的魯棒性。同時，模組化的設計也使得應用程式更容易擴展，以應對更複雜的任務和不斷變化的需求 [8]。
5.  **從「提示詞工程師」轉向「AI 系統架構師」**：DSPy 改變了 AI 開發者的角色。開發者不再是提示詞的「工匠」，而是專注於設計數據流、定義評估指標和構建模組化邏輯的「AI 系統架構師」。這使得開發者能夠從低層次的提示詞細節中解放出來，專注於更高層次的系統設計和業務價值 [9]。

---

**參考資料**

- [1] Statsig. (2025, October 31). _DSPy vs prompt engineering: Systematic vs manual tuning_. Retrieved from https://www.statsig.com/perspectives/dspy-vs-prompt-tuning
- [2] DSPy. (n.d.). _Programming LLMs with DSPy_. Retrieved from https://dspy.ai/learn/programming/
- [3] Medium. (2024, June 3). _An Exploratory Tour of DSPy: A Framework for Programing LLMs_. Retrieved from https://medium.com/the-modern-scientist/an-exploratory-tour-of-dspy-a-framework-for-programing-language-models-not-prompting-711bc4a56376
- [4] DSPy. (n.d.). _Signatures_. Retrieved from https://dspy.ai/learn/programming/signatures/
- [5] IBM. (n.d.). _What is DSPy?_. Retrieved from https://www.ibm.com/think/topics/dspy
- [6] DSPy. (n.d.). _Optimizers_. Retrieved from https://dspy.ai/learn/optimization/optimizers/
- [7] The Data Quarry. (2025, October 13). _Learning DSPy (3): Working with optimizers_. Retrieved from https://thedataquarry.com/blog/learning-dspy-3-working-with-optimizers
- [8] Statsig. (2025, October 31). _DSPy fundamentals: Programmatic LLM optimization_. Retrieved from https://www.statsig.com/perspectives/dspy-fundamentals-llm-optimization
- [9] blog.devwithawais.com. (2025, November 27). _6 Surprising Truths About DSPy That Make Manual Prompting Obsolete_. Retrieved from https://blog.devwithawais.com/6-surprising-truths-about-dspy-that-make-manual-prompting-obsolete-a13c85a5c458
