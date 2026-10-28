import type { FlipbookLabels, FlipbookOptions } from './types';

export const DEFAULT_LABELS: FlipbookLabels = {
  book: 'PDF book',
  prev: 'Previous page',
  next: 'Next page',
  loading: 'Loading…',
  error: 'The document could not be loaded.',
  counter: (pages, total) => `${pages} / ${total}`,
  page: (page) => `Page ${page}`,
};

export type ResolvedOptions = Required<Omit<FlipbookOptions, 'src' | 'labels' | 'pdfjs'>> &
  Pick<FlipbookOptions, 'src' | 'pdfjs'> & { labels: FlipbookLabels };

export const DEFAULT_OPTIONS: Omit<ResolvedOptions, 'labels' | 'src' | 'pdfjs'> = {
  startPage: 1,
  mode: 'auto',
  singlePageBreakpoint: 640,
  showCover: true,
  flipDuration: 800,
  preloadSpreads: 1,
  maxPixelRatio: 2,
  maxCanvasPixels: 16_777_216,
  cacheSize: 12,
  padding: 16,
  swipe: true,
  clickToFlip: true,
  keyboard: true,
  cornerHint: true,
  controls: true,
  dragThreshold: 6,
  respectReducedMotion: true,
  injectStyles: true,
  pageBackground: '#ffffff',
};

export function resolveOptions(options: FlipbookOptions, base?: ResolvedOptions): ResolvedOptions {
  const defined = Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  ) as FlipbookOptions;
  const previous = base ?? { ...DEFAULT_OPTIONS, labels: DEFAULT_LABELS };
  return {
    ...previous,
    ...defined,
    labels: { ...previous.labels, ...defined.labels },
  };
}
