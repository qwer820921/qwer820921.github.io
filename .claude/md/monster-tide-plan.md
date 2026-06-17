# 怪物洪流（Monster Tide）實作計畫

## 專案定位

純 CSR 網頁遊戲，掛載在現有 Next.js 站台的 `/monsterTide` 路由下。
目標：完成 2~3 關可玩、可過關、可重玩的 vertical slice，驗證整套架構。

---

## 技術棧（已確定）

| 層級                       | 技術                                                      |
| -------------------------- | --------------------------------------------------------- |
| 外殼框架                   | Next.js App Router（現有站台）                            |
| 遊戲渲染                   | TypeScript + Canvas 2D API，手刻遊戲迴圈                  |
| 整合方式                   | `dynamic import` + `ssr: false` 載入遊戲 client component |
| HUD                        | Canvas 直接繪製                                           |
| 技能彈窗 / 結算 / 暫停選單 | React component 絕對定位疊在 canvas 上                    |
| 存檔                       | localStorage（demo 階段，無需後端）                       |

---

## 目錄結構

```
src/app/(games)/monsterTide/
├── page.tsx                              ← 已建立（Server Component + metadata）
├── stageSelect/
│   └── page.tsx                          ← 關卡選擇頁（CSR，讀 localStorage 解鎖狀態）
├── forge/
│   └── page.tsx                          ← 鐵匠鋪 / 永久強化商店
├── battle/
│   └── [stageId]/
│       └── page.tsx                      ← 遊戲戰鬥頁，dynamic import GameCanvas
├── components/
│   ├── monsterTidePage.tsx               ← 已建立（landing / 導航 hub）
│   ├── GameCanvas.tsx                    ← "use client"，掛 <canvas> + rAF 迴圈
│   ├── SkillSelectModal.tsx              ← 三選一技能彈窗 React overlay
│   ├── ResultScreen.tsx                  ← 結算畫面（戰績 + 深淵晶核獲得量）
│   └── PauseMenu.tsx                     ← 暫停選單 overlay
├── lib/
│   ├── engine.ts                         ← 遊戲迴圈核心（update / render 排程）
│   ├── input.ts                          ← 輸入抽象層（鍵盤 + 觸控 → direction）
│   ├── waveManager.ts                    ← 波次管理器
│   ├── collision.ts                      ← 空間分割碰撞偵測
│   ├── objectPool.ts                     ← 通用物件池
│   ├── skills.ts                         ← 單局技能定義 + 三選一抽取邏輯
│   ├── stages.ts                         ← 關卡設定表
│   ├── renderer.ts                       ← 所有 Canvas 繪製函式集中管理
│   ├── entities/
│   │   ├── player.ts
│   │   ├── enemy.ts
│   │   ├── boss.ts
│   │   ├── bullet.ts
│   │   ├── base.ts                       ← 基地/核心（承受敵人傷害的目標）
│   │   └── particle.ts
│   └── meta/
│       ├── saveData.ts                   ← localStorage 存讀寫
│       └── permanentUpgrades.ts          ← 永久強化項目定義與購買邏輯
├── doc/
│   └── implementation_plan.md            ← 已建立（同步保存本計畫副本）
├── types/
│   └── index.ts                          ← 所有共用型別
└── styles/
    └── monsterTide.module.css            ← 已建立
```

> `battle/[stageId]` 是 Next.js 動態路由，stageId = `1` | `2` | `3`。
> `stageSelect` 與 `forge` 不加入 Navbar，由 monsterTide landing page 內部連結導航。

---

## Canvas 尺寸與座標系

- **Canvas 邏輯尺寸**：480 × 800（寬 × 高）
- **實際顯示**：CSS `max-width: 480px; width: 100%; aspect-ratio: 480/800` 自適應縮放
- **座標原點**：左上角 (0, 0)，Y 軸向下為正
- **玩家固定 Y**：`canvasHeight - 60`（距底部 60px）
- **敵人生成 Y**：`-60`（從畫面上方外側生成）
- **基地判定 Y**：`canvasHeight - 10`（敵人 Y 超過此值視為到達底部）

---

## 型別定義（types/index.ts）

