import type { PdfjsModule, PdfjsOptions } from '../core/types';
import { importPdfjs } from './pdfjs-import';

let defaultLib: Promise<PdfjsModule> | null = null;

const cdnBase = (options: PdfjsOptions, version: string): string =>
  (options.cdnBaseUrl ?? `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}`).replace(/\/+$/, '');

/** Loads pdf.js once (shared by all flipbooks on the page) and makes sure a worker is configured. */
export async function loadPdfjs(options: PdfjsOptions = {}): Promise<PdfjsModule> {
  let lib: PdfjsModule;
  if (options.lib) {
    lib = typeof options.lib === 'function' ? await options.lib() : options.lib;
  } else {
    if (!defaultLib) {
      defaultLib = importPdfjs(cdnBase(options, __PDFJS_VERSION__));
      defaultLib.catch(() => (defaultLib = null)); // allow retry after a network failure
    }
    lib = await defaultLib;
  }

  if (options.workerSrc) {
    lib.GlobalWorkerOptions.workerSrc = options.workerSrc;
  } else if (!lib.GlobalWorkerOptions.workerSrc) {
    // pdf.js wraps cross-origin worker URLs in a same-origin blob, so a CDN URL works.
    lib.GlobalWorkerOptions.workerSrc = `${cdnBase(options, lib.version)}/build/pdf.worker.min.mjs`;
  }
  return lib;
}
