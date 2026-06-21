import type { Particle } from "../../types";

export function spawnDeathParticles(
  particles: Particle[],
  x: number,
  y: number,
  color = "#e8c060",
  count = 7
): void {
  for (let i = 0; i < count; i++) {
    const angle = ((Math.PI * 2) / count) * i + Math.random() * 0.4;
    const speed = 50 + Math.random() * 90;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 30,
      life: 280 + Math.random() * 180,
      maxLife: 460,
      radius: 2.5 + Math.random() * 2.5,
      color,
      isAlive: true,
    });
  }
}

export function updateParticles(particles: Particle[], dt: number): void {
  const dts = dt / 1000;
  for (const p of particles) {
    if (!p.isAlive) continue;
    p.x += p.vx * dts;
    p.y += p.vy * dts;
    p.vy += 200 * dts; // 重力
    p.life -= dt;
    if (p.life <= 0) p.isAlive = false;
  }
}
