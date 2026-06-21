import type {
  Player,
  SkillOption,
  WeaponType,
  PassiveType,
  Base,
} from "../types";
import { MAX_WEAPON_SLOTS } from "./constants";

const MAX_WEAPON_LEVEL = 5;

// ===== 名稱 / 圖示 =====

const WEAPON_NAMES: Record<WeaponType, string> = {
  basic_shot: "普通彈",
  orbit_blade: "環繞刃",
  multi_arrow: "多重箭",
  aoe_orb: "範圍法球",
};

const WEAPON_ICONS: Record<WeaponType, string> = {
  basic_shot: "🔫",
  orbit_blade: "⚔️",
  multi_arrow: "🏹",
  aoe_orb: "🔮",
};

const PASSIVE_NAMES: Record<PassiveType, string> = {
  damage_up: "攻擊強化",
  attack_speed_up: "攻速提升",
  move_speed_up: "移動加速",
  base_hp_up: "基地加固",
  range_up: "範圍擴大",
};

const PASSIVE_ICONS: Record<PassiveType, string> = {
  damage_up: "⚡",
  attack_speed_up: "🌀",
  move_speed_up: "💨",
  base_hp_up: "🛡️",
  range_up: "📡",
};

const WEAPON_DESCS: Record<WeaponType, Record<number, string>> = {
  basic_shot: {
    1: "自動向上射擊，傷害 10，每 0.8 秒",
    2: "攻速 +20%",
    3: "傷害 +30%",
    4: "變為雙發",
    5: "子彈穿透",
  },
  orbit_blade: {
    1: "1 把刃繞你旋轉，接觸傷害",
    2: "增加為 2 把刃",
    3: "增加為 3 把刃",
    4: "旋轉速度大幅提升",
    5: "增加為 4 把刃",
  },
  multi_arrow: {
    1: "同時射出 3 方向（-30°/0°/+30°）",
    2: "方向 +1（共 4 向）",
    3: "傷害 +30%",
    4: "方向 +1（共 5 向）",
    5: "子彈穿透",
  },
  aoe_orb: {
    1: "法球朝上飛至上方後爆炸，半徑 60",
    2: "爆炸半徑 +20%",
    3: "傷害 +40%",
    4: "飛行速度 +30%",
    5: "雙發",
  },
};

const PASSIVE_DESCS: Record<PassiveType, string> = {
  damage_up: "所有武器傷害 +15%",
  attack_speed_up: "所有武器攻速 +10%",
  move_speed_up: "玩家移速 +12%",
  base_hp_up: "基地血量上限 +25",
  range_up: "所有彈體/爆炸半徑 +15%",
};

// Phase 4 技能池（aoe_orb 於 Phase 5+ 啟用）
const WEAPON_POOL: WeaponType[] = ["basic_shot", "orbit_blade", "multi_arrow"];
const PASSIVE_POOL: PassiveType[] = [
  "damage_up",
  "attack_speed_up",
  "move_speed_up",
  "base_hp_up",
  "range_up",
];

// ===== 環繞刃輔助（engine & renderer 共用） =====

export function getOrbitBladeCount(level: number): number {
  if (level >= 5) return 4;
  if (level >= 3) return 3;
  if (level >= 2) return 2;
  return 1;
}

export function getOrbitBladeSpeed(level: number): number {
  return level >= 4 ? 4.0 : 2.5; // rad/s
}

export function getOrbitBladeRadius(level: number): number {
  return level >= 5 ? 80 : 70;
}

// ===== 多重箭方向數 =====

export function getMultiArrowDirCount(level: number): number {
  if (level >= 4) return 5;
  if (level >= 2) return 4;
  return 3;
}

// ===== Fisher-Yates shuffle =====

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ===== 產生三選一選項 =====

