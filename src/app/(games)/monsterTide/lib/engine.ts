import { InputManager } from "./input";
import { WaveManager } from "./waveManager";
import { getStage, STAGE_BONUS_SOULS } from "./stages";
import {
  generateSkillOptions,
  applySkillToPlayer,
  getOrbitBladeCount,
  getOrbitBladeSpeed,
  getOrbitBladeRadius,
  getMultiArrowDirCount,
} from "./skills";
import { createPlayer } from "./entities/player";
import { createBase } from "./entities/base";
import {
  makeBullet,
  getWeaponBaseInterval,
  getWeaponBaseDamage,
} from "./entities/bullet";
import { updateEnemy, spawnSlimeSplit } from "./entities/enemy";
import { createBoss, getBossStopY, BOSS_MOVE_SPEED } from "./entities/boss";
import { makeEnemyBullet } from "./entities/enemyBullet";
import { spawnDeathParticles, updateParticles } from "./entities/particle";
import { checkBulletsVsEnemies, checkEnemiesVsBase } from "./collision";
import { renderFrame } from "./renderer";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  BULLET_SPEED,
  BASE_COLLISION_Y,
} from "./constants";
import type {
  Player,
  Base,
  Bullet,
  Enemy,
  Particle,
  Boss,
  ActiveWeapon,
  GamePhase,
  GameEvent,
  StageConfig,
  SkillOption,
} from "../types";

const WAVE_TRANSITION_DURATION = 2000;
const ORBIT_HIT_COOLDOWN = 500;

export class GameEngine {
  private ctx: CanvasRenderingContext2D;
  private rafId = 0;
  private lastTime = 0;

  private phase: GamePhase = "IDLE";
  private player!: Player;
  private base!: Base;
  private bullets: Bullet[] = [];
  private enemyBullets: Bullet[] = []; // 食人花 + Boss 彈幕
  private enemies: Enemy[] = [];
  private particles: Particle[] = [];
  private boss: Boss | null = null;
  private inputManager!: InputManager;
  private waveManager = new WaveManager();

  private stage!: StageConfig;
  private statsMult = 1.0;
  private currentWaveIndex = 0;
  private waveTransitionTimer = 0;
  private waveTransitionMessage = "";

  private totalExp = 0;
  private soulsEarned = 0;
  private wavesCleared = 0;
  private waveTotal = 0;
  private playerLevel = 0;
  private pendingSkillSelects = 0;
  private previousPhase: GamePhase = "PLAYING"; // 技能選取後回到這個 phase

  private orbitBladeCooldowns = new Map<number, number>();

  constructor(
    private canvas: HTMLCanvasElement,
    private stageId: number,
    private onEvent: (event: GameEvent) => void,
    private permanentDmgBonus = 0,
    private permanentHpBonus = 0
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    this.ctx = ctx;
  }

  start(): void {
    const stage = getStage(this.stageId);
    if (!stage) throw new Error(`Stage ${this.stageId} not found`);
    this.stage = stage;
    this.statsMult = stage.statsMult ?? 1.0;

    this.player = createPlayer(this.permanentDmgBonus);
    this.base = createBase(this.permanentHpBonus);
    this.bullets = [];
    this.enemyBullets = [];
    this.enemies = [];
    this.particles = [];
    this.boss = null;
    this.totalExp = 0;
    this.soulsEarned = 0;
    this.wavesCleared = 0;
    this.currentWaveIndex = 0;
    this.waveTotal = stage.waves.length;
    this.playerLevel = 0;
    this.pendingSkillSelects = 0;
    this.orbitBladeCooldowns.clear();

    this.inputManager = new InputManager();
    this.inputManager.bindKeyboard();
    this.inputManager.bindTouch(this.canvas);

    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
    this.startWaveTransition(0);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    this.inputManager?.unbind();
  }

  applySkill(skill: SkillOption): void {
    applySkillToPlayer(skill, this.player, this.base);
    this.pendingSkillSelects = Math.max(0, this.pendingSkillSelects - 1);
    if (this.pendingSkillSelects > 0) {
      this.triggerSkillSelect();
    } else {
      this.phase = this.previousPhase;
    }
  }

  // ===== 主迴圈 =====