```typescript
// ===== 輸入 =====
type MoveDirection = -1 | 0 | 1; // -1 = 左, 0 = 靜止, 1 = 右

// ===== 移動模式 =====
type MovePattern = "straight" | "sinusoidal" | "stationary";

// ===== 武器類型 =====
type WeaponType = "basic_shot" | "orbit_blade" | "multi_arrow" | "aoe_orb";

// ===== 被動類型 =====
type PassiveType =
  | "damage_up"
  | "attack_speed_up"
  | "move_speed_up"
  | "base_hp_up"
  | "range_up";

// ===== 遊戲狀態機 =====
type GamePhase =
  | "IDLE"
  | "PLAYING"
  | "WAVE_TRANSITION" // 波次間隔 2 秒，顯示 "Wave X" 提示
  | "SKILL_SELECT" // 技能三選一（遊戲暫停）
  | "PAUSED"
  | "BOSS_FIGHT"
  | "STAGE_CLEAR"
  | "GAME_OVER";

// ===== 玩家 =====
interface Player {
  x: number;
  y: number; // 固定值，由 canvasHeight 決定
  width: number; // 32
  height: number; // 48
  baseSpeed: number; // 200 px/s
  weapons: ActiveWeapon[]; // 上限 MAX_WEAPON_SLOTS = 6
  passiveStack: PassiveStack;
}

interface PassiveStack {
  damageMultiplier: number; // 預設 1.0
  attackSpeedMultiplier: number;
  moveSpeedMultiplier: number;
  baseHpBonus: number; // 加算
  rangeMultiplier: number;
}

// ===== 基地 =====
interface Base {
  x: number; // 置中
  y: number; // canvasHeight - 20
  width: number; // 80
  height: number; // 20
  maxHp: number;
  currentHp: number;
}

// ===== 武器（單局內裝備） =====
interface ActiveWeapon {
  type: WeaponType;
  level: number; // 1~5（同一武器最多選 5 次升級）
  attackTimer: number; // 距下次攻擊的倒計時 ms
  orbitAngle?: number; // 環繞刃專用
}

// ===== 敵人 =====
interface Enemy {
  id: number; // 物件池 index
  type: EnemyType;
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  armor: number; // 護甲（鎧甲武士使用，0 = 無護甲）
  speed: number; // px/s
  movePattern: MovePattern;
  sinPhase?: number; // 蛇行型的正弦波相位
  stationaryY?: number; // 停滯型的目標 Y 座標
  stationaryTimer?: number; // 停滯型的攻擊計時器 ms
  damageToBase: number; // 抵達底部對基地造成的傷害
  souls: number; // 擊殺獲得的深淵晶核
  exp: number; // 擊殺獲得的 EXP
  isAlive: boolean;
  splitLevel?: number; // 史萊姆：0=原版 1=小 2=最小（不再分裂）
  flashTimer?: number; // 受擊閃白計時器 ms
}

// Boss 不含在 EnemyType 內，由獨立 Boss 介面處理
type EnemyType =
  | "skeleton"
  | "goblin"
  | "slime"
  | "armored_knight"
  | "man_eater_flower"
  | "bat";

// ===== 子彈 =====
// sourceType 含 'boss_projectile'，用於 Boss 發射的彈幕（傷害對象為玩家，非基地）
type BulletSource = WeaponType | "boss_projectile";

interface Bullet {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  damage: number;
  piercing: boolean; // 穿透
  sourceType: BulletSource;
  isAlive: boolean;
  hitEnemies: Set<number>; // 穿透武器已打過的敵人 id
}

// ===== Boss =====
// Boss 與 Enemy 完全獨立，不繼承 Enemy 介面（避免雜兵背負用不到的欄位）
// Boss 仍納入同一個 SpatialGrid 與同一個 Bullet 物件池
type BossType = "dungeon_lord" | "spider_queen";
type BossPhase = "PHASE_MOVE" | "PHASE_1" | "PHASE_ARMOR_BREAK" | "PHASE_2";

interface Boss {
  id: number;
  type: BossType;
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  phase: BossPhase;
  phaseTimer: number; // 當前 phase 已經過時間 ms
  attackTimer: number; // 距下次攻擊動作倒計時 ms
  weakPointExposed: boolean;
  damageMultiplierWhenExposed: number; // 弱點暴露時受到的傷害倍率
  souls: number; // 擊殺獲得的深淵晶核
  exp: number; // 擊殺獲得的 EXP
  isAlive: boolean;
}

// soulsEarned 計算定義：所有死亡 Enemy.souls 加總 + 若 Boss 已死亡則加 Boss.souls
// 同理適用於 EXP 累積

// ===== 粒子特效 =====
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 剩餘生命 ms
  maxLife: number;
  radius: number;
  color: string;
  isAlive: boolean;
}

// ===== 技能選項 =====
interface SkillOption {
  id: string;
  skillType: "weapon" | "passive";
  weaponType?: WeaponType;
  passiveType?: PassiveType;
  currentLevel: number; // 選前現有等級（0 = 尚未解鎖）
  nextLevel: number;
  name: string;
  description: string;
  icon: string; // emoji 或圖片路徑，demo 階段用 emoji
}

// ===== 波次設定 =====
interface WaveEnemyEntry {
  type: EnemyType;
  count: number;
  spawnInterval: number; // ms，每隻生成間隔
  spawnPattern: "sequential" | "random_x" | "sides";
  // sequential=逐一生成, random_x=隨機X, sides=從左右兩側
}

interface WaveConfig {
  waveIndex: number; // 1-based
  enemies: WaveEnemyEntry[];
  isBossWave: boolean;
  preWaveMessage?: string; // 顯示在 WAVE_TRANSITION 的提示文字
}

interface StageConfig {
  stageId: number;
  name: string;
  waves: WaveConfig[];
  backgroundTheme: "graveyard" | "dungeon" | "castle";
  unlockRequirement: number | null; // null = 預設解鎖；數字 = 需通關哪一關
}

// ===== 永久存檔 =====
interface SaveData {
  totalSouls: number; // 累積深淵晶核
  clearedStages: number[]; // 已通關關卡 id 列表
  permanentUpgrades: {
    [key in PermanentUpgradeType]: number; // 購買等級
  };
}

type PermanentUpgradeType =
  | "base_atk" // 基礎攻擊力永久 +5% / 級
  | "base_hp" // 基地血量上限永久 +20 / 級
  | "start_weapon"; // 解鎖初始武器選擇（等級 = 解鎖的額外起始武器數量）
```

