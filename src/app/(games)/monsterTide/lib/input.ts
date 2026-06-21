import type { MoveDirection } from "../types";

export class InputManager {
  private direction: MoveDirection = 0;
  private keyLeft = false;
  private keyRight = false;
  private canvas: HTMLCanvasElement | null = null;

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A")
      this.keyLeft = true;
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D")
      this.keyRight = true;
    this.syncKeyboard();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A")
      this.keyLeft = false;
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D")
      this.keyRight = false;
    this.syncKeyboard();
  };

  private onPointerDown = (e: PointerEvent) => {
    const canvas = this.canvas!;
    const rect = canvas.getBoundingClientRect();
    this.direction = e.clientX - rect.left < rect.width / 2 ? -1 : 1;
  };

  private onPointerUp = () => {
    this.syncKeyboard();
  };

  private onPointerCancel = () => {
    this.syncKeyboard();
  };

  private syncKeyboard() {
    if (this.keyLeft && !this.keyRight) this.direction = -1;
    else if (this.keyRight && !this.keyLeft) this.direction = 1;
    else this.direction = 0;
  }

  bindKeyboard(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  bindTouch(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerCancel);
  }

  unbind(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    if (this.canvas) {
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("pointerup", this.onPointerUp);
      this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
    }
  }

  getDirection(): MoveDirection {
    return this.direction;
  }
}
