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
  Cavalry = "cavalry",
  /** 法師（周瑜）：和弓兵一樣能攻擊飛行敵人（見 utils/antiAir） */
  Mage = "mage",
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
 * Unconfirmed → 武將升級的結果無法確認（回應遺失）：暫停自動保存，等待重新確認
 */
export enum SyncStatus {
  Idle = "idle",
  Pending = "pending",
  Syncing = "syncing",
  Unconfirmed = "unconfirmed",
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
  image?: string;
  attack_image?: string;
  range_growth: number;
  /** 攻速成長（程式內部使用的名稱）。靜態設定進入 store 時由 utils/heroStats 的 normalizeHeroConfig 補齊 */
  atk_spd_growth: number;
  /** 正式 heroes_config 的攻速成長欄位名稱；atk_spd_growth 無效時才採用（見 normalizeHeroConfig） */
  speed_growth?: number;
}

export interface EnemyConfig {
  enemy_id: string;
  name: string;
  hp: number;
  speed: number;
  /** 移動方式：flying 是飛行（直線飛向終點、不被武將擋住）；沒有、空白或其他值遊戲都當作地面（見 utils/antiAir） */
  movement_type?: string;
  /** 被武將擋住時每次攻擊那位武將的攻擊力；只有有限、不小於 0 的數字有效，其他遊戲以 20 計（見 utils/enemyCombat） */
  atk?: unknown;
  /** 特性：immune_slow（去掉前後空白後完全相同）是免疫減速，其他值遊戲不使用（見 utils/enemyCombat） */
  trait?: unknown;
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
  /** 本機版本：每次本機修改 +1（只存在本機，不送到伺服器；舊版 session 沒有） */
  rev?: number;
  /** 伺服器已確認保存的本機版本；與 rev 不同代表有未同步的修改 */
  syncedRev?: number;
  /**
   * 雲端存檔的版本基準（後端回報的 rev，只存在本機，不送到伺服器）：
   * 這個分頁已同步的資料等於雲端這個版本的內容，未同步的修改都在它之上。
   * 保存、升級、結算時當作 base_rev 送出；雲端在這之後被其他分頁或裝置改過，整份保存與升級會被拒絕（版本衝突），
   * 不會互相覆蓋。只能在確定雲端的新版本已包含在本機資料裡時才前進（寧可舊，不可新）。
   * 舊版後端不回報版本（或舊版 session 沒有這個欄位）時是 null／沒有：保存不帶 base_rev，沒有版本保護
   */
  serverRev?: number | null;
  /** 已送出、還沒確認結果的伺服器升級（只存在本機，不送到伺服器） */
  pendingUpgrade?: PendingUpgrade | null;
  /** 還沒確認雲端已保存的戰鬥結算（依結算順序；只存在本機，不送到伺服器）：見 PendingSettle */
  pendingSettles?: PendingSettle[];
  /** 遷移狀態不明的寫入限制（只存在本機，不送到伺服器）：見 MigrationHold */
  migrationHold?: MigrationHold | null;
}

/**
 * 遷移狀態不明的寫入限制：網站移除全站跨來源隔離時，這個分頁讀不回更新前的暫存
 * （見 utils/siteIsolation/boot.ts 的 lostCopy），那份暫存可能有稍晚才在伺服器完成的操作（例如升級），
 * 前端無法確認。限制期間這個分頁不送出任何寫入（save_profile、upgrade_hero、save_result、create_profile），
 * 只能讀取；重新整理、讀取雲端、關閉提示、重新輸入金鑰都不會解除（目前沒有可靠的解除依據，需要後端版本號）。
 * 這個欄位是分頁標記的另一份持久紀錄：從 session 載入時看到它，整個分頁都維持限制
 */
export interface MigrationHold {
  /** 開始限制的時間（毫秒） */
  since: number;
}

