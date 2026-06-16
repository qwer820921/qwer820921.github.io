---
title: "【前端組件化】封裝通用的 RxJS 狀態管理組件"
date: "2026-02-03"
author: "子yee"
description: "針對 Angular 開發者，說明如何將重複的資料請求（如 API Loading/Error/Data）封裝成一個通用的 Base Component，展示 RxJS 非同步處理與程式碼重構的深度實踐。"
category: "Frontend"
tags: ["Angular", "RxJS", "TypeScript", "Architecture"]
---

在現代前端開發中，處理非同步資料請求（Async Operations）是組件開發最核心的任務之一。本文件將展示如何利用 **RxJS** 的響應式程式設計特性，結合 Angular 的組件繼承機制，封裝出一個通用的狀態管理基礎組件（Base Component）。

### Overview

開發者經常需要在多個組件中重複編寫處理 `loading`、`error` 與 `data` 的邏輯。這不僅導致程式碼冗餘，也使得 UI 狀態的維護變得破碎且難以追蹤。

透過封裝通用的 `BaseStateComponent`，我們旨在解決以下問題：

1.  **減少樣板程式碼 (Boilerplate)**：不再需要在每個組件手動宣告狀態變數。
2.  **統一狀態流**：確保所有非同步操作都遵循相同的狀態轉換生命週期。
3.  **自動化資源清理**：利用基底類別統一處理訂閱取消，避免記憶體洩漏。

---

### Architecture / Design

此設計採用 **Reactive State Management** 模式，將組件視為一個狀態機。

#### 1. 邏輯說明與資料流

- **State 封裝**：定義 `AsyncState<T>` 介面，統一封裝資料、載入中與錯誤資訊。
- **狀態傳播**：使用 `BehaviorSubject` 作為狀態源，並透過 `Observable` 暴露給 UI 層。
- **單向資料流**：組件觸發 Action -> Base 處理 Logic -> 更新 State -> UI 透過 `AsyncPipe` 自動響應。

#### 2. 狀態模型定義

```typescript
export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: any | null;
}
```

---

### Prerequisites

在使用此模式前，請確保您的環境具備以下依賴：

- **Angular**: v16.0.0+ (支援 Standalone Component)
- **RxJS**: v7.4.0+
- **TypeScript**: v4.9+

---

### Implementation / Code Example

以下是通用 `BaseStateComponent` 的核心實作與應用範例。

#### 1. Base State Component (核心封裝)

```typescript
import { Component, OnDestroy } from "@angular/core";
import { BehaviorSubject, Observable, Subscription, of } from "rxjs";
import { catchError, finalize, tap } from "rxjs/operators";

@Component({ template: "" })
export abstract class BaseStateComponent<T> implements OnDestroy {
  // 內部狀態管理
  private readonly _state = new BehaviorSubject<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  // 公開給 Template 訂閱的 Observable
  readonly state$: Observable<AsyncState<T>> = this._state.asObservable();

  protected subscriptions = new Subscription();

  /**
   * 執行非同步操作並自動管理狀態
   */
  protected executeAsyncOperation(operation$: Observable<T>): void {
    this._state.next({ ...this._state.value, loading: true, error: null });

    const sub = operation$
      .pipe(
        tap((data) => this._state.next({ data, loading: false, error: null })),
        catchError((error) => {
          this._state.next({ ...this._state.value, loading: false, error });
          return of(null);
        }),
        finalize(() => {
          if (this._state.value.loading) {
            this._state.next({ ...this._state.value, loading: false });
          }
        })
      )
      .subscribe();

    this.subscriptions.add(sub);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
```

#### 2. Sub Component Application (子組件應用)

```typescript
@Component({
  selector: "app-user-list",
  standalone: true,
  template: `
    <div *ngIf="state$ | async as state">
      <p *ngIf="state.loading">載入中...</p>
      <ul *ngIf="state.data">
        <li *ngFor="let user of state.data">{{ user.name }}</li>
      </ul>
      <p *ngIf="state.error" class="error">{{ state.error.message }}</p>
    </div>
  `,
})
export class UserListComponent
  extends BaseStateComponent<User[]>
  implements OnInit
{
  constructor(private userService: UserService) {
    super();
  }

  ngOnInit() {
    this.executeAsyncOperation(this.userService.getUsers());
  }
}
```