  private loop = (timestamp: number): void => {
    const dt = Math.min(timestamp - this.lastTime, 50);
    this.lastTime = timestamp;
    this.update(dt);
    this.render();
    if (this.phase !== "GAME_OVER" && this.phase !== "STAGE_CLEAR") {
      this.rafId = requestAnimationFrame(this.loop);
    }
  };

  private update(dt: number): void {
    if (this.phase === "WAVE_TRANSITION") {
      this.waveTransitionTimer -= dt;
      if (this.waveTransitionTimer <= 0) this.beginWave();
      return;
    }
    if (this.phase === "SKILL_SELECT" || this.phase === "PAUSED") return;

    if (this.phase === "PLAYING") {
      this.updatePlaying(dt);
    } else if (this.phase === "BOSS_FIGHT") {
      this.updateBossFight(dt);
    }
  }

  // ===== 一般波次邏輯 =====

  private updatePlaying(dt: number): void {
    this.updateOrbitBladeCooldowns(dt);
    this.updatePlayer(dt);
    this.updateWeapons(dt);
    this.updateOrbitBlades(dt);
    this.updateBullets(dt);
    this.waveManager.update(dt, this.enemies);
    this.updateEnemies(dt);
    this.updateFlowerAttacks(dt);
    this.updateEnemyBullets(dt);
    this.resolveCollisions();
    this.checkOrbitBladeCollisions();
    updateParticles(this.particles, dt);
    this.pruneArrays();

    if (this.base.currentHp <= 0) {
      this.triggerGameOver();
      return;
    }
    if (this.pendingSkillSelects > 0) {
      this.previousPhase = "PLAYING";
      this.triggerSkillSelect();
      return;
    }

    if (this.waveManager.isWaveCleared(this.enemies)) {
      this.wavesCleared = this.currentWaveIndex + 1;
      if (this.currentWaveIndex + 1 >= this.stage.waves.length) {
        this.triggerStageClear();
      } else {
        this.startWaveTransition(this.currentWaveIndex + 1);
      }
    }
  }

  // ===== Boss 波次邏輯 =====

  private updateBossFight(dt: number): void {
    this.updateOrbitBladeCooldowns(dt);
    this.updatePlayer(dt);
    this.updateWeapons(dt);
    this.updateOrbitBlades(dt);
    this.updateBullets(dt);
    this.updateBoss(dt);
    this.updateEnemyBullets(dt);
    this.checkBulletsVsBoss();
    this.checkOrbitBladeCollisions(); // 也對 boss 生效
    this.checkEnemyBulletsVsBase();
    updateParticles(this.particles, dt);
    this.pruneArrays();

    if (this.base.currentHp <= 0) {
      this.triggerGameOver();
      return;
    }
    if (this.pendingSkillSelects > 0) {
      this.previousPhase = "BOSS_FIGHT";
      this.triggerSkillSelect();
      return;
    }
  }

  // ===== 波次流程 =====

  private startWaveTransition(waveIndex: number): void {
    this.currentWaveIndex = waveIndex;
    const wave = this.stage.waves[waveIndex];
    this.waveTransitionMessage =
      wave.preWaveMessage ?? `Wave ${wave.waveIndex}`;
    this.waveTransitionTimer = WAVE_TRANSITION_DURATION;
    this.waveManager.reset();
    this.phase = "WAVE_TRANSITION";
  }

  private beginWave(): void {
    const wave = this.stage.waves[this.currentWaveIndex];
    if (wave.isBossWave) {
      this.boss = createBoss(wave.bossType ?? "dungeon_lord");
      this.phase = "BOSS_FIGHT";
    } else {
      this.waveManager.startWave(wave, this.statsMult);
      this.phase = "PLAYING";
    }
  }

  // ===== 玩家 =====

  private updatePlayer(dt: number): void {
    const dir = this.inputManager.getDirection();
    const speed =
      this.player.baseSpeed * this.player.passiveStack.moveSpeedMultiplier;
    this.player.x = Math.max(
      this.player.width / 2,
      Math.min(
        CANVAS_WIDTH - this.player.width / 2,
        this.player.x + dir * speed * (dt / 1000)
      )
    );
  }

  // ===== 武器 =====

