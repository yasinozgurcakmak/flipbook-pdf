import { clamp, type Easing } from './math';

/** Minimal rAF-driven tween. Only one animation runs at a time per instance. */
export class Tween {
  private frame = 0;
  private settle: ((completed: boolean) => void) | undefined;

  get running(): boolean {
    return this.settle !== undefined;
  }

  /** Resolves `true` when the animation completes, `false` when it was cancelled. */
  run(
    from: number,
    to: number,
    duration: number,
    easing: Easing,
    onUpdate: (value: number) => void,
  ): Promise<boolean> {
    this.cancel();
    if (duration <= 0 || from === to) {
      onUpdate(to);
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      this.settle = resolve;
      const start = performance.now();
      const tick = (now: number) => {
        const t = clamp((now - start) / duration, 0, 1);
        onUpdate(from + (to - from) * easing(t));
        if (t < 1) {
          this.frame = requestAnimationFrame(tick);
        } else {
          this.frame = 0;
          this.settle = undefined;
          resolve(true);
        }
      };
      this.frame = requestAnimationFrame(tick);
    });
  }

  cancel(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    const settle = this.settle;
    this.settle = undefined;
    settle?.(false);
  }
}
