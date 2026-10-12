/**
 * WaveManager.ts
 * 敵人波次生成與驗證管理器
 * 100% 精準對齊原版 WaveManager.gd 邏輯與 Wave Rejection 7 大代碼
 * 支援 Delta 時間驅動（倍速、暫停、部屬減速完美同步）
 */

import { GameMap, WorldCoord } from "./GameMap";
import { EnemyEntity, EnemyConfigData } from "./entities/EnemyEntity";

export interface WaveGroupConfig {
  enemy_id: string;
  count: number;
  interval: number;
  path: string;
}

export interface WaveConfigData {
  wave: number;
  enemies: WaveGroupConfig[];
}

export interface WavePlanGroup {
  cfg: EnemyConfigData;
  waypoints: WorldCoord[];
  count: number;
  interval: number;
}

export interface WaveSkippedReport {
  index: number;
  enemy_id: string;
  path: string;
  reason: string;
}

export interface WavePlanReport {
  wave: number;
  missing: boolean;
  skipped: WaveSkippedReport[];
}

/**
 * 這一波的一次性開波資料（prepareWave 產生，startPreparedWave 只接受一次）：
 * 記下產生時的世代，換場後的舊資料不能開始，也不能重用或重算
 */
export interface PreparedWave {
  wave: number;
  generation: number;
  groups: WavePlanGroup[];
  consumed: boolean;
}

/** 出兵間隔的最短等待（秒）：和 Godot 版 create_game_timer 的 maxf(sec, 0.0001) 相同，0 與負數也等這麼久 */
export const MIN_SPAWN_WAIT = 0.0001;

/**
 * 每組的數量：缺鍵是 1；有限數字向 0 取整（和 Godot 版 int() 相同，2.7 → 2）；
 * 只有數字和小數點的字串照同樣規則（Godot 版 "2" → 2、"2.7" → 2）。
 * 其他（null、布林、非有限數字、其他字串、陣列、物件）回 0 當作無效組——這是額外的防守，不宣稱和 Godot 版所有型別轉換相同
 */
export function waveGroupCount(raw: unknown): number {
  if (raw === undefined) return 1;
  if (typeof raw === "number")
    return Number.isFinite(raw) ? Math.trunc(raw) : 0;
  if (typeof raw === "string" && /^[+-]?\d+(\.\d+)?$/.test(raw)) {
    // 很長的數字字串會轉成 Infinity：轉換後也要是有限數字，否則是無效組
    const n = Number(raw);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }
  return 0;
}

/**
 * 每組的出兵間隔（秒）：缺鍵是 1；有限數字取 max(0, x)（和 Godot 版 maxf(0, float(x)) 相同，合法的 0 保留）。
 * 其他型別照原本的換算（不是有限數字時用 1）；非有限數字也用 1，不讓出兵卡住——額外的防守，不宣稱和 Godot 版相同
 */
export function waveGroupInterval(raw: unknown): number {
  if (raw === undefined) return 1.0;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? Math.max(0.0, raw) : 1.0;
  }
  const n = Number(raw) || 1.0;
  return Number.isFinite(n) ? Math.max(0.0, n) : 1.0;
}

/**
 * 出兵中的一組：remaining 是到下一隻的遊戲時間倒數（和 Godot 版的遊戲計時器相同，扣到小於 0 才生成一隻）。
 * eligible：這一幀可以扣——一幀開始處理時（beginFrame）已經存在的倒數才可以扣，在這一幀處理中才設的下一幀才扣
 * （Godot 版處理前建立的計時器同一幀就扣、處理中建立的下一幀才開始倒數）
 */
interface ActiveSpawningTask {
  plan: WavePlanGroup;
  spawned: number;
  remaining: number;
  eligible: boolean;
  gen: number;
  done: boolean;
}

export class WaveManager {
  private wavesData: WaveConfigData[] = [];
  private enemiesConfig: EnemyConfigData[] = [];
  private gameMap: GameMap | null = null;

  public activeEnemies: EnemyEntity[] = [];
  private currentWaveNum = 0;
  private clearedWaveNum = 0;
  private activeSpawningTasks: ActiveSpawningTask[] = [];

  private generation = 0;
  private spawnCount = 0;
  /** 引擎是否正在一幀的處理中（beginFrame～endFrame）；沒有引擎的幀界線時，每次 update 自成一幀 */
  private frameOpen = false;
  private lastPlanReport: WavePlanReport = {
    wave: 0,
    missing: false,
    skipped: [],
  };

  // 事件回調
  public onEnemySpawned?: (enemy: EnemyEntity) => void;
  public onEnemyKilled?: (enemy: EnemyEntity) => void;
  public onEnemyLeaked?: (enemy: EnemyEntity) => void;
  public onWaveCleared?: (waveNum: number) => void;
  public onWaveAllSpawned?: (waveNum: number) => void;

  public setup(
    waves: WaveConfigData[],
    enemiesConfig: EnemyConfigData[],
    gameMap: GameMap
  ): void {
    this.beginNewGeneration();
    this.wavesData = waves || [];
    this.enemiesConfig = enemiesConfig || [];
    this.gameMap = gameMap;
  }

