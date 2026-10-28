import { describe, expect, it } from 'vitest';
import { buildSpreads, pagesOfSpread, spreadIndexOfPage } from '../src/core/spreads';
import { fitPage, resolveMode } from '../src/core/layout';

describe('buildSpreads', () => {
  it('single mode has one page per spread', () => {
    expect(buildSpreads(3, 'single', true)).toEqual([
      { left: null, right: 0 },
      { left: null, right: 1 },
      { left: null, right: 2 },
    ]);
  });

  it('double mode with cover: cover alone, then pairs, odd back page alone on the left', () => {
    expect(buildSpreads(4, 'double', true)).toEqual([
      { left: null, right: 0 },
      { left: 1, right: 2 },
      { left: 3, right: null },
    ]);
    expect(buildSpreads(5, 'double', true)).toEqual([
      { left: null, right: 0 },
      { left: 1, right: 2 },
      { left: 3, right: 4 },
    ]);
  });

  it('double mode without cover pairs from the first page', () => {
    expect(buildSpreads(3, 'double', false)).toEqual([
      { left: 0, right: 1 },
      { left: 2, right: null },
    ]);
  });

  it('handles empty documents', () => {
    expect(buildSpreads(0, 'double', true)).toEqual([]);
  });
});

describe('spread lookup', () => {
  const spreads = buildSpreads(6, 'double', true);

  it('finds the spread of a page', () => {
    expect(spreadIndexOfPage(spreads, 0)).toBe(0);
    expect(spreadIndexOfPage(spreads, 2)).toBe(1);
    expect(spreadIndexOfPage(spreads, 5)).toBe(3);
  });

  it('clamps out-of-range pages', () => {
    expect(spreadIndexOfPage(spreads, -3)).toBe(0);
    expect(spreadIndexOfPage(spreads, 99)).toBe(spreads.length - 1);
  });

  it('lists visible pages', () => {
    expect(pagesOfSpread(spreads[0])).toEqual([0]);
    expect(pagesOfSpread(spreads[1])).toEqual([1, 2]);
    expect(pagesOfSpread(undefined)).toEqual([]);
  });
});

describe('layout', () => {
  const a4 = 1 / Math.SQRT2;

  it('auto picks double on wide containers and single on tall/narrow ones', () => {
    expect(resolveMode('auto', { width: 1600, height: 900 }, a4, 640)).toBe('double');
    expect(resolveMode('auto', { width: 800, height: 1100 }, a4, 640)).toBe('single');
    expect(resolveMode('auto', { width: 500, height: 300 }, a4, 640)).toBe('single');
  });

  it('respects an explicit mode', () => {
    expect(resolveMode('double', { width: 300, height: 900 }, a4, 640)).toBe('double');
  });

  it('fits pages inside the container keeping the aspect ratio', () => {
    const size = fitPage('double', { width: 1000, height: 1000 }, 0.5);
    expect(size).toEqual({ width: 500, height: 1000 });
    const limitedByWidth = fitPage('double', { width: 400, height: 1000 }, 0.5);
    expect(limitedByWidth).toEqual({ width: 200, height: 400 });
  });
});
