import type { ResolvedMode, ViewMode } from './types';

export interface Size {
  width: number;
  height: number;
}

/**
 * Picks single/double page mode. In `auto`, double is used when the container is
 * wide enough that two pages side by side are not much smaller than a single page.
 */
export function resolveMode(
  requested: ViewMode,
  container: Size,
  pageAspect: number,
  singlePageBreakpoint: number,
): ResolvedMode {
  if (requested !== 'auto') return requested;
  const { width, height } = container;
  if (width < singlePageBreakpoint) return 'single';
  const singleHeight = Math.min(height, width / pageAspect);
  const doubleHeight = Math.min(height, width / (2 * pageAspect));
  return doubleHeight >= singleHeight * 0.75 ? 'double' : 'single';
}

/** Largest page size (CSS px) that fits the container for the given mode. */
export function fitPage(mode: ResolvedMode, container: Size, pageAspect: number): Size {
  const columns = mode === 'double' ? 2 : 1;
  let height = container.height;
  let width = height * pageAspect;
  if (width * columns > container.width) {
    width = container.width / columns;
    height = width / pageAspect;
  }
  return { width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(height)) };
}
