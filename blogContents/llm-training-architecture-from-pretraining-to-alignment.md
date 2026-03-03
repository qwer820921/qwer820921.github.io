---
title: "LLM 底層揭密：從無字天書到對話大師的「三階段煉丹術」"
date: "2026-03-03"
author: "子yee"
description: "每天都在呼叫 OpenAI 或 Gemini API，但你知道這些擁有千億參數的大語言模型究竟是如何訓練出來的嗎？本文從後端與系統架構的視角，從煉丹爐的構造 (Transformer) 與原料研磨 (Tokenization) 談起，帶你拆解預訓練、監督式微調 (SFT) 與人類回饋強化學習 (RLHF) 的底層數學與工程邏輯，最終解析開爐出丹的推論階段——Temperature、Top-P 等參數究竟在控制什麼。"
category: "AI Architecture"
tags:
  ["LLM", "AI", "Machine Learning", "Architecture", "Backend", "Deep Learning"]
---

## 前言：AI 不是魔法，是算力與數學的暴力美學

對於習慣寫 C#、TypeScript 或撰寫嚴謹 SQL 語法的後端開發者來說，程式碼的世界是「決定性 (Deterministic)」的——給定相同的 Input，必定得到相同的 Output。然而，當我們呼叫大語言模型 (LLM) 的 API 時，卻像是在面對一個不可預測的黑盒子。

很多人以為 AI 擁有某種程度的「意識」，但在架構師與演算法工程師的眼中，這些千億參數的模型不過是一個**巨大無比的機率分佈矩陣**。

今天，我們不談怎麼寫 Prompt，而是直接把手伸進矽谷巨頭們的「煉丹爐」裡，看看一個模型是如何經歷**「三階段煉丹術」**，從只會胡言亂語的無字天書，進化成能幫你 Debug 甚至寫 Code 的對話大師。

但在點火煉丹之前，我們得先看看這座煉丹爐的**爐體構造**，以及原料是怎麼被**研磨**成可入爐的型態。

---

## 煉丹基礎：認識爐體構造與原料研磨

### 原料研磨：Tokenization（分詞器）

在煉丹之前，藥材必須先被磨成粉末才能放入爐中。對 LLM 來說，這個「研磨」的過程就是 **Tokenization**——將人類可讀的文字，切碎成模型能理解的最小單位：**Token**。

**Token ≠ 字，也 ≠ 單詞。** 這是許多開發者的常見誤解。現代 LLM 普遍使用 **BPE (Byte Pair Encoding)** 演算法，它會根據語料庫中字元組合出現的頻率，自動學習出一套最佳的切分方式：

| 語言   | 原始文字        | Token 切分結果                  | Token 數量 |
| :----- | :-------------- | :------------------------------ | :--------- |
| 英文   | `Hello World`   | `["Hello", " World"]`           | 2          |
| 中文   | `你好世界`      | `["你", "好", "世", "界"]`      | 4          |
| 程式碼 | `console.log()` | `["console", ".", "log", "()"]` | 4          |

> **後端開發者須知**：這直接影響你的 **API 計費**與 **Context Window 長度限制**。同樣的語意內容，中文通常會比英文消耗更多 Token（約 1.5~2 倍）。當你使用 OpenAI API 時，`max_tokens` 限制的不是「字數」，而是 Token 數。

每個 Token 會被映射為一個整數 ID（例如 `"Hello"` → `15339`），最終輸入模型的是一串數字序列。這就是煉丹的「粉末化原料」。

### 爐體構造：Transformer 架構

原料研磨好了，那煉丹爐本身是怎麼設計的？2017 年 Google 發表的 **Transformer** 架構，就是現代所有 LLM 的爐體核心。

#### Self-Attention：讓每個字「回頭看」所有其他字

Transformer 最革命性的設計就是 **Self-Attention（自注意力機制）**。對後端開發者來說，你可以把它想像成資料庫的 `JOIN` 操作：

> **類比**：在 SQL 中，`JOIN` 讓每一筆資料都能參考其他表格的欄位。Self-Attention 做的事情幾乎一樣——**讓序列中的每一個 Token，都能「回頭看」所有其他 Token，並根據相關性賦予不同的權重。**