---

## 遊戲迴圈（engine.ts）

```typescript
// 基本結構
class GameEngine {
  private lastTime: number = 0;
  private rafId: number = 0;
  private phase: GamePhase = "IDLE";

  start(canvas: HTMLCanvasElement, stageId: number): void;
  stop(): void;

  private loop(timestamp: number): void {
    const dt = Math.min(timestamp - this.lastTime, 50); // 限制 dt 上限，避免 tab 切換後暴衝
    this.lastTime = timestamp;
    this.update(dt);
    this.render();
    this.rafId = requestAnimationFrame(this.loop.bind(this));
  }

  private update(dt: number): void; // 根據 phase 分派邏輯
  private render(): void; // 固定繪製順序（見下方）
}
```

**update 各 phase 邏輯：**

- `PLAYING`：移動玩家、更新武器計時器、發射子彈、移動敵人、碰撞偵測、更新粒子
- `WAVE_TRANSITION`：倒計時結束後切換至 `PLAYING` 並生成下一波
- `SKILL_SELECT`：遊戲暫停，等待 React 發事件觸發選擇結果
- `BOSS_FIGHT`：同 PLAYING 但 Boss 有獨立 phase 狀態機

**render 繪製順序（每幀）：**

1. `clearRect` 整個 canvas
2. 繪製背景（色塊或簡易圖案，demo 先用純色）
3. 繪製基地（底部矩形 + HP 條）
4. 繪製敵人（含護甲條、HP 條、受擊閃白）
5. 繪製子彈
6. 繪製玩家角色
7. 繪製武器特效（環繞刃軌道）
8. 繪製粒子特效
9. 繪製 HUD（波次進度、武器槓位 icon、EXP 條）

---

## 碰撞偵測（collision.ts）

使用**網格空間分割（Grid Spatial Hashing）**：

- Canvas 480×800，分為 **4 列 × 8 行** = 32 個格子（每格 120×100）
- 每幀重新分配所有活躍實體到對應格子（一個實體可能跨多格）
- 碰撞對只檢查：**子彈 vs 敵人**、**敵人 vs 基地觸底判定**
- 同格或相鄰格才進行 AABB 矩形重疊檢測

```typescript
class SpatialGrid {
  private cells: Map<number, Set<number>>; // cellKey → entity id set

  clear(): void;
  insert(id: number, x: number, y: number, w: number, h: number): void;
  queryNear(x: number, y: number, w: number, h: number): Set<number>;
}
```

**觸底判定只適用於 `Enemy[]`，明確排除 `Boss`：**

```typescript
function checkBaseCollision(enemies: Enemy[], base: Base): void {
  for (const enemy of enemies) {
    if (enemy.isAlive && enemy.y >= BASE_COLLISION_Y) {
      base.currentHp -= enemy.damageToBase;
      enemy.isAlive = false;
    }
  }
  // Boss 永遠不會超過停滯 Y（canvasHeight * 0.25），不執行此函式
}
```

