import type { Boss, BossType } from "../../types";
import { CANVAS_WIDTH } from "../constants";

interface BossTemplate {
  width: number;
  height: number;
  hp: number;
  armor: number;
  maxArmor: number;
  souls: number;
  exp: number;
  damageMultiplierWhenExposed: number;
}

const TEMPLATES: Record<BossType, BossTemplate> = {
  dungeon_lord: {
    width: 64,
    height: 72,
    hp: 800,
    armor: 100,
    maxArmor: 100,
    souls: 80,
    exp: 100,
    damageMultiplierWhenExposed: 2,
  },
  spider_queen: {
    width: 72,
    height: 64,
    hp: 1200,
    armor: 0,
    maxArmor: 0,
    souls: 120,
    exp: 150,
    damageMultiplierWhenExposed: 1,
  },
};

export function createBoss(type: BossType): Boss {
  const t = TEMPLATES[type];
  return {
    id: 99999,
    type,
    x: CANVAS_WIDTH / 2,
    y: -t.height / 2,
    width: t.width,
    height: t.height,
    hp: t.hp,
    maxHp: t.hp,
    armor: t.armor,
    maxArmor: t.maxArmor,
    phase: "PHASE_MOVE",
    phaseTimer: 0,
    attackTimer: type === "dungeon_lord" ? 3000 : 2000,
    weakPointExposed: false,
    damageMultiplierWhenExposed: t.damageMultiplierWhenExposed,
    souls: t.souls,
    exp: t.exp,
    isAlive: true,
  };
}

// 各 Boss 的停滯 Y 座標
export function getBossStopY(type: BossType, canvasHeight: number): number {
  if (type === "dungeon_lord") return canvasHeight * 0.25;
  if (type === "spider_queen") return canvasHeight * 0.3;
  return canvasHeight * 0.25;
}

// Boss 移動速度（PHASE_MOVE）
export const BOSS_MOVE_SPEED = 70; // px/s