  private updateWeapons(dt: number): void {
    for (const weapon of this.player.weapons) {
      if (weapon.type === "orbit_blade") continue;
      weapon.attackTimer -= dt;
      if (weapon.attackTimer <= 0) {
        this.fireWeapon(weapon);
        const interval = getWeaponBaseInterval(weapon.type, weapon.level);
        weapon.attackTimer =
          interval / this.player.passiveStack.attackSpeedMultiplier;
      }
    }
  }

  /** 鎖定目標：Boss 戰時鎖 Boss，否則鎖最靠近基地（Y 最大）的活著敵人 */
  private findPriorityTarget(): { x: number; y: number } | null {
    if (this.phase === "BOSS_FIGHT" && this.boss?.isAlive) {
      return { x: this.boss.x, y: this.boss.y };
    }
    let best: Enemy | null = null;
    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      if (!best || enemy.y > best.y) best = enemy;
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  private fireWeapon(weapon: ActiveWeapon): void {
    const { x, y, height, passiveStack } = this.player;
    const muzzleY = y - height / 2;
    const piercing = weapon.level >= 5;

    // 計算瞄準角度：有目標就朝目標，否則正上方
    const target = this.findPriorityTarget();
    const aimAngle = target
      ? Math.atan2(target.y - muzzleY, target.x - x)
      : -Math.PI / 2;

    if (weapon.type === "basic_shot") {
      const vx = Math.cos(aimAngle) * BULLET_SPEED;
      const vy = Math.sin(aimAngle) * BULLET_SPEED;
      if (weapon.level >= 4) {
        this.bullets.push(
          makeBullet(weapon, passiveStack, x - 8, muzzleY, vx, vy, piercing)
        );
        this.bullets.push(
          makeBullet(weapon, passiveStack, x + 8, muzzleY, vx, vy, piercing)
        );
      } else {
        this.bullets.push(
          makeBullet(weapon, passiveStack, x, muzzleY, vx, vy, piercing)
        );
      }
    } else if (weapon.type === "multi_arrow") {
      const dirCount = getMultiArrowDirCount(weapon.level);
      const spread = 30 * (Math.PI / 180);
      for (let i = 0; i < dirCount; i++) {
        const angle = aimAngle + (i - (dirCount - 1) / 2) * spread;
        this.bullets.push(
          makeBullet(
            weapon,
            passiveStack,
            x,
            muzzleY,
            Math.cos(angle) * BULLET_SPEED,
            Math.sin(angle) * BULLET_SPEED,
            piercing
          )
        );
      }
    }
  }

  // ===== 環繞刃 =====

  private updateOrbitBladeCooldowns(dt: number): void {
    for (const [id, cd] of this.orbitBladeCooldowns) {
      const next = cd - dt;
      if (next <= 0) this.orbitBladeCooldowns.delete(id);
      else this.orbitBladeCooldowns.set(id, next);
    }
  }

  private updateOrbitBlades(dt: number): void {
    for (const weapon of this.player.weapons) {
      if (weapon.type !== "orbit_blade") continue;
      weapon.orbitAngle =
        ((weapon.orbitAngle ?? 0) +
          getOrbitBladeSpeed(weapon.level) * (dt / 1000)) %
        (Math.PI * 2);
    }
  }

  private checkOrbitBladeCollisions(): void {
    for (const weapon of this.player.weapons) {
      if (weapon.type !== "orbit_blade") continue;
      const count = getOrbitBladeCount(weapon.level);
      const radius = getOrbitBladeRadius(weapon.level);
      const baseAngle = weapon.orbitAngle ?? 0;
      const dmg =
        getWeaponBaseDamage("orbit_blade", weapon.level) *
        this.player.passiveStack.damageMultiplier;

      for (let b = 0; b < count; b++) {
        const angle = baseAngle + (b * Math.PI * 2) / count;
        const bx = this.player.x + Math.cos(angle) * radius;
        const by = this.player.y + Math.sin(angle) * radius;

        // vs 雜兵
        for (const enemy of this.enemies) {
          if (!enemy.isAlive || this.orbitBladeCooldowns.has(enemy.id))
            continue;
          const dist = Math.hypot(bx - enemy.x, by - enemy.y);
          if (dist >= 13 + Math.max(enemy.width, enemy.height) / 2) continue;
          this.applyDamageToEnemy(enemy, dmg);
          this.orbitBladeCooldowns.set(enemy.id, ORBIT_HIT_COOLDOWN);
        }

        // vs Boss
        if (this.boss?.isAlive) {
          const bossId = this.boss.id;
          if (!this.orbitBladeCooldowns.has(bossId)) {
            const dist = Math.hypot(bx - this.boss.x, by - this.boss.y);
            if (dist < 13 + Math.max(this.boss.width, this.boss.height) / 2) {
              this.applyDamageToBoss(dmg);
              this.orbitBladeCooldowns.set(bossId, ORBIT_HIT_COOLDOWN);
            }
          }
        }
      }
    }
  }

  // ===== 子彈 =====

  private updateBullets(dt: number): void {
    for (const b of this.bullets) {
      if (!b.isAlive) continue;
      b.x += b.vx * (dt / 1000);
      b.y += b.vy * (dt / 1000);
      if (
        b.y < -20 ||
        b.y > CANVAS_HEIGHT + 20 ||
        b.x < -20 ||
        b.x > CANVAS_WIDTH + 20
      )
        b.isAlive = false;
    }
  }

  private updateEnemyBullets(dt: number): void {
    for (const b of this.enemyBullets) {
      if (!b.isAlive) continue;
      b.x += b.vx * (dt / 1000);
      b.y += b.vy * (dt / 1000);
      if (
        b.y < -20 ||
        b.y > CANVAS_HEIGHT + 20 ||
        b.x < -20 ||
        b.x > CANVAS_WIDTH + 20
      )
        b.isAlive = false;
    }
  }

  // ===== 敵人 =====

  private updateEnemies(dt: number): void {
    for (const enemy of this.enemies) updateEnemy(enemy, dt);
  }

  // ===== 食人花攻擊 =====

  private updateFlowerAttacks(dt: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.isAlive || enemy.type !== "man_eater_flower") continue;
      if (enemy.stationaryY === undefined) continue; // 尚未到達停滯 Y

      enemy.stationaryTimer = (enemy.stationaryTimer ?? 2000) - dt;
      if (enemy.stationaryTimer <= 0) {
        enemy.stationaryTimer = 2000;
        this.fireFlowerShot(enemy);
      }
    }
  }

  private fireFlowerShot(flower: Enemy): void {
    const angle = Math.atan2(
      this.player.y - flower.y,
      this.player.x - flower.x
    );
    const spread = 20 * (Math.PI / 180);
    const speed = 140;
    for (let i = -1; i <= 1; i++) {
      const a = angle + i * spread;
      this.enemyBullets.push(
        makeEnemyBullet(
          flower.x,
          flower.y,
          Math.cos(a) * speed,
          Math.sin(a) * speed,
          5
        )
      );
    }
  }

  // ===== Boss =====

  private updateBoss(dt: number): void {
    if (!this.boss?.isAlive) return;
    const boss = this.boss;
    boss.phaseTimer += dt;
    const stopY = getBossStopY(boss.type, CANVAS_HEIGHT);

    if (boss.flashTimer && boss.flashTimer > 0) boss.flashTimer -= dt;

    switch (boss.phase) {
      case "PHASE_MOVE": {
        boss.y = Math.min(stopY, boss.y + BOSS_MOVE_SPEED * (dt / 1000));
        if (boss.y >= stopY) {
          boss.phase = boss.armor > 0 ? "PHASE_1" : "PHASE_2";
          boss.phaseTimer = 0;
          boss.attackTimer = boss.type === "dungeon_lord" ? 3000 : 2000;
        }
        break;
      }
      case "PHASE_1": {
        if (boss.type === "dungeon_lord" && boss.armor <= 0) {
          boss.phase = "PHASE_ARMOR_BREAK";
          boss.phaseTimer = 0;
          break;
        }
        // Spider Queen: PHASE_1 → PHASE_2 when HP < 50%
        if (boss.type === "spider_queen" && boss.hp < boss.maxHp * 0.5) {
          boss.phase = "PHASE_2";
          boss.phaseTimer = 0;
          boss.attackTimer = 1200;
          boss.weakPointExposed = true;
          break;
        }
        boss.attackTimer -= dt;
        if (boss.attackTimer <= 0) {
          this.fireBossPhase1Shot();
          boss.attackTimer = boss.type === "dungeon_lord" ? 3000 : 2000;
        }
        break;
      }
      case "PHASE_ARMOR_BREAK": {
        // 地城領主護甲破除動畫 0.5 秒
        if (boss.phaseTimer >= 500) {
          boss.phase = "PHASE_2";
          boss.phaseTimer = 0;
          boss.attackTimer = 1500;
          boss.weakPointExposed = true;
        }
        break;
      }
      case "PHASE_2": {
        // 蜘蛛王 Phase 2：左右移動
        if (boss.type === "spider_queen") {
          boss.x =
            CANVAS_WIDTH / 2 +
            Math.sin(boss.phaseTimer * 0.0008) * (CANVAS_WIDTH * 0.28);
        }
        boss.attackTimer -= dt;
        if (boss.attackTimer <= 0) {
          this.fireBossPhase2Shot();
          boss.attackTimer = boss.type === "dungeon_lord" ? 1500 : 1200;
        }
        break;
      }
    }
  }

  private fireBossPhase1Shot(): void {
    if (!this.boss) return;
    if (this.boss.type === "dungeon_lord") {
      // 橫排 5 顆朝下
      const count = 5;
      for (let i = 0; i < count; i++) {
        const x = (i + 0.5) * (CANVAS_WIDTH / count);
        this.enemyBullets.push(
          makeEnemyBullet(
            x,
            this.boss.y + this.boss.height / 2,
            0,
            180,
            10,
            10,
            "boss_projectile"
          )
        );
      }
    } else {
      // 蜘蛛王 Phase 1：3 向扇形朝玩家
      this.fireBossFanShot(3, 25);
    }
  }

  private fireBossPhase2Shot(): void {
    if (!this.boss) return;
    if (this.boss.type === "dungeon_lord") {
      // 3 顆追蹤玩家的低速彈
      this.fireBossFanShot(3, 15);
    } else {
      // 蜘蛛王 Phase 2：5 向扇形
      this.fireBossFanShot(5, 25);
    }
  }

  private fireBossFanShot(count: number, spreadDeg: number): void {
    if (!this.boss) return;
    const baseAngle = Math.atan2(
      this.player.y - this.boss.y,
      this.player.x - this.boss.x
    );
    const spread = spreadDeg * (Math.PI / 180);
    const speed = 160;
    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (i - (count - 1) / 2) * spread;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      this.enemyBullets.push(
        makeEnemyBullet(
          this.boss.x,
          this.boss.y + this.boss.height / 2,
          vx,
          vy,
          10,
          10,
          "boss_projectile"
        )
      );
    }
  }

  // ===== 碰撞 =====

  private resolveCollisions(): void {
    checkBulletsVsEnemies(this.bullets, this.enemies, (enemy) => {
      this.killEnemy(enemy);
    });
    checkEnemiesVsBase(this.enemies, this.base);
  }

  private killEnemy(enemy: Enemy): void {
    this.soulsEarned += enemy.souls;
    this.totalExp += enemy.exp;
    spawnDeathParticles(this.particles, enemy.x, enemy.y);
    this.checkLevelUp();
    // 史萊姆分裂
    if (enemy.type === "slime") {
      const level = enemy.splitLevel ?? 0;
      if (level < 2) {
        this.enemies.push(
          spawnSlimeSplit(enemy.x - 16, enemy.y, level + 1, this.statsMult)
        );
        this.enemies.push(
          spawnSlimeSplit(enemy.x + 16, enemy.y, level + 1, this.statsMult)
        );
      }
    }
  }

  private applyDamageToEnemy(enemy: Enemy, dmg: number): void {
    if (!enemy.isAlive) return;
    if (enemy.armor > 0) {
      enemy.armor = Math.max(0, enemy.armor - dmg);
    } else {
      enemy.hp -= dmg;
    }
    enemy.flashTimer = 120;
    if (enemy.hp <= 0) {
      enemy.isAlive = false;
      this.killEnemy(enemy);
    }
  }

  private checkBulletsVsBoss(): void {
    if (!this.boss?.isAlive) return;
    const boss = this.boss;
    for (const bullet of this.bullets) {
      if (!bullet.isAlive) continue;
      if (
        bullet.x + bullet.width / 2 < boss.x - boss.width / 2 ||
        bullet.x - bullet.width / 2 > boss.x + boss.width / 2 ||
        bullet.y + bullet.height / 2 < boss.y - boss.height / 2 ||
        bullet.y - bullet.height / 2 > boss.y + boss.height / 2
      )
        continue;

      this.applyDamageToBoss(bullet.damage);
      if (!bullet.piercing) bullet.isAlive = false;
      if (!this.boss?.isAlive) return;
    }
  }

  private applyDamageToBoss(dmg: number): void {
    if (!this.boss?.isAlive) return;
    const boss = this.boss;
    const mult = boss.weakPointExposed ? boss.damageMultiplierWhenExposed : 1;
    if (boss.armor > 0 && !boss.weakPointExposed) {
      boss.armor = Math.max(0, boss.armor - dmg);
    } else {
      boss.hp -= dmg * mult;
    }
    boss.flashTimer = 80;
    if (boss.hp <= 0) {
      boss.isAlive = false;
      this.soulsEarned += boss.souls;
      this.totalExp += boss.exp;
      this.checkLevelUp();
      spawnDeathParticles(this.particles, boss.x, boss.y);
      this.wavesCleared = this.currentWaveIndex + 1;
      this.triggerStageClear();
    }
  }

  private checkEnemyBulletsVsBase(): void {
    for (const b of this.enemyBullets) {
      if (!b.isAlive) continue;
      if (b.y >= BASE_COLLISION_Y) {
        this.base.currentHp = Math.max(0, this.base.currentHp - b.damage);
        b.isAlive = false;
      }
    }
  }

  // ===== EXP / 升級 =====

  private checkLevelUp(): void {
    const newLevel = this.computeLevel(this.totalExp);
    const gained = newLevel - this.playerLevel;
    if (gained > 0) {
      this.playerLevel = newLevel;
      this.pendingSkillSelects += gained;
    }
  }

  private computeLevel(exp: number): number {
    let level = 0,
      cumulative = 0,
      cost = 8;
    while (exp >= cumulative + cost) {
      cumulative += cost;
      cost += 3;
      level++;
    }
    return level;
  }

  private getExpBarProgress(): { current: number; max: number } {
    let cumulative = 0,
      cost = 8;
    while (this.totalExp >= cumulative + cost) {
      cumulative += cost;
      cost += 3;
    }
    return { current: this.totalExp - cumulative, max: cost };
  }

  // ===== 技能選取 =====

  private triggerSkillSelect(): void {
    this.phase = "SKILL_SELECT";
    this.onEvent({
      type: "SKILL_SELECT_NEEDED",
      options: generateSkillOptions(this.player),
    });
  }

  // ===== 清理 =====

  private pruneArrays(): void {
    if (this.bullets.length > 500)
      this.bullets = this.bullets.filter((b) => b.isAlive);
    if (this.enemyBullets.length > 300)
      this.enemyBullets = this.enemyBullets.filter((b) => b.isAlive);
    if (this.enemies.length > 200)
      this.enemies = this.enemies.filter((e) => e.isAlive);
    if (this.particles.length > 400)
      this.particles = this.particles.filter((p) => p.isAlive);
  }

  // ===== 結算 =====

  private triggerGameOver(): void {
    this.phase = "GAME_OVER";
    cancelAnimationFrame(this.rafId);
    this.onEvent({
      type: "RESULT",
      data: {
        outcome: "game_over",
        wavesCleared: this.wavesCleared,
        totalWaves: this.waveTotal,
        soulsEarned: this.soulsEarned,
        stageBonusSouls: 0,
      },
    });
  }

  private triggerStageClear(): void {
    this.phase = "STAGE_CLEAR";
    cancelAnimationFrame(this.rafId);
    this.onEvent({
      type: "RESULT",
      data: {
        outcome: "stage_clear",
        wavesCleared: this.wavesCleared,
        totalWaves: this.waveTotal,
        soulsEarned: this.soulsEarned,
        stageBonusSouls: STAGE_BONUS_SOULS[this.stageId] ?? 0,
      },
    });
  }

  // ===== 渲染 =====

  private render(): void {
    const { current, max } = this.getExpBarProgress();
    renderFrame(
      this.ctx,
      this.player,
      this.base,
      this.bullets,
      this.enemyBullets,
      this.enemies,
      this.particles,
      this.boss,
      this.currentWaveIndex + 1,
      this.waveTotal,
      current,
      max,
      this.stage?.backgroundTheme ?? "graveyard",
      this.phase,
      this.waveTransitionMessage
    );
  }
}
