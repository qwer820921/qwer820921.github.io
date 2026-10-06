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

interface ActiveSpawningTask {
  plan: WavePlanGroup;
  spawned: number;
  timer: number;
  gen: number;
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
  private lastPlanReport: WavePlanReport = { wave: 0, missing: false, skipped: [] };

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

      const count = Number(g.count) || 1;
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
        interval: Math.max(0.0, Number(g.interval) || 1.0),
      });
    }

    return plans;
  }

  private findEnemyConfig(enemyId: string): EnemyConfigData | null {
    return this.enemiesConfig.find((c) => c.enemy_id === enemyId) ?? null;
  }

  public startWave(waveNum: number, plans: WavePlanGroup[]): void {
    if (plans.length === 0) return;
    const currentGen = this.generation;
    this.currentWaveNum = waveNum;

    for (const plan of plans) {
      this.activeSpawningTasks.push({
        plan,
        spawned: 0,
        timer: 0, // 立刻生成第一隻
        gen: currentGen,
      });
    }
  }

  /**
   * 隨遊戲時間 Delta 推進敵人生成（完美同步倍速與暫停）
   */
  public update(delta: number): void {
    if (this.activeSpawningTasks.length === 0) return;

    for (let i = this.activeSpawningTasks.length - 1; i >= 0; i--) {
      const task = this.activeSpawningTasks[i];
      if (task.gen !== this.generation) {
        this.activeSpawningTasks.splice(i, 1);
        continue;
      }

      task.timer -= delta;
      while (task.timer <= 0 && task.spawned < task.plan.count) {
        // 生成一隻敵兵
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

        this.activeEnemies.push(enemy);
        this.onEnemySpawned?.(enemy);

        task.spawned++;
        if (task.spawned < task.plan.count) {
          task.timer += Math.max(0.05, task.plan.interval);
        } else {
          break;
        }
      }

      if (task.spawned >= task.plan.count) {
        this.activeSpawningTasks.splice(i, 1);
      }
    }

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
    if (this.currentWaveNum <= 0 || this.clearedWaveNum === this.currentWaveNum) {
      return;
    }
    if (this.activeEnemies.length === 0 && this.activeSpawningTasks.length === 0) {
      this.clearedWaveNum = this.currentWaveNum;
      this.onWaveCleared?.(this.currentWaveNum);
    }
  }
}
