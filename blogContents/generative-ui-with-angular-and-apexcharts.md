---
title: "【新一代互動領域】Generative UI：讓 AI 直接「畫」出 Angular 組件"
date: "2026-02-11"
author: "子yee"
description: "深入探討 Generative UI (GenUI) 如何將 AI 的文字輸出轉化為可互動的 Angular 組件，結合 ApexCharts 實現動態數據視覺化，將 Chatbot 升級為功能性 GUI。"
category: "UI/UX & AI"
tags:
  [
    "Generative UI",
    "GenUI",
    "Angular",
    "ApexCharts",
    "AI SDK",
    "Dynamic Rendering",
    "Frontend",
    "AI",
    "UX",
  ]
---

## 1. Overview

在人工智慧（AI）與使用者介面（UI）的交匯點，一個革命性的概念正在崛起：**Generative UI (GenUI)**。傳統上，AI 應用程式主要透過文字回應與使用者互動，無論是聊天機器人、內容生成器或數據分析工具，其輸出形式多為純文本。這意味著使用者在接收到 AI 的洞察或建議後，仍需手動將這些資訊轉化為實際的操作或視覺化呈現。然而，GenUI 的出現，正在打破這一限制，它允許 AI 不僅能「說」出答案，更能直接「畫」出一個可互動、功能性的使用者介面 [1]。

本文件將深入探討 Generative UI 的核心概念，並結合您在 Angular 與 ApexCharts 的經驗，實作一個端到端的工作流。我們將學習如何讓 AI 不再僅僅回傳文字，而是輸出結構化的 JSON 配置，前端應用程式（特別是 Angular）能夠即時解析這些配置，動態渲染出圖表、按鈕或其他互動組件。例如，當使用者詢問「分析台積電走勢」時，AI 不再僅回傳文字描述，而是直接生成一個包含 K 線圖與買賣按鈕的互動式儀表板，讓使用者能夠直接點擊操作。這將 Chatbot 從單純的對話介面，升級為一個真正的「功能性 GUI」，大幅提升使用者體驗與任務達成效率 [2]。

## 2. Architecture / Design

實現 Generative UI 需要 AI 後端與前端應用程式之間緊密的協同工作。其核心在於建立一個標準化的通訊協定，讓 AI 能夠以結構化的方式描述所需的 UI 組件，而前端則負責解析並動態渲染這些組件 [3]。

### 2.1 AI 端：結構化輸出 (Structured Output)

AI 後端是 GenUI 的「設計師」，負責根據使用者的意圖和上下文，決定生成何種 UI 組件及其配置。這需要以下關鍵能力：

- **Tool Calling / Function Calling**：AI 必須具備調用預定義工具的能力。這些工具可以是抽象的 UI 渲染指令，例如 `render_chart(config)`、`show_action_buttons(buttons)` 等。當 AI 判斷需要視覺化或互動時，它會選擇調用這些工具 [4]。
- **JSON Schema 定義**：為了確保 AI 輸出的 UI 配置能夠被前端正確解析，必須為每個可生成的 UI 組件定義嚴格的 JSON Schema。例如，一個圖表組件的配置可能包含 `chartType`、`series`、`options` 等欄位，而按鈕組件則包含 `label`、`action` 等。JSON Schema 不僅規範了數據格式，也作為 AI 生成時的「藍圖」 [5]。
- **Prompt Engineering**：引導 AI 根據上下文決定「何時」以及「如何」生成 UI 是關鍵。提示詞需要明確指示 AI 在特定情境下，應優先輸出結構化的 UI 配置而非純文本。這可能涉及 Few-shot Learning，提供 AI 範例來學習如何將用戶意圖映射到 UI 組件的 JSON 描述 [6]。

### 2.2 前端端：Angular 動態渲染 (Dynamic Rendering)

前端應用程式（在此為 Angular）是 GenUI 的「建造者」，負責接收 AI 輸出的結構化配置，並將其轉換為實際的互動式 UI。這需要強大的動態組件渲染能力：

