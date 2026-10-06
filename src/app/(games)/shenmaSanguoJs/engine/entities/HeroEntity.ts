/**
 * HeroEntity.ts
 * 武將實體（13種三國武將技能、光環疊加、職業對空、普攻判定、阻擋緩速、受傷反擊、堅韌與吸血）
 * 100% 精準對齊原版 Hero.gd 邏輯與回歸測試保護
 */

import { GridCoord } from "../GameMap";
import { EnemyEntity } from "./EnemyEntity";
import { FloatingTextManager } from "../FloatingTextManager";
import { SoundManager } from "../SoundManager";

export interface HeroStateData {
  hero_id: string;
  level?: number;
  star?: number;
  atk?: number;
  def?: number;
  hp?: number;
  slot?: number;
  skill?: any;
}

export interface HeroConfigData {
  hero_id: string;
  name?: string;
  job?: string;
  attack_range?: number;
  attack_speed?: number;
  atk_growth?: number;
  def_growth?: number;
  hp_growth?: number;
  range_growth?: number;
  atk_spd_growth?: number;
  speed_growth?: number;
  image?: string;
  attack_image?: string;
}

export const HERO_FALLBACK_INFO: Record<
  string,
  { name: string; job: string; image: string; attackImage: string }
> = {
  ma_chao: { name: "馬超", job: "cavalry", image: "hero_ma_chao.webp", attackImage: "hero_ma_chao_atk.webp" },
  zhao_yun: { name: "趙雲", job: "infantry", image: "hero_zhao_yun.webp", attackImage: "hero_zhao_yun_atk.webp" },
  huang_zhong: { name: "黃忠", job: "archer", image: "hero_huang_zhong.webp", attackImage: "hero_huang_zhong_atk.webp" },
  zhou_yu: { name: "周瑜", job: "mage", image: "hero_zhou_yu.webp", attackImage: "hero_zhou_yu_atk.webp" },
  guan_yu: { name: "關羽", job: "cavalry", image: "hero_guan_yu.webp", attackImage: "hero_guan_yu_atk.webp" },
  liu_bei: { name: "劉備", job: "infantry", image: "hero_liu_bei.webp", attackImage: "hero_liu_bei_atk.webp" },
  zhang_fei: { name: "張飛", job: "infantry", image: "hero_zhang_fei.webp", attackImage: "hero_zhang_fei_atk.webp" },
  wei_yan: { name: "魏延", job: "infantry", image: "hero_wei_yan.webp", attackImage: "hero_wei_yan_atk.webp" },
  cao_cao: { name: "曹操", job: "cavalry", image: "hero_cao_cao.webp", attackImage: "hero_cao_cao_atk.webp" },
  xia_hou_dun: { name: "夏侯惇", job: "infantry", image: "hero_xia_hou_dun.webp", attackImage: "hero_xia_hou_dun_atk.webp" },
  liao_hua: { name: "廖化", job: "infantry", image: "hero_liao_hua.webp", attackImage: "hero_liao_hua_atk.webp" },
  yan_liang: { name: "顏良", job: "cavalry", image: "hero_yan_liang.webp", attackImage: "hero_yan_liang_atk.webp" },
  sun_shang_xiang: { name: "孫尚香", job: "archer", image: "hero_sun_shang_xiang.webp", attackImage: "hero_sun_shang_xiang_atk.webp" },
  lv_bu: { name: "呂布", job: "cavalry", image: "hero_lv_bu.webp", attackImage: "hero_lv_bu_atk.webp" },
  diao_chan: { name: "貂蟬", job: "mage", image: "hero_diao_chan.webp", attackImage: "hero_diao_chan_atk.webp" },
  zhu_ge_liang: { name: "諸葛亮", job: "mage", image: "hero_zhu_ge_liang.webp", attackImage: "hero_zhu_ge_liang_atk.webp" },
  dian_wei: { name: "典韋", job: "infantry", image: "hero_dian_wei.webp", attackImage: "hero_dian_wei_atk.webp" },
  sun_quan: { name: "孫權", job: "cavalry", image: "hero_sun_quan.webp", attackImage: "hero_sun_quan_atk.webp" },
  gan_ning: { name: "甘寧", job: "cavalry", image: "hero_gan_ning.webp", attackImage: "hero_gan_ning_atk.webp" },
  xu_chu: { name: "許褚", job: "infantry", image: "hero_xu_chu.webp", attackImage: "hero_xu_chu_atk.webp" },
  pang_tong: { name: "龐統", job: "mage", image: "hero_pang_tong.webp", attackImage: "hero_pang_tong_atk.webp" },
  lu_su: { name: "魯肅", job: "mage", image: "hero_lu_su.webp", attackImage: "hero_lu_su_atk.webp" },
  zhou_cang: { name: "周倉", job: "infantry", image: "hero_zhou_cang.webp", attackImage: "hero_zhou_cang_atk.webp" },
};

