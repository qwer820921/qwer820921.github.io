/**
 * EnemyEntity.ts
 * 敵人實體（地面折線運動 vs 飛行直線、阻擋近戰攻擊、多來源減速、文士塔疊加減速、灼燒、暈眩、受傷死亡）
 * 100% 精準對齊原版 Enemy.gd 邏輯與回歸測試保護
 */

import { WorldCoord, GameMap } from "../GameMap";
import { FloatingTextManager } from "../FloatingTextManager";
import { SoundManager } from "../SoundManager";

export interface EnemyConfigData {
  enemy_id: string;
  name?: string;
  hp?: number;
  speed?: number;
  movement_type?: string;
  atk?: unknown;
  trait?: unknown;
  image?: string;
  attack_image?: string;
}

export class EnemyEntity {
  public id: string;
  public enemyId: string;
  public name: string;
  public spawnSeq: number;

  public maxHp: number;
  public currentHp: number;
  public baseSpeed: number; // 像素/秒

  public movementType: "ground" | "flying";
  public blockerAtk: number;
  public immuneSlow: boolean;

  public x = 0;
  public y = 0;
  public radius = 17;

  public textureKey = "";
  public attackTextureKey = "";
  public isDead = false;

  // 動畫與閃爍
  public flashTimer = 0.0;
  public isFighting = false;

  // 路徑導航
  private waypoints: WorldCoord[] = [];
  private wpIndex = 1;
  private tail: number[] = [];
  private flightLen = 0.0;

  // 倍率減速 (武將阻擋, 步兵塔, 關羽光環)
  private slowSources = new Map<string, { mult: number; left: number }>();
  public speedMult = 1.0;

  // 文士塔疊加減速
  private stackSlowAmount = 0.0;
  private stackSlowTimer = 0.0;

  // 威壓光環 (顏良)
  private atkDownSources = new Map<string, { mult: number; left: number }>();
  public atkMult = 1.0;

  // 灼燒 (周瑜)
  private burnTicksLeft = 0;
  private burnDamage = 0.0;
  private burnInterval = 1.0;
  private burnTimer = 0.0;

  // 暈眩 (張飛)
  private stunLeft = 0.0;
  public stunAngle = 0.0;

  // 阻路戰鬥
  public blocker: any = null; // HeroEntity
  private blockerAtkTimer = 0.0;
  public blockerAttacksCount = 0;

  public bodyColor = "rgb(204, 51, 51)";

  public get enemyName(): string {
    return this.name;
  }

  public isSlowed(): boolean {
    return this.speedMult < 1.0 || this.stackSlowAmount > 0;
  }

  // 回調通知
  public onDied?: (enemy: EnemyEntity) => void;
  public onReachedBase?: (enemy: EnemyEntity) => void;

  constructor(
    id: string,
    spawnSeq: number,
    cfg: EnemyConfigData,
    waypoints: WorldCoord[],
    tileSize = 48
  ) {
    this.id = id;
    this.spawnSeq = spawnSeq;
    this.enemyId = String(cfg.enemy_id || "soldier");
    this.name = String(cfg.name || "兵");

    this.maxHp = Number(cfg.hp) > 0 ? Number(cfg.hp) : 100;
    this.currentHp = this.maxHp;
    this.baseSpeed = Number(cfg.speed) > 0 ? Number(cfg.speed) : 80; // 預設 80px/s

    this.movementType =
      String(cfg.movement_type || "").trim() === "flying" ? "flying" : "ground";

    // 阻擋攻擊力：預設 20.0
    const rawAtk = cfg.atk;
    if (typeof rawAtk === "number" && Number.isFinite(rawAtk) && rawAtk >= 0) {
      this.blockerAtk = rawAtk;
    } else {
      this.blockerAtk = 20.0;
    }

    // 免疫減速
    const rawTrait = cfg.trait;
    this.immuneSlow =
      typeof rawTrait === "string" && rawTrait.trim() === "immune_slow";

    this.radius = Math.max(8, Math.floor(tileSize * 0.35));

    // 貼圖
    if (cfg.image) this.textureKey = String(cfg.image);
    if (cfg.attack_image) {
      this.attackTextureKey = String(cfg.attack_image);
    } else if (this.textureKey) {
      this.attackTextureKey = this.textureKey.replace(".webp", "_atk.webp");
    }

    // 飛行怪只取起點與終點
    if (this.isFlying() && waypoints.length >= 2) {
      this.waypoints = [waypoints[0], waypoints[waypoints.length - 1]];
    } else {
      this.waypoints = [...waypoints];
    }

    this.wpIndex = 1;
    this.buildTail();

    if (this.waypoints.length > 0) {
      this.x = this.waypoints[0].x;
      this.y = this.waypoints[0].y;
    }
  }