- **Component Registry (組件註冊表)**：前端需要維護一個可用的 UI 組件映射表。這個註冊表將 AI 輸出中的組件類型字串（例如 `"stock-chart"`、`"action-buttons"`）對應到實際的 Angular 組件類別（例如 `StockChartComponent`、`ActionButtonsComponent`）。這使得前端能夠根據 AI 的指令，找到並載入正確的組件 [7]。
- **Dynamic Component Loader (動態組件載入器)**：Angular 提供了強大的機制來動態載入和實例化組件。主要方法包括：
  - **`ViewContainerRef`**：允許在運行時動態地將組件插入到 DOM 中。這是最常見且靈活的動態組件載入方式 [8]。
  - **`ngComponentOutlet`**：一個結構型指令，可以根據組件類別動態渲染組件，通常用於更簡單的場景 [9]。
  - **`ComponentMirror` (Angular 17+)**：提供更現代化的 API 來操作組件實例，尤其是在 Signals 時代，可以更高效地處理組件的輸入與輸出 [10]。
- **State & Input Binding**：將 AI 輸出的 JSON 配置中的數據和屬性，綁定到動態載入組件的 `@Input()` 屬性上。同時，監聽組件發出的 `@Output()` 事件，將使用者的互動（例如點擊按鈕、圖表縮放）回傳給 AI 後端或處理本地業務邏輯 [11]。

## 3. 實作工作流 (Workflow)

以下是一個基於 Angular 與 ApexCharts 實現 Generative UI 的典型工作流：

1.  **使用者查詢 (User Query)**：使用者在聊天介面中輸入：「幫我分析台積電最近一週的走勢，並提供買賣建議。」
2.  **AI 推理 (AI Reasoning)**：
    - AI 接收到查詢後，透過其內部的工具調用機制，判斷需要獲取股票數據並以圖表形式呈現，同時提供交易操作。
    - AI 調用一個名為 `render_stock_analysis_ui` 的工具，並根據其對話上下文和知識，生成該工具所需的參數。
3.  **JSON 配置輸出 (JSON Output)**：AI 後端將生成一個符合預定義 JSON Schema 的配置對象，例如：
    ```json
    {
      "componentType": "stock-chart-dashboard",
      "data": {
        "symbol": "TSM",
        "timeframe": "1W",
        "chartOptions": {
          /* ApexCharts 配置 */
        },
        "series": [
          /* 股票數據 */
        ]
      },
      "actions": [
        {
          "label": "買入",
          "actionType": "buy",
          "payload": { "symbol": "TSM", "amount": 100 }
        },
        {
          "label": "賣出",
          "actionType": "sell",
          "payload": { "symbol": "TSM", "amount": 100 }
        }
      ]
    }
    ```
4.  **Angular 聊天組件攔截 (Angular Interceptor)**：前端的聊天組件（例如 `ChatComponent`）接收到 AI 的回應。它會檢查回應內容，如果發現是結構化的 UI 配置（例如以特定標籤或 JSON 格式開頭），則會攔截並處理。
5.  **動態組件渲染 (Dynamic Render)**：
    - 聊天組件根據 `componentType` 查找 `Component Registry`，找到對應的 `StockChartDashboardComponent`。
    - 利用 `ViewContainerRef` 或 `ComponentMirror` 動態載入 `StockChartDashboardComponent`。
    - 將 JSON 配置中的 `data` 和 `actions` 綁定到 `StockChartDashboardComponent` 的 `@Input()` 屬性。
    - `StockChartDashboardComponent` 內部使用 ApexCharts 庫，根據接收到的 `chartOptions` 和 `series` 數據渲染出 K 線圖，並根據 `actions` 渲染出買賣按鈕。
6.  **使用者互動 (User Interaction)**：
    - 使用者可以直接在 K 線圖上進行縮放、平移等操作。
    - 使用者點擊「買入」按鈕，`StockChartDashboardComponent` 發出一個 `@Output()` 事件，包含 `actionType` 和 `payload`。
    - 聊天組件接收到這個事件，並將其轉發回 AI 後端，觸發後續的交易執行邏輯。

## 4. Prerequisites

要實作 Generative UI 與 Angular 動態渲染，您需要具備以下環境和知識：

- **Angular 開發環境**：Node.js、Angular CLI (v17+ 推薦)。
- **Angular 基礎知識**：組件、服務、模組、輸入/輸出屬性、生命週期鉤子。
- **Angular 動態組件載入**：熟悉 `ViewContainerRef`、`ComponentFactoryResolver` (舊版) 或 `ComponentMirror` (新版) 的使用。
- **ApexCharts 知識**：了解 ApexCharts 的配置選項、數據格式和事件處理。
- **AI SDK / LLM API 存取**：如果使用 Vercel AI SDK 或其他 LLM 服務，需要相關的 API 金鑰和 SDK 配置。
- **TypeScript 基礎**：強型別語言有助於定義清晰的 JSON Schema 和組件介面。
- **JSON Schema 知識**：理解如何定義和驗證 JSON 數據結構。

