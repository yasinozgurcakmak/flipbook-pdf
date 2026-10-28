import type { FlipbookLabels, ResolvedMode } from '../core/types';
import type { Size } from '../core/layout';
import type { Corner, CurlFrame, FoldLine, Point } from './curl';
import { clamp } from '../utils/math';
import { createEl } from '../utils/dom';

/**
 * Static slots show the spread at rest; `front` and `back` are the two sides of the
 * sheet being turned. A turn between a lower spread L and a higher spread H uses:
 *   left = L.left, right = H.right, front = L.right, back = H.left
 * Turning forward peels `front` and folds `back` over; backward it's the other way round.
 */
export type SlotName = 'left' | 'right' | 'front' | 'back';

export interface SlotContent {
  /** 0-based page index, `null` for an empty side. */
  page: number | null;
  /** Rendered page, or `null` while it is still rendering (shows a spinner). */
  canvas: HTMLCanvasElement | null;
  /** How an empty side looks: hidden (default) or blank paper (back of a single page). */
  empty?: 'hidden' | 'paper';
}

/** A corner handle the user can grab to curl a page. */
export interface CornerHandle {
  side: 'left' | 'right';
  corner: Corner;
}

export type ViewStatus = 'loading' | 'ready' | 'error';

export interface BookViewCallbacks {
  prev(): void;
  next(): void;
}

interface Slot {
  el: HTMLElement;
  content: HTMLElement;
  shade: HTMLElement;
}

const BAR_BASE_WIDTH = 100; // px, matches .pfb-fold-shade in styles.ts
const EMPTY_CLIP = 'polygon(0 0, 0 0, 0 0)';

const ICON_PREV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
const ICON_NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

export class BookView {
  readonly root: HTMLDivElement;
  /** Area the book is centred in (the root minus the counter strip). */
  readonly stage: HTMLDivElement;
  readonly book: HTMLDivElement;
  private readonly slots: Record<SlotName, Slot>;
  private readonly cast: HTMLDivElement;
  private readonly castShade: HTMLDivElement;
  private readonly prevButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly counter: HTMLDivElement;
  private readonly message: HTMLDivElement;
  private readonly live: HTMLDivElement;
  private pageWidth = 0;
  private forward = true;

  constructor(
    container: HTMLElement,
    labels: FlipbookLabels,
    callbacks: BookViewCallbacks,
  ) {
    this.root = createEl('div', 'pfb-root pfb-loading', {
      tabindex: '0',
      role: 'region',
      'aria-roledescription': 'book',
    });
    const stage = (this.stage = createEl('div', 'pfb-stage'));
    this.book = createEl('div', 'pfb-book pfb-double');

    const makeSlot = (className: string): Slot => {
      const el = createEl('div', className);
      const content = createEl('div', 'pfb-content');
      const shade = createEl('div', 'pfb-fold-shade');
      el.append(content, shade);
      return { el, content, shade };
    };
    this.slots = {
      left: makeSlot('pfb-page pfb-slot-left'),
      right: makeSlot('pfb-page pfb-slot-right'),
      front: makeSlot('pfb-face pfb-face-front'),
      back: makeSlot('pfb-face pfb-face-back'),
    };
    this.slots.front.el.setAttribute('aria-hidden', 'true');
    this.slots.back.el.setAttribute('aria-hidden', 'true');
    this.cast = createEl('div', 'pfb-cast', { 'aria-hidden': 'true' });
    this.castShade = createEl('div', 'pfb-fold-shade');
    this.cast.append(this.castShade);
    const spine = createEl('div', 'pfb-spine');
    const corners = (['left', 'right'] as const).flatMap((side) =>
      (['top', 'bottom'] as const).map((corner) =>
        createEl('div', 'pfb-corner', { 'data-side': side, 'data-corner': corner, 'aria-hidden': 'true' }),
      ),
    );
    this.book.append(
      this.slots.left.el,
      this.slots.right.el,
      spine,
      this.cast,
      this.slots.front.el,
      this.slots.back.el,
      ...corners,
    );
    stage.append(this.book);

    this.prevButton = createEl('button', 'pfb-nav pfb-nav-prev', { type: 'button' });
    this.prevButton.innerHTML = ICON_PREV;
    this.prevButton.addEventListener('click', () => callbacks.prev());
    this.nextButton = createEl('button', 'pfb-nav pfb-nav-next', { type: 'button' });
    this.nextButton.innerHTML = ICON_NEXT;
    this.nextButton.addEventListener('click', () => callbacks.next());
    this.counter = createEl('div', 'pfb-counter', { 'aria-hidden': 'true' });
    this.message = createEl('div', 'pfb-message');
    this.live = createEl('div', 'pfb-sr-only', { 'aria-live': 'polite', 'aria-atomic': 'true' });

    this.root.append(stage, this.prevButton, this.nextButton, this.counter, this.message, this.live);
    this.setLabels(labels);
    container.appendChild(this.root);
  }

  /** Space available for the book inside the stage. */
  measure(padding: number): Size {
    return {
      width: Math.max(0, this.stage.clientWidth - padding * 2),
      height: Math.max(0, this.stage.clientHeight - padding * 2),
    };
  }

  setLayout(mode: ResolvedMode, page: Size): void {
    this.book.classList.toggle('pfb-single', mode === 'single');
    this.book.classList.toggle('pfb-double', mode === 'double');
    this.book.style.width = `${page.width * (mode === 'double' ? 2 : 1)}px`;
    this.book.style.height = `${page.height}px`;
    this.book.style.setProperty('--pfb-page-w', `${page.width}px`);
    this.book.style.setProperty('--pfb-bar-h', `${Math.ceil(Math.hypot(page.width, page.height) * 2.2)}px`);
    this.pageWidth = page.width;
  }

