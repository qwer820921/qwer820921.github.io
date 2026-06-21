import type { Bullet, Enemy, Base } from "../types";
import { BASE_COLLISION_Y } from "./constants";

function aabb(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
): boolean {
  return (
    ax - aw / 2 < bx + bw / 2 &&
    ax + aw / 2 > bx - bw / 2 &&
    ay - ah / 2 < by + bh / 2 &&
    ay + ah / 2 > by - bh / 2
  );
}

export function checkBulletsVsEnemies(
  bullets: Bullet[],
  enemies: Enemy[],
  onKill: (enemy: Enemy) => void
): void {
  for (const bullet of bullets) {
    if (!bullet.isAlive) continue;

    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;
      if (!bullet.piercing && bullet.hitEnemies.has(enemy.id)) continue;

      if (
        !aabb(
          bullet.x,
          bullet.y,
          bullet.width,
          bullet.height,
          enemy.x,
          enemy.y,
          enemy.width,
          enemy.height
        )
      )
        continue;

      // 護甲先扣，護甲清零後才傷 HP
      if (enemy.armor > 0) {
        enemy.armor = Math.max(0, enemy.armor - bullet.damage);
      } else {
        enemy.hp -= bullet.damage;
      }
      enemy.flashTimer = 80;

      if (bullet.piercing) {
        bullet.hitEnemies.add(enemy.id);
      } else {
        bullet.isAlive = false;
      }

      if (enemy.hp <= 0) {
        enemy.isAlive = false;
        onKill(enemy);
      }

      if (!bullet.isAlive) break;
    }
  }
}

export function checkEnemiesVsBase(enemies: Enemy[], base: Base): void {
  for (const enemy of enemies) {
    if (!enemy.isAlive) continue;
    if (enemy.y + enemy.height / 2 >= BASE_COLLISION_Y) {
      base.currentHp = Math.max(0, base.currentHp - enemy.damageToBase);
      enemy.isAlive = false;
    }
  }
}