  private buildTail(): void {
    const n = this.waypoints.length;
    this.tail = new Array(n).fill(0);
    let acc = 0.0;
    for (let i = n - 2; i >= 0; i--) {
      const dx = this.waypoints[i].x - this.waypoints[i + 1].x;
      const dy = this.waypoints[i].y - this.waypoints[i + 1].y;
      acc += Math.hypot(dx, dy);
      this.tail[i] = acc;
    }
    this.flightLen = acc;
  }

  public isFlying(): boolean {
    return this.movementType === "flying";
  }

  public getRemainingDistance(): number {
    if (this.wpIndex >= this.waypoints.length || this.tail.length !== this.waypoints.length) {
      return 0.0;
    }
    const target = this.waypoints[this.wpIndex];
    const distToNext = Math.hypot(target.x - this.x, target.y - this.y);
    return distToNext + (this.tail[this.wpIndex] || 0.0);
  }

  public getProgressRatio(): number {
    if (this.isFlying()) {
      if (this.flightLen <= 0.001) return 1.0;
      return Math.max(0, Math.min(1.0, 1.0 - this.getRemainingDistance() / this.flightLen));
    }
    return Math.min(1.0, this.wpIndex / Math.max(1, this.waypoints.length));
  }

  public update(
    delta: number,
    gameMap: GameMap,
    floatingTexts: FloatingTextManager,
    soundMgr: SoundManager
  ): void {
    if (this.isDead || this.waypoints.length === 0) return;

    delta = Math.min(delta, 0.1);

    // 閃爍計時
    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
    }

    // 減速計時與倒數
    this.tickSlowSources(delta);
    if (this.stackSlowTimer > 0) {
      this.stackSlowTimer -= delta;
      if (this.stackSlowTimer <= 0) {
        this.stackSlowAmount = 0.0;
      }
    }

    // 威壓計時
    this.tickAtkDownSources(delta);

    // 灼燒處理
    if (this.burnTicksLeft > 0) {
      this.burnTimer -= delta;
      while (this.burnTicksLeft > 0 && this.burnTimer <= 0 && !this.isDead) {
        this.burnTicksLeft--;
        this.burnTimer += this.burnInterval;
        this.takeDamage(this.burnDamage, true, false, floatingTexts, soundMgr);
      }
      if (this.isDead) return;
    }

    // 抵達基地判定
    if (this.wpIndex >= this.waypoints.length) {
      this.onReachedBase?.(this);
      this.isDead = true;
      return;
    }

    // 檢查阻擋者是否失效或移位
    if (
      this.blocker &&
      (this.blocker.isDead ||
        this.blocker.currentHp <= 0 ||
        !this.isBlockerOnMyWay(gameMap, this.blocker))
    ) {
      this.blocker = null;
      this.isFighting = false;
    }

    // 暈眩狀態判定
    if (this.stunLeft > 0) {
      this.stunLeft -= delta;
      this.stunAngle += delta * 6.0;
      this.blockerAtkTimer = Math.max(0, this.blockerAtkTimer - delta);
      if (this.stunLeft <= 1e-6) {
        this.stunLeft = 0;
      }
      return; // 暈眩中停止移動與攻擊
    }

