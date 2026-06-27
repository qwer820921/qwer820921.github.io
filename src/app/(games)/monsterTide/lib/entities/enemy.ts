import type { Enemy, EnemyType } from "../../types";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../constants";

let _idCounter = 0;

interface EnemyTemplate {
  width: number;
  height: number;
  hp: number;
  armor: number;
  speed: number;
  damageToBase: number;
  souls: number;
  exp: number;
}

const TEMPLATES: Record<EnemyType, EnemyTemplate> = {
  skeleton: {
    width: 28,
    height: 36,
    hp: 30,
    armor: 0,
    speed: 80,
    damageToBase: 15,
    souls: 1,
    exp: 4,
  },
  goblin: {
    width: 24,
    height: 30,
    hp: 20,
    armor: 0,
    speed: 120,
    damageToBase: 10,
    souls: 1,
    exp: 3,
  },
  slime: {
    width: 32,
    height: 26,
    hp: 50,
    armor: 0,
    speed: 50,
    damageToBase: 20,
    souls: 2,
    exp: 4,
  },
  armored_knight: {
    width: 34,
    height: 44,
    hp: 80,
    armor: 30,
    speed: 55,
    damageToBase: 20,
    souls: 4,
    exp: 8,
  },
  man_eater_flower: {
    width: 36,
    height: 40,
    hp: 100,
    armor: 0,
    speed: 70,
    damageToBase: 25,
    souls: 5,
    exp: 10,
  },
  bat: {
    width: 30,
    height: 22,
    hp: 40,
    armor: 0,
    speed: 100,
    damageToBase: 12,
    souls: 2,
    exp: 6,
  },
};

// 史萊姆分裂子體模板（index = splitLevel）
const SLIME_SPLIT_TEMPLATES: Record<number, EnemyTemplate> = {
  1: {
    width: 24,
    height: 20,
    hp: 25,
    armor: 0,
    speed: 60,
    damageToBase: 10,
    souls: 1,
    exp: 2,
  },
  2: {
    width: 18,
    height: 14,
    hp: 10,
    armor: 0,
    speed: 70,
    damageToBase: 5,
    souls: 0,
    exp: 1,
  },
};

const MOVE_PATTERNS: Record<EnemyType, Enemy["movePattern"]> = {
  skeleton: "straight",
  goblin: "straight",
  slime: "straight",
  armored_knight: "straight",
  man_eater_flower: "stationary",
  bat: "sinusoidal",
};

export function spawnEnemy(type: EnemyType, x: number, statsMult = 1.0): Enemy {
  const t = TEMPLATES[type];
  const enemy: Enemy = {
    id: _idCounter++,
    type,
    x,
    y: -t.height / 2,
    width: t.width,
    height: t.height,
    hp: Math.round(t.hp * statsMult),
    maxHp: Math.round(t.hp * statsMult),
    armor: t.armor,
    speed: t.speed * statsMult,
    movePattern: MOVE_PATTERNS[type],
    damageToBase: Math.round(t.damageToBase * statsMult),
    souls: t.souls,
    exp: t.exp,
    isAlive: true,
    // 史萊姆：Level 0 = 大史萊姆
    ...(type === "slime" ? { splitLevel: 0 } : {}),
    // 食人花：初始攻擊計時器 2 秒
    ...(type === "man_eater_flower" ? { stationaryTimer: 2000 } : {}),
  };
  return enemy;
}

/** 史萊姆分裂子體（不從頂端生成，從父體位置出現） */
export function spawnSlimeSplit(
  x: number,
  y: number,
  splitLevel: number,
  statsMult = 1.0
): Enemy {
  const t = SLIME_SPLIT_TEMPLATES[splitLevel] ?? SLIME_SPLIT_TEMPLATES[2];
  return {
    id: _idCounter++,
    type: "slime",
    x,
    y,
    width: t.width,
    height: t.height,
    hp: Math.round(t.hp * statsMult),
    maxHp: Math.round(t.hp * statsMult),
    armor: 0,
    speed: t.speed * statsMult,
    movePattern: "straight",
    damageToBase: Math.round(t.damageToBase * statsMult),
    souls: t.souls,
    exp: t.exp,
    isAlive: true,
    splitLevel,
  };
}

export function updateEnemy(enemy: Enemy, dt: number): void {
  if (!enemy.isAlive) return;

  const dts = dt / 1000;

  switch (enemy.movePattern) {
    case "straight":
      enemy.y += enemy.speed * dts;
      break;

    case "sinusoidal": {
      const prev = enemy.sinPhase ?? 0;
      const next = prev + dt * 0.003;
      enemy.x += (Math.sin(next) - Math.sin(prev)) * 80;
      enemy.x = Math.max(
        enemy.width / 2,
        Math.min(CANVAS_WIDTH - enemy.width / 2, enemy.x)
      );
      enemy.sinPhase = next;
      enemy.y += enemy.speed * dts;
      break;
    }

    case "stationary": {
      const targetY = CANVAS_HEIGHT * 0.4;
      if (enemy.stationaryY === undefined) {
        enemy.y = Math.min(targetY, enemy.y + enemy.speed * dts);
        if (enemy.y >= targetY) enemy.stationaryY = targetY;
      }
      // 停滯後的攻擊邏輯由 engine 管理
      break;
    }
  }

  if (enemy.flashTimer !== undefined && enemy.flashTimer > 0) {
    enemy.flashTimer -= dt;
  }
}

export const ENEMY_COLORS: Record<EnemyType, string> = {
  skeleton: "#c8c8b0",
  goblin: "#50a050",
  slime: "#4878d0",
  armored_knight: "#707880",
  man_eater_flower: "#a040b8",
  bat: "#604890",
};