export class HeroEntity {
  public isHero = true;
  public heroId: string;
  public heroName: string;
  public heroLevel = 1;

  public gridCell: GridCoord;
  public x = 0;
  public y = 0;
  public tileSize = 48;
  public heroHalf = 16;
  public isOnRoad = false;

  public atk = 100.0;
  public defStat = 50.0;
  public maxHp = 1000.0;
  public currentHp = 1000.0;
  public attackRange = 2.0; // 格數
  public attackSpeed = 1.0; // 秒 / 次

  public job = "infantry";
  public canHitAir = false;
  public static readonly AIR_JOBS = ["archer", "mage"];

  public bodyColor = "rgb(51, 102, 204)";
  public textureKey = "";
  public attackTextureKey = "";

  public isAttacking = false;
  public isSelected = false;
  public isDead = false;
  private animTimer = 0.0;
  private atkTimer = 0.0;
  public attackCount = 0;

  // 13 大技能參數
  public firstStrikeMultiplier = 1.0;
  public rangeMultiplier = 1.0;
  public burnRatio = 0.0;
  public burnTicks = 0;
  public burnInterval = 1.0;
  public slowAuraMult = 1.0;
  public dodgeChance = 0.0;
  public defAuraMult = 1.0;
  public stunDuration = 0.0;
  public lifestealRatio = 0.0;
  public atkSpeedAuraMult = 1.0;
  public counterRatio = 0.0;
  public tenacityHpRatio = 0.0;
  public tenacityDamageMult = 1.0;
  public atkDownAuraMult = 1.0;
  public doubleShotChance = 0.0;

  // 光環來源識別
  public slowSource: string;
  public auraSource: string;
  public defAuraSource: string;
  public atkSpeedAuraSource: string;
  public atkDownAuraSource: string;

  // 受到的光環加成
  private defSources = new Map<string, { mult: number; left: number }>();
  public defBonusMult = 1.0;

  private atkSpeedSources = new Map<string, { mult: number; left: number }>();
  public atkSpeedBonusMult = 1.0;

  // 當前施加之光環目標集合
  private roadSlowed = new Set<EnemyEntity>();
  private auraSlowed = new Set<EnemyEntity>();
  private defBuffed = new Set<HeroEntity>();
  private atkSpeedBuffed = new Set<HeroEntity>();
  private atkDowned = new Set<EnemyEntity>();

  // 回調通知
  public onHeroDied?: (hero: HeroEntity) => void;