Boss 的失敗風險 = 彈幕干擾下無法及時擊殺，而非 Boss 衝到底部扣血。

---

## 物件池（objectPool.ts）

```typescript
class ObjectPool<T extends { isAlive: boolean }> {
  private pool: T[] = [];
  constructor(
    private factory: () => T,
    private onReset: (obj: T) => void,
    preAllocate: number
  ) {}

  get(): T; // 從 pool 取出或新建
  release(obj: T): void;
  getActive(): T[]; // 過濾 isAlive = true
}
```

預分配大小：

- 子彈池：300
- 粒子池：150
- 敵人池：80

---

## 波次管理器（waveManager.ts）

```typescript
interface SpawnQueueItem {
  type: EnemyType;
  delay: number; // 距波次開始的絕對延遲 ms
  spawnPattern: WaveEnemyEntry["spawnPattern"]; // 保留來源 pattern
}

class WaveManager {
  private currentWaveIndex: number = 0;
  private spawnQueue: SpawnQueueItem[] = []; // 帶有 spawnPattern
  private spawnTimer: number = 0;
  private waveComplete: boolean = false;

  startWave(wave: WaveConfig): void;
  // 展開邏輯：
  // for (const entry of wave.enemies) {
  //   for (let i = 0; i < entry.count; i++) {
  //     spawnQueue.push({ type, delay: i * entry.spawnInterval, spawnPattern })
  //   }
  // }

  update(dt: number, activeEnemies: Enemy[]): void;
  isWaveCleared(activeEnemies: Enemy[]): boolean;
  // → spawnQueue 空 && activeEnemies 全部 isAlive = false
  onWaveCleared(): "next_wave" | "boss_wave" | "stage_clear";
}
```

生成敵人時依 `spawnPattern` 決定 X 座標：

- `sequential`：等分畫面寬度，依序輪流（`(i % slots) * (canvasWidth / slots)`）
- `random_x`：`Math.random() * canvasWidth`
- `sides`：交替從 `x = 20`（左）或 `x = canvasWidth - 20`（右）生成

波次流程：

1. `WAVE_TRANSITION`：顯示「第 X 波」提示，計時 2 秒
2. `WaveManager.startWave()` 展開 spawnQueue（保留 spawnPattern）
3. 偵測到 `isWaveCleared()` 後，根據 `onWaveCleared()` 決定下一步

---

## 技能系統（skills.ts）

### 武器攻擊方向規則（已定案）

所有武器**固定朝正上方發射**，不做「鎖定最近敵人」搜尋邏輯。
理由：固定方向不需要每幀對 `SpatialGrid` 查詢最近敵人，且在「玩家固定底部、敵人從上方來」的場地設計下，朝正上方發射已是合理方向。

| 武器     | 發射方向規則                                                                          |
| -------- | ------------------------------------------------------------------------------------- |
| 普通彈   | 固定朝正上方（vx=0, vy=-speed）                                                       |
| 環繞刃   | 不發射子彈，繞玩家中心旋轉，半徑與旋轉速度依等級調整                                  |
| 多重箭   | 以正上方為中心，向左右展開固定角度（Lv1：-30°/0°/+30°，每升一級增加 ±15° 或追加方向） |
| 範圍法球 | 固定朝正上方，飛行至畫面上方 1/3 處（Y ≤ canvasHeight/3）或命中敵人後爆炸             |

> 若未來要新增「鎖定最近敵人」類型武器，**只針對該武器個別實作查詢邏輯**，不套用到全部武器。

### 武器升級效果表

| 武器     | Lv1            | Lv2       | Lv3       | Lv4      | Lv5       |
| -------- | -------------- | --------- | --------- | -------- | --------- |
| 普通彈   | 傷害 10 / 0.8s | +20% 攻速 | +30% 傷害 | 變為雙發 | 穿透 1 層 |
| 環繞刃   | 1 刃 旋轉      | 2 刃      | 3 刃      | 旋轉加速 | 4 刃      |
| 多重箭   | 3 方向         | +1 方向   | +30% 傷害 | +1 方向  | 穿透      |
| 範圍法球 | 爆炸半徑 60    | +20% 半徑 | +40% 傷害 | 速度+30% | 雙發      |

### 被動升級效果表

| 被動         | 每級效果                 | 最大級 |
| ------------ | ------------------------ | ------ |
| 攻擊力提升   | 全武器傷害 +15%          | 5      |
| 攻速提升     | 全武器攻速 +10%          | 5      |
| 移動速度提升 | 玩家移速 +12%            | 5      |
| 基地血量上限 | 基地 maxHp +25           | 5      |
| 範圍擴大     | 所有彈體 / 爆炸半徑 +15% | 5      |

