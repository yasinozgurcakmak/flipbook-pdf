import type * as Pdfjs from 'pdfjs-dist';

export type PdfjsModule = typeof Pdfjs;

/** `auto` switches between single and double page depending on the available space. */
export type ViewMode = 'auto' | 'single' | 'double';
export type ResolvedMode = 'single' | 'double';

/** URL of the PDF or its raw bytes. Note: pdf.js transfers (detaches) passed ArrayBuffers. */
export type PdfSource = string | URL | ArrayBuffer | Uint8Array;

export interface PdfjsOptions {
  /**
   * Provide pdf.js yourself (module or async loader), e.g. `() => import('pdfjs-dist')`.
   * By default the ESM build imports `pdfjs-dist` lazily and the IIFE build loads it from a CDN.
   */
  lib?: PdfjsModule | (() => Promise<PdfjsModule>);
  /** Worker script URL. Self-hosting is recommended in production (CSP, offline). Defaults to the CDN. */
  workerSrc?: string;
  /** CDN base used when no `workerSrc` / `lib` is given. Default: jsDelivr for the matching pdf.js version. */
  cdnBaseUrl?: string;
  /** Extra parameters forwarded to `pdfjs.getDocument()` (httpHeaders, withCredentials, password...). */
  documentParams?: Record<string, unknown>;
}

export interface FlipbookLabels {
  book: string;
  prev: string;
  next: string;
  loading: string;
  error: string;
  /** Text of the page counter, e.g. `"2-3 / 40"`. */
  counter: (pages: string, total: number) => string;
  /** Accessible name of a rendered page. */
  page: (page: number) => string;
}

export interface FlipbookOptions {
  /** PDF to open. Can also be provided later with `load()`. */
  src?: PdfSource;
  /** 1-based page to open first. Default `1`. */
  startPage?: number;
  /** Default `auto`. */
  mode?: ViewMode;
  /** In `auto` mode, containers narrower than this (px) always use single page. Default `640`. */
  singlePageBreakpoint?: number;
  /** In double mode, show the first page alone on the right like a book cover. Default `true`. */
  showCover?: boolean;
  /** Page-turn animation duration in ms. Default `800`. */
  flipDuration?: number;
  /** Spreads pre-rendered ahead and behind the current one. Default `1`. */
  preloadSpreads?: number;
  /** Upper bound for devicePixelRatio when rendering (memory vs. sharpness). Default `2`. */
  maxPixelRatio?: number;
  /** Hard cap for a single canvas' pixel count (mobile browsers fail above ~16M). Default `16_777_216`. */
  maxCanvasPixels?: number;
  /** Maximum rendered pages kept in memory. Default `12`. */
  cacheSize?: number;
  /** Empty space around the book, in px. Default `16`. */
  padding?: number;
  /** Mouse / touch drag to turn pages. Default `true`. */
  swipe?: boolean;
  /** Click / tap on the left or right half to turn pages. Default `true`. */
  clickToFlip?: boolean;
  /** Arrow keys, PageUp/PageDown, Home/End when the book has focus. Default `true`. */
  keyboard?: boolean;
  /** Lift a page corner slightly when the mouse hovers it, hinting that it can be pulled. Default `true`. */
  cornerHint?: boolean;
  /** Built-in prev/next buttons and page counter. Default `true`. */
  controls?: boolean;
  /** Pixels the pointer has to travel before a drag starts. Default `6`. */
  dragThreshold?: number;
  /** Skip animations when the OS asks for reduced motion. Default `true`. */
  respectReducedMotion?: boolean;
  /** Inject the default stylesheet. Disable if you ship `flipbookCss` yourself (strict CSP). Default `true`. */
  injectStyles?: boolean;
  /** Canvas background used while rendering pages. Default `#ffffff`. */
  pageBackground?: string;
  labels?: Partial<FlipbookLabels>;
  pdfjs?: PdfjsOptions;
}

export type FlipDirection = 'forward' | 'backward';

export interface PageChangeEvent {
  /** First visible page (1-based). */
  page: number;
  /** All visible pages (1-based). */
  pages: number[];
  pageCount: number;
}

export interface FlipbookEvents {
  ready: { pageCount: number };
  pagechange: PageChangeEvent;
  flipstart: { direction: FlipDirection; fromPage: number; toPage: number };
  /** `changed` is false when a drag was released and the page fell back. */
  flipend: { page: number; changed: boolean };
  modechange: { mode: ResolvedMode };
  error: { error: unknown; page?: number };
}
