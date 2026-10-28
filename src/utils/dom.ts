export const isBrowser = (): boolean =>
  typeof window !== 'undefined' && typeof document !== 'undefined';

export function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  attrs?: Record<string, string>,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export function resolveContainer(container: HTMLElement | string): HTMLElement {
  if (typeof container !== 'string') return container;
  const el = document.querySelector<HTMLElement>(container);
  if (!el) throw new Error(`[pdf-flipbook] Container not found: ${container}`);
  return el;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Frees the backing store of a canvas immediately instead of waiting for GC (important on iOS). */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
  canvas.remove();
}