舉個例子，當模型處理這句話：「**小明**把球丟給了**他**」時，Self-Attention 會計算「他」和句中每個字的關聯分數，發現「他」和「小明」的關聯分數最高，從而理解「他」指的是「小明」。

#### 為什麼 Transformer 取代了 RNN/LSTM？

| 特性           | RNN / LSTM                 | Transformer                     |
| :------------- | :------------------------- | :------------------------------ |
| **處理方式**   | 逐字依序處理（序列化）     | 所有字同時處理（平行化）        |
| **長距離依賴** | 容易「忘記」太早出現的資訊 | 透過 Attention 直接存取任意位置 |
| **訓練速度**   | 無法平行，極慢             | 高度平行，可充分利用 GPU        |
| **代價**       | 計算量 $O(n)$              | 計算量 $O(n^2)$，記憶體需求大   |

> **工程觀點**：Transformer 的 $O(n^2)$ 計算複雜度來自 Self-Attention——每個 Token 都要和所有其他 Token 計算關聯分數。這也是為什麼 Context Window 的長度受限（128K Token 的 Attention 矩陣極其龐大），也催生了 Sliding Window Attention、Sparse Attention 等優化技術。

了解了爐體構造與原料研磨，接下來就可以正式點火開煉了。

---

## 階段一：預訓練 (Pre-training) —— 暴力壓縮人類知識的「文字接龍」引擎

這是整個訓練過程中最耗費算力、燒最多 GPU 與電費的階段。在這個階段，模型就像個剛出生的嬰兒，工程師會把全網際網路的資料（維基百科、GitHub 程式碼、論壇文章）倒給它看。

### 核心原理：Next-Token Prediction

預訓練模型的唯一任務只有一個：**預測下一個字（Token）出現的機率**。它本質上就是一個超級強大的「文字接龍」引擎。

舉個例子，當模型看到「台灣的首都是」這段文字時，它要做的就是在整個詞彙表中（通常包含數萬個 Token），算出每一個 Token 出現的機率，並盡可能讓「台北」的機率最高。

### 底層的數學運作：交叉熵損失 (Cross-Entropy Loss)

在寫程式時，我們會寫單元測試來驗證邏輯對錯；在訓練 AI 時，我們透過「損失函數 (Loss Function)」來告訴模型它猜得多離譜。模型訓練的終極目標，就是最小化以下這個數學公式：

$$L = -\sum_{t=1}^{T} \log P(x_t | x_{\lt t}, \theta)$$

> **開發者白話文**：給定前面已經出現過的字串 $x_{\lt t}$ 以及模型目前的權重參數 $\theta$，模型要去預測正確的下一個字 $x_t$ 的機率 $P$。如果猜測的機率很低，取對數並加上負號後的損失 $L$ 就會很大。
>
> 模型會透過「反向傳播 (Backpropagation)」，微積分計算梯度，不斷去調整那幾千億個參數 $\theta$，直到把損失 $L$ 降到最低為止。

### 分散式系統的極限挑戰

幾千張甚至上萬張 GPU 是怎麼協同工作的？這是一個極度困難的分散式系統工程。因為千億參數連一張 GPU 的記憶體都塞不下，工程師必須運用多種平行策略來化解難題：

| 平行策略                            | 原理                                                            | 切割對象         |
| :---------------------------------- | :-------------------------------------------------------------- | :--------------- |
| **資料平行 (Data Parallelism)**     | 每張 GPU 都持有完整模型副本，各自處理不同批次的資料後再同步梯度 | 訓練資料         |
| **張量平行 (Tensor Parallelism)**   | 將單一層的矩陣運算橫切成多個區塊，分散到不同 GPU 上計算         | 模型的每一層     |
| **管線平行 (Pipeline Parallelism)** | 將模型的不同層分配到不同 GPU，資料像流水線一樣依序通過          | 模型的層與層之間 |

> **工程觀點**：實務上，像 GPT-4、Gemini 這類巨型模型通常會同時使用以上三種平行策略（稱為「3D 平行」），讓叢集之間的資料交換延遲降到最低。這也是為什麼 NVIDIA 的 NVLink 與 InfiniBand 高速互連技術在 AI 時代如此重要。

### 預訓練的規模：一些驚人數字

