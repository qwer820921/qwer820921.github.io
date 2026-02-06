---
description: Click Ascension 狀態管理重構工作流程
---

# 狀態管理重構計畫

## 📋 目標

將分散在各處的數值計算邏輯統一管理，提高程式碼可維護性和一致性。

---

## 🔄 重構階段

### Phase 1: 建立工具函數 (基礎設施) ✅ 已完成

**預計時間**: 1-2 小時
**風險等級**: 低

#### Step 1.1: 建立 Effect Mapper ✅

- [x] 建立 `utils/effectMapper.ts`
- [x] 實作 `applyEffect(stats, effectType, value)` 函數
- [x] 涵蓋所有 14 種 UpgradeEffectType
- [ ] 單元測試 (可選)

```typescript
// utils/effectMapper.ts
export const applyEffect = (
  stats: PlayerStats,
  effectType: UpgradeEffectType,
  value: number
): PlayerStats => { ... };
```

#### Step 1.2: 建立 Wallet Manager ✅

- [x] 建立 `utils/walletManager.ts`
- [x] 實作 `deductCurrency(wallet, currency, amount)` 函數
- [x] 實作 `addCurrency(wallet, currency, amount)` 函數
- [x] 實作 `hasSufficientFunds(wallet, currency, amount)` 函數

```typescript
// utils/walletManager.ts
export const deductCurrency = (wallet: Wallet, currency: CurrencyType, amount: number): Wallet => { ... };
export const addCurrency = (wallet: Wallet, currency: CurrencyType, amount: number): Wallet => { ... };
export const hasSufficientFunds = (wallet: Wallet, currency: CurrencyType, amount: number): boolean => { ... };
```

#### Step 1.3: 建立 Cost Calculator ✅

- [x] 建立 `utils/costCalculator.ts`
- [x] 實作 `calculateUpgradeCost(base, mult, level, effectType)` 函數
- [x] 統一線性/指數/固定成本計算邏輯

---

### Phase 2: 重構 recalculateStats (核心) ✅ 已完成

**預計時間**: 2-3 小時
**風險等級**: 中

#### Step 2.1: 分析現有 recalculateStats ✅

- [x] 確認目前 recalculateStats 的完整邏輯
- [x] 列出所有計算來源 (4 個商店 + 裝備 + Buff)
- [x] 確認是否有遺漏的計算

#### Step 2.2: 使用 effectMapper 重寫 ✅

- [x] 在 recalculateStats 中使用 `applyEffect`
- [x] 移除重複的 switch/if 邏輯
- [x] 確保結果與原邏輯一致

#### Step 2.3: 測試驗證 ✅

- [x] 手動測試各商店升級後數值是否正確
- [x] 確認飛昇/重製後數值正確

---

### Phase 3: 重構商店購買邏輯 (主要工作) ✅ 已完成

**預計時間**: 3-4 小時
**風險等級**: 中高

#### Step 3.1: 重構 Click Shop ✅

- [x] 使用 `walletManager.deductCurrency` 取代手動扣款
- [x] 購買後呼叫 `recalculateStats` 取代手動更新 stats
- [x] 移除 inline 的 `newStats` 計算

#### Step 3.2: 重構 Level Shop ✅

- [x] 同 Step 3.1 模式

#### Step 3.3: 重構 Gold Shop ✅

- [x] 同 Step 3.1 模式
- [x] 額外處理消耗品 (ADD_INVENTORY)

#### Step 3.4: 重構 Ascension Shop ✅

- [x] 同 Step 3.1 模式

#### Step 3.5: 重構 Diamond Shop (金幣包) ✅

- [x] 使用 `walletManager` 處理

#### Step 3.6: 重構 Equipment Shop (Gacha) ✅

- [x] 使用 `walletManager` 處理

---

### Phase 4: 重構其他功能 ✅ 已完成

**預計時間**: 2 小時
**風險等級**: 低

#### Step 4.1: 怪物死亡獎勵 ✅

- [x] 使用 `walletManager.addCurrency` 處理金幣/經驗
- [x] 使用統一的升級邏輯

#### Step 4.2: 飛昇 (handleAscension) ✅

- [x] 確認已使用 `recalculateStats`
- [x] 使用 `walletManager` 處理錢包重置

#### Step 4.3: 重製等級積分 (handleResetLevelPoints) ✅

- [x] 確認已使用 `recalculateStats`

#### Step 4.4: 使用藥水 (handleUsePotion) ⏭️

- [x] 保持原樣 (不需要重構，僅涉及 inventory)

---

### Phase 5: 建立 Context/Store (選擇性)

**預計時間**: 4-6 小時
**風險等級**: 高

> ⚠️ 此階段為可選，可在 Phase 1-4 完成後評估是否需要

#### Step 5.1: 選擇狀態管理方案

- [ ] React Context + useReducer (輕量)
- [ ] Zustand (推薦，簡單易用)
- [ ] Redux Toolkit (重量級)

#### Step 5.2: 建立 Store

- [ ] 建立 `store/gameStore.ts`
- [ ] 遷移 player, stage, gameConfig 狀態
- [ ] 實作 actions (purchaseUpgrade, applyEffect, etc.)

#### Step 5.3: 遷移元件

- [ ] 更新 page.tsx 使用 store
- [ ] 更新 ShopPage.tsx
- [ ] 更新 CharacterView.tsx
- [ ] 更新 ProfilePage.tsx
- [ ] 更新 MonsterBattle.tsx

---

## 📁 預計新增檔案結構

```
src/app/clickAscension/
├── utils/
│   ├── effectMapper.ts      # Phase 1.1
│   ├── walletManager.ts     # Phase 1.2
│   ├── costCalculator.ts    # Phase 1.3
│   └── formatNumber.ts      # (既有)
├── store/                    # Phase 5 (選擇性)
│   └── gameStore.ts
└── components/
    └── ... (現有元件)
```

---

## ✅ 檢查清單

### 每個 Phase 完成後

- [ ] 程式碼可編譯無錯誤
- [ ] 基本功能測試通過
- [ ] Git commit 保存進度

### 全部完成後

- [ ] 所有商店功能正常
- [ ] 飛昇/重製功能正常
- [ ] 存檔/載入功能正常
- [ ] 數值計算結果與重構前一致

---

## 🚀 執行順序建議

1. **先做 Phase 1** - 純新增檔案，不影響現有程式
2. **再做 Phase 2** - 核心邏輯，需小心測試
3. **逐步做 Phase 3** - 一次重構一個商店，每次都測試
4. **做 Phase 4** - 收尾工作
5. **評估 Phase 5** - 如果 Phase 1-4 已足夠穩定，可暫緩

---

## 📝 備註

- 每個 Step 完成後建議 commit
- 遇到問題可以 revert 到上一個穩定版本
- Phase 5 可以等專案穩定後再考慮
