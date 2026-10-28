export type DragDirection = 1 | -1;

export interface DragStart<Handle> {
  /** `1` = forward (towards the next page), `-1` = backward. */
  direction: DragDirection;
  clientX: number;
  clientY: number;
  /** Corner handle the pointer went down on, if any. */
  handle: Handle | null;
}

export interface GestureHandlers<Handle> {
  /** Return `false` to ignore this drag. */
  dragStart(start: DragStart<Handle>): boolean;
  /** Distance (px) since the pointer went down. Called at most once per frame. */
  dragMove(deltaX: number, deltaY: number): void;
  /** Release velocity in px/ms (negative = towards the left). */
  dragEnd(velocityX: number): void;
  tap(clientX: number, clientY: number): void;
  /** Mouse hovering (no button pressed) over a target; `null` when it leaves the book. */
  hover(target: EventTarget | null): void;
  settings(): { swipe: boolean; tap: boolean; threshold: number };
  /** Pointer-downs on these targets are ignored (e.g. the nav buttons). */
  ignore(target: EventTarget | null): boolean;
  /** Corner handle under the target; corner drags may start in any direction. */
  handleAt(target: EventTarget | null): Handle | null;
  /** Direction implied by grabbing a handle. */
  handleDirection(handle: Handle): DragDirection;
}

type State = 'idle' | 'pending' | 'dragging' | 'ignored';

const VELOCITY_WINDOW_MS = 100;
/** A pointer that hasn't moved for this long before release counts as stopped. */
const REST_MS = 80;

/**
 * Unified mouse / touch / pen handling via Pointer Events. Outside the corner handles
 * vertical gestures are left to the browser (touch-action: pan-y), so pages embedding
 * the book still scroll; corners use touch-action: none so they can be pulled any way.
 */
export class GestureController<Handle> {
  private state: State = 'idle';
  private pointerId = -1;
  private handle: Handle | null = null;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastY = 0;
  private samples: { x: number; t: number }[] = [];
  private frame = 0;
  private readonly abort = new AbortController();

  constructor(
    private readonly el: HTMLElement,
    private readonly handlers: GestureHandlers<Handle>,
  ) {
    const options = { signal: this.abort.signal };
    el.addEventListener('pointerdown', this.onDown, options);
    el.addEventListener('pointermove', this.onMove, options);
    el.addEventListener('pointerup', this.onUp, options);
    el.addEventListener('pointercancel', this.onCancel, options);
    el.addEventListener('pointerleave', this.onLeave, options);
    el.addEventListener('dragstart', (e) => e.preventDefault(), options);
  }

  get dragging(): boolean {
    return this.state === 'dragging';
  }

  /** Stops tracking the current pointer without firing `dragEnd`. */
  cancel(): void {
    if (this.state === 'dragging' || this.state === 'pending') this.state = 'ignored';
    this.cancelFrame();
  }

  destroy(): void {
    this.abort.abort();
    this.cancelFrame();
  }

  private onDown = (e: PointerEvent): void => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (this.handlers.ignore(e.target)) return;
    this.state = 'pending';
    this.pointerId = e.pointerId;
    this.handle = this.handlers.handleAt(e.target);
    this.startX = this.lastX = e.clientX;
    this.startY = this.lastY = e.clientY;
    this.samples = [{ x: e.clientX, t: e.timeStamp }];
  };

  private onMove = (e: PointerEvent): void => {
    if (this.state === 'idle') {
      if (e.pointerType === 'mouse' && e.buttons === 0) this.handlers.hover(e.target);
      return;
    }
    if (e.pointerId !== this.pointerId) return;

    if (this.state === 'pending') {
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;
      const { swipe, threshold } = this.handlers.settings();
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

      let direction: DragDirection;
      if (this.handle !== null) {
        direction = this.handlers.handleDirection(this.handle);
      } else if (Math.abs(dx) > Math.abs(dy)) {
        direction = dx < 0 ? 1 : -1;
      } else {
        this.state = 'ignored'; // vertical: let the page scroll
        return;
      }
      const start = { direction, clientX: this.startX, clientY: this.startY, handle: this.handle };
      if (!swipe || !this.handlers.dragStart(start)) {
        this.state = 'ignored';
        return;
      }
      this.state = 'dragging';
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
    }

    if (this.state !== 'dragging') return;
    e.preventDefault();
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.addSample(e.clientX, e.timeStamp);
    // Pointer events can fire far more often than the display refreshes; coalesce.
    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.handlers.dragMove(this.lastX - this.startX, this.lastY - this.startY);
      });
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    if (this.state === 'dragging') {
      this.cancelFrame();
      // Lifting the finger repeats the last position; only real movement counts for velocity,
      // and a pointer that rested before release has none.
      const last = this.samples[this.samples.length - 1];
      const rested = e.timeStamp - last.t > REST_MS;
      if (e.clientX !== last.x) this.addSample(e.clientX, e.timeStamp);
      this.handlers.dragMove(e.clientX - this.startX, e.clientY - this.startY);
      this.handlers.dragEnd(rested ? 0 : this.velocity());
    } else if (this.state === 'pending' && this.handlers.settings().tap) {
      this.handlers.tap(e.clientX, e.clientY);
    }
    this.reset();
  };

  private onCancel = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    if (this.state === 'dragging') {
      this.cancelFrame();
      this.handlers.dragEnd(0);
    }
    this.reset();
  };

  private onLeave = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && this.state === 'idle') this.handlers.hover(null);
  };

  private addSample(x: number, t: number): void {
    this.samples.push({ x, t });
    while (this.samples.length > 2 && t - this.samples[0].t > VELOCITY_WINDOW_MS) this.samples.shift();
  }

  private velocity(): number {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const dt = last.t - first.t;
    return dt > 0 ? (last.x - first.x) / dt : 0;
  }

  private reset(): void {
    this.state = 'idle';
    this.pointerId = -1;
    this.handle = null;
    this.samples = [];
  }

  private cancelFrame(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
}