  constructor(
    state: HeroStateData,
    heroesConfig: HeroConfigData[],
    cell: GridCoord,
    worldPos: { x: number; y: number },
    onRoad: boolean,
    tileSize = 48
  ) {
    this.heroId = String(state.hero_id || "");
    this.heroLevel = Number(state.level) || 1;
    this.gridCell = { ...cell };
    this.x = worldPos.x;
    this.y = worldPos.y;
    this.isOnRoad = onRoad;
    this.tileSize = tileSize;
    this.heroHalf = Math.max(10, Math.floor(tileSize * 0.46));

    const instanceId = Math.floor(Math.random() * 1000000);
    this.slowSource = `hero_road#${instanceId}`;
    this.auraSource = `hero_aura#${instanceId}`;
    this.defAuraSource = `hero_def_aura#${instanceId}`;
    this.atkSpeedAuraSource = `hero_atk_speed_aura#${instanceId}`;
    this.atkDownAuraSource = `hero_atk_down_aura#${instanceId}`;

    this.currentHp = Number(state.hp) > 0 ? Number(state.hp) : 1000;
    this.maxHp = this.currentHp;
    this.atk = Number(state.atk) > 0 ? Number(state.atk) : 100;
    this.defStat = Number(state.def) >= 0 ? Number(state.def) : 50;

    this.readSkill(state);

    // 正規化英雄 ID 匹配（兼顧 'ma_chao' 與 'hero_ma_chao'）
    const normalizeHeroId = (id: string) => String(id || "").replace(/^hero_/, "");
    const targetKey = normalizeHeroId(this.heroId);
    const cfg = heroesConfig.find((c) => normalizeHeroId(c.hero_id) === targetKey);
    const fallback = HERO_FALLBACK_INFO[targetKey];

    if (cfg) {
      this.heroName = cfg.name || fallback?.name || targetKey;
      this.job = String(cfg.job || fallback?.job || "infantry");
      this.canHitAir = HeroEntity.AIR_JOBS.includes(this.job);

      const baseRange = Number(cfg.attack_range) || 2.0;
      const rangeGrowth = Number(cfg.range_growth) || 0.0;
      this.attackRange = (baseRange + (this.heroLevel - 1) * rangeGrowth) * this.rangeMultiplier;

      const baseSpd = Number(cfg.attack_speed) || 1.0;
      const spdGrowth = Number(cfg.atk_spd_growth ?? cfg.speed_growth ?? 0);
      this.attackSpeed = Math.max(0.1, baseSpd * (1.0 - (this.heroLevel - 1) * spdGrowth));

      this.textureKey = cfg.image || fallback?.image || `hero_${targetKey}.webp`;
      this.attackTextureKey = cfg.attack_image || fallback?.attackImage || `hero_${targetKey}_atk.webp`;
    } else if (fallback) {
      this.heroName = fallback.name;
      this.job = fallback.job;
      this.canHitAir = HeroEntity.AIR_JOBS.includes(this.job);
      this.textureKey = fallback.image;
      this.attackTextureKey = fallback.attackImage;
    } else {
      this.heroName = targetKey;
      this.textureKey = `hero_${targetKey}.webp`;
      this.attackTextureKey = `hero_${targetKey}_atk.webp`;
    }

    if (!this.textureKey.endsWith(".webp")) {
      this.textureKey = `${this.textureKey}.webp`;
    }
    if (!this.attackTextureKey.endsWith(".webp")) {
      this.attackTextureKey = `${this.attackTextureKey}.webp`;
    }

    switch (this.job) {
      case "infantry":
        this.bodyColor = "rgb(166, 51, 51)";
        break;
      case "archer":
        this.bodyColor = "rgb(51, 166, 51)";
        break;
      case "artillery":
        this.bodyColor = "rgb(166, 128, 26)";
        break;
      case "cavalry":
        this.bodyColor = "rgb(51, 102, 204)";
        break;
      case "mage":
        this.bodyColor = "rgb(156, 39, 176)";
        break;
      default:
        this.bodyColor = "rgb(51, 102, 204)";
        break;
    }
  }

