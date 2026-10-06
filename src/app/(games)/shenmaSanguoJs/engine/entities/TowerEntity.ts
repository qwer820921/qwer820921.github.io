/**
 * TowerEntity.ts
 * 防禦塔實體（5種塔類型、數值成長、索敵優先、拆除退費 50%、步兵塔光環、砲兵群傷、文士疊加）
 * 100% 精準對齊原版 Tower.gd 邏輯與回歸測試保護
 */

import { GridCoord } from "../GameMap";
import { EnemyEntity } from "./EnemyEntity";
import { FloatingTextManager } from "../FloatingTextManager";
import { SoundManager } from "../SoundManager";

export interface TowerConfigInfo {
  typeKey: string;
  name: string;
  atk: number;
  atkSpd: number;
  rangeTiles: number;
  cost: number;
  upgradeBase: number;
  color: string;
  aoe: boolean;
  aoeRadius?: number;
  slowMult?: number;
  stackSlowAmount?: number;
  antiAir: boolean;
  image?: string;
  attackImage?: string;
  scale?: number;
}

export const TOWER_CONFIGS: Record<string, TowerConfigInfo> = {
  archer: {
    typeKey: "archer",
    name: "弓兵塔",
    atk: 30.0,
    atkSpd: 0.8,
    rangeTiles: 2.5,
    cost: 50,
    upgradeBase: 50,
    color: "rgb(51, 166, 51)",
    aoe: false,
    antiAir: true,
    image: "tower_archer.webp",
    attackImage: "tower_archer_attack.webp",
  },
  infantry: {
    typeKey: "infantry",
    name: "步兵塔",
    atk: 20.0,
    atkSpd: 1.5,
    rangeTiles: 1.5,
    cost: 70,
    upgradeBase: 60,
    color: "rgb(153, 51, 51)",
    aoe: false,
    slowMult: 0.55,
    antiAir: false,
    image: "tower_infantry.webp",
    attackImage: "tower_infantry_attack.webp",
  },
  artillery: {
    typeKey: "artillery",
    name: "砲兵塔",
    atk: 80.0,
    atkSpd: 3.0,
    rangeTiles: 2.0,
    cost: 100,
    upgradeBase: 80,
    color: "rgb(153, 115, 26)",
    aoe: true,
    aoeRadius: 80.0,
    antiAir: false,
    image: "tower_artillery.webp",
    attackImage: "tower_artillery_attack.webp",
  },
  cavalry: {
    typeKey: "cavalry",
    name: "騎兵塔",
    atk: 50.0,
    atkSpd: 1.2,
    rangeTiles: 1.8,
    cost: 120,
    upgradeBase: 70,
    color: "rgb(140, 64, 166)",
    aoe: false,
    antiAir: false,
    image: "tower_cavalry.webp",
    attackImage: "tower_cavalry_attack.webp",
  },
  scholar: {
    typeKey: "scholar",
    name: "文士塔",
    atk: 0.0,
    atkSpd: 1.2,
    rangeTiles: 2.5,
    cost: 80,
    upgradeBase: 75,
    color: "rgb(51, 128, 166)",
    aoe: false,
    stackSlowAmount: 0.05,
    antiAir: true,
    image: "tower_scholar.webp",
    attackImage: "tower_scholar_atk.webp",
  },
};

export class TowerEntity {
  public towerUid: string;
  public towerTypeKey: string;
  public towerName: string;
  public towerLevel: number = 1;

  public gridCell: GridCoord;
  public x = 0;
  public y = 0;
  public tileSize = 48;

  public atk: number;
  public atkSpd: number; // 秒 / 次
  public rangeTiles: number;
  public upgradeCostBase: number;

  public isAoe: boolean;
  public aoeRadius: number;
  public slowMult: number;
  public stackSlowAmount: number;
  public canHitAir: boolean;

  public bodyColor: string;
  public textureKey = "";
  public attackTextureKey = "";

  public isAttacking = false;
  public isSelected = false;
  private animTimer = 0.0;
  private atkTimer = 0.0;

  // 索敵優先
  public targetMode = "first"; // "first" | "strongest" | "weakest" | "air_first"

  // 拆除與投資
  public investedGold = 0;
  public sold = false;

  // 步兵塔緩速光環來源識別
  public slowSource: string;
  private auraSlowed = new Set<EnemyEntity>();

  constructor(
    towerUid: string,
    typeKey: string,
    cell: GridCoord,
    worldPos: { x: number; y: number },
    tileSize = 48
  ) {
    this.towerUid = towerUid;
    this.towerTypeKey = typeKey;
    this.gridCell = { ...cell };
    this.x = worldPos.x;
    this.y = worldPos.y;
    this.tileSize = tileSize;
    this.slowSource = `tower_aura#${towerUid}`;

    const cfg = TOWER_CONFIGS[typeKey] || TOWER_CONFIGS.archer;
    this.towerName = cfg.name;
    this.atk = cfg.atk;
    this.atkSpd = cfg.atkSpd;
    this.rangeTiles = cfg.rangeTiles;
    this.upgradeCostBase = cfg.upgradeBase;
    this.isAoe = cfg.aoe;
    this.aoeRadius = cfg.aoeRadius || 0;
    this.slowMult = cfg.slowMult || 1.0;
    this.stackSlowAmount = cfg.stackSlowAmount || 0.0;
    this.canHitAir = cfg.antiAir;
    this.bodyColor = cfg.color;

    if (cfg.image) this.textureKey = cfg.image;
    if (cfg.attackImage) this.attackTextureKey = cfg.attackImage;
  }

  public getUpgradeCost(): number {
    if (this.towerLevel >= 5) return 0;
    return this.upgradeCostBase * this.towerLevel;
  }

