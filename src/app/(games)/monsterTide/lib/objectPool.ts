export class ObjectPool<T extends { isAlive: boolean }> {
  private pool: T[] = [];

  constructor(
    private factory: () => T,
    private onReset: (obj: T) => void,
    preAllocate: number
  ) {
    for (let i = 0; i < preAllocate; i++) {
      const obj = this.factory();
      obj.isAlive = false;
      this.pool.push(obj);
    }
  }

  get(): T {
    for (const obj of this.pool) {
      if (!obj.isAlive) {
        this.onReset(obj);
        obj.isAlive = true;
        return obj;
      }
    }
    const obj = this.factory();
    obj.isAlive = true;
    this.pool.push(obj);
    return obj;
  }

  release(obj: T): void {
    obj.isAlive = false;
  }

  getActive(): T[] {
    return this.pool.filter((o) => o.isAlive);
  }

  size(): number {
    return this.pool.length;
  }
}