  private readSkill(state: HeroStateData): void {
    const s = state.skill;
    if (!s || typeof s !== "object") return;

    switch (String(s.id)) {
      case "first_strike":
        this.firstStrikeMultiplier = Math.max(1.0, Number(s.first_attack_multiplier) || 2.0);
        break;
      case "long_range":
        this.rangeMultiplier = Math.max(1.0, Number(s.range_multiplier) || 1.5);
        break;
      case "burn":
        if (Number(s.burn_ratio) > 0 && Number(s.burn_ticks) > 0) {
          this.burnRatio = Number(s.burn_ratio);
          this.burnTicks = Math.trunc(Number(s.burn_ticks));
          this.burnInterval = Number(s.burn_interval) || 1.0;
        }
        break;
      case "slow_aura":
        if (Number(s.slow_mult) > 0 && Number(s.slow_mult) < 1.0) {
          this.slowAuraMult = Number(s.slow_mult);
        }
        break;
      case "dodge":
        if (Number(s.dodge_chance) > 0 && Number(s.dodge_chance) <= 1.0) {
          this.dodgeChance = Number(s.dodge_chance);
        }
        break;
      case "def_aura":
        if (Number(s.def_mult) > 1.0) {
          this.defAuraMult = Number(s.def_mult);
        }
        break;
      case "stun":
        if (Number(s.stun_sec) > 0) {
          this.stunDuration = Number(s.stun_sec);
        }
        break;
      case "lifesteal":
        if (Number(s.lifesteal_ratio) > 0 && Number(s.lifesteal_ratio) <= 1.0) {
          this.lifestealRatio = Number(s.lifesteal_ratio);
        }
        break;
      case "atk_speed_aura":
        if (Number(s.atk_speed_mult) > 1.0) {
          this.atkSpeedAuraMult = Number(s.atk_speed_mult);
        }
        break;
      case "counter":
        if (Number(s.counter_ratio) > 0 && Number(s.counter_ratio) <= 1.0) {
          this.counterRatio = Number(s.counter_ratio);
        }
        break;
      case "tenacity":
        if (
          Number(s.low_hp_ratio) > 0 &&
          Number(s.low_hp_ratio) < 1.0 &&
          Number(s.damage_mult) > 0 &&
          Number(s.damage_mult) < 1.0
        ) {
          this.tenacityHpRatio = Number(s.low_hp_ratio);
          this.tenacityDamageMult = Number(s.damage_mult);
        }
        break;
      case "atk_down_aura":
        if (Number(s.atk_mult) > 0 && Number(s.atk_mult) < 1.0) {
          this.atkDownAuraMult = Number(s.atk_mult);
        }
        break;
      case "double_shot":
        if (Number(s.double_shot_chance) > 0 && Number(s.double_shot_chance) < 1.0) {
          this.doubleShotChance = Number(s.double_shot_chance);
        }
        break;
    }
  }

  public effectiveDef(): number {
    return this.defStat > 0 ? this.defStat * this.defBonusMult : this.defStat;
  }

  public effectiveAttackInterval(): number {
    return this.attackSpeed / this.atkSpeedBonusMult;
  }

  public tenacityActive(): boolean {
    if (this.tenacityHpRatio <= 0 || this.maxHp <= 0 || this.currentHp <= 0) return false;
    return this.currentHp / this.maxHp <= this.tenacityHpRatio;
  }

  public canTarget(e: EnemyEntity): boolean {
    return this.canHitAir || !e.isFlying();
  }

