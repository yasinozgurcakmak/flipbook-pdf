export { PdfFlipbook, createFlipbook, type GoToOptions } from './core/PdfFlipbook';
export { defineFlipbookElement, type PdfFlipbookElement } from './element/defineElement';
export { flipbookCss, injectStyles } from './view/styles';
export { DEFAULT_LABELS, DEFAULT_OPTIONS } from './core/options';
export { buildSpreads, type Spread } from './core/spreads';
export type {
  FlipDirection,
  FlipbookEvents,
  FlipbookLabels,
  FlipbookOptions,
  PageChangeEvent,
  PdfSource,
  PdfjsModule,
  PdfjsOptions,
  ResolvedMode,
  ViewMode,
} from './core/types';