---

### Parameters / API Reference

| 參數 / 屬性             | 類型                          | 描述                                                     |
| :---------------------- | :---------------------------- | :------------------------------------------------------- |
| `state$`                | `Observable<AsyncState<T>>`   | **Output**: 提供給 UI 訂閱的唯讀狀態流。                 |
| `executeAsyncOperation` | `(op: Observable<T>) => void` | **Method**: 接收一個非同步 Observable 並開始追蹤其狀態。 |
| `data`                  | `T \| null`                   | **State Field**: 成功取得的資料內容。                    |
| `loading`               | `boolean`                     | **State Field**: 目前是否處於請求進行中狀態。            |
| `error`                 | `any \| null`                 | **State Field**: 請求失敗時回傳的錯誤物件。              |

---

### Notes & Best Practices

1.  **效能建議**：建議在子組件開啟 `ChangeDetectionStrategy.OnPush`。由於狀態是透過 `Observable` 驅動的，這能極大化 Angular 的變更檢測效能。
2.  **Rendering 優化**：在 Template 中始終優先使用 `AsyncPipe`。它能自動處理訂閱與取消訂閱，避免手動 `subscribe` 造成的記憶體洩漏。
3.  **錯誤粒度**：`catchError` 中可以根據 HTTP Status Code 進行初步過濾，再將精確的錯誤訊息傳遞給 `error` 狀態。
4.  **Component 繼承限制**：如果組件需要同時管理多個互不相關的資料流，建議改用 **Composition (組合)** 模式而非繼承。

---

### 為什麼選擇這種方式？

1.  **整合方便**：封裝後，子組件只需關注業務邏輯，無需處理重複的 `try-catch`。
2.  **靈活度高**：完全掌控 RxJS Operator 的串接，易於擴展如 `retry` 或 `debounce` 等功能。
3.  **效能不錯**：基於 RxJS 的推播機制，能與 Angular 的響應式系統完美結合。

---

## 實作心得

RxJS 讓我踩得最深的坑是 `switchMap` 和 `mergeMap` 的選擇。在做搜尋框的 autocomplete 功能時，我最初用了 `mergeMap`，結果發現當使用者快速輸入時，多個 API 請求會同時飛出去，最後先發出的請求如果比後發的慢，回傳時會覆蓋掉「正確」的結果，出現搜尋結果閃跳的問題（race condition）。換成 `switchMap` 之後，每次有新的輸入值，舊的請求就會被自動取消，永遠只保留最新一次的回應。現在我的原則是：只要是「使用者觸發的即時搜尋或篩選」，一定用 `switchMap`；「需要全部結果的批次操作」才用 `mergeMap`。

`AsyncPipe` 讓我從一個很實際的 bug 中學到它的價值。早期在元件的 `ngOnDestroy` 中手動呼叫 `unsubscribe`，有幾次忘記加，造成元件被銷毀後 Observable 還在繼續發送值並更新 DOM，在 DevTools 裡看到 `ExpressionChangedAfterItHasBeenCheckedError`。改用 `AsyncPipe` 之後，Angular 自動管理訂閱和取消訂閱，這類錯誤完全消失。現在凡是 Template 中需要顯示 Observable 的值，一律不手動 subscribe，全部交給 `AsyncPipe`。

`combineLatest` 和 `forkJoin` 的差異在實作中有實際意義。`forkJoin` 等到所有 Observable 都 complete 才發出值，適合一次性的 API 批次請求；`combineLatest` 則是任何一個 Observable 發出新值時就重新組合，適合多個狀態流的持續同步。把分頁參數（頁碼）和篩選條件（分類、排序）合流時用 `combineLatest`，載入完就結束的並行 API 請求用 `forkJoin`——搞清楚這個區別之後，很多原本複雜的狀態管理邏輯都變簡單了。
