import type { Enemy, SpawnQueueItem, WaveConfig } from "../types";
import { CANVAS_WIDTH } from "./constants";
import { spawnEnemy } from "./entities/enemy";

export class WaveManager {
  private spawnQueue: SpawnQueueItem[] = [];
  private spawnTimer = 0;
  private waveStarted = false;
  private spawnCount = 0;
  private statsMult = 1.0;

  startWave(wave: WaveConfig, statsMult = 1.0): void {
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveStarted = true;
    this.spawnCount = 0;
    this.statsMult = statsMult;

    let cumulativeDelay = 0;
    for (const entry of wave.enemies) {
      for (let i = 0; i < entry.count; i++) {
        this.spawnQueue.push({
          type: entry.type,
          delay: cumulativeDelay + i * entry.spawnInterval,
          spawnPattern: entry.spawnPattern,
        });
      }
      cumulativeDelay += entry.count * entry.spawnInterval;
    }
    this.spawnQueue.sort((a, b) => a.delay - b.delay);
  }

  update(dt: number, enemies: Enemy[]): void {
    if (!this.waveStarted) return;
    this.spawnTimer += dt;

    while (
      this.spawnQueue.length > 0 &&
      this.spawnQueue[0].delay <= this.spawnTimer
    ) {
      const item = this.spawnQueue.shift()!;
      const x = this.calcSpawnX(item.spawnPattern);
      this.spawnCount++;
      enemies.push(spawnEnemy(item.type, x, this.statsMult));
    }
  }

  isWaveCleared(enemies: Enemy[]): boolean {
    if (!this.waveStarted) return false;
    if (this.spawnQueue.length > 0) return false;
    return enemies.every((e) => !e.isAlive);
  }

  reset(): void {
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveStarted = false;
    this.spawnCount = 0;
  }

  private calcSpawnX(pattern: SpawnQueueItem["spawnPattern"]): number {
    switch (pattern) {
      case "random_x":
        return 40 + Math.random() * (CANVAS_WIDTH - 80);
      case "sides":
        return this.spawnCount % 2 === 0 ? 20 : CANVAS_WIDTH - 20;
      case "sequential": {
        const slots = 6;
        const slotW = CANVAS_WIDTH / slots;
        return (this.spawnCount % slots) * slotW + slotW / 2;
      }
    }
  }
}
