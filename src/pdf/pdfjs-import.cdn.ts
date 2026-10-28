import type { PdfjsModule } from '../core/types';

/** IIFE build: no bundler on the consumer side, so pdf.js is fetched from the CDN at runtime. */
export const importPdfjs = (cdnBase: string): Promise<PdfjsModule> =>
  import(/* @vite-ignore */ `${cdnBase}/build/pdf.min.mjs`);