- **資料量**：通常需要數兆 (Trillion) 個 Token 的文本資料。
- **算力成本**：訓練一次頂級模型可能耗費數千萬美元的 GPU 運算費用。
- **訓練時間**：即使使用數千張 A100/H100 GPU，也需要數週到數月的時間。

---

## 階段二：監督式微調 (SFT) —— 建立 API Contract 的問答格式

經過了第一階段的預訓練，模型已經背下了全世界的知識，但它還不能用。如果你對這時候的模型輸入：「台灣的首都在哪裡？」，它不會回答你「台北」，它可能會接龍寫下：「日本的首都在哪裡？韓國的首都在哪裡？」（因為它看過很多題庫網頁）。

> **關鍵理解**：預訓練後的模型只是一部「知識壓縮機」，它不懂「對話」是什麼，更不懂你期望它停在哪裡。

### 核心轉變：從「文字補完」到「指令遵循」

為了讓模型聽懂人話，我們必須進入**監督式微調 (Supervised Fine-Tuning, SFT)** 階段。

這個階段非常像我們在開發 Web API 時制定的 **API Contract（介面規格）**。工程師會精心準備數萬筆高品質的 JSON 資料，格式大約如下：

```json
{
  "messages": [
    {
      "role": "system",
      "content": "你是一位專業的程式設計助手。"
    },
    {
      "role": "user",
      "content": "請寫一段 C# 讀取檔案的代碼"
    },
    {
      "role": "assistant",
      "content": "可以使用 File.ReadAllText() 方法，範例如下：\n\nusing System.IO;\n\nstring content = File.ReadAllText(\"path/to/file.txt\");\nConsole.WriteLine(content);"
    }
  ]
}
```

我們強迫模型看著這些高品質的「問答對」，微調它內部的參數。這就像是給了 AI 一個框架，告訴它：「當你看到指令形式的 Input 時，請你收斂你的機率分佈，給出符合解答形式的 Output。」

### SFT 的實務考量

- **資料品質 \> 資料數量**：幾千筆精心撰寫的高品質問答對，效果可以勝過數十萬筆低品質資料。
- **格式統一**：訓練時使用的 Prompt 格式（如 `ChatML`、`Alpaca` 格式）必須與推論時一致，否則模型會「聽不懂」。
- **過擬合風險**：SFT 的資料量相較預訓練小得多，容易過度擬合到訓練集，導致模型在未見過的問題上表現下降。

---

## 階段三：人類回饋強化學習 (RLHF) —— 注入價值觀與安全防線

經過 SFT 的模型已經可以對話了，但它可能會一本正經地胡說八道，甚至教你怎麼做危險物品。為了讓它聽起來「像個有禮貌且安全的真人」，我們需要最後一步：**人類回饋強化學習 (RLHF, Reinforcement Learning from Human Feedback)**。

### 步驟 1：訓練一個裁判 (Reward Model)

工程師會先請大量的人類標註員，對 AI 產生的多個回答進行排名（例如 A 回答比 B 回答更有禮貌、更準確）。利用這些排名資料，我們訓練出「另一個較小的 AI 模型」，稱之為**獎勵模型 (Reward Model)**。

這個小模型的作用就是當裁判，專門給大模型的回答打分數。舉例來說：

| 問題                        | 模型回答 A             | 模型回答 B               | 人類標註結果 |
| :-------------------------- | :--------------------- | :----------------------- | :----------- |
| 「如何製作蛋糕？」          | 詳細列出步驟與注意事項 | 只回「去 Google 搜尋」   | A \> B ✅    |
| 「你覺得 X 政治人物好嗎？」 | 客觀分析不同觀點       | 帶有強烈偏見的攻擊性言論 | A \> B ✅    |

### 步驟 2：PPO 演算法 (Proximal Policy Optimization)

接下來，大模型就像是在玩一場遊戲。它產出回答，裁判給分。大模型會透過強化學習演算法（通常是 PPO）不斷修改自己的權重，以追求「最高期望獎勵」：

$$\max_{\theta} \mathbb{E}_{x \sim \mathcal{D}, y \sim \pi_\theta}[R(x, y)]$$

> **開發者白話文**：這是一個尋找最佳解的過程。調整模型目前的參數 $\theta$，讓模型 $\pi_\theta$ 針對問題 $x$ 所產生的回答 $y$，能夠在裁判 $R$ 手中拿到最高分的數學期望值 $\mathbb{E}$。