### 子彈傷害計算時機（已定案）

**子彈在生成時即計算最終傷害，寫死在 `Bullet.damage`，飛行中不再變動。**

```typescript
function createBullet(weapon: ActiveWeapon, passiveStack: PassiveStack, ...): Bullet {
  const baseDamage = getWeaponBaseDamage(weapon.type, weapon.level);
  const finalDamage = baseDamage * passiveStack.damageMultiplier;
  return { ...bullet, damage: finalDamage };
}
```

理由：生成後傷害固定，方便除錯（直接看 Bullet 物件即知傷害值），且玩家升級不應影響已發出的子彈。

### 數值疊加公式（已定案）

凡是「武器等級加成」與「被動疊加倍率」同時存在的數值，一律採**相乘**：

```
最終數值 = 基礎值 × 武器等級乘數 × 被動疊加倍率
```

適用範圍：傷害、爆炸半徑、攻擊速度（攻擊間隔 ÷ 攻速乘數）。

```typescript
// 範例：範圍法球爆炸半徑
function getFinalRadius(
  weapon: ActiveWeapon,
  passiveStack: PassiveStack
): number {
  const baseRadius = 60;
  const weaponMult = getWeaponRadiusMultiplier(weapon.type, weapon.level); // e.g. Lv2 = 1.2
  return baseRadius * weaponMult * passiveStack.rangeMultiplier;
}

// 範例：攻擊間隔（ms）
function getFinalInterval(
  weapon: ActiveWeapon,
  passiveStack: PassiveStack
): number {
  const baseInterval = getWeaponBaseInterval(weapon.type, weapon.level);
  return baseInterval / passiveStack.attackSpeedMultiplier; // 攻速越高，間隔越短
}
```

所有武器 / 所有數值類型統一用此公式，**不允許各武器自行定義不同計算方式**。

### 三選一抽取規則

```
槓位空餘 ≥ 1：武器 50% / 被動 50%
槓位空餘 = 0：武器 0% / 被動 100%
武器已全部達到 Lv5 且槓位已滿：被動 100%（需確保被動也還有可升項）
```

已達最高等級的技能不納入抽取池。

---

## 敵人屬性表（demo 關卡平衡）

| 敵人         | HP  | 護甲 | 速度(px/s) | 移動模式   | 到底傷害 | 掉落EXP | 深淵晶核 |
| ------------ | --- | ---- | ---------- | ---------- | -------- | ------- | -------- |
| 骷髏兵       | 30  | 0    | 80         | straight   | 15       | 3       | 1        |
| 哥布林       | 20  | 0    | 120        | straight   | 10       | 2       | 1        |
| 史萊姆(大)   | 50  | 0    | 50         | straight   | 20       | 4       | 2        |
| 史萊姆(小)   | 25  | 0    | 60         | straight   | 10       | 2       | 1        |
| 史萊姆(最小) | 10  | 0    | 70         | straight   | 5        | 1       | 0        |
| 鎧甲武士     | 80  | 30   | 55         | straight   | 30       | 8       | 4        |
| 食人花       | 100 | 0    | 70         | stationary | 25       | 10      | 5        |
| 蝙蝠         | 40  | 0    | 100        | sinusoidal | 12       | 5       | 2        |

**護甲機制**：受到傷害時先扣護甲值，護甲降至 0 後才對 HP 造成傷害（護甲不回復）。

**食人花停滯 Y**：`canvasHeight * 0.4`（距頂 40%），停滯後每 2 秒朝玩家方向發射 3 顆彈幕（弓扇形散射）。

**蛇行型正弦波**：`x += Math.sin(phase) * 80`（振幅 80px），`phase += dt * 0.003`。

---

## Boss 屬性表

> **Boss 彈幕設計原則**：Boss 發射的彈幕（`sourceType: 'boss_projectile'`）命中玩家後，
> 效果為**短暫減速或暈眩**，**不直接傷害基地**。
> 理由：基地傷害應只來自「敵人/Boss 抵達底部」這個機制，讓玩家在底部承受 Boss 彈幕壓力的同時仍要顧住底線，維持「擋住底部」這個核心玩法的一致性。

### 地城領主（第 1 關 Boss）

| 屬性             | 數值                    |
| ---------------- | ----------------------- |
| HP               | 800                     |
| 護甲（第一階段） | 100（頭部護甲）         |
| 移動至停滯 Y     | `canvasHeight * 0.25`   |
| 攻擊模式         | 停滯後進入 phase 狀態機 |