/**
 * 一場戰鬥屬於哪個帳號：送出關卡資料時向 store 取得，結算時用來確認歸屬（只存在記憶體）
 * 不含玩家金鑰：帳號世代判斷是不是同一個帳號（切換帳號後就會改變），
 * id 判斷是不是目前這一場（store 只接受目前有效那一場的票）
 */
export interface BattleTicket {
  /**
   * 這一場戰鬥的識別碼（隨機產生，不含玩家金鑰）：同一場只能結算一次。
   * 也以 battle_id 送進 Godot，Godot 的 stats 與結算會帶回產生它的那一場的 battle_id
   */
  id: string;
  /** 取得時的帳號世代 */
  gen: number;
}

/**
 * 送出 upgrade_hero 前先寫進 session 的紀錄。
 * 重新整理或網路錯誤讓回應遺失時，靠它知道「有一個結果不明的升級」，
 * 不會把送出前的 heroes／gold 當成最新版整份保存（會蓋掉伺服器上已完成的升級）。
 */
export interface PendingUpgrade {
  /** 本機產生的識別碼；後端目前沒有 operation id，只用來對應本機的回應 */
  id: string;
  hero_id: string;
  /** 送出前的伺服器資料（送出前要求沒有未同步修改，所以等於伺服器已確認的資料） */
  base: PlayerState;
  /** 送出時帶的雲端版本（base_rev）；舊版後端沒有版本時是 null */
  base_rev?: number | null;
  /** 送出時間（毫秒） */
  sent_at: number;
  /**
   * in_flight：送出請求的頁面還在等回應
   * unknown：回應遺失（重新整理、網路錯誤、無法解析的回應），無法確定伺服器是否已完成
   */
  state: "in_flight" | "unknown";
}

/**
 * 戰鬥結算的完整獎勵（後端在同一次寫入保存點數、經驗、等級、容量與進度）還沒確認時的紀錄，
 * 和本機先套用的獎勵在同一次寫進 session。確認之前不送整份保存：整份保存會先把獎勵寫進雲端，
 * 晚到的結算又會再加一次。重新整理或回應遺失時，用同一個 request_id、同一份內容與第一次的 base_rev
 * 重新送出確認（後端已處理就回傳第一次的結果，不會有第二份獎勵）
 */