## 5. Implementation / Code Example

本節將提供一個簡化的 Angular 程式碼範例，展示如何動態渲染基於 AI 輸出的 JSON 配置的組件。我們將專注於前端的動態渲染邏輯，假設 AI 後端已經能夠輸出符合預期格式的 JSON。

### 5.1 專案初始化

```bash
ng new generative-ui-demo --standalone --routing=false
cd generative-ui-demo
ng add ng-apexcharts # 安裝 ApexCharts for Angular
```

### 5.2 定義 UI 配置介面 (`src/app/shared/ui-config.model.ts`)

```typescript
export interface ChartConfig {
  chartType: string; // e.g., 'line', 'candlestick'
  series: any[];
  options: any;
}

export interface ActionButtonConfig {
  label: string;
  actionType: string; // e.g., 'buy', 'sell'
  payload: any;
}

export interface GenerativeUIConfig {
  componentType: "stock-chart-dashboard"; // 假設只有一種 GenUI 組件類型
  data: ChartConfig;
  actions: ActionButtonConfig[];
}
```

### 5.3 股票圖表儀表板組件 (`src/app/stock-chart-dashboard/stock-chart-dashboard.component.ts`)

```typescript
import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { NgApexchartsModule } from "ng-apexcharts";
import { ChartConfig, ActionButtonConfig } from "../shared/ui-config.model";

// 引入 ApexCharts 類型定義
import {
  ChartOptions,
  ApexAxisChartSeries,
  ApexChart,
  ApexXAxis,
  ApexDataLabels,
  ApexTooltip,
  ApexStroke,
  ApexYAxis,
  ApexPlotOptions,
  ApexCandlestick,
} from "ng-apexcharts";

// 擴展 ChartOptions 以包含所有可能的 ApexCharts 配置
export type StockChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis | ApexYAxis[];
  dataLabels: ApexDataLabels;
  tooltip: ApexTooltip;
  stroke: ApexStroke;
  plotOptions: ApexPlotOptions;
  candlestick: ApexCandlestick;
} & ChartOptions;

@Component({
  selector: "app-stock-chart-dashboard",
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  template: `
    <div class="stock-dashboard">
      <div class="chart-container">
        <ng-apexcharts
          *ngIf="chartData && chartOptions"
          [series]="chartData.series"
          [chart]="chartOptions.chart"
          [xaxis]="chartOptions.xaxis"
          [yaxis]="chartOptions.yaxis"
          [dataLabels]="chartOptions.dataLabels"
          [tooltip]="chartOptions.tooltip"
          [stroke]="chartOptions.stroke"
          [plotOptions]="chartOptions.plotOptions"
          [candlestick]="chartOptions.candlestick"
        ></ng-apexcharts>
      </div>
      <div class="action-buttons">
        <button
          *ngFor="let action of actions"
          (click)="onActionClick(action)"
          class="btn btn-primary"
        >
          {{ action.label }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .stock-dashboard {
        border: 1px solid #ccc;
        padding: 15px;
        border-radius: 8px;
        margin-top: 20px;
      }
      .chart-container {
        margin-bottom: 15px;
      }
      .action-buttons button {
        margin-right: 10px;
        padding: 8px 15px;
        cursor: pointer;
      }
      .btn-primary {
        background-color: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
      }
    `,
  ],
})
export class StockChartDashboardComponent implements OnInit {
  @Input() chartConfig!: ChartConfig;
  @Input() actions!: ActionButtonConfig[];
  @Output() actionTriggered = new EventEmitter<{
    actionType: string;
    payload: any;
  }>();

  public chartData: ChartConfig["data"] | undefined;
  public chartOptions: Partial<StockChartOptions> | undefined;

  ngOnInit(): void {
    if (this.chartConfig) {
      this.chartData = { series: this.chartConfig.series };
      this.chartOptions = {
        ...this.chartConfig.options,
        chart: {
          ...this.chartConfig.options.chart,
          type: this.chartConfig.chartType,
        },
      };
    }
  }

  onActionClick(action: ActionButtonConfig): void {
    this.actionTriggered.emit({
      actionType: action.actionType,
      payload: action.payload,
    });
  }
}
```

### 5.4 動態渲染服務 (`src/app/shared/dynamic-ui.service.ts`)

```typescript
import {
  Injectable,
  Type,
  ViewContainerRef,
  ComponentRef,
} from "@angular/core";
import { GenerativeUIConfig } from "./ui-config.model";
import { StockChartDashboardComponent } from "../stock-chart-dashboard/stock-chart-dashboard.component";

@Injectable({ providedIn: "root" })
export class DynamicUiService {
  private componentRegistry: { [key: string]: Type<any> } = {
    "stock-chart-dashboard": StockChartDashboardComponent,
  };

  // 註冊組件，允許擴展
  registerComponent(type: string, component: Type<any>): void {
    this.componentRegistry[type] = component;
  }

  renderDynamicComponent(
    viewContainerRef: ViewContainerRef,
    uiConfig: GenerativeUIConfig
  ): ComponentRef<any> | null {
    const componentType = this.componentRegistry[uiConfig.componentType];

    if (!componentType) {
      console.error(
        `Component type ${uiConfig.componentType} not found in registry.`
      );
      return null;
    }

    viewContainerRef.clear(); // 清除舊組件
    const componentRef = viewContainerRef.createComponent(componentType);

    // 設置輸入屬性
    if (uiConfig.componentType === "stock-chart-dashboard") {
      const stockDashboardInstance =
        componentRef.instance as StockChartDashboardComponent;
      stockDashboardInstance.chartConfig = uiConfig.data;
      stockDashboardInstance.actions = uiConfig.actions;
      // 訂閱輸出事件
      stockDashboardInstance.actionTriggered.subscribe((event) => {
        console.log("User action triggered:", event);
        // 在這裡處理用戶互動，例如發送給 AI 後端
        alert(`執行動作: ${event.actionType} ${JSON.stringify(event.payload)}`);
      });
    }

    return componentRef;
  }
}
```

### 5.5 聊天組件 (`src/app/chat/chat.component.ts`)

```typescript
import { Component, ViewChild, ViewContainerRef, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { DynamicUiService } from "../shared/dynamic-ui.service";
import { GenerativeUIConfig } from "../shared/ui-config.model";
import { StockChartDashboardComponent } from "../stock-chart-dashboard/stock-chart-dashboard.component";

@Component({
  selector: "app-chat",
  standalone: true,
  imports: [CommonModule, FormsModule, StockChartDashboardComponent], // 引入 StockChartDashboardComponent 確保其可用
  template: `
    <div class="chat-container">
      <div class="messages">
        <div *ngFor="let message of messages" class="message">
          <div *ngIf="message.type === 'text'">
            <strong>{{ message.sender }}:</strong> {{ message.content }}
          </div>
          <div *ngIf="message.type === 'ui'">
            <strong>{{ message.sender }}:</strong>
            <ng-container #dynamicUiHost></ng-container>
          </div>
        </div>
      </div>
      <div class="input-area">
        <input
          [(ngModel)]="userInput"
          placeholder="輸入你的問題..."
          (keyup.enter)="sendMessage()"
        />
        <button (click)="sendMessage()">發送</button>
      </div>
    </div>
  `,
  styles: [
    `
      .chat-container {
        width: 80%;
        margin: 20px auto;
        border: 1px solid #eee;
        padding: 20px;
        border-radius: 8px;
      }
      .messages {
        min-height: 300px;
        max-height: 500px;
        overflow-y: auto;
        border-bottom: 1px solid #eee;
        margin-bottom: 15px;
        padding-bottom: 10px;
      }
      .message {
        margin-bottom: 10px;
      }
      .input-area {
        display: flex;
      }
      .input-area input {
        flex-grow: 1;
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 4px;
        margin-right: 10px;
      }
      .input-area button {
        padding: 8px 15px;
        background-color: #28a745;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
    `,
  ],
})
export class ChatComponent implements OnInit {
  @ViewChild("dynamicUiHost", { read: ViewContainerRef, static: true })
  dynamicUiHost!: ViewContainerRef;

  messages: {
    type: "text" | "ui";
    sender: string;
    content?: string;
    uiConfig?: GenerativeUIConfig;
  }[] = [];
  userInput: string = "";

  constructor(private dynamicUiService: DynamicUiService) {}

  ngOnInit(): void {
    // 註冊組件，確保服務知道如何渲染
    this.dynamicUiService.registerComponent(
      "stock-chart-dashboard",
      StockChartDashboardComponent
    );
  }

  sendMessage(): void {
    if (!this.userInput.trim()) return;

    this.messages.push({
      type: "text",
      sender: "User",
      content: this.userInput,
    });

    // 模擬 AI 回應
    if (this.userInput.includes("台積電走勢")) {
      const aiResponse: GenerativeUIConfig = {
        componentType: "stock-chart-dashboard",
        data: {
          chartType: "candlestick",
          series: [
            {
              name: "TSM",
              data: [
                {
                  x: new Date("2026-02-03").getTime(),
                  y: [600, 610, 595, 605],
                },
                {
                  x: new Date("2026-02-04").getTime(),
                  y: [605, 615, 600, 612],
                },
                {
                  x: new Date("2026-02-05").getTime(),
                  y: [612, 620, 608, 618],
                },
                {
                  x: new Date("2026-02-06").getTime(),
                  y: [618, 625, 610, 622],
                },
                {
                  x: new Date("2026-02-07").getTime(),
                  y: [622, 630, 615, 628],
                },
                {
                  x: new Date("2026-02-10").getTime(),
                  y: [628, 635, 620, 632],
                },
                {
                  x: new Date("2026-02-11").getTime(),
                  y: [632, 640, 625, 638],
                },
              ],
            },
          ],
          options: {
            chart: {
              height: 350,
              type: "candlestick",
            },
            title: {
              text: "台積電 (TSM) 近期走勢",
              align: "left",
            },
            xaxis: {
              type: "datetime",
            },
            yaxis: {
              tooltip: {
                enabled: true,
              },
            },
          },
        },
        actions: [
          {
            label: "買入 100 股",
            actionType: "buy",
            payload: { symbol: "TSM", amount: 100 },
          },
          {
            label: "賣出 50 股",
            actionType: "sell",
            payload: { symbol: "TSM", amount: 50 },
          },
        ],
      };
      this.messages.push({ type: "ui", sender: "AI", uiConfig: aiResponse });
      this.dynamicUiService.renderDynamicComponent(
        this.dynamicUiHost,
        aiResponse
      );
    } else {
      this.messages.push({
        type: "text",
        sender: "AI",
        content: `您好，您說的是："${this.userInput}" 嗎？`,
      });
    }

    this.userInput = "";
  }
}
```

### 5.6 根組件 (`src/app/app.component.ts`)

```typescript
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { ChatComponent } from './chat/chat.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ChatComponent],
  template: `
    <div class="main-container">
      <h1>Generative UI Demo</h1>
      <app-chat></app-chat>
    </div>
  `,
  styles: [`
    .main-container { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
    h1 { color: #333; }
  `]
`]
})
export class AppComponent {
  title = 'generative-ui-demo';
}
```

### 5.7 運行應用程式

```bash
ng serve --open
```

打開瀏覽器，在聊天框中輸入「台積電走勢」，您將會看到 AI 不僅回覆文字，還會動態渲染出一個包含 K 線圖和買賣按鈕的互動式儀表板。

## 6. Parameters / API Reference

本節將抽象出 Generative UI 實現中涉及的關鍵介面和參數。

### 6.1 `GenerativeUIConfig` (AI 輸出結構)

| 欄位名稱        | 類型                   | 描述                                                                |
| :-------------- | :--------------------- | :------------------------------------------------------------------ |
| `componentType` | `string`               | 指定前端應渲染的組件類型（例如 `"stock-chart-dashboard"`）。        |
| `data`          | `ChartConfig`          | 傳遞給組件的數據配置，例如圖表的 `series` 和 `options`。            |
| `actions`       | `ActionButtonConfig[]` | 傳遞給組件的互動按鈕配置，包含 `label`、`actionType` 和 `payload`。 |

### 6.2 `ChartConfig` (圖表配置)

| 欄位名稱 | 類型 | 描述 |
| :------------ | :-------- | :------------------------------------------------------------------- |\n| `chartType` | `string` | 圖表類型（例如 `"line"`, `"candlestick"`）。 |
| `series` | `any[]` | ApexCharts 的數據系列配置。 |
| `options` | `any` | ApexCharts 的圖表選項配置。 |

### 6.3 `ActionButtonConfig` (互動按鈕配置)

| 欄位名稱     | 類型     | 描述                                           |
| :----------- | :------- | :--------------------------------------------- |
| `label`      | `string` | 按鈕上顯示的文字。                             |
| `actionType` | `string` | 按鈕觸發的動作類型（例如 `"buy"`, `"sell"`）。 |
| `payload`    | `any`    | 動作相關的數據，例如股票代碼、數量等。         |

### 6.4 `DynamicUiService` 介面

| 方法名稱                 | 參數                                                               | 返回值             | 描述                                     |
| :----------------------- | :----------------------------------------------------------------- | :----------------- | :--------------------------------------- | --------------------------------------------------------- |
| `registerComponent`      | `type: string, component: Type<any>`                               | `void`             | 註冊可動態渲染的組件及其對應的類型字串。 |
| `renderDynamicComponent` | `viewContainerRef: ViewContainerRef, uiConfig: GenerativeUIConfig` | `ComponentRef<any> | null`                                    | 根據 `uiConfig` 動態渲染組件到指定的 `ViewContainerRef`。 |

## 7. Notes & Best Practices

1.  **安全性優先**：GenUI 的核心挑戰之一是安全性。由於 AI 能夠生成程式碼或配置，必須嚴格限制 AI 只能生成預定義、經過安全審核的組件類型和配置選項。絕對禁止 AI 生成任意的 HTML、JavaScript 或 CSS，以防範跨站腳本攻擊 (XSS) 或其他惡意行為 [12]。
2.  **清晰的 JSON Schema**：AI 輸出的 JSON 配置必須有清晰、嚴格的 Schema 定義。這不僅有助於前端的解析和驗證，也能作為 AI 提示工程的強大約束，確保 AI 輸出符合預期格式 [5]。
3.  **組件的原子性與可重用性**：設計 GenUI 組件時，應遵循原子設計原則，使其盡可能小巧、獨立且可重用。例如，一個圖表組件、一個按鈕組件、一個表格組件等。這有助於 AI 更靈活地組合 UI，也方便前端的維護 [13]。
4.  **錯誤處理與回退機制**：當 AI 輸出無效的 JSON 配置，或前端動態載入組件失敗時，應用程式應具備健壯的錯誤處理機制。例如，可以回退到顯示純文本錯誤訊息，或提供一個預設的 UI 替代方案 [14]。
5.  **性能優化**：動態渲染組件可能會帶來性能開銷。應考慮使用 Angular 的 `OnPush` 變化檢測策略、延遲載入（Lazy Loading）組件，以及對 AI 輸出的 JSON 進行緩存，以優化渲染性能 [15]。
6.  **提示工程的精煉**：AI 的輸出品質直接影響 GenUI 的效果。需要不斷迭代和優化提示詞，讓 AI 更好地理解使用者意圖，並精確地生成所需的 UI 配置。可以利用 Few-shot 範例來訓練 AI 輸出特定格式的 JSON [6]。
7.  **使用者體驗 (UX) 設計**：即使是 AI 生成的 UI，也應考慮其可用性和一致性。確保生成的 UI 符合品牌指南，並且互動流程直觀。提供明確的視覺回饋，讓使用者知道哪些部分是 AI 生成的，哪些是靜態內容 [1]。

## 8. 為什麼選擇這種方式？

Generative UI 代表了人機互動的未來趨勢，它將 AI 的智慧與前端的視覺化能力無縫結合，帶來了傳統 Chatbot 無法比擬的優勢：

1.  **從「閱讀」到「操作」的範式轉變**：傳統 AI 應用要求使用者閱讀文字回應，然後自行判斷並執行後續操作。GenUI 則將這一過程簡化為直接的視覺化呈現與互動。例如，AI 分析股票後直接呈現 K 線圖和交易按鈕，使用者無需離開對話介面即可完成交易，極大地提升了效率和便利性 [2]。
2.  **提升使用者體驗 (UX)**：視覺化數據比純文本更容易理解和分析。GenUI 能夠根據上下文動態生成最適合當前任務的 UI，例如圖表、表格、表單或控制面板，使得資訊呈現更直觀、互動更自然，從而顯著改善使用者體驗 [1]。
3.  **加速任務達成**：透過將複雜的數據分析或操作流程直接嵌入到對話介面中，GenUI 減少了使用者在不同應用程式之間切換的次數，縮短了完成任務的路徑。這對於需要快速決策和響應的場景（如金融交易、即時監控）尤其有價值。
4.  **降低認知負荷**：AI 直接將複雜的數據或操作選項以結構化的 UI 呈現，降低了使用者理解和處理資訊的認知負荷。使用者無需記憶複雜的指令或在腦中構建視覺模型，只需直觀地與介面互動即可 [3]。
5.  **高度客製化與動態性**：GenUI 的核心在於其動態性。AI 可以根據每個使用者的具體查詢、偏好和歷史互動，生成高度客製化的 UI。這使得應用程式能夠提供更個人化、更具響應性的體驗，超越了傳統靜態介面的限制。
6.  **擴展 AI 的應用邊界**：GenUI 將 AI 的能力從純粹的資訊提供者，擴展到成為一個能夠主動構建和呈現功能性工具的「智慧助手」。這為 AI 在企業應用、數據分析、自動化控制等領域開闢了全新的應用場景，是從「玩具專案」跨入「產品級應用」的關鍵一步 [1]。

---

**參考資料**

- [1] UX Planet. (2025, October 13). _GenUI Design: Foundational Patterns_. Retrieved from https://uxplanet.org/genui-design-foundational-patterns-633320d0dfea
- [2] YouTube. (2026, January 30). _Generative UI: Specs, Patterns, and the Protocols Behind_. Retrieved from https://www.youtube.com/watch?v=Z4aSGCs_O5A
- [3] Medium. (2025, August 21). _Angular Meets Generative AI: Best Practices Made Easy_. Retrieved from https://medium.com/@davidepassafaro/angular-meets-generative-ai-best-practices-made-easy-2641fbe643ed
- [4] Angular.dev. (n.d.). _Build with AI - Angular_. Retrieved from https://angular.dev/ai
- [5] GitHub. (2026, February 1). _Generative UI examples for: AG-UI, A2UI/Open-JSON-UI, and MCP_. Retrieved from https://github.com/CopilotKit/generative-ui
- [6] Angular Space. (2026, January 22). _Gemini and Angular, Part II: Creating Generative UIs_. Retrieved from https://www.angularspace.com/gemini-and-angular-part-ii-creating-generative-uis/
- [7] Rangle.io. (2023, July 24). _How to render dynamic components in Angular_. Retrieved from https://rangle.io/blog/how-to-render-dynamic-components-in-angular
- [8] Stack Overflow. (2016, May 21). _Angular RC 2 - Dynamically Render Components from a json file_. Retrieved from https://stackoverflow.com/questions/37368068/angular-rc-2-dynamically-render-components-from-a-json-file
- [9] Pluralsight. (2020, February 20). _How to Render a Component Dynamically Based on a JSON Config_. Retrieved from https://www.pluralsight.com/resources/blog/guides/how-to-render-a-component-dynamically-based-on-a-json-config
- [10] Angular.love. (2025, December 16). _Building Dynamic Forms in Angular Using JSON Schema and Signals_. Retrieved from https://angular.love/building-dynamic-forms-in-angular-using-json-schema-and-signals
- [11] AI SDK. (n.d.). _Reference: AI SDK UI_. Retrieved from https://ai-sdk.dev/docs/reference/ai-sdk-ui
- [12] Codecademy. (n.d.). _A Complete Guide to Vercel's AI SDK_. Retrieved from https://www.codecademy.com/article/guide-to-vercels-ai-sdk
- [13] Telerik. (2024, September 3). _A Practical Guide to Using Vercel AI SDK in Next.js Apps_. Retrieved from https://www.telerik.com/blogs/practical-guide-using-vercel-ai-sdk-next-js-applications
- [14] GitHub. (2024, May 22). _Using createStreamableUI (Generative UI) with Nuxt 3? #1671_. Retrieved from https://github.com/vercel/ai/discussions/1671
- [15] Krasimir Tsonev. (2025, August 29). _React Server Components support without a framework_. Retrieved from https://krasimirtsonev.com/blog/article/vanilla-react-server-components-with-no-framework