  public stopAll(): void {
    this.beginNewGeneration();
  }

  private beginNewGeneration(): void {
    this.generation++;
    this.spawnCount = 0;
    this.activeEnemies = [];
    this.activeSpawningTasks = [];
    this.currentWaveNum = 0;
    this.clearedWaveNum = 0;
    this.lastPlanReport = { wave: 0, missing: false, skipped: [] };
  }

  public getLastPlanReport(): WavePlanReport {
    return JSON.parse(JSON.stringify(this.lastPlanReport));
  }

  /** 目前的世代（每次 setup／stopAll 加 1，只增不減） */
  public getGeneration(): number {
    return this.generation;
  }

  public planWave(waveNum: number): WavePlanGroup[] {
    this.lastPlanReport = { wave: waveNum, missing: false, skipped: [] };

    let waveObj: WaveConfigData | null = null;
    for (const w of this.wavesData) {
      if (w && Number(w.wave) === waveNum) {
        waveObj = w;
        break;
      }
    }

    if (!waveObj) {
      this.lastPlanReport.missing = true;
      return [];
    }
    if (!this.gameMap) return [];

    const plans: WavePlanGroup[] = [];
    let index = 0;
    const groups = Array.isArray(waveObj.enemies) ? waveObj.enemies : [];

    for (const g of groups) {
      index++;
      if (!g || typeof g !== "object") continue;

      const enemyId = String(g.enemy_id || "").trim();
      if (!enemyId) continue; // GAS 空白列

      const pathId = String(g.path || "path_a");
      const enemyCfg = this.findEnemyConfig(enemyId);

      if (!enemyCfg) {
        this.lastPlanReport.skipped.push({
          index,
          enemy_id: enemyId,
          path: pathId,
          reason: "enemy_not_found",
        });
        continue;
      }

      const waypoints = this.gameMap.getWaypointsWorld(pathId);
      if (!waypoints || waypoints.length === 0) {
        this.lastPlanReport.skipped.push({
          index,
          enemy_id: enemyId,
          path: pathId,
          reason: "path_empty",
        });
        continue;
      }

      // 飛行檢查
      const isFlying = String(enemyCfg.movement_type || "").trim() === "flying";
      if (isFlying) {
        if (waypoints.length < 2) {
          this.lastPlanReport.skipped.push({
            index,
            enemy_id: enemyId,
            path: pathId,
            reason: "flight_single_point",
          });
          continue;
        }
        const p0 = waypoints[0];
        const pEnd = waypoints[waypoints.length - 1];
        if (Math.hypot(p0.x - pEnd.x, p0.y - pEnd.y) <= 0.001) {
          this.lastPlanReport.skipped.push({
            index,
            enemy_id: enemyId,
            path: pathId,
            reason: "flight_same_endpoints",
          });
          continue;
        }
      } else {
        // 地面折線總長檢查
        if (waypoints.length < 2) {
          this.lastPlanReport.skipped.push({
            index,
            enemy_id: enemyId,
            path: pathId,
            reason: "ground_single_point",
          });
          continue;
        }
        let totalLen = 0.0;
        for (let i = 1; i < waypoints.length; i++) {
          totalLen += Math.hypot(
            waypoints[i - 1].x - waypoints[i].x,
            waypoints[i - 1].y - waypoints[i].y
          );
        }
        if (totalLen <= 0.001) {
          this.lastPlanReport.skipped.push({
            index,
            enemy_id: enemyId,
            path: pathId,
            reason: "ground_zero_length",
          });
          continue;
        }
      }

      const raw = g as unknown as Record<string, unknown>;
      const count = waveGroupCount(raw.count);
      if (count <= 0) {
        this.lastPlanReport.skipped.push({
          index,
          enemy_id: enemyId,
          path: pathId,
          reason: "count_invalid",
        });
        continue;
      }

      plans.push({
        cfg: enemyCfg,
        waypoints,
        count,
        interval: waveGroupInterval(raw.interval),
      });
    }

    return plans;
  }

  private findEnemyConfig(enemyId: string): EnemyConfigData | null {
    return this.enemiesConfig.find((c) => c.enemy_id === enemyId) ?? null;
  }

  /**
   * 產生這一波的一次性開波資料（只算一次）：有效組與略過原因照 planWave，並記下目前的世代。
   * groups 是空的代表這一波沒有任何敵人可生成，呼叫端必須拒絕開戰
   */
  public prepareWave(waveNum: number): PreparedWave {
    return {
      wave: waveNum,
      generation: this.generation,
      groups: this.planWave(waveNum),
      consumed: false,
    };
  }

