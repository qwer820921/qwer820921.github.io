/**
 * 遊戲引擎 - 核心遊戲循環
 */

import { Enemy, Tower, Projectile, GameStatus, AttackType } from "../types";
import { CanvasRenderer } from "./CanvasRenderer";
import { useGameStore } from "../store/gameStore";
import { PATH_POINTS } from "../config/mapConfig";
import { ENEMY_CONFIGS } from "../config/gameData";
import { distance, lerpPoint, normalize, generateId } from "../utils/math";
import { levelManager } from "./LevelManager";

export class GameEngine {
  private renderer: CanvasRenderer;
  private animationFrameId: number | null = null;
  private lastTime = 0;
  private waveSpawnTimer: number | null = null;
  private enemySpawnQueue: Array<{ type: string; time: number }> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new CanvasRenderer(canvas);
  }

  /**
   * 開始遊戲循環
   */
  start() {
    if (this.animationFrameId) return;

    this.lastTime = performance.now();
    this.loop(this.lastTime);
    this.startWave();
  }

  /**
   * 停止遊戲循環
   */
  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.waveSpawnTimer) {
      clearTimeout(this.waveSpawnTimer);
      this.waveSpawnTimer = null;
    }
  }

  /**
   * 主遊戲循環
   */
  private loop = (currentTime: number) => {
    const state = useGameStore.getState();

    // 計算 delta time (秒)
    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // 只在遊戲進行中更新
    if (state.status === GameStatus.PLAYING) {
      const adjustedDelta = deltaTime * state.speed;
      this.update(adjustedDelta);
    }

    // 渲染
    this.render();

    // 繼續循環
    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  /**
   * 更新遊戲邏輯
   */
  private update(deltaTime: number) {
    this.updateEnemies(deltaTime);
    this.updateTowers(deltaTime);
    this.updateProjectiles(deltaTime);
    this.checkWaveComplete();
  }

  /**
   * 更新敵人
   */
  private updateEnemies(deltaTime: number) {
    const state = useGameStore.getState();
    const { enemies, loseLife, removeEnemy, addGold, addScore } = state;

    enemies.forEach((enemy) => {
      if (enemy.isDead) return;

      // 計算移動速度 (考慮減速效果)
      const effectiveSpeed = enemy.speed * (1 - enemy.slowAmount);
      const moveDistance = effectiveSpeed * deltaTime;

      // 沿路徑移動
      enemy.pathProgress += moveDistance;

      // 計算當前位置
      let remainingDistance = enemy.pathProgress;
      let currentIndex = 0;

      while (currentIndex < PATH_POINTS.length - 1) {
        const start = PATH_POINTS[currentIndex];
        const end = PATH_POINTS[currentIndex + 1];
        const segmentLength = distance(start, end);

        if (remainingDistance <= segmentLength) {
          // 在這個路徑段上
          const t = remainingDistance / segmentLength;
          enemy.position = lerpPoint(start, end, t);
          enemy.pathIndex = currentIndex;
          break;
        }

        remainingDistance -= segmentLength;
        currentIndex++;
      }

      // 到達終點
      if (currentIndex >= PATH_POINTS.length - 1) {
        loseLife(enemy.damage);
        removeEnemy(enemy.id);
        return;
      }

      // 敵人死亡
      if (enemy.health <= 0) {
        enemy.isDead = true;
        addGold(enemy.reward);
        addScore(enemy.reward * 10);
        removeEnemy(enemy.id);
      }

      // 減速效果衰減
      if (enemy.slowAmount > 0) {
        enemy.slowAmount = Math.max(0, enemy.slowAmount - deltaTime * 0.5);
      }
    });
  }

  /**
   * 更新塔
   */
  private updateTowers(_deltaTime: number) {
    const state = useGameStore.getState();
    const { towers, enemies, addProjectile } = state;
    const currentTime = performance.now();

    towers.forEach((tower) => {
      // 檢查攻擊冷卻
      if (currentTime - tower.lastAttackTime < tower.attackSpeed) {
        return;
      }

      // 尋找範圍內的敵人
      const target = this.findTarget(tower, enemies);

      if (target) {
        // 發射投射物
        const projectile: Projectile = {
          id: generateId("projectile"),
          position: { ...tower.position },
          target,
          damage: tower.damage,
          speed: tower.projectileSpeed,
          attackType: tower.attackType,
          aoeRadius: tower.aoeRadius,
          slowAmount: tower.slowAmount,
          color: tower.color,
          hasHit: false,
        };

        addProjectile(projectile);
        tower.lastAttackTime = currentTime;
      }
    });
  }

  /**
   * 尋找目標敵人
   */
  private findTarget(tower: Tower, enemies: Enemy[]): Enemy | undefined {
    // 找出範圍內最前面的敵人
    let bestTarget: Enemy | undefined;
    let maxProgress = -1;

    enemies.forEach((enemy) => {
      if (enemy.isDead) return;

      const dist = distance(tower.position, enemy.position);
      if (dist <= tower.range && enemy.pathProgress > maxProgress) {
        bestTarget = enemy;
        maxProgress = enemy.pathProgress;
      }
    });

    return bestTarget;
  }

  /**
   * 更新投射物
   */
  private updateProjectiles(deltaTime: number) {
    const state = useGameStore.getState();
    const { projectiles, enemies, removeProjectile, updateEnemy } = state;

    projectiles.forEach((projectile) => {
      if (projectile.hasHit) return;

      const target = projectile.target;

      // 目標已死亡,移除投射物
      if (target.isDead || !enemies.find((e) => e.id === target.id)) {
        removeProjectile(projectile.id);
        return;
      }

      // 移動投射物
      const direction = normalize(projectile.position, target.position);
      const moveDistance = projectile.speed * deltaTime;

      projectile.position.x += direction.x * moveDistance;
      projectile.position.y += direction.y * moveDistance;

      // 檢查是否命中
      const dist = distance(projectile.position, target.position);

      if (dist < 10) {
        // 命中!
        projectile.hasHit = true;

        if (projectile.attackType === AttackType.AOE && projectile.aoeRadius) {
          // 範圍傷害
          enemies.forEach((enemy) => {
            if (enemy.isDead) return;
            const distToEnemy = distance(target.position, enemy.position);
            if (distToEnemy <= projectile.aoeRadius!) {
              updateEnemy(enemy.id, {
                health: Math.max(0, enemy.health - projectile.damage),
              });
            }
          });
        } else if (
          projectile.attackType === AttackType.SLOW &&
          projectile.slowAmount
        ) {
          // 減速效果
          updateEnemy(target.id, {
            health: Math.max(0, target.health - projectile.damage),
            slowAmount: Math.max(target.slowAmount, projectile.slowAmount),
          });
        } else {
          // 單體傷害
          updateEnemy(target.id, {
            health: Math.max(0, target.health - projectile.damage),
          });
        }

        removeProjectile(projectile.id);
      }
    });
  }

  /**
   * 檢查波次是否完成
   */
  private checkWaveComplete() {
    const state = useGameStore.getState();
    const { enemies, currentWave, totalWaves, nextWave } = state;

    // 所有敵人都清除且沒有待生成的敵人
    if (enemies.length === 0 && this.enemySpawnQueue.length === 0) {
      if (currentWave < totalWaves) {
        // 準備下一波
        setTimeout(() => {
          nextWave();
          this.startWave();
        }, 3000);
      } else {
        // 遊戲勝利
        useGameStore.setState({ status: GameStatus.WIN });
      }
    }
  }

  /**
   * 開始新波次
   */
  private startWave() {
    const state = useGameStore.getState();

    // 從當前關卡獲取波次配置
    const level = levelManager.getLevelById(state.currentLevelId);
    if (!level) return;

    const waveConfig = level.waves[state.currentWave - 1];

    if (!waveConfig) return;

    // 清空生成隊列
    this.enemySpawnQueue = [];

    // 建立生成隊列
    waveConfig.enemies.forEach(
      (enemySpawn: {
        type: string;
        count: number;
        interval: number;
        delay?: number;
      }) => {
        const baseDelay = enemySpawn.delay || 0;

        for (let i = 0; i < enemySpawn.count; i++) {
          const spawnTime = Date.now() + baseDelay + i * enemySpawn.interval;
          this.enemySpawnQueue.push({
            type: enemySpawn.type,
            time: spawnTime,
          });
        }
      }
    );

    // 開始生成敵人
    this.spawnEnemies();
  }

  /**
   * 生成敵人
   */
  private spawnEnemies() {
    const checkSpawn = () => {
      const now = Date.now();
      const { addEnemy } = useGameStore.getState();

      // 檢查是否有敵人需要生成
      while (
        this.enemySpawnQueue.length > 0 &&
        this.enemySpawnQueue[0].time <= now
      ) {
        const spawn = this.enemySpawnQueue.shift()!;
        const config = ENEMY_CONFIGS[spawn.type as keyof typeof ENEMY_CONFIGS];

        const enemy: Enemy = {
          id: generateId("enemy"),
          type: config.type,
          position: { ...PATH_POINTS[0] },
          health: config.maxHealth,
          maxHealth: config.maxHealth,
          speed: config.speed,
          pathIndex: 0,
          pathProgress: 0,
          reward: config.reward,
          damage: config.damage,
          size: config.size,
          color: config.color,
          isDead: false,
          slowAmount: 0,
        };

        addEnemy(enemy);
      }

      // 繼續檢查
      if (this.enemySpawnQueue.length > 0) {
        this.waveSpawnTimer = window.setTimeout(checkSpawn, 100);
      }
    };

    checkSpawn();
  }

  /**
   * 渲染
   */
  private render() {
    const state = useGameStore.getState();

    this.renderer.clear();
    this.renderer.renderGrid(state.grid, state.hoveredCell);
    // 路徑已經通過格子顏色顯示,不需要額外繪製

    // 先渲染所有塔的攻擊範圍
    state.towers.forEach((tower) => {
      this.renderer.renderTowerRange(tower);
    });

    // 渲染放置預覽的攻擊範圍
    if (state.selectedTowerType && state.hoveredCell) {
      const cell = state.grid[state.hoveredCell.row]?.[state.hoveredCell.col];
      if (cell && cell.type === "buildable" && !cell.towerId) {
        this.renderer.renderPlacementPreview(
          state.selectedTowerType,
          state.hoveredCell
        );
      }
    }

    this.renderer.renderEnemies(state.enemies);
    this.renderer.renderTowers(state.towers);
    this.renderer.renderProjectiles(state.projectiles);
  }
}