    // 正在被武將阻擋：進行近戰搏鬥
    if (this.blocker) {
      this.isFighting = true;
      const wasReady = this.blockerAtkTimer <= 0;
      this.blockerAtkTimer -= delta;

      if (this.blockerAtkTimer <= 0) {
        this.blockerAttacksCount++;
        const hitAtk = this.blockerAtk * this.atkMult;

        // 呼叫武將受傷（可能引發反擊或反傷倒地）
        this.blocker.takeDamage(hitAtk, this, floatingTexts, soundMgr);
        if (this.isDead) return;

        // 副步長保留
        const late = wasReady ? 0 : -this.blockerAtkTimer;
        this.blockerAtkTimer = 1.0 - (late < 1.0 ? late : 0);
      }
      return;
    }

    // 未被阻擋：攻擊冷卻衰減至 0
    this.isFighting = false;
    this.blockerAtkTimer = Math.max(0, this.blockerAtkTimer - delta);

    // 檢查前方是否有地面武將阻路（飛行怪不受阻擋）
    if (!this.isFlying()) {
      const curCell = gameMap.worldToGrid(this.x, this.y);
      const nextCell = gameMap.worldToGrid(
        this.waypoints[this.wpIndex].x,
        this.waypoints[this.wpIndex].y
      );

      for (const checkCell of [curCell, nextCell]) {
        const occ = gameMap.getOccupant(checkCell.col, checkCell.row);
        if (occ && occ.isHero && !occ.isDead && occ.currentHp > 0 && occ.isOnRoad) {
          this.blocker = occ;
          this.isFighting = true;
          return;
        }
      }
    }

    // 移動物理
    const target = this.waypoints[this.wpIndex];
    const effectiveSpeed = this.getEffectiveSpeed();
    const moveDist = effectiveSpeed * delta;

    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distToTarget = Math.hypot(dx, dy);