  /**
   * 開始 prepareWave 產生的那一波（和 Godot 版 start_wave 相同）：生成任何敵人之前先登記所有組，
   * 再依序同步生成每組的第一隻；之後每組照自己的間隔倒數。
   * 已用過、別的世代（換場後）或沒有任何組的資料一律不開始，回傳 false
   */
  public startPreparedWave(prepared: PreparedWave): boolean {
    if (
      prepared.consumed ||
      prepared.generation !== this.generation ||
      prepared.groups.length === 0
    ) {
      return false;
    }
    prepared.consumed = true;
    const gen = this.generation;
    this.currentWaveNum = prepared.wave;
    const tasks: ActiveSpawningTask[] = prepared.groups.map((plan) => ({
      plan,
      spawned: 0,
      remaining: 0,
      eligible: false,
      gen,
      done: false,
    }));
    this.activeSpawningTasks.push(...tasks);
    for (const task of tasks) {
      // 同步的生成通知裡可能已經換場：剩下的組屬於舊場，不再生成、不改新場的計數
      if (gen !== this.generation) return true;
      this.spawnOne(task);
      if (gen !== this.generation) return true;
      this.afterSpawn(task);
    }
    return true;
  }

  /** 引擎一幀的處理開始：這時已經存在的出兵倒數這一幀可以扣 */
  public beginFrame(): void {
    this.frameOpen = true;
    for (const task of this.activeSpawningTasks) task.eligible = true;
  }

  /** 引擎一幀的處理結束 */
  public endFrame(): void {
    this.frameOpen = false;
  }

  /**
   * 隨遊戲時間推進出兵（delta 已含倍率；暫停時引擎不呼叫）。
   * 每組的倒數扣這一次的 delta，小於 0 才生成一隻，然後重新倒數完整的間隔、這一幀不再扣：
   * 同一幀每組最多一隻，超過的時間不帶到下一隻（和 Godot 版每隻用一個新的遊戲計時器相同）
   */
  public update(delta: number): void {
    // 沒有引擎的幀界線（直接呼叫 update）時，這次 update 自成一幀
    if (!this.frameOpen) {
      for (const task of this.activeSpawningTasks) task.eligible = true;
    }
    if (this.activeSpawningTasks.length === 0) return;
    const gen = this.generation;
    for (const task of [...this.activeSpawningTasks]) {
      // 同步的生成通知裡換場：舊世代的工作全部停止，不碰新場的工作與計數
      if (gen !== this.generation) return;
      if (task.done || task.gen !== gen) continue;
      if (!task.eligible) continue;
      task.remaining -= delta;
      if (!(task.remaining < 0)) continue;
      this.spawnOne(task);
      if (gen !== this.generation) return;
      this.afterSpawn(task);
    }
  }

  /** 生成這一組的下一隻敵人並通知（通知是同步的，回來後呼叫端要重新核世代） */
  private spawnOne(task: ActiveSpawningTask): void {
    const enemyId = `enemy_${task.gen}_${this.spawnCount}`;
    const enemy = new EnemyEntity(
      enemyId,
      this.spawnCount++,
      task.plan.cfg,
      task.plan.waypoints,
      this.gameMap?.tileSize || 48
    );
    const currentGen = task.gen;
    enemy.onDied = (e) => this.handleEnemyDied(e, currentGen);
    enemy.onReachedBase = (e) => this.handleEnemyReachedBase(e, currentGen);
    task.spawned++;
    this.activeEnemies.push(enemy);
    this.onEnemySpawned?.(enemy);
  }

  /** 生成一隻之後：還有剩就重新倒數（這一幀不再扣），生完就完成這一組（每組只完成一次） */
  private afterSpawn(task: ActiveSpawningTask): void {
    if (task.spawned < task.plan.count) {
      task.remaining = Math.max(task.plan.interval, MIN_SPAWN_WAIT);
      task.eligible = false;
      return;
    }
    if (task.done) return;
    task.done = true;
    const idx = this.activeSpawningTasks.indexOf(task);
    if (idx >= 0) this.activeSpawningTasks.splice(idx, 1);
    // 最後一組完成時整波只通知一次
    if (this.activeSpawningTasks.length === 0) {
      this.onWaveAllSpawned?.(this.currentWaveNum);
      this.checkWaveFinished();
    }
  }

  private handleEnemyDied(enemy: EnemyEntity, gen: number): void {
    if (gen !== this.generation) return;
    this.onEnemyKilled?.(enemy);
    this.removeEnemy(enemy);
  }

  private handleEnemyReachedBase(enemy: EnemyEntity, gen: number): void {
    if (gen !== this.generation) return;
    this.onEnemyLeaked?.(enemy);
    this.removeEnemy(enemy);
  }

  private removeEnemy(enemy: EnemyEntity): void {
    const idx = this.activeEnemies.indexOf(enemy);
    if (idx >= 0) {
      this.activeEnemies.splice(idx, 1);
    }
    this.checkWaveFinished();
  }

  private checkWaveFinished(): void {
    if (
      this.currentWaveNum <= 0 ||
      this.clearedWaveNum === this.currentWaveNum
    ) {
      return;
    }
    if (
      this.activeEnemies.length === 0 &&
      this.activeSpawningTasks.length === 0
    ) {
      this.clearedWaveNum = this.currentWaveNum;
      this.onWaveCleared?.(this.currentWaveNum);
    }
  }
}