  public update(
    delta: number,
    enemies: EnemyEntity[],
    allHeroes: HeroEntity[],
    battleMgr: any,
    floatingTexts: FloatingTextManager,
    soundMgr: SoundManager
  ): void {
    if (this.isDead) return;

    // 1. 光環倒數與刷新
    this.tickAuras(delta);
    this.updateSlows(enemies);
    this.updateDefAura(allHeroes);
    this.updateAtkSpeedAura(allHeroes);
    this.updateAtkDownAura(enemies);

    const wasReady = this.atkTimer <= 0.0;
    this.atkTimer -= delta;

    if (this.animTimer > 0.0) {
      this.animTimer -= delta;
      if (this.animTimer <= 0.0) {
        this.isAttacking = false;
      }
    }

    if (this.atkTimer > 0.0) return;

    const rangePx = this.attackRange * this.tileSize;
    const target = this.findTarget(enemies, rangePx);

    if (!target) {
      this.atkTimer = 0.0; // 待命
      return;
    }

    // 2. 進行普通攻擊
    let damage = this.atk;

    // 馬超首擊加倍
    if (this.firstStrikeMultiplier > 1.0 && battleMgr) {
      const boosted = this.atk * this.firstStrikeMultiplier;
      if (battleMgr.consumeFirstStrike(this.heroId, boosted)) {
        damage = boosted;
        floatingTexts.spawn(
          `x${this.firstStrikeMultiplier}!`,
          FloatingTextManager.COLOR_FIRST_STRIKE,
          this.x,
          this.y - this.heroHalf - 12,
          1.5
        );
      }
    }

    // 結算命中傷害
    const dealt = target.takeDamage(damage, false, false, floatingTexts, soundMgr);

    // 魏延吸血
    if (this.lifestealRatio > 0 && dealt > 0) {
      this.applyLifesteal(dealt, floatingTexts);
    }

    // 周瑜火攻
    if (this.burnRatio > 0 && !target.isDead) {
      target.applyBurn(this.atk * this.burnRatio, this.burnTicks, this.burnInterval);
    }

    // 張飛暈眩
    if (this.stunDuration > 0 && !target.isDead) {
      target.applyStun(this.stunDuration);
    }

    // 孫尚香連射
    if (this.doubleShotChance > 0 && dealt > 0 && !target.isDead) {
      if (Math.random() < this.doubleShotChance) {
        target.takeDamage(this.atk, false, false, floatingTexts, soundMgr);
        floatingTexts.spawn(
          "+1",
          FloatingTextManager.COLOR_DOUBLE_SHOT,
          this.x,
          this.y - this.heroHalf - 12,
          1.5
        );
      }
    }

    // ROAD 武將攻擊時施加道路阻擋緩速 (30%)
    if (this.isOnRoad && !target.isDead && !target.isFlying()) {
      target.applySlowFrom(this.slowSource, 0.3, 0.5);
      if (target.hasSlowFrom(this.slowSource)) {
        this.roadSlowed.add(target);
      }
    }

    this.isAttacking = true;
    this.animTimer = 0.22;
    this.attackCount++;

    const interval = this.effectiveAttackInterval();
    const late = wasReady ? 0.0 : -this.atkTimer;
    this.atkTimer = interval - (late < interval ? late : 0.0);
  }

  private findTarget(enemies: EnemyEntity[], rangePx: number): EnemyEntity | null {
    let best: EnemyEntity | null = null;
    let bestProgress = -1.0;

    for (const e of enemies) {
      if (e.isDead || !this.canTarget(e)) continue;
      const dist = Math.hypot(e.x - this.x, e.y - this.y);
      if (dist <= rangePx) {
        const prog = e.getProgressRatio();
        if (prog > bestProgress) {
          bestProgress = prog;
          best = e;
        }
      }
    }
    return best;
  }

  private applyLifesteal(dealt: number, floatingTexts: FloatingTextManager): void {
    if (this.isDead || this.currentHp <= 0) return;
    const gain = Math.min(dealt * this.lifestealRatio, this.maxHp - this.currentHp);
    if (gain <= 0) return;

    this.currentHp += gain;
    const shown = (gain >= 0.1 ? gain.toFixed(1) : gain.toFixed(2)).replace(/\.?0+$/, "");
    floatingTexts.spawn(
      `+${shown}`,
      FloatingTextManager.COLOR_HEAL,
      this.x,
      this.y - this.heroHalf - 16
    );
  }

