import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfSource, PdfjsOptions } from '../core/types';
import type { Size } from '../core/layout';
import { loadPdfjs } from './pdfjs';

export interface RenderRequest {
  /** 0-based page index. */
  index: number;
  /** Box (CSS px) the page must fit into. */
  box: Size;
  pixelRatio: number;
  maxCanvasPixels: number;
  background: string;
  signal: AbortSignal;
}

const abortError = () => new DOMException('Render aborted', 'AbortError');

/** Thin wrapper around a pdf.js document: page sizes + cancellable canvas rendering. */
export class PdfDocument {
  private sizes = new Map<number, Promise<Size>>();

  private constructor(
    private readonly task: PDFDocumentLoadingTask,
    private readonly doc: PDFDocumentProxy,
  ) {}

  static async load(source: PdfSource, options: PdfjsOptions = {}): Promise<PdfDocument> {
    const lib = await loadPdfjs(options);
    const params: Record<string, unknown> = { ...options.documentParams };
    if (typeof source === 'string' || source instanceof URL) params.url = source;
    else params.data = source instanceof Uint8Array ? source : new Uint8Array(source);

    const task = lib.getDocument(params);
    try {
      return new PdfDocument(task, await task.promise);
    } catch (error) {
      void task.destroy();
      throw error;
    }
  }

  get pageCount(): number {
    return this.doc.numPages;
  }

  /** Page size in PDF points (scale 1, rotation applied). */
  getPageSize(index: number): Promise<Size> {
    let size = this.sizes.get(index);
    if (!size) {
      size = this.doc.getPage(index + 1).then((page) => {
        const { width, height } = page.getViewport({ scale: 1 });
        return { width, height };
      });
      this.sizes.set(index, size);
    }
    return size;
  }

  async render(req: RenderRequest): Promise<HTMLCanvasElement> {
    const { signal } = req;
    if (signal.aborted) throw abortError();
    const page = await this.doc.getPage(req.index + 1);
    if (signal.aborted) throw abortError();

    const base = page.getViewport({ scale: 1 });
    const fit = Math.min(req.box.width / base.width, req.box.height / base.height);
    let scale = fit * req.pixelRatio;
    const pixels = base.width * base.height * scale * scale;
    if (pixels > req.maxCanvasPixels) scale *= Math.sqrt(req.maxCanvasPixels / pixels);

    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const task = page.render({ canvas, viewport, background: req.background });
    const onAbort = () => task.cancel();
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      await task.promise;
      return canvas;
    } catch (error) {
      canvas.width = canvas.height = 0;
      throw signal.aborted ? abortError() : error;
    } finally {
      signal.removeEventListener('abort', onAbort);
      // Release parsed operator lists; the bitmap on the canvas is all we need.
      page.cleanup();
    }
  }

  destroy(): void {
    this.sizes.clear();
    void this.task.destroy();
  }
}

export const isAbortError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'AbortError' || error.name === 'RenderingCancelledException');