**Boss Phase 狀態機：**

- `PHASE_MOVE`：從畫面上方移動到停滯 Y
- `PHASE_1`（護甲完整）：每 3 秒發射橫排 5 顆彈幕朝玩家方向
- `PHASE_ARMOR_BREAK`：護甲破除，播放震動動畫 0.5 秒
- `PHASE_2`（弱點暴露）：傷害倍率 ×2，每 1.5 秒發射 3 顆追蹤彈（低速追蹤）

**擊殺獎勵：**
| Boss | souls | exp |
|------|-------|-----|
| 地城領主 | 80 | 100 |
| 巨型蜘蛛王 | 120 | 150 |

> Boss 不觸發底部判定（見下方「碰撞偵測」章節說明）。Boss 威脅來自彈幕干擾，不來自抵達底部。

### 巨型蜘蛛王（第 2 關 Boss，預留）

| 屬性         | 數值                                                               |
| ------------ | ------------------------------------------------------------------ |
| HP           | 1200                                                               |
| 腹部弱點     | 平時遮蔽，傷害 ×0.3                                                |
| 弱點暴露條件 | 吐絲動作前搖 0.8 秒內腹部打開，可正常造傷                          |
| 攻擊 1       | 左右移動 + 落地衝撞（返回停滯 Y）                                  |
| 攻擊 2       | 吐絲：在玩家當前 X 落下緩速黏液球，命中玩家使其移速 -50% 持續 3 秒 |

---

## 關卡設定表（stages.ts）

### 第 1 關：墓地前哨

| 波次      | 敵人配置                           | 備注                       |
| --------- | ---------------------------------- | -------------------------- |
| Wave 1    | 骷髏兵 × 5                         | 每 0.8s 生成一隻，從隨機 X |
| Wave 2    | 骷髏兵 × 4 + 哥布林 × 3            | 哥布林從兩側生成           |
| Wave 3    | 史萊姆(大) × 3 + 骷髏兵 × 4        |                            |
| Wave 4    | 鎧甲武士 × 2 + 哥布林 × 6          | 哥布林先出                 |
| Wave 5    | 食人花 × 2 + 蝙蝠 × 4 + 哥布林 × 3 |                            |
| Wave 6 ⚔️ | 地城領主（Boss）                   |                            |

**過關獎勵**：+50 深淵晶核
**解鎖條件**：預設解鎖

### 第 2 關：地下迷宮（預留，Phase 8 實作）

**解鎖條件**：通關第 1 關
敵人血量 / 速度整體 ×1.3，新增巨型蜘蛛王 Boss。

---

## 結算畫面規格（ResultScreen.tsx）

`ResultScreen` 需同時處理 `STAGE_CLEAR` 與 `GAME_OVER` 兩種情境，**用同一個元件 + props 區分**，不拆成兩個元件。

```typescript
interface ResultScreenProps {
  outcome: "stage_clear" | "game_over";
  wavesCleared: number; // 本局已清完的波次數（e.g. 失敗在第 3 波 → 2）
  totalWaves: number; // 該關總波次數
  soulsEarned: number; // 本局擊殺累積的深淵晶核（無論成敗都計入）
  stageBonusSouls: number; // 過關獎勵晶核，只有 outcome === 'stage_clear' 時 > 0
  onContinue: () => void; // 點擊後導回 /monsterTide/stageSelect
}
```

**失敗結算規則**：

- `GAME_OVER` 時，本局累積的 `soulsEarned` 全數計入永久存檔（`addSouls(soulsEarned)`）。
- `stageBonusSouls`（過關獎勵，目前第 1 關為 +50）**只有 `STAGE_CLEAR` 時才發放**。
- `engine.ts` 在觸發 `GAME_OVER` 時，必須將 `soulsEarned` 一併傳給 `ResultScreen`，不能只傳狀態本身。

顯示文字對照：
| outcome | 標題 | 底部按鈕 |
|---------|------|---------|
| `stage_clear` | 防線守住了！ | 返回關卡選擇 |
| `game_over` | 防線失守... | 返回關卡選擇 |

---

## 永久資源系統

**資源名稱**：深淵晶核（Abyss Crystal Core）

### 永久強化項目（permanentUpgrades.ts）

| 項目         | 每級效果                        | 費用（晶核）              | 最大級 |
| ------------ | ------------------------------- | ------------------------- | ------ |
| 基礎攻擊強化 | 全武器傷害 +5%                  | 30 / 60 / 100 / 150 / 200 | 5      |
| 基地加固     | 基地最大血量 +20                | 25 / 50 / 80 / 120 / 180  | 5      |
| 初始武器解鎖 | 解鎖進入關卡時可選 1 個初始武器 | 200                       | 1      |

