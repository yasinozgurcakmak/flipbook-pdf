import { EventEmitter } from './EventEmitter';
import { LruCache } from './LruCache';
import { fitPage, resolveMode, type Size } from './layout';
import { resolveOptions, type ResolvedOptions } from './options';
import { buildSpreads, pagesOfSpread, spreadIndexOfPage, type Spread } from './spreads';
import type {
  FlipbookEvents,
  FlipbookOptions,
  PdfSource,
  ResolvedMode,
  ViewMode,
} from './types';
import { PdfDocument, isAbortError } from '../pdf/PdfDocument';
import { RenderQueue, type QueueJob } from '../pdf/RenderQueue';
import { BookView, type CornerHandle, type SlotContent, type SlotName } from '../view/BookView';
import { injectStyles } from '../view/styles';
import {
  computeCurl,
  cornerPoint,
  turnedPoint,
  type Corner,
  type CurlSetup,
  type Point,
} from '../view/curl';
import { GestureController, type DragDirection, type DragStart } from '../input/GestureController';
import { KeyboardController } from '../input/KeyboardController';
import { Tween } from '../utils/Tween';
import { clamp, easeInOutCubic, easeOutCubic, type Easing } from '../utils/math';
import { isBrowser, prefersReducedMotion, releaseCanvas, resolveContainer } from '../utils/dom';

interface CachedPage {
  canvas: HTMLCanvasElement;
  /** Device-pixel box the page was rendered for. */
  box: Size;
}

/**
 * An in-progress page turn between spreads `low` < `high`. The sheet is curled by
 * moving its grabbed corner to `point`; `progress` 0 = low spread, 1 = high spread.
 */
interface FlipState {
  low: number;
  high: number;
  forward: boolean;
  setup: CurlSetup;
  point: Point;
  progress: number;
  /** Where the running animation is heading; `null` while the user is dragging. */
  target: 0 | 1 | null;
  /** Hover hint: a slightly lifted corner. Emits no events and never changes the page. */
  peek: boolean;
}

interface DragState {
  origin: Point;
  /** Grabbed by a corner handle: the corner follows the pointer exactly. */
  fromCorner: boolean;
  scale: number;
}

const SLOT_NAMES: SlotName[] = ['left', 'right', 'front', 'back'];
/** Release speed (px/ms) above which a drag completes in the flick direction. */
const FLICK_VELOCITY = 0.35;
const RESIZE_RENDER_DELAY = 150;
/** Programmatic turns lift the corner along an arc (fraction of the page height). */
const ARC_LIFT = 0.2;
/** Drags that don't start at a corner get a little lift so the paper visibly curls. */
const DRAG_LIFT = 0.12;
const PEEK_SIZE = 0.12;

export interface GoToOptions {
  /** Default `true`. Distant pages are reached with a single page-turn. */
  animate?: boolean;
}

/**
 * Framework-agnostic PDF flipbook.
 *
 * ```ts
 * const book = new PdfFlipbook('#reader', { src: '/book.pdf' });
 * book.on('pagechange', ({ page, pageCount }) => console.log(page, pageCount));
 * ```
 */
export class PdfFlipbook extends EventEmitter<FlipbookEvents> {
  private options: ResolvedOptions;
  private readonly view: BookView;
  private readonly gestures: GestureController<CornerHandle>;
  private readonly keyboard: KeyboardController;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly tween = new Tween();
  private readonly queue = new RenderQueue(1);
  private readonly cache: LruCache<number, CachedPage>;

  private doc: PdfDocument | null = null;
  private loadToken = 0;
  private loading: Promise<void> = Promise.resolve();
  private pageAspect = 1 / Math.SQRT2;
  private currentMode: ResolvedMode | null = null;
  private pageSize: Size = { width: 0, height: 0 };
  private spreads: Spread[] = [];
  private spreadIndex = 0;
  private flip: FlipState | null = null;
  private drag: DragState | null = null;
  private hoverHandle: CornerHandle | null = null;
  private lastPagesKey = '';
  private resizeFrame = 0;
  private renderTimer: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;