    if (distToTarget <= moveDist) {
      this.x = target.x;
      this.y = target.y;
      this.wpIndex++;
    } else {
      this.x += (dx / distToTarget) * moveDist;
      this.y += (dy / distToTarget) * moveDist;
    }
  }

  private isBlockerOnMyWay(gameMap: GameMap, blocker: any): boolean {
    const bCell = blocker.gridCell;
    const curCell = gameMap.worldToGrid(this.x, this.y);
    const nextCell = gameMap.worldToGrid(
      this.waypoints[this.wpIndex]?.x ?? this.x,
      this.waypoints[this.wpIndex]?.y ?? this.y
    );
    return (
      (bCell.col === curCell.col && bCell.row === curCell.row) ||
      (bCell.col === nextCell.col && bCell.row === nextCell.row)
    );
  }

  public getEffectiveSpeed(): number {
    const minSpeed = this.baseSpeed * 0.15;
    const currentSpeed =
      this.baseSpeed * this.speedMult * Math.max(0, 1.0 - this.stackSlowAmount);
    return Math.max(minSpeed, currentSpeed);
  }

  public takeDamage(
    amount: number,
    isBurn = false,
    isCounter = false,
    floatingTexts?: FloatingTextManager,
    soundMgr?: SoundManager
  ): number {
    if (this.isDead || !Number.isFinite(amount) || amount <= 0) {
      return 0.0;
    }

    const dealt = Math.min(amount, Math.max(0, this.currentHp));
    this.currentHp -= amount;
    this.flashTimer = 0.12;

    // 飄字
    if (floatingTexts) {
      if (isBurn) {
        floatingTexts.spawn(
          Math.round(amount).toString(),
          FloatingTextManager.COLOR_BURN,
          this.x,
          this.y - 12
        );
      } else if (isCounter) {
        floatingTexts.spawn(
          Math.round(amount).toString(),
          FloatingTextManager.COLOR_COUNTER,
          this.x,
          this.y + 10
        );
      } else {
        floatingTexts.spawn(
          Math.round(amount).toString(),
          FloatingTextManager.COLOR_DAMAGE_ENEMY,
          this.x,
          this.y
        );
      }
    }

    if (this.currentHp <= 0) {
      this.currentHp = 0;
      this.isDead = true;
      soundMgr?.play("enemy_die");
      this.onDied?.(this);
    } else if (!isBurn) {
      soundMgr?.play("enemy_hit");
    }

    return dealt;
  }

  public applySlowFrom(source: string, mult: number, duration: number): void {
    if (this.immuneSlow || this.isDead || !source) return;
    if (!Number.isFinite(mult) || mult <= 0 || mult >= 1 || !Number.isFinite(duration) || duration <= 0) {
      return;
    }
    this.slowSources.set(source, { mult, left: duration });
    this.refreshSpeedMult();
  }

  public removeSlowFrom(source: string): void {
    if (this.slowSources.delete(source)) {
      this.refreshSpeedMult();
    }
  }

  public hasSlowFrom(source: string): boolean {
    return this.slowSources.has(source);
  }

  private refreshSpeedMult(): void {
    let minM = 1.0;
    for (const s of this.slowSources.values()) {
      if (s.mult < minM) minM = s.mult;
    }
    this.speedMult = minM;
  }

  private tickSlowSources(delta: number): void {
    if (this.slowSources.size === 0) return;
    let expired = false;
    for (const [key, s] of this.slowSources.entries()) {
      s.left -= delta;
      if (s.left <= 0) {
        this.slowSources.delete(key);
        expired = true;
      }
    }
    if (expired) {
      this.refreshSpeedMult();
    }
  }

  public applyStackableSlow(
    amount: number,
    duration: number,
    floatingTexts?: FloatingTextManager
  ): void {
    if (this.immuneSlow || this.isDead) return;
    this.stackSlowAmount = Math.min(0.85, this.stackSlowAmount + amount);
    this.stackSlowTimer = duration;

    floatingTexts?.spawn("緩", FloatingTextManager.COLOR_SLOW, this.x, this.y - 10);
  }

  public applyAtkDownFrom(source: string, mult: number, duration: number): void {
    if (this.isDead || !source) return;
    if (!Number.isFinite(mult) || mult <= 0 || mult >= 1 || !Number.isFinite(duration) || duration <= 0) {
      return;
    }
    this.atkDownSources.set(source, { mult, left: duration });
    this.refreshAtkMult();
  }

  public removeAtkDownFrom(source: string): void {
    if (this.atkDownSources.delete(source)) {
      this.refreshAtkMult();
    }
  }

  public hasAtkDownFrom(source: string): boolean {
    return this.atkDownSources.has(source);
  }

  private refreshAtkMult(): void {
    let minM = 1.0;
    for (const s of this.atkDownSources.values()) {
      if (s.mult < minM) minM = s.mult;
    }
    this.atkMult = minM;
  }

  private tickAtkDownSources(delta: number): void {
    if (this.atkDownSources.size === 0) return;
    let expired = false;
    for (const [key, s] of this.atkDownSources.entries()) {
      s.left -= delta;
      if (s.left <= 0) {
        this.atkDownSources.delete(key);
        expired = true;
      }
    }
    if (expired) {
      this.refreshAtkMult();
    }
  }

  public applyBurn(damage: number, ticks: number, interval: number): void {
    if (this.isDead || ticks <= 0 || damage <= 0 || interval <= 0) return;
    if (this.burnTicksLeft <= 0) {
      this.burnInterval = interval;
      this.burnTimer = interval;
    }
    this.burnTicksLeft = ticks;
    this.burnDamage = damage;
  }

  public isBurning(): boolean {
    return this.burnTicksLeft > 0 && !this.isDead;
  }

  public applyStun(duration: number): boolean {
    if (this.isDead || !Number.isFinite(duration) || duration <= 0) return false;
    this.stunLeft = Math.max(this.stunLeft, duration);
    return true;
  }

  public isStunned(): boolean {
    return this.stunLeft > 0 && !this.isDead;
  }
}
