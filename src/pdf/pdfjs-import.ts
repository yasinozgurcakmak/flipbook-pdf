import type { PdfjsModule } from '../core/types';

/**
 * ESM build: let the app's bundler resolve pdfjs-dist. The dynamic import keeps
 * pdf.js (~400 kB) out of the initial bundle and SSR-safe.
 * The IIFE build swaps this module for `pdfjs-import.cdn.ts` (see vite.config.ts).
 */
export const importPdfjs = (_cdnBase: string): Promise<PdfjsModule> => import('pdfjs-dist');
