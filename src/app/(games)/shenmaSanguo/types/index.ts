// ============================================================
//  神馬三國 型別定義
// ============================================================

// ── Enums ────────────────────────────────────────────────────

export enum Rarity {
  Orange = "orange",
  Purple = "purple",
  Blue = "blue",
  Green = "green",
}

export enum JobClass {
  Infantry = "infantry",
  Archer = "archer",
  Artillery = "artillery",
}

export enum BattleResult {
  Win = "WIN",
  Lose = "LOSE",
}

/**
 * 玩家資料與 GAS 的同步狀態
 * Idle    → 無待同步資料
 * Pending → 有待同步，30s debounce 計時中
 * Syncing → GAS 請求進行中
 */
export enum SyncStatus {
  Idle = "idle",
  Pending = "pending",
  Syncing = "syncing",
}

// ── 靜態設定（初始化時從 GAS 讀取，快取於 sessionStorage）────

export interface HeroConfig {
  hero_id: string;
  name: string;
  rarity: Rarity;
  cost: number;
  job: JobClass;
  base_atk: number;
  base_def: number;
  base_hp: number;
  attack_range: number;
  attack_speed: number;
  upgrade_cost_base: number;
  atk_growth: number;
  def_growth: number;
  hp_growth: number;
}

export interface EnemyConfig {
  enemy_id: string;
  name: string;
  hp: number;
  speed: number;
  // 其餘欄位依 enemies_config 表擴充
  [key: string]: unknown;
}

export interface WaveEnemy {
  enemy_id: string;
  count: number;
  interval: number;
  path: string;
}

export interface Wave {
  wave: number;
  enemies: WaveEnemy[];
}

/**
 * path_json 由 Godot 解析，Web 端只負責傳遞，不需深入型別
 */
export interface PathJson {
  paths: unknown[];
  spawn: unknown[];
  base: unknown[];
}

export interface MapConfig {
  map_id: string;
  chapter: number;
  name: string;
  unlock_stage: string;
  path_json: PathJson;
  waves: Wave[];
}

/**
 * 初始化時一次快取進 sessionStorage（key: "shenma_static_config"）
 * 之後各頁面直接讀，不再打 GAS
 */
export interface StaticConfig {
  heroesConfig: HeroConfig[];
  enemiesConfig: EnemyConfig[];
  maps: MapConfig[];
}

// ── 玩家狀態 ─────────────────────────────────────────────────

export interface HeroState {
  hero_id: string;
  level: number;
  star: number;
  atk: number;
  def: number;
  hp: number;
}

export interface TeamSlot {
  hero_id: string;
  slot: number;
}

/**
 * 對應 GAS players.data JSON 的結構
 */
export interface PlayerState {
  nickname: string;
  level: number;
  exp: number;
  gold: number;
  capacity: number;
  max_stage: string;
  heroes: HeroState[];
  team: TeamSlot[];
}

/**
 * sessionStorage 存放的完整玩家狀態（key: "shenma_player_state"）
 * syncStatus 控制 debounce 同步邏輯，也用於 UI 顯示
 */
export interface SessionPlayerState extends PlayerState {
  key: string; // 玩家自訂 key（與 localStorage 同步）
  syncStatus: SyncStatus;
}

// ── 通訊協議（Web ↔ Godot）──────────────────────────────────

export interface Loot {
  item: string;
  count: number;
}

/**
 * Web → Godot：出征 payload（透過 postMessage 傳入 iframe）
 * team_list 的 atk/def/hp 取自 session（玩家升級後的實際數值）
 */
export interface ExpeditionPayload {
  stage_id: string;
  player: Pick<PlayerState, "nickname" | "level" | "gold"> & { key: string };
  team_list: Array<HeroState & { slot: number }>;
  heroes_config: HeroConfig[];
  enemies_config: EnemyConfig[];
  map: MapConfig;
}

/**
 * Godot → Web：戰鬥結算（透過 postMessage 回傳）
 * __godot_bridge: true 為識別旗標，過濾非 Godot 來源訊息
 */
export interface BattleResultPayload {
  result: BattleResult;
  stage_id: string;
  stars_earned: number;
  kills: number;
  time_seconds: number;
  loots: Loot[];
  __godot_bridge: true;
}
