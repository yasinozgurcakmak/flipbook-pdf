import { describe, expect, it } from 'vitest';
import {
  clipHalfPlane,
  computeCurl,
  constrainPoint,
  cornerPoint,
  turnedPoint,
  type CurlSetup,
  type Point,
} from '../src/view/curl';

const W = 400;
const H = 600;
const forwardTop: CurlSetup = { mode: 'double', width: W, height: H, forward: true, corner: 'top' };

/** Applies the CSS matrix(a, b, c, d, e, f) of a frame to a point. */
const apply = (m: number[], p: Point): Point => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
const close = (a: Point, b: Point) => {
  expect(a.x).toBeCloseTo(b.x, 4);
  expect(a.y).toBeCloseTo(b.y, 4);
};

describe('curl geometry', () => {
  it('places corners on the outer edge and mirrors them across the spine', () => {
    expect(cornerPoint(forwardTop)).toEqual({ x: 2 * W, y: 0 });
    expect(turnedPoint(forwardTop)).toEqual({ x: 0, y: 0 });
    const backBottom: CurlSetup = { ...forwardTop, forward: false, corner: 'bottom' };
    expect(cornerPoint(backBottom)).toEqual({ x: 0, y: H });
    expect(turnedPoint(backBottom)).toEqual({ x: 2 * W, y: H });
    const single: CurlSetup = { ...forwardTop, mode: 'single' };
    expect(cornerPoint(single)).toEqual({ x: W, y: 0 });
    expect(turnedPoint(single)).toEqual({ x: -W, y: 0 });
  });

  it('shows the flat page when the corner has not moved', () => {
    const frame = computeCurl(forwardTop, cornerPoint(forwardTop));
    expect(frame.turned).toBe(0);
    expect(frame.flapClip).toEqual([]);
    expect(frame.peelClip).toHaveLength(4);
  });

  it('keeps the paper attached to the spine', () => {
    // Dragged far away: the corner may not get further than one page width from the spine top.
    const p = constrainPoint(forwardTop, { x: 2000, y: 1500 });
    expect(Math.hypot(p.x - W, p.y)).toBeLessThanOrEqual(W + 1e-6);
    expect(Math.hypot(p.x - W, p.y - H)).toBeLessThanOrEqual(Math.hypot(W, H) + 1e-6);
  });

  it('folds the grabbed corner exactly onto the pointer', () => {
    const target = { x: 650, y: 120 };
    const frame = computeCurl(forwardTop, target);
    close(frame.point, target);
    // Flap-local point at the sheet's corner (u = 0 is the back side of the outer edge).
    close(apply(frame.flapMatrix, { x: 0, y: 0 }), target);
    expect(frame.turned).toBeCloseTo((2 * W - target.x) / (2 * W), 6);
  });

  it('flap is a rotation (content never mirrored) and lands on the left page when turned', () => {
    const frame = computeCurl(forwardTop, turnedPoint(forwardTop));
    const [a, b, c, d] = frame.flapMatrix;
    expect(a * d - b * c).toBeCloseTo(1, 6);
    close(apply(frame.flapMatrix, { x: 0, y: 0 }), { x: 0, y: 0 });
    close(apply(frame.flapMatrix, { x: W, y: H }), { x: W, y: H });
    expect(frame.turned).toBe(1);
  });

  it('backward turns land the flap on the right page', () => {
    const setup: CurlSetup = { ...forwardTop, forward: false, corner: 'bottom' };
    const frame = computeCurl(setup, turnedPoint(setup));
    close(apply(frame.flapMatrix, { x: 0, y: 0 }), { x: W, y: 0 });
    close(apply(frame.flapMatrix, { x: W, y: H }), { x: 2 * W, y: H });
  });

  it('single mode hides the parts of the flap outside the book', () => {
    const setup: CurlSetup = { ...forwardTop, mode: 'single', corner: 'bottom' };
    const frame = computeCurl(setup, { x: -100, y: 500 });
    for (const q of frame.flapClip) {
      const book = apply(frame.flapMatrix, q);
      expect(book.x).toBeGreaterThanOrEqual(-1e-6);
    }
  });
});

describe('clipHalfPlane', () => {
  it('cuts a square along a diagonal', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const kept = clipHalfPlane(square, { x: 0.5, y: 0.5 }, { x: Math.SQRT1_2, y: Math.SQRT1_2 }, 1);
    expect(kept).toHaveLength(3);
  });
});