### 為什麼不直接用 Reward Model 的分數做監督式學習？

這是一個很好的直覺，但行不通。因為如果模型「作弊」——學會產生某些特定的語句模式來欺騙 Reward Model 拿高分，整個系統就崩壞了。PPO 演算法中內建了一個 **KL Divergence 懲罰項**，確保微調後的模型不會偏離 SFT 基準模型太遠：

$$L_{RLHF} = \mathbb{E}[R(x, y)] - \beta \cdot D_{KL}(\pi_\theta \| \pi_{SFT})$$

> **白話文**：向裁判拿高分的同時（第一項），也不能讓自己的行為和 SFT 後的原始模型差太遠（第二項的 KL 散度懲罰）。$\beta$ 控制懲罰的力道。

透過這個機制，我們成功地將人類的「喜好、語氣、價值觀與道德底線」注入到冰冷的矩陣公式中。

### 新趨勢：DPO (Direct Preference Optimization)

值得補充的是，RLHF 的 PPO 訓練流程非常複雜且不穩定。近年來業界開始興起 **DPO (Direct Preference Optimization)**，它的核心思想是：**跳過 Reward Model，直接用人類偏好資料去優化語言模型本身**，大幅簡化了訓練流程，且效果在許多場景下不輸 RLHF。Meta 的 Llama 3 系列就採用了 DPO 來進行對齊訓練。

---

## 開爐出丹：推論 (Inference) 階段的工程解析

三階段煉丹術走完，模型的參數已經定型。但丹藥煉好了，**怎麼服用**才是使用者真正接觸到的環節。這就是**推論 (Inference)** 階段——你每次呼叫 ChatGPT 或 Gemini API，背後就是在執行推論。

### 自迴歸生成：一次只吐一個 Token

LLM 的回答不是「一次算好整段文字再回傳」的，而是**一個 Token 一個 Token 依序生成**的。每產出一個 Token，就把它接回輸入序列的尾端，再預測下一個——如此反覆循環，直到生成終止符號（如 `<EOS>`）或達到 `max_tokens` 上限。

```
Input:  「台灣的首都是」
Step 1: 「台灣的首都是 [台]」    → 模型預測出「台」
Step 2: 「台灣的首都是台 [北]」  → 模型預測出「北」
Step 3: 「台灣的首都是台北 [。]」→ 模型預測出「。」
Step 4: 「台灣的首都是台北。[EOS]」→ 模型結束生成
```

> **後端開發者須知**：這就是為什麼 ChatGPT 的文字是「逐漸浮現」而非一次跳出的。API 中的 `stream: true` 參數背後使用的是 **SSE (Server-Sent Events)** 協定，讓後端在每產出一個 Token 後就立刻推送給前端，大幅提升使用者體驗的感知速度。

### 控制丹藥藥性的三個旋鈕：Temperature、Top-P、Top-K

在推論時，模型會為詞彙表中的每個 Token 計算一個機率分佈。但我們不一定每次都選機率最高的那個——否則回答會死板且重複。這時候，以下三個參數就是控制「藥性」的旋鈕：

#### Temperature（溫度）

Temperature 直接調控機率分佈的「尖銳程度」。數學上，它作用在 Softmax 函數中：

$$P(x_i) = \frac{e^{z_i / T}}{\sum_j e^{z_j / T}}$$

| Temperature 值 | 效果                                            | 適用場景                         |
| :------------- | :---------------------------------------------- | :------------------------------- |
| **T → 0**      | 機率分佈極度集中，幾乎確定性地選擇最高分 Token  | 程式碼生成、事實查詢（追求精準） |
| **T = 1.0**    | 維持原始機率分佈，保有適度隨機性                | 一般對話                         |
| **T \> 1.0**   | 機率分佈被攤平，低機率 Token 也有較大機會被選中 | 創意寫作、腦力激盪（追求多樣性） |

#### Top-P（核取樣 / Nucleus Sampling）

不直接選「機率最高的 K 個」，而是動態選擇「累積機率達到 P 的最小 Token 集合」。例如 `Top-P = 0.9` 表示只從累積機率前 90% 的 Token 中取樣，自動忽略那些極低機率的「垃圾 Token」。