  public canUpgrade(): boolean {
    return this.towerLevel < 5;
  }

  public applyUpgrade(): void {
    if (!this.canUpgrade()) return;
    this.towerLevel++;

    if (this.towerTypeKey === "scholar") {
      this.stackSlowAmount += 0.02; // +2% 疊加
      this.atkSpd *= 0.95; // 攻速間隔縮短 5%
      this.rangeTiles += 0.2;
    } else {
      this.atk *= 1.2; // 攻擊力 +20%
      this.atkSpd *= 0.92; // 間隔縮短 8%
      this.rangeTiles += 0.2;
    }
  }

  public addInvestment(amount: number): void {
    if (amount > 0) {
      this.investedGold += amount;
    }
  }

  public getSellRefund(isPrep = false): number {
    return isPrep ? this.investedGold : Math.floor(this.investedGold * 0.5);
  }

  public upgrade(): void {
    const cost = this.getUpgradeCost();
    this.addInvestment(cost);
    this.applyUpgrade();
  }

  public sell(): void {
    this.destroy();
  }

  public getTargetModes(): string[] {
    const list = ["first", "strongest", "weakest"];
    if (this.canHitAir) {
      list.push("air_first");
    }
    return list;
  }

  public setTargetMode(mode: string): boolean {
    if (!this.getTargetModes().includes(mode)) return false;
    this.targetMode = mode;
    return true;
  }

  public canTarget(e: EnemyEntity): boolean {
    return this.canHitAir || !e.isFlying();
  }

  public update(
    delta: number,
    enemies: EnemyEntity[],
    floatingTexts: FloatingTextManager,
    soundMgr: SoundManager
  ): void {
    if (this.sold) return;

    // 步兵塔緩速光環每一幀刷新
    if (this.slowMult < 1.0 && this.towerTypeKey === "infantry") {
      this.updateSlowAura(enemies);
    }

    const wasReady = this.atkTimer <= 0.0;
    this.atkTimer -= delta;

    if (this.animTimer > 0.0) {
      this.animTimer -= delta;
      if (this.animTimer <= 0.0) {
        this.isAttacking = false;
      }
    }

    if (this.atkTimer > 0.0) return;

    const rangePx = this.rangeTiles * this.tileSize;
    const target = this.findTarget(enemies, rangePx);

    if (!target) {
      this.atkTimer = 0.0; // 待命
      return;
    }

    // 發動攻擊
    if (this.isAoe) {
      this.attackAoe(target, enemies, floatingTexts, soundMgr);
    } else if (this.towerTypeKey === "scholar") {
      target.applyStackableSlow(this.stackSlowAmount, 3.5, floatingTexts);
    } else {
      target.takeDamage(this.atk, false, false, floatingTexts, soundMgr);
    }

    this.isAttacking = true;
    this.animTimer = 0.22;

    const late = wasReady ? 0.0 : -this.atkTimer;
    this.atkTimer = this.atkSpd - (late < this.atkSpd ? late : 0.0);
    soundMgr.play("tower_shoot");
  }

  private findTarget(enemies: EnemyEntity[], rangePx: number): EnemyEntity | null {
    let best: EnemyEntity | null = null;
    for (const e of enemies) {
      if (e.isDead || !this.canTarget(e)) continue;
      const dist = Math.hypot(e.x - this.x, e.y - this.y);
      if (dist > rangePx) continue;

      if (!best || this.isBetterTarget(e, best)) {
        best = e;
      }
    }
    return best;
  }

  private isBetterTarget(a: EnemyEntity, b: EnemyEntity): boolean {
    switch (this.targetMode) {
      case "strongest":
        if (Math.abs(a.currentHp - b.currentHp) > 0.001) {
          return a.currentHp > b.currentHp;
        }
        break;
      case "weakest":
        if (Math.abs(a.currentHp - b.currentHp) > 0.001) {
          return a.currentHp < b.currentHp;
        }
        break;
      case "air_first":
        if (a.isFlying() !== b.isFlying()) {
          return a.isFlying();
        }
        break;
    }
    return a.getRemainingDistance() < b.getRemainingDistance() - 0.001;
  }

  private attackAoe(
    primary: EnemyEntity,
    enemies: EnemyEntity[],
    floatingTexts: FloatingTextManager,
    soundMgr: SoundManager
  ): void {
    for (const e of enemies) {
      if (e.isDead || !this.canTarget(e)) continue;
      const dist = Math.hypot(e.x - primary.x, e.y - primary.y);
      if (dist <= this.aoeRadius) {
        e.takeDamage(this.atk, false, false, floatingTexts, soundMgr);
      }
    }
  }

  private updateSlowAura(enemies: EnemyEntity[]): void {
    const rangePx = this.rangeTiles * this.tileSize;
    const currentNearby = new Set<EnemyEntity>();

    for (const e of enemies) {
      if (e.isDead || e.isFlying()) continue;
      const dist = Math.hypot(e.x - this.x, e.y - this.y);
      if (dist <= rangePx) {
        e.applySlowFrom(this.slowSource, this.slowMult, 0.5);
        if (e.hasSlowFrom(this.slowSource)) {
          currentNearby.add(e);
        }
      }
    }

    // 離開射程者撤除
    for (const e of this.auraSlowed) {
      if (!currentNearby.has(e)) {
        e.removeSlowFrom(this.slowSource);
      }
    }
    this.auraSlowed = currentNearby;
  }

  public destroy(): void {
    this.sold = true;
    for (const e of this.auraSlowed) {
      e.removeSlowFrom(this.slowSource);
    }
    this.auraSlowed.clear();
  }

  public reposition(cell: GridCoord, worldPos: { x: number; y: number }): void {
    this.gridCell = { ...cell };
    this.x = worldPos.x;
    this.y = worldPos.y;
  }
}