export function generateSkillOptions(player: Player): SkillOption[] {
  const slotsUsed = player.weapons.length;
  const slotsAvailable = MAX_WEAPON_SLOTS - slotsUsed;

  // 武器選項（未達最大等級）
  const weaponOptions: SkillOption[] = [];
  for (const type of WEAPON_POOL) {
    const existing = player.weapons.find((w) => w.type === type);
    const currentLevel = existing?.level ?? 0;
    if (currentLevel >= MAX_WEAPON_LEVEL) continue;
    // 尚未解鎖的武器需要空槓位
    if (currentLevel === 0 && slotsAvailable === 0) continue;
    weaponOptions.push({
      id: `weapon_${type}`,
      skillType: "weapon",
      weaponType: type,
      currentLevel,
      nextLevel: currentLevel + 1,
      name: WEAPON_NAMES[type],
      description: WEAPON_DESCS[type][currentLevel + 1] ?? "",
      icon: WEAPON_ICONS[type],
    });
  }

  // 被動選項（無上限限制，每次都可選）
  const passiveOptions: SkillOption[] = PASSIVE_POOL.map((type) => ({
    id: `passive_${type}`,
    skillType: "passive" as const,
    passiveType: type,
    currentLevel: 0,
    nextLevel: 1,
    name: PASSIVE_NAMES[type],
    description: PASSIVE_DESCS[type],
    icon: PASSIVE_ICONS[type],
  }));

  // 決定本次抽卡偏好
  let primaryPool: SkillOption[];
  let fallbackPool: SkillOption[];

  if (weaponOptions.length === 0) {
    primaryPool = passiveOptions;
    fallbackPool = [];
  } else if (
    slotsAvailable === 0 &&
    weaponOptions.every((w) => w.currentLevel === 0)
  ) {
    // 槓位滿且無可升武器
    primaryPool = passiveOptions;
    fallbackPool = [];
  } else {
    // 50% 武器 / 50% 被動
    const preferWeapon = Math.random() < 0.5;
    primaryPool = preferWeapon ? weaponOptions : passiveOptions;
    fallbackPool = preferWeapon ? passiveOptions : weaponOptions;
  }

  // 打亂後取 3 張，不足時從後備池補充
  const picked: SkillOption[] = [];
  const seen = new Set<string>();

  for (const opt of shuffle(primaryPool)) {
    if (picked.length >= 3) break;
    if (!seen.has(opt.id)) {
      seen.add(opt.id);
      picked.push(opt);
    }
  }
  for (const opt of shuffle(fallbackPool)) {
    if (picked.length >= 3) break;
    if (!seen.has(opt.id)) {
      seen.add(opt.id);
      picked.push(opt);
    }
  }

  return picked;
}

// ===== 套用技能至玩家 =====

export function applySkillToPlayer(
  skill: SkillOption,
  player: Player,
  base: Base
): void {
  if (skill.skillType === "weapon" && skill.weaponType) {
    const existing = player.weapons.find((w) => w.type === skill.weaponType);
    if (existing) {
      existing.level = skill.nextLevel;
    } else {
      player.weapons.push({
        type: skill.weaponType,
        level: 1,
        attackTimer: 0,
        ...(skill.weaponType === "orbit_blade" ? { orbitAngle: 0 } : {}),
      });
    }
  } else if (skill.skillType === "passive" && skill.passiveType) {
    applyPassive(skill.passiveType, player, base);
  }
}

function applyPassive(type: PassiveType, player: Player, base: Base): void {
  const ps = player.passiveStack;
  switch (type) {
    case "damage_up":
      ps.damageMultiplier *= 1.15;
      break;
    case "attack_speed_up":
      ps.attackSpeedMultiplier *= 1.1;
      break;
    case "move_speed_up":
      ps.moveSpeedMultiplier *= 1.12;
      break;
    case "range_up":
      ps.rangeMultiplier *= 1.15;
      break;
    case "base_hp_up":
      ps.baseHpBonus += 25;
      base.maxHp += 25;
      base.currentHp = Math.min(base.currentHp + 25, base.maxHp);
      break;
  }
}