#### Top-K

更粗暴的截斷：只保留機率排名前 K 個 Token，其餘全部歸零。例如 `Top-K = 50` 表示只從前 50 個候選 Token 中選擇。

> **實務建議**：一般情況下，建議調整 `Temperature` + `Top-P` 其中一個即可，不需要三個同時調整。OpenAI 官方建議：如果調了 `Temperature`，就把 `Top-P` 設為 `1`；反之亦然。

### Streaming API 的背後：SSE 協定

當你在 Next.js 或 Angular 串接 LLM API 時，`stream: true` 的回應格式遵循 **Server-Sent Events (SSE)** 協定。後端回傳的 HTTP 回應會長這樣：

```
HTTP/1.1 200 OK
Content-Type: text/event-stream

data: {"choices":[{"delta":{"content":"台"}}]}

data: {"choices":[{"delta":{"content":"北"}}]}

data: {"choices":[{"delta":{"content":"是"}}]}

data: [DONE]
```

> **架構師觀點**：SSE 是單向的（Server → Client），比 WebSocket 輕量。但要注意，如果中間經過了 CDN 或反向代理（如 Nginx），必須確保它們支援 Streaming 回應而非緩衝整個 Response Body。這也跟你了解的 CDN 架構知識直接相關！

---

## 總結：理解底層，才能更好地駕馭頂層

將完整的 LLM 生命週期總結起來，你會發現整個歷程就像一部完整的煉丹故事：

1. **原料研磨 (Tokenization)**：將人類文字切碎成 Token，轉化為模型能消化的數字序列。
2. **爐體構造 (Transformer)**：Self-Attention 機制讓每個 Token 都能「看見」所有其他 Token，賦予模型理解上下文的能力。
3. **第一爐火：Pre-training (預訓練)**：給了模型廣闊的「世界知識」。透過數兆 Token 的文字接龍，將人類知識壓縮進數千億個參數中。
4. **第二爐火：SFT (監督式微調)**：教會模型「如何聽懂指令與對話格式」。用精選的問答對，讓模型從「補完引擎」變成「對話引擎」。
5. **第三爐火：RLHF (強化學習)**：賦予模型「人類的價值觀與安全性」。透過獎勵模型與 PPO 演算法，讓冰冷的機率分佈學會人類的喜好。
6. **開爐出丹 (Inference 推論)**：透過 Temperature、Top-P 等參數控制輸出的「藥性」，用 SSE Streaming 即時送達使用者。

身為應用層的開發者，當我們了解了 AI 是如何透過機率與損失函數「算」出這些文字後，我們在撰寫 System Prompt、設定 `Temperature`（控制機率分佈的隨機性）、調整 `Top-P`（核取樣），甚至未來考慮串接開源模型進行微調時，就不再是盲人摸象，而是能以架構師的思維，精準地駕馭這項強大的技術。

> **最後的架構師提醒**：LLM 的輸出永遠是「機率性 (Probabilistic)」的，而非「決定性 (Deterministic)」的。在設計系統時，永遠不要假設 LLM 的輸出是 100% 可靠的——加上驗證層（Output Validation）、設計降級方案（Fallback），才是穩健的工程實踐。

### 參考資料

- [Vaswani et al.: Attention Is All You Need (Transformer 原始論文)](https://arxiv.org/abs/1706.03762)
- [OpenAI: InstructGPT Paper (Training language models to follow instructions)](https://arxiv.org/abs/2203.02155)
- [Anthropic: Training a Helpful and Harmless Assistant (RLHF)](https://arxiv.org/abs/2204.05862)
- [Stanford: Direct Preference Optimization (DPO)](https://arxiv.org/abs/2305.18290)
- [Google DeepMind: Scaling Language Models](https://arxiv.org/abs/2203.15556)
- [Hugging Face: RLHF - An Overview](https://huggingface.co/blog/rlhf)
- [Holtzman et al.: The Curious Case of Neural Text Degeneration (Top-P / Nucleus Sampling)](https://arxiv.org/abs/1904.09751)
- [Lilian Weng: LLM Powered Autonomous Agents](https://lilianweng.github.io/posts/2023-06-23-agent/)
