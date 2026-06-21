import type { Bullet } from "../../types";

let _idCounter = 50000;

export function makeEnemyBullet(
  x: number,
  y: number,
  vx: number,
  vy: number,
  damage: number,
  size = 8,
  sourceType: "enemy_projectile" | "boss_projectile" = "enemy_projectile"
): Bullet {
  return {
    id: _idCounter++,
    x,
    y,
    width: size,
    height: size,
    vx,
    vy,
    damage,
    piercing: false,
    sourceType,
    isAlive: true,
    hitEnemies: new Set(),
  };
}