### localStorage 存檔結構（saveData.ts）

```typescript
const SAVE_KEY = "monsterTide_save";

const defaultSave: SaveData = {
  totalSouls: 0,
  clearedStages: [],
  permanentUpgrades: {
    base_atk: 0,
    base_hp: 0,
    start_weapon: 0,
  },
};

// 操作函式
function loadSave(): SaveData;
function writeSave(data: SaveData): void;
function addSouls(amount: number): void;
function markStageCleared(stageId: number): void;
function purchaseUpgrade(type: PermanentUpgradeType): boolean; // 回傳是否購買成功
```

---

## EXP 與升級

- 初始 EXP 閾值：15
- 每升一級，閾值 = 前一閾值 + 10（即：15 → 25 → 35 → ...）
- 升級後 EXP 不重置（累積型），以 `Math.floor(totalExp / threshold)` 計算等級
- **EXP 在整局內持續累積，波次切換時不重置**。從第 1 波進入到本局結束（過關或死亡），EXP 是同一條累積軸線。波次間的 WAVE_TRANSITION 期間只是暫停生怪，不影響 EXP 累積軸。

觸發三選一時：

1. 遊戲暫停（phase → `SKILL_SELECT`）
2. `skills.ts` 依槓位狀態生成 3 個 `SkillOption`
3. React `SkillSelectModal` 接收選項並渲染
4. 玩家點選後透過 callback 回傳選擇，遊戲恢復（phase → `PLAYING`）

---

## HUD 繪製規格（Canvas 直接繪製）

```
頂部 HUD 列（y = 10~40）：
  [波次進度] Wave 3/6        [基地 HP] ❤️ 85/100

底部 HUD 列（y = canvasHeight - 50）：
  武器槓位：[ 普通彈 Lv2 ] [ 環繞刃 Lv1 ] [  空  ] [  空  ] [  空  ] [  空  ]

左側：EXP 條（細長豎條）
```

---

## 開發階段（Phase）

### Phase 1 — 最小可動骨架

- Next.js 子路由 `/monsterTide/battle/[stageId]` + `GameCanvas.tsx` dynamic import
- Canvas 遊戲迴圈（rAF + dt）
- `lib/input.ts`：`InputManager` 同時綁定鍵盤（← →）與觸控（左半邊 / 右半邊），統一輸出 `direction: -1 | 0 | 1`
- 玩家左右移動，移動邏輯只讀 `inputManager.getDirection()`，不直接監聽 DOM 事件
- 普通彈固定朝正上方自動發射（不追蹤最近敵人）
- 基地 HP 顯示（數字即可，不用美術）

**驗收**：開啟 `/monsterTide/battle/1`，玩家可用鍵盤或觸控左右移動，自動往正上方發射子彈，有基地 HP 顯示。

### Phase 2 — 單波次 + 基地傷害

- 骷髏兵的生成、直線移動、抵達底部 → 基地扣血並消失
- 基地 HP 歸零 → `GAME_OVER` → 顯示 `ResultScreen`（含本局累積 `soulsEarned`，即使失敗也計入永久存檔）
- 子彈命中敵人 → 扣 HP → HP ≤ 0 → 消失 + 簡易粒子爆炸

**驗收**：骷髏兵從上方生成，被子彈擊殺或抵達底部扣基地血，血量歸零後顯示結算畫面並能看到深淵晶核獲得量。

### Phase 3 — 波次管理器

- `stages.ts` 第 1 關 Wave 1~5（先不含 Boss）
- `WaveManager` 波次清空判定、WAVE_TRANSITION 提示
- 通關 5 波顯示「本關通關（暫無 Boss）」

**驗收**：5 波依序觸發，每波生成前顯示波次提示。

### Phase 4 — 三選一升級系統

- EXP 累積與升級閾值
- `SkillSelectModal` React overlay，遊戲暫停
- 武器槓位機制，槓位滿時只出被動
- 環繞刃、多重箭、各被動納入技能池

**驗收**：擊殺足夠敵人後彈出三選一，選武器後能看到新武器發動攻擊，選被動後數值提升。

### Phase 5 — 完整敵人清單

- 哥布林、史萊姆（含分裂）、鎧甲武士（護甲機制）、食人花（停滯 + 彈幕）、蝙蝠（蛇行）
- 物件池正式啟用（子彈、粒子）

