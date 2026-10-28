import type { ResolvedMode } from './types';

/**
 * A spread is what the reader sees at rest. Page indexes are 0-based; `null` means
 * "no page on this side" (e.g. the inside of the front cover).
 * In single mode only `right` is used.
 */
export interface Spread {
  left: number | null;
  right: number | null;
}

export function buildSpreads(pageCount: number, mode: ResolvedMode, showCover: boolean): Spread[] {
  const spreads: Spread[] = [];
  if (pageCount <= 0) return spreads;

  if (mode === 'single') {
    for (let i = 0; i < pageCount; i++) spreads.push({ left: null, right: i });
    return spreads;
  }

  let i = 0;
  if (showCover) {
    spreads.push({ left: null, right: 0 });
    i = 1;
  }
  for (; i < pageCount; i += 2) {
    spreads.push({ left: i, right: i + 1 < pageCount ? i + 1 : null });
  }
  return spreads;
}

export function spreadIndexOfPage(spreads: Spread[], pageIndex: number): number {
  const idx = spreads.findIndex((s) => s.left === pageIndex || s.right === pageIndex);
  if (idx >= 0) return idx;
  return pageIndex < 0 ? 0 : Math.max(0, spreads.length - 1);
}

export function pagesOfSpread(spread: Spread | undefined): number[] {
  if (!spread) return [];
  const pages: number[] = [];
  if (spread.left !== null) pages.push(spread.left);
  if (spread.right !== null) pages.push(spread.right);
  return pages;
}