  public takeDamage(
    amount: number,
    source: any,
    floatingTexts: FloatingTextManager,
    soundMgr: SoundManager
  ): void {
    if (this.isDead || this.currentHp <= 0 || !Number.isFinite(amount) || amount <= 0) {
      return;
    }

    // 趙雲閃避
    if (this.dodgeChance > 0) {
      if (Math.random() < this.dodgeChance) {
        floatingTexts.spawn("MISS", FloatingTextManager.COLOR_DODGE, this.x, this.y - this.heroHalf - 4);
        return;
      }
    }

    // 防禦公式
    const d = this.effectiveDef();
    const rawDmg = amount * (1.0 - d / (d + 100.0));
    let actualDmg = rawDmg;

    // 廖化堅韌 (受傷前生命 <= 30% 減傷 20%)
    if (this.tenacityHpRatio > 0 && this.tenacityActive()) {
      actualDmg = rawDmg * this.tenacityDamageMult;
    }

    this.currentHp -= actualDmg;
    floatingTexts.spawn(Math.round(actualDmg).toString(), FloatingTextManager.COLOR_DAMAGE_HERO, this.x, this.y);

    if (this.currentHp <= 0) {
      this.currentHp = 0;
      this.isDead = true;
      this.releaseAllAuras();
      this.onHeroDied?.(this);
    } else {
      // 夏侯惇反擊 (受到攻擊存活時反彈 20% 實扣傷害)
      if (this.counterRatio > 0 && source && !source.isDead) {
        const reflect = actualDmg * this.counterRatio;
        if (reflect > 0) {
          source.takeDamage(reflect, false, true, floatingTexts, soundMgr);
        }
      }
    }
  }

  // ── 光環處理 ──────────────────────────────────────────

  private tickAuras(delta: number): void {
    // 防禦加成倒數
    let defExpired = false;
    for (const [key, s] of this.defSources.entries()) {
      s.left -= delta;
      if (s.left <= 0) {
        this.defSources.delete(key);
        defExpired = true;
      }
    }
    if (defExpired) {
      let m = 1.0;
      for (const s of this.defSources.values()) m = Math.max(m, s.mult);
      this.defBonusMult = m;
    }

    // 攻速加成倒數
    let spdExpired = false;
    for (const [key, s] of this.atkSpeedSources.entries()) {
      s.left -= delta;
      if (s.left <= 0) {
        this.atkSpeedSources.delete(key);
        spdExpired = true;
      }
    }
    if (spdExpired) {
      let m = 1.0;
      for (const s of this.atkSpeedSources.values()) m = Math.max(m, s.mult);
      this.atkSpeedBonusMult = m;
    }
  }

  private updateSlows(enemies: EnemyEntity[]): void {
    const rangePx = this.attackRange * this.tileSize;

    // 道路阻擋緩速
    for (const e of Array.from(this.roadSlowed)) {
      if (
        this.isDead ||
        !this.isOnRoad ||
        e.isDead ||
        Math.hypot(e.x - this.x, e.y - this.y) > rangePx
      ) {
        e.removeSlowFrom(this.slowSource);
        this.roadSlowed.delete(e);
      } else {
        e.applySlowFrom(this.slowSource, 0.3, 0.5);
      }
    }

    // 關羽減速光環
    if (this.slowAuraMult < 1.0 && !this.isDead) {
      const keep = new Set<EnemyEntity>();
      for (const e of enemies) {
        if (!e.isDead && !e.isFlying() && Math.hypot(e.x - this.x, e.y - this.y) <= rangePx) {
          e.applySlowFrom(this.auraSource, this.slowAuraMult, 0.5);
          if (e.hasSlowFrom(this.auraSource)) {
            keep.add(e);
          }
        }
      }
      for (const e of this.auraSlowed) {
        if (!keep.has(e)) e.removeSlowFrom(this.auraSource);
      }
      this.auraSlowed = keep;
    }
  }

  private updateDefAura(allHeroes: HeroEntity[]): void {
    if (this.defAuraMult <= 1.0 || this.isDead) return;
    const rangePx = this.attackRange * this.tileSize;
    const keep = new Set<HeroEntity>();

    for (const h of allHeroes) {
      if (h === this || h.isDead) continue;
      if (Math.hypot(h.x - this.x, h.y - this.y) <= rangePx) {
        h.applyDefFrom(this.defAuraSource, this.defAuraMult, 0.5);
        keep.add(h);
      }
    }
    for (const h of this.defBuffed) {
      if (!keep.has(h)) h.removeDefFrom(this.defAuraSource);
    }
    this.defBuffed = keep;
  }