**驗收**：所有敵人類型在第 1 關可正常生成，各自行為符合設計。

### Phase 6 — Boss 戰 + 過關結算

- 地城領主（Wave 6）：Phase 狀態機、護甲破除、弱點傷害倍率
- 過關 → `STAGE_CLEAR` → `ResultScreen` 顯示戰績與深淵晶核獲得量
- 結算後導回 `/monsterTide/stageSelect`

**驗收**：打完 6 波通關，Boss 護甲破除後進入第二階段，過關後能看到結算畫面。

### Phase 7 — 雙軸進度系統

- `saveData.ts` localStorage 讀寫
- `/monsterTide/stageSelect` 頁面：解鎖狀態顯示
- `/monsterTide/forge` 頁面：購買永久強化，餘額顯示
- 永久強化效果在遊戲初始化時讀取並套用

**驗收**：通關第 1 關解鎖第 2 關入口，深淵晶核累積，鐵匠鋪購買後下一局數值有差異。

### Phase 8 — 擴充至 2 關

- 第 2 關敵人配置（血量 / 速度 ×1.3，新增巨型蜘蛛王）
- 驗證難度曲線與整體架構

### Phase 9 — 打磨

- 受擊音效 / 擊殺音效（Web Audio API 產生的簡單音效或 .mp3）
- 死亡 / 升級動畫優化
- 效能 profile：若 100+ 實體時低於 50fps，啟動碰撞網格 profiling

---

## 效能警戒線

| 場景                     | 期望 fps | 最低接受 fps |
| ------------------------ | -------- | ------------ |
| 一般波次（< 30 敵人）    | 60       | 50           |
| 高密度波次（50~80 敵人） | 55       | 40           |
| Boss 戰 + 大量彈幕       | 50       | 35           |

監控指標：每 5 秒在 console 輸出平均 fps（開發模式）。

---

## 已確認設計決策

### Landing Page（`monsterTidePage.tsx`）

保留簡單靜態 landing page，**不直接 redirect**。
內容：遊戲標題、一段簡介、「開始遊戲」按鈕（→ `/monsterTide/stageSelect`）。
不需要進入動畫，demo 階段靜態頁即可；動畫效果留到 Phase 9 視需求決定是否加入。

### 輸入系統（`lib/input.ts`，Phase 1 同步實作）

輸入抽象為統一的 `InputManager`，遊戲邏輯只讀 `getDirection()`，不直接監聽任何 DOM 事件：

- 鍵盤：ArrowLeft / A → `-1`，ArrowRight / D → `+1`，keyup 歸 `0`
- 觸控：canvas 左半邊 pointerdown → `-1`，右半邊 → `+1`，pointerup / pointercancel → `0`

不做複雜觸控 zone UI；Phase 1 即同時綁定兩種來源，避免後期回頭重構 Player 移動邏輯。

```typescript
// lib/input.ts
type MoveDirection = -1 | 0 | 1;

class InputManager {
  private direction: MoveDirection = 0;

  bindKeyboard(): void;
  // keydown: ArrowLeft/A → -1, ArrowRight/D → +1
  // keyup: 歸 0（需處理兩鍵同按的優先順序：後按的鍵優先）

  bindTouch(canvas: HTMLCanvasElement): void;
  // pointerdown: x < canvas.width/2 → -1, x ≥ canvas.width/2 → +1
  // pointerup / pointercancel → 0

  unbind(): void; // 移除所有事件監聽（在 useEffect cleanup 呼叫）

  getDirection(): MoveDirection;
}
```

### 第 2 關 Boss：維持巨型蜘蛛王原設計

兩場 Boss 機制（護甲破除 vs 動作弱點窗口）在 demo 階段相似是可接受的，
核心目標是驗證「多關卡架構跑得通」，差異化設計等 Phase 1~8 邏輯驗證完後再回頭優化。

### 背景美術：全程 Canvas 色塊，Phase 8 前不引入圖片資源

原因：美術資源會帶來素材製作 / 載入管理 / 版權確認等額外成本，會拖慢架構驗證速度。
Phase 8+ 邏輯跑通後，再根據實際視覺需求（分層背景、視差捲動需求等）決定美術方案。

各主題背景色（Canvas fillRect 填充）：
| 關卡主題 | 天空色 | 地面色 |
|---------|--------|--------|
| 墓地前哨（第 1 關） | `#1a1a2e` 深藍黑 | `#2d4a1e` 暗綠 |
| 地下迷宮（第 2 關） | `#0d0d0d` 純黑 | `#3a2010` 深棕 |