export interface PendingSettle {
  /** request_id（這一場的戰鬥票 id） */
  id: string;
  /** 送到後端的結算內容（不含場次識別碼） */
  record: {
    result: BattleResult;
    stage_id: string;
    stars_earned: number;
    kills: number;
    time_seconds: number;
    loots: Loot[];
  };
  /** 本機算出的獎勵（和後端回報的比對） */
  reward: { points: number; exp: number };
  /** 本機套用這場獎勵後的版本（player.rev） */
  local_rev: number;
  /** 第一次送出時帶的雲端版本；還沒送出時是 null（重送一律用第一次的版本） */
  base_rev: number | null;
  /**
   * queued：排隊中、還沒送出；sent：這個頁面送出後在等回應；
   * unknown：送出後結果不明（回應遺失、重新整理、伺服器忙碌），要重新送出確認
   */
  state: "queued" | "sent" | "unknown";
  /** 本機套用的時間（毫秒） */
  at: number;
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
/**
 * Web → Godot：武將技能參數（隨出征資料的 team_list 送進去，定義在 utils/heroSkills）
 * 只存在戰場，不寫進玩家存檔；Godot 不認得的 id 一律當作普通攻擊
 */
/** 送進 Godot 的技能參數：每種技能只帶自己的欄位（定義在 utils/heroSkills） */
export type HeroSkillPayload =
  | {
      id: "first_strike";
      /** 每場戰鬥首次有效普通攻擊的傷害倍率 */
      first_attack_multiplier: number;
    }
  | {
      id: "long_range";
      /** 有效射程倍率 */
      range_multiplier: number;
    }
  | {
      id: "burn";
      /** 每跳傷害＝命中時攻擊力 × burn_ratio */
      burn_ratio: number;
      /** 每次命中後的跳數 */
      burn_ticks: number;
      /** 每跳間隔（秒） */
      burn_interval: number;
    }
  | {
      id: "slow_aura";
      /** 範圍（目前有效射程內）地面敵人的移動速度倍率（0.9＝降低 10%） */
      slow_mult: number;
    }
  | {
      id: "dodge";
      /** 每次受到敵人直接攻擊時閃避的機率（0～1）；不是有限數字或超出範圍時 Godot 當作沒有閃避 */
      dodge_chance: number;
    }
  | {
      id: "def_aura";
      /** 範圍（目前有效射程內）其他友軍武將的防禦倍率（1.2＝防禦提升 20%）；不是大於 1 的有限數字時 Godot 當作沒有這個技能 */
      def_mult: number;
    }
  | {
      id: "stun";
      /** 每次普通攻擊命中（目標還活著）後的暈眩時間（秒，遊戲時間）；不是正的有限數字時 Godot 當作沒有這個技能 */
      stun_sec: number;
    }
  | {
      id: "lifesteal";
      /**
       * 每次普通攻擊命中後，恢復這一擊實際扣掉敵人生命的比例（0.15＝15%；不含溢出的傷害）；
       * 不是大於 0、不超過 1 的有限數字時 Godot 當作沒有這個技能
       */
      lifesteal_ratio: number;
    }
  | {
      id: "atk_speed_aura";
      /**
       * 範圍（目前有效射程內）其他友軍武將每秒攻擊次數的倍率（1.15＝攻速提升 15%，攻擊間隔 ÷ 1.15）；
       * 不是大於 1 的有限數字時 Godot 當作沒有這個技能
       */
      atk_speed_mult: number;
    }
  | {
      id: "counter";
      /**
       * 受到敵人的直接攻擊、實際扣血後仍然活著時，反彈給攻擊者的比例（0.2＝這一擊實際扣掉自己生命的 20%）；
       * 不是大於 0、不超過 1 的有限數字時 Godot 當作沒有這個技能
       */
      counter_ratio: number;
    }
  | {
      id: "tenacity";
      /**
       * 受傷前的生命比例（生命 ÷ 最大生命）不高於這個值時減傷（0.3＝30%，含剛好等於）；
       * 和 damage_mult 都要是 0～1 之間（不含兩端）的有限數字，任何一個不是時 Godot 當作沒有這個技能
       */
      low_hp_ratio: number;
      /** 減傷時防禦計算後傷害的倍率（0.8＝少扣 20%） */
      damage_mult: number;
    }
  | {
      id: "atk_down_aura";
      /**
       * 範圍內敵人對阻路武將的直接攻擊力倍率（0.9＝降低 10%）；
       * 不是 0～1 之間（不含兩端）的有限數字時 Godot 當作沒有這個技能
       */
      atk_mult: number;
    }
  | {
      id: "double_shot";
      /**
       * 每次普通攻擊追加一擊（同一個目標、這次攻擊力 × 1）的機率（0.2＝20%）；
       * 不是 0～1 之間（不含兩端）的有限數字時 Godot 當作沒有這個技能
       */
      double_shot_chance: number;
    };

export interface ExpeditionPayload {
  stage_id: string;
  /** 這一場的識別碼（戰鬥票的 id）：Godot 的 update_stats 與結算都會帶回它 */
  battle_id: string;
  player: Pick<PlayerState, "nickname" | "level" | "gold"> & { key: string };
  team_list: Array<HeroState & { slot: number; skill?: HeroSkillPayload }>;
  heroes_config: HeroConfig[];
  enemies_config: EnemyConfig[];
  map: MapConfig;
  sound_settings: {
    sfx_enabled: boolean;
    sfx_polyphony: "single" | "faithful";
  };
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
  /**
   * 產生這筆結算的那一場（關卡資料送進 Godot 的 battle_id）。
   * 頁面只採用目前這一場的結算；送到後端的 save_result 不含這個欄位
   */
  battle_id?: string;
  __godot_bridge: true;
}