  constructor(container: HTMLElement | string, options: FlipbookOptions = {}) {
    super();
    if (!isBrowser()) {
      throw new Error('[pdf-flipbook] PdfFlipbook must be created in the browser (e.g. in onMounted / useEffect).');
    }
    const host = resolveContainer(container);
    this.options = resolveOptions(options);

    if (this.options.injectStyles) {
      const root = host.getRootNode();
      injectStyles(root instanceof ShadowRoot ? root : document);
    }

    this.cache = new LruCache<number, CachedPage>(
      this.options.cacheSize,
      (_page, entry) => releaseCanvas(entry.canvas),
      (page) => !this.isOnScreen(page),
    );

    this.view = new BookView(host, this.options.labels, {
      prev: () => void this.prev(),
      next: () => void this.next(),
    });
    this.view.setControlsVisible(this.options.controls);

    this.gestures = new GestureController<CornerHandle>(this.view.root, {
      dragStart: (start) => this.onDragStart(start),
      dragMove: (dx, dy) => this.onDragMove(dx, dy),
      dragEnd: (velocity) => this.onDragEnd(velocity),
      tap: (x, y) => this.onTap(x, y),
      hover: (target) => this.onHover(target),
      settings: () => ({
        swipe: this.options.swipe,
        tap: this.options.clickToFlip,
        threshold: this.options.dragThreshold,
      }),
      ignore: (target) => this.view.isControl(target),
      handleAt: (target) => this.view.cornerAt(target),
      handleDirection: (handle) => (handle.side === 'right' ? 1 : -1),
    });

    this.keyboard = new KeyboardController(this.view.root, {
      next: () => void this.next(),
      prev: () => void this.prev(),
      first: () => void this.first(),
      last: () => void this.last(),
      enabled: () => this.options.keyboard,
    });

    this.resizeObserver =
      typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.onResize()) : null;
    // The stage also shrinks when controls are toggled, so observe it rather than the root.
    this.resizeObserver?.observe(this.view.stage);