  private updateAtkSpeedAura(allHeroes: HeroEntity[]): void {
    if (this.atkSpeedAuraMult <= 1.0 || this.isDead) return;
    const rangePx = this.attackRange * this.tileSize;
    const keep = new Set<HeroEntity>();

    for (const h of allHeroes) {
      if (h === this || h.isDead) continue;
      if (Math.hypot(h.x - this.x, h.y - this.y) <= rangePx) {
        h.applyAtkSpeedFrom(this.atkSpeedAuraSource, this.atkSpeedAuraMult, 0.5);
        keep.add(h);
      }
    }
    for (const h of this.atkSpeedBuffed) {
      if (!keep.has(h)) h.removeAtkSpeedFrom(this.atkSpeedAuraSource);
    }
    this.atkSpeedBuffed = keep;
  }

  private updateAtkDownAura(enemies: EnemyEntity[]): void {
    if (this.atkDownAuraMult >= 1.0 || this.isDead) return;
    const rangePx = this.attackRange * this.tileSize;
    const keep = new Set<EnemyEntity>();

    for (const e of enemies) {
      if (e.isDead) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) <= rangePx) {
        e.applyAtkDownFrom(this.atkDownAuraSource, this.atkDownAuraMult, 0.5);
        keep.add(e);
      }
    }
    for (const e of this.atkDowned) {
      if (!keep.has(e)) e.removeAtkDownFrom(this.atkDownAuraSource);
    }
    this.atkDowned = keep;
  }

  public applyDefFrom(source: string, mult: number, duration: number): void {
    if (this.isDead || mult <= 1.0) return;
    this.defSources.set(source, { mult, left: duration });
    let m = 1.0;
    for (const s of this.defSources.values()) m = Math.max(m, s.mult);
    this.defBonusMult = m;
  }

  public removeDefFrom(source: string): void {
    if (this.defSources.delete(source)) {
      let m = 1.0;
      for (const s of this.defSources.values()) m = Math.max(m, s.mult);
      this.defBonusMult = m;
    }
  }

  public applyAtkSpeedFrom(source: string, mult: number, duration: number): void {
    if (this.isDead || mult <= 1.0) return;
    this.atkSpeedSources.set(source, { mult, left: duration });
    let m = 1.0;
    for (const s of this.atkSpeedSources.values()) m = Math.max(m, s.mult);
    this.atkSpeedBonusMult = m;
  }

  public removeAtkSpeedFrom(source: string): void {
    if (this.atkSpeedSources.delete(source)) {
      let m = 1.0;
      for (const s of this.atkSpeedSources.values()) m = Math.max(m, s.mult);
      this.atkSpeedBonusMult = m;
    }
  }

  public releaseAllAuras(): void {
    for (const e of this.roadSlowed) e.removeSlowFrom(this.slowSource);
    for (const e of this.auraSlowed) e.removeSlowFrom(this.auraSource);
    for (const h of this.defBuffed) h.removeDefFrom(this.defAuraSource);
    for (const h of this.atkSpeedBuffed) h.removeAtkSpeedFrom(this.atkSpeedAuraSource);
    for (const e of this.atkDowned) e.removeAtkDownFrom(this.atkDownAuraSource);

    this.roadSlowed.clear();
    this.auraSlowed.clear();
    this.defBuffed.clear();
    this.atkSpeedBuffed.clear();
    this.atkDowned.clear();
  }

  public reposition(cell: GridCoord, worldPos: { x: number; y: number }, onRoad: boolean): void {
    this.gridCell = { ...cell };
    this.x = worldPos.x;
    this.y = worldPos.y;
    this.isOnRoad = onRoad;
    if (!onRoad) {
      for (const e of this.roadSlowed) e.removeSlowFrom(this.slowSource);
      this.roadSlowed.clear();
    }
  }
}
