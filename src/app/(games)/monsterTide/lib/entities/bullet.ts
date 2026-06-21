import type { Bullet, ActiveWeapon, PassiveStack } from "../../types";

// 各武器每等級基礎傷害（index = level - 1）
const WEAPON_BASE_DAMAGE: Record<string, number[]> = {
  basic_shot: [10, 10, 13, 13, 13],
  orbit_blade: [8, 8, 8, 8, 8],
  multi_arrow: [7, 7, 7, 9, 9],
  aoe_orb: [20, 20, 28, 28, 28],
};

// 各武器每等級基礎攻擊間隔 ms（index = level - 1）
const WEAPON_BASE_INTERVAL: Record<string, number[]> = {
  basic_shot: [800, 660, 660, 660, 660],
  orbit_blade: [0, 0, 0, 0, 0],
  multi_arrow: [1000, 1000, 1000, 1000, 1000],
  aoe_orb: [2500, 2500, 2500, 1900, 1900],
};

export function getWeaponBaseDamage(type: string, level: number): number {
  return WEAPON_BASE_DAMAGE[type]?.[Math.min(level - 1, 4)] ?? 10;
}

export function getWeaponBaseInterval(type: string, level: number): number {
  return WEAPON_BASE_INTERVAL[type]?.[Math.min(level - 1, 4)] ?? 1000;
}

let _idCounter = 0;

export function makeBullet(
  weapon: ActiveWeapon,
  passiveStack: PassiveStack,
  x: number,
  y: number,
  vx: number,
  vy: number,
  piercing = false
): Bullet {
  const baseDamage = getWeaponBaseDamage(weapon.type, weapon.level);
  return {
    id: _idCounter++,
    x,
    y,
    width: 6,
    height: 12,
    vx,
    vy,
    damage: baseDamage * passiveStack.damageMultiplier,
    piercing,
    sourceType: weapon.type,
    isAlive: true,
    hitEnemies: new Set(),
  };
}