    if (this.options.src !== undefined) void this.load(this.options.src);
  }

  // ---------------------------------------------------------------- public API

  /** Resolves when the current document is loaded (rejects if loading failed). */
  get ready(): Promise<void> {
    return this.loading;
  }

  get pageCount(): number {
    return this.doc?.pageCount ?? 0;
  }

  /** First visible page (1-based), `0` before the document is ready. */
  get currentPage(): number {
    return this.visiblePages[0] ?? 0;
  }

  /** All visible pages (1-based). */
  get visiblePages(): number[] {
    return pagesOfSpread(this.spreads[this.spreadIndex]).map((p) => p + 1);
  }

  get mode(): ResolvedMode {
    return this.currentMode ?? 'single';
  }

  get isFlipping(): boolean {
    return this.flip !== null && !this.flip.peek;
  }

  /** Root element created inside the container (useful for styling / focus). */
  get element(): HTMLElement {
    return this.view.root;
  }

  /** Opens another PDF in the same flipbook. */
  load(src: PdfSource): Promise<void> {
    this.options.src = src;
    const promise = this.loadDocument(src);
    // Failures are reported through the `error` event; don't leak unhandled rejections.
    promise.catch(() => undefined);
    this.loading = promise;
    return promise;
  }

  next(): Promise<boolean> {
    return this.step(1);
  }

  prev(): Promise<boolean> {
    return this.step(-1);
  }

  first(options?: GoToOptions): Promise<boolean> {
    return this.goTo(1, options);
  }

  last(options?: GoToOptions): Promise<boolean> {
    return this.goTo(Math.max(1, this.pageCount), options);
  }

  /** Goes to a 1-based page. Resolves `true` if the visible spread changed. */
  goTo(page: number, options: GoToOptions = {}): Promise<boolean> {
    if (!this.doc || !this.spreads.length) {
      this.options.startPage = Math.max(1, Math.floor(page));
      return Promise.resolve(false);
    }
    if (this.drag) return Promise.resolve(false);
    this.settle();
    const index = clamp(Math.floor(page) - 1, 0, this.doc.pageCount - 1);
    return this.flipTo(spreadIndexOfPage(this.spreads, index), options.animate ?? true);
  }

  setMode(mode: ViewMode): void {
    this.setOptions({ mode });
  }

  /** Updates options at runtime; only what changed is re-applied. */
  setOptions(partial: FlipbookOptions): void {
    const prev = this.options;
    const next = resolveOptions(partial, prev);
    this.options = next;

    if (partial.src !== undefined && partial.src !== prev.src) {
      void this.load(partial.src);
      return;
    }
    if (prev.controls !== next.controls) this.view.setControlsVisible(next.controls);
    if (partial.labels) {
      this.view.setLabels(next.labels);
      this.syncNavigation();
    }

    const changed = (key: keyof ResolvedOptions) => prev[key] !== next[key];
    if (changed('pageBackground')) this.cache.clear();
    if (changed('mode') || changed('showCover') || changed('singlePageBreakpoint') || changed('padding')) {
      this.layout(changed('showCover'));
    } else if (
      changed('pageBackground') ||
      changed('preloadSpreads') ||
      changed('maxPixelRatio') ||
      changed('maxCanvasPixels') ||
      changed('cacheSize')
    ) {
      this.refreshSlots();
      this.scheduleRenders();
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.loadToken++;
    cancelAnimationFrame(this.resizeFrame);
    clearTimeout(this.renderTimer);
    this.resizeObserver?.disconnect();
    this.gestures.destroy();
    this.keyboard.destroy();
    this.unloadDocument();
    this.view.destroy();
    this.removeAllListeners();
  }

  // ---------------------------------------------------------------- loading

  private async loadDocument(src: PdfSource): Promise<void> {
    if (this.destroyed) throw new Error('[pdf-flipbook] Instance was destroyed.');
    const token = ++this.loadToken;
    this.unloadDocument();
    this.view.setStatus('loading', this.options.labels.loading);

    let doc: PdfDocument | null = null;
    try {
      doc = await PdfDocument.load(src, this.options.pdfjs);
      if (token !== this.loadToken) return doc.destroy();
      const firstPage = await doc.getPageSize(0);
      if (token !== this.loadToken) return doc.destroy();

      this.doc = doc;
      this.pageAspect = firstPage.width / firstPage.height;
      this.view.setStatus('ready');
      this.emit('ready', { pageCount: doc.pageCount });
      if (token !== this.loadToken) return; // a listener destroyed or reloaded the book
      this.layout(true);
    } catch (error) {
      if (doc && doc !== this.doc) doc.destroy();
      if (token !== this.loadToken) return;
      this.view.setStatus('error', this.options.labels.error);
      this.emit('error', { error });
      throw error;
    }
  }

  private unloadDocument(): void {
    this.tween.cancel();
    this.gestures.cancel();
    this.flip = null;
    this.drag = null;
    this.hoverHandle = null;
    this.view.setDragging(false);
    this.view.setTurning(null);
    this.queue.clear();
    this.queue.resume();
    this.cache.clear();
    this.doc?.destroy();
    this.doc = null;
    this.spreads = [];
    this.spreadIndex = 0;
    this.lastPagesKey = '';
    this.refreshSlots();
  }

  // ---------------------------------------------------------------- layout

  private onResize(): void {
    if (this.resizeFrame) return;
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = 0;
      this.layout(false, RESIZE_RENDER_DELAY);
    });
  }

  /**
   * Recomputes mode, spreads and page size. Canvases are scaled with CSS right away;
   * sharper re-renders are scheduled (debounced while resizing).
   */
  private layout(rebuildSpreads = false, renderDelay = 0): void {
    const doc = this.doc;
    if (!doc || this.destroyed) return;

    const available = this.view.measure(this.options.padding);
    const hasSize = available.width > 0 && available.height > 0;
    const mode = hasSize
      ? resolveMode(this.options.mode, available, this.pageAspect, this.options.singlePageBreakpoint)
      : this.options.mode === 'auto'
        ? (this.currentMode ?? 'single')
        : this.options.mode;

    if (rebuildSpreads || mode !== this.currentMode || !this.spreads.length) {
      this.abortInteraction();
      const anchor = this.spreads.length
        ? (pagesOfSpread(this.spreads[this.spreadIndex])[0] ?? 0)
        : this.options.startPage - 1;
      const modeChanged = mode !== this.currentMode;
      this.currentMode = mode;
      this.spreads = buildSpreads(doc.pageCount, mode, this.options.showCover);
      this.spreadIndex = spreadIndexOfPage(this.spreads, clamp(anchor, 0, doc.pageCount - 1));
      if (modeChanged) this.emit('modechange', { mode });
    }

    if (hasSize) {
      const size = fitPage(mode, available, this.pageAspect);
      if (size.width !== this.pageSize.width || size.height !== this.pageSize.height) {
        this.abortInteraction(); // curl geometry is tied to the page size
        this.pageSize = size;
      }
      this.view.setLayout(mode, this.pageSize);
    }
    this.refreshSlots();
    this.syncNavigation();
    if (hasSize) this.scheduleRenders(renderDelay);
  }

  // ---------------------------------------------------------------- navigation & flipping

  private step(direction: DragDirection, corner: Corner = 'bottom'): Promise<boolean> {
    if (!this.spreads.length || this.drag) return Promise.resolve(false);

    // A hover hint on the same side turns into the real turn, starting from the lifted corner.
    const peek = this.flip?.peek ? this.flip : null;
    if (peek && peek.forward === (direction === 1)) {
      peek.peek = false;
      this.emitFlipStart(peek);
      return this.animateFlip(peek.forward ? 1 : 0, this.options.flipDuration, easeInOutCubic, ARC_LIFT).then(
        () => true,
      );
    }
    this.settle(); // rapid clicks: finish the running turn instantly, then start the next
    return this.flipTo(this.spreadIndex + direction, true, corner);
  }

  private flipTo(target: number, animate: boolean, corner: Corner = 'bottom'): Promise<boolean> {
    const index = clamp(target, 0, this.spreads.length - 1);
    if (index === this.spreadIndex) return Promise.resolve(false);
    if (!animate || !this.pageSize.width) {
      this.setSpread(index);
      return Promise.resolve(true);
    }
    const forward = index > this.spreadIndex;
    const flip = forward
      ? this.beginFlip(this.spreadIndex, index, true, corner)
      : this.beginFlip(index, this.spreadIndex, false, corner);
    this.emitFlipStart(flip);
    return this.animateFlip(forward ? 1 : 0, this.options.flipDuration, easeInOutCubic, ARC_LIFT).then(() => true);
  }

  private beginFlip(low: number, high: number, forward: boolean, corner: Corner, peek = false): FlipState {
    const setup: CurlSetup = {
      mode: this.mode,
      width: this.pageSize.width,
      height: this.pageSize.height,
      forward,
      corner,
    };
    const flip: FlipState = {
      low,
      high,
      forward,
      setup,
      point: cornerPoint(setup),
      progress: forward ? 0 : 1,
      target: null,
      peek,
    };
    this.flip = flip;
    this.queue.pause(); // keep rasterization off the animation frames (urgent pages excepted)
    this.view.setTurning(forward);
    this.refreshSlots();
    this.setFlipPoint(flip.point);
    this.scheduleRenders();
    return flip;
  }

  private emitFlipStart(flip: FlipState): void {
    const firstPage = (spread: number) => (pagesOfSpread(this.spreads[spread])[0] ?? 0) + 1;
    this.emit('flipstart', {
      direction: flip.forward ? 'forward' : 'backward',
      fromPage: firstPage(flip.forward ? flip.low : flip.high),
      toPage: firstPage(flip.forward ? flip.high : flip.low),
    });
  }

  /** Moves the grabbed corner and redraws the curl. */
  private setFlipPoint(point: Point): void {
    const flip = this.flip;
    if (!flip) return;
    const frame = computeCurl(flip.setup, point);
    flip.point = frame.point;
    flip.progress = flip.forward ? frame.turned : 1 - frame.turned;
    this.view.setCurl(frame);
  }

  /**
   * Animates the corner to `to`. `lift` (fraction of the page height) bends the path
   * into an arc so the page curls instead of sliding flat.
   */
  private animatePoint(to: Point, duration: number, easing: Easing, lift = 0): Promise<boolean> {
    const flip = this.flip;
    if (!flip) return Promise.resolve(false);
    if (this.options.respectReducedMotion && prefersReducedMotion()) duration = 0;
    const from = { ...flip.point };
    const liftPx = lift * flip.setup.height * (flip.setup.corner === 'top' ? 1 : -1);
    return this.tween.run(0, 1, duration, easing, (t) => {
      this.setFlipPoint({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t + liftPx * Math.sin(Math.PI * t),
      });
    });
  }

  /** Animates to the low (0) or high (1) spread, then commits. */
  private animateFlip(target: 0 | 1, duration: number, easing: Easing, lift = 0): Promise<boolean> {
    const flip = this.flip;
    if (!flip) return Promise.resolve(false);
    flip.target = target;
    const completes = flip.forward === (target === 1);
    const to = completes ? turnedPoint(flip.setup) : cornerPoint(flip.setup);
    return this.animatePoint(to, duration, easing, lift).then((completed) => {
      if (completed && this.flip === flip) this.commitFlip();
      return completed;
    });
  }

  private commitFlip(): void {
    const flip = this.flip;
    if (!flip) return;
    this.flip = null;
    this.view.setTurning(null);
    this.queue.resume();
    if (flip.peek) {
      this.refreshSlots();
      this.scheduleRenders();
      return;
    }
    const target = flip.target ?? (flip.progress >= 0.5 ? 1 : 0);
    const before = this.spreadIndex;
    this.setSpread(target === 1 ? flip.high : flip.low);
    this.emit('flipend', { page: this.currentPage, changed: this.spreadIndex !== before });
  }

  /** Jumps a running (non-drag) animation to its end; a hover hint is simply dropped. */
  private settle(): void {
    if (!this.flip || this.drag) return;
    this.tween.cancel();
    this.commitFlip();
  }

  /** Ends any gesture/animation immediately (used on mode change and unload). */
  private abortInteraction(): void {
    if (this.drag) {
      this.gestures.cancel();
      this.drag = null;
      this.view.setDragging(false);
    }
    if (this.flip) {
      this.tween.cancel();
      this.commitFlip();
    }
  }

  private setSpread(index: number): void {
    this.spreadIndex = index;
    this.refreshSlots();
    this.syncNavigation();
    this.scheduleRenders();
  }

  // ---------------------------------------------------------------- gestures

  private onDragStart(start: DragStart<CornerHandle>): boolean {
    if (!this.doc || !this.spreads.length || !this.pageSize.width) return false;
    const forward = start.direction === 1;
    const pointer = this.view.toBookPoint(start.clientX, start.clientY);
    const corner: Corner = start.handle?.corner ?? (pointer.y < this.pageSize.height / 2 ? 'top' : 'bottom');
    this.hoverHandle = null;

    let flip = this.flip;
    if (flip?.peek && flip.forward === forward && flip.setup.corner === corner) {
      // Continue from the hover hint without a jump.
      this.tween.cancel();
      flip.peek = false;
    } else {
      this.settle();
      const target = this.spreadIndex + start.direction;
      if (target < 0 || target >= this.spreads.length) return false;
      flip = forward
        ? this.beginFlip(this.spreadIndex, target, true, corner)
        : this.beginFlip(target, this.spreadIndex, false, corner);
    }
    this.emitFlipStart(flip);

    const fromCorner = start.handle !== null;
    this.drag = {
      // A grabbed corner sticks to the pointer; elsewhere the corner moves with the pointer's delta.
      origin: fromCorner ? pointer : { ...flip.point },
      fromCorner,
      // On a single page the corner has a whole page width to travel; amplify swipes a bit.
      scale: this.mode === 'single' && !fromCorner ? 1.5 : 1,
    };
    this.view.setDragging(true);
    return true;
  }

  private onDragMove(deltaX: number, deltaY: number): void {
    const flip = this.flip;
    const drag = this.drag;
    if (!flip || !drag) return;
    const { width, height, corner } = flip.setup;
    let y = drag.origin.y + deltaY;
    if (!drag.fromCorner) {
      const travel = clamp(Math.abs(deltaX * drag.scale) / (2 * width), 0, 1);
      y += (corner === 'top' ? 1 : -1) * DRAG_LIFT * height * Math.sin(Math.PI * travel);
    }
    this.setFlipPoint({ x: drag.origin.x + deltaX * drag.scale, y });
  }

  private onDragEnd(velocityX: number): void {
    const flip = this.flip;
    if (!this.drag || !flip) return;
    this.drag = null;
    this.view.setDragging(false);

    const target: 0 | 1 =
      Math.abs(velocityX) > FLICK_VELOCITY ? (velocityX < 0 ? 1 : 0) : flip.progress > 0.5 ? 1 : 0;
    const duration = Math.max(150, this.options.flipDuration * Math.abs(target - flip.progress));
    void this.animateFlip(target, duration, easeOutCubic);
  }

  private onTap(clientX: number, clientY: number): void {
    const rect = this.view.book.getBoundingClientRect();
    if (!rect.width) return;
    const corner: Corner = clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
    void this.step(clientX >= rect.left + rect.width / 2 ? 1 : -1, corner);
  }

  /** Mouse over a corner: lift it slightly to show the page can be pulled from there. */
  private onHover(target: EventTarget | null): void {
    const handle = target ? this.view.cornerAt(target) : null;
    const same =
      handle === this.hoverHandle ||
      (handle && this.hoverHandle && handle.side === this.hoverHandle.side && handle.corner === this.hoverHandle.corner);
    if (same) return;
    this.hoverHandle = handle;

    const peek = this.flip?.peek ? this.flip : null;
    if (peek) {
      // Fold the hint back, then drop it (unless something else took over meanwhile).
      void this.animatePoint(cornerPoint(peek.setup), 180, easeOutCubic).then(() => {
        if (this.flip === peek && peek.peek) this.commitFlip();
        if (this.hoverHandle && !this.flip) this.onHoverStart(this.hoverHandle);
      });
      return;
    }
    if (handle && !this.flip) this.onHoverStart(handle);
  }

  private onHoverStart(handle: CornerHandle): void {
    if (!this.options.cornerHint || this.drag || this.flip || !this.pageSize.width) return;
    const forward = handle.side === 'right';
    const target = this.spreadIndex + (forward ? 1 : -1);
    if (target < 0 || target >= this.spreads.length) return;
    const flip = forward
      ? this.beginFlip(this.spreadIndex, target, true, handle.corner, true)
      : this.beginFlip(target, this.spreadIndex, false, handle.corner, true);
    const size = Math.min(flip.setup.width, flip.setup.height) * PEEK_SIZE;
    const c = cornerPoint(flip.setup);
    void this.animatePoint(
      { x: c.x + (forward ? -size : size), y: c.y + (handle.corner === 'top' ? size : -size) },
      260,
      easeOutCubic,
    );
  }

  // ---------------------------------------------------------------- rendering

  /** Which page each slot shows in the current state. */
  private slotPages(): Record<SlotName, number | null> {
    const flip = this.flip;
    if (flip) {
      const low = this.spreads[flip.low];
      const high = this.spreads[flip.high];
      return { left: low.left, right: high.right, front: low.right, back: high.left };
    }
    const spread = this.spreads[this.spreadIndex];
    return { left: spread?.left ?? null, right: spread?.right ?? null, front: null, back: null };
  }

  private isOnScreen(page: number): boolean {
    return Object.values(this.slotPages()).includes(page);
  }

  private refreshSlots(): void {
    const pages = this.slotPages();
    const contents = {} as Record<SlotName, SlotContent>;
    for (const name of SLOT_NAMES) {
      const page = pages[name];
      contents[name] = { page, canvas: page === null ? null : (this.cache.peek(page)?.canvas ?? null) };
    }
    // The folded-over side of a single page has no content: show it as blank paper.
    if (this.flip) contents[this.flip.forward ? 'back' : 'front'].empty = 'paper';
    this.view.setSlots(contents);
  }

  /**
   * Renders on-screen pages first, then neighbouring spreads around where the reader
   * is heading. Work that is no longer needed is dropped or aborted.
   */
  private scheduleRenders(delay = 0): void {
    clearTimeout(this.renderTimer);
    if (delay > 0) {
      this.renderTimer = setTimeout(() => this.scheduleRenders(), delay);
      return;
    }
    const doc = this.doc;
    if (!doc || !this.spreads.length || !this.pageSize.width) return;

    const onScreen = Object.values(this.slotPages()).filter((p): p is number => p !== null);
    const ordered = [...new Set(onScreen)];
    const add = (spread: number) => {
      for (const page of pagesOfSpread(this.spreads[spread])) {
        if (!ordered.includes(page)) ordered.push(page);
      }
    };
    const flip = this.flip;
    const base = flip ? (flip.target === 0 ? flip.low : flip.high) : this.spreadIndex;
    add(base);
    for (let d = 1; d <= this.options.preloadSpreads; d++) {
      add(base + d);
      add(base - d);
    }

    // Most important pages become most-recently-used so the LRU never drops them.
    this.cache.setCapacity(Math.max(this.options.cacheSize, ordered.length + 2));
    for (let i = ordered.length - 1; i >= 0; i--) this.cache.get(ordered[i]);

    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.options.maxPixelRatio);
    const cssBox = { ...this.pageSize };
    const box = { width: Math.round(cssBox.width * pixelRatio), height: Math.round(cssBox.height * pixelRatio) };
    const keep = new Set<string>();
    const jobs: QueueJob<HTMLCanvasElement>[] = [];

    for (const page of ordered) {
      const cached = this.cache.peek(page);
      if (cached && cached.box.width >= box.width * 0.95 && cached.box.height >= box.height * 0.95) continue;
      const key = `${page}@${box.width}x${box.height}`;
      keep.add(key);
      jobs.push({
        key,
        urgent: onScreen.includes(page),
        run: (signal) =>
          doc.render({
            index: page,
            box: cssBox,
            pixelRatio,
            maxCanvasPixels: this.options.maxCanvasPixels,
            background: this.options.pageBackground,
            signal,
          }),
        onDone: (canvas) => this.onPageRendered(doc, page, canvas, box),
        onError: (error) => this.onRenderError(doc, page, error),
      });
    }
    this.queue.cancelExcept(keep);
    this.queue.schedule(jobs);
  }

  private onPageRendered(doc: PdfDocument, page: number, canvas: HTMLCanvasElement, box: Size): void {
    if (doc !== this.doc) {
      releaseCanvas(canvas);
      return;
    }
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', this.options.labels.page(page + 1));
    this.cache.set(page, { canvas, box });
    this.refreshSlots();
  }

  private onRenderError(doc: PdfDocument, page: number, error: unknown): void {
    if (doc !== this.doc || isAbortError(error)) return;
    this.emit('error', { error, page: page + 1 });
  }

  private syncNavigation(): void {
    const pages = this.visiblePages;
    const total = this.pageCount;
    const range = pages.length > 1 ? `${pages[0]}–${pages[pages.length - 1]}` : String(pages[0] ?? '');
    this.view.setNavigation(
      pages.length ? this.options.labels.counter(range, total) : '',
      this.spreadIndex > 0,
      this.spreadIndex < this.spreads.length - 1,
    );
    const key = pages.join(',');
    if (pages.length && key !== this.lastPagesKey) {
      this.lastPagesKey = key;
      this.emit('pagechange', { page: pages[0], pages, pageCount: total });
    }
  }
}

/** Convenience factory, handy for the script-tag build: `PdfFlipbook.createFlipbook(el, opts)`. */
export function createFlipbook(container: HTMLElement | string, options?: FlipbookOptions): PdfFlipbook {
  return new PdfFlipbook(container, options);
}