  setSlots(contents: Record<SlotName, SlotContent>): void {
    for (const name of Object.keys(contents) as SlotName[]) {
      const { page, canvas, empty = 'hidden' } = contents[name];
      const slot = this.slots[name];
      slot.el.classList.toggle('pfb-blank', page === null && empty === 'hidden');
      slot.el.classList.toggle('pfb-paper', page === null && empty === 'paper');
      if (page === null || !canvas) {
        if (slot.content.firstChild) slot.content.replaceChildren();
      } else if (slot.content.firstChild !== canvas) {
        slot.content.replaceChildren(canvas);
      }
    }
    this.book.classList.toggle(
      'pfb-no-spine',
      contents.left.page === null || contents.right.page === null,
    );
  }

  /** Shows the turning layers (`forward` decides which side peels) or hides them (`null`). */
  setTurning(forward: boolean | null): void {
    this.book.classList.toggle('pfb-turning', forward !== null);
    if (forward === null) {
      for (const el of [this.slots.front.el, this.slots.back.el, this.cast]) {
        el.style.transform = '';
        el.style.clipPath = '';
      }
      return;
    }
    this.forward = forward;
    const [peel, flap] = this.turnRoles();
    peel.el.classList.add('pfb-peel');
    peel.el.classList.remove('pfb-flap');
    flap.el.classList.add('pfb-flap');
    flap.el.classList.remove('pfb-peel');
  }

  /** Draws one frame of the curl. Only transforms, clip paths and opacity change. */
  setCurl(frame: CurlFrame): void {
    const [peel, flap] = this.turnRoles();
    const sheet = `translate3d(${px(frame.sheetLeft)},0,0)`;

    peel.el.style.transform = sheet;
    peel.el.style.clipPath = polygon(frame.peelClip);
    flap.el.style.transform = `matrix(${frame.flapMatrix.map((v) => v.toFixed(5)).join(',')})`;
    flap.el.style.clipPath = polygon(frame.flapClip);
    this.cast.style.transform = sheet;
    this.cast.style.clipPath = polygon(frame.castClip);

    // Shadows grow with the fold and fade out as the page lands.
    const W = this.pageWidth;
    const d = frame.foldDepth;
    const fade = clamp((1 - frame.turned) * 3, 0, 1);
    placeBar(this.castShade, frame.castFold, Math.min(W * 0.3, d * 0.5), fade);
    placeBar(peel.shade, frame.peelFold, Math.min(W * 0.12, d * 0.25), fade);
    placeBar(flap.shade, frame.flapFold, Math.min(W * 0.45, d * 0.5), fade);
  }

  setStatus(status: ViewStatus, text = ''): void {
    this.root.classList.toggle('pfb-loading', status === 'loading');
    this.root.classList.toggle('pfb-error', status === 'error');
    this.root.classList.toggle('pfb-ready', status === 'ready');
    this.root.setAttribute('aria-busy', String(status === 'loading'));
    this.message.textContent = text;
  }

  setNavigation(counterText: string, canPrev: boolean, canNext: boolean): void {
    if (this.counter.textContent !== counterText) {
      this.counter.textContent = counterText;
      this.live.textContent = counterText;
    }
    this.prevButton.disabled = !canPrev;
    this.nextButton.disabled = !canNext;
  }

  setControlsVisible(visible: boolean): void {
    this.root.classList.toggle('pfb-no-controls', !visible);
  }

  setDragging(dragging: boolean): void {
    this.root.classList.toggle('pfb-dragging', dragging);
  }

  setLabels(labels: FlipbookLabels): void {
    this.root.setAttribute('aria-label', labels.book);
    this.prevButton.setAttribute('aria-label', labels.prev);
    this.prevButton.title = labels.prev;
    this.nextButton.setAttribute('aria-label', labels.next);
    this.nextButton.title = labels.next;
    if (this.root.classList.contains('pfb-loading')) this.message.textContent = labels.loading;
  }

  isControl(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest('.pfb-nav') !== null;
  }

  cornerAt(target: EventTarget | null): CornerHandle | null {
    const el = target instanceof Element ? target.closest<HTMLElement>('.pfb-corner') : null;
    if (!el) return null;
    return { side: el.dataset.side as CornerHandle['side'], corner: el.dataset.corner as Corner };
  }

  /** Converts a viewport point to book coordinates. */
  toBookPoint(clientX: number, clientY: number): Point {
    const rect = this.book.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  destroy(): void {
    for (const slot of Object.values(this.slots)) slot.content.replaceChildren();
    this.root.remove();
  }

  private turnRoles(): [Slot, Slot] {
    return this.forward ? [this.slots.front, this.slots.back] : [this.slots.back, this.slots.front];
  }
}

const px = (v: number) => `${v.toFixed(2)}px`;

function polygon(points: Point[]): string {
  if (points.length < 3) return EMPTY_CLIP;
  return `polygon(${points.map((p) => `${px(p.x)} ${px(p.y)}`).join(',')})`;
}

/** Positions a gradient bar so it starts at `line` and runs `width` px along its normal. */
function placeBar(bar: HTMLElement, line: FoldLine, width: number, opacity: number): void {
  if (width < 1 || opacity <= 0) {
    bar.style.opacity = '0';
    return;
  }
  bar.style.opacity = opacity.toFixed(3);
  bar.style.transform =
    `translate(${px(line.x)},${px(line.y)}) rotate(${line.angle.toFixed(5)}rad) scaleX(${(width / BAR_BASE_WIDTH).toFixed(4)})`;
}
