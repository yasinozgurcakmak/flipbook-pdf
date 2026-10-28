import type { ResolvedMode } from '../core/types';
import { clamp } from '../utils/math';

/**
 * Pure geometry of a page curl (no DOM). All coordinates are CSS px in the book's
 * own space: x = 0 is the book's left edge, y = 0 its top. The spine is at x = W in
 * double mode and at x = 0 (the left edge) in single mode.
 *
 * The turning sheet is folded along the perpendicular bisector of the segment from
 * its grabbed corner C to the point P where the corner currently is:
 *  - "peel": the part of the sheet still lying flat (clipped at the fold line);
 *  - "flap": the folded-over part, i.e. the sheet's other side, reflected across the
 *    fold line;
 *  - the area the flap uncovered shows the page underneath (a static slot).
 */

export interface Point {
  x: number;
  y: number;
}

export type Corner = 'top' | 'bottom';

export interface CurlSetup {
  mode: ResolvedMode;
  /** Page size in CSS px. */
  width: number;
  height: number;
  /** true: the sheet on the right is turned to the left (next page). */
  forward: boolean;
  corner: Corner;
}

/** A straight line in some local frame, used to place shadow gradients. */
export interface FoldLine {
  x: number;
  y: number;
  /** Direction (radians) of the normal the gradient runs along. */
  angle: number;
}

export interface CurlFrame {
  /** Corner position after constraints. */
  point: Point;
  /** 0 = sheet flat at its start, 1 = completely turned over. */
  turned: number;
  /** Distance between the grabbed corner and its current position. */
  foldDepth: number;
  /** Book x of the sheet's start position (peel and shadow elements are placed here). */
  sheetLeft: number;
  /** Visible part of the peel, in its local coordinates. */
  peelClip: Point[];
  /** CSS `matrix()` (a, b, c, d, e, f) mapping flap-local coordinates to the book. */
  flapMatrix: [number, number, number, number, number, number];
  /** Visible part of the flap, in its local coordinates. */
  flapClip: Point[];
  /** Area uncovered by the flap (sheet-local); the flap casts its shadow here. */
  castClip: Point[];
  peelFold: FoldLine;
  flapFold: FoldLine;
  castFold: FoldLine;
}

const EPSILON = 0.5;

export function spineX(s: CurlSetup): number {
  return s.mode === 'double' ? s.width : 0;
}

/** Horizontal extent of the sheet before it is turned. */
export function sheetSpan(s: CurlSetup): { left: number; right: number } {
  const spine = spineX(s);
  return s.forward ? { left: spine, right: spine + s.width } : { left: spine - s.width, right: spine };
}

/** The grabbed corner, on the outer edge of the sheet. */
export function cornerPoint(s: CurlSetup): Point {
  const span = sheetSpan(s);
  return { x: s.forward ? span.right : span.left, y: s.corner === 'top' ? 0 : s.height };
}

/** Where the corner ends up once the page is fully turned (mirrored across the spine). */
export function turnedPoint(s: CurlSetup): Point {
  const c = cornerPoint(s);
  return { x: 2 * spineX(s) - c.x, y: c.y };
}

/** How far the sheet is turned for a corner position (0..1). */
export function turnedAmount(s: CurlSetup, point: Point): number {
  const c = cornerPoint(s);
  const travel = s.forward ? c.x - point.x : point.x - c.x;
  return clamp(travel / (2 * s.width), 0, 1);
}

/**
 * Paper can't stretch: the corner stays within one page width of the spine's end on
 * its own edge, and within the page diagonal of the spine's other end.
 */
export function constrainPoint(s: CurlSetup, point: Point): Point {
  const spine = spineX(s);
  const near = { x: spine, y: s.corner === 'top' ? 0 : s.height };
  const far = { x: spine, y: s.corner === 'top' ? s.height : 0 };
  let p = limitDistance(point, near, s.width);
  p = limitDistance(p, far, Math.hypot(s.width, s.height));
  return p;
}

export function computeCurl(s: CurlSetup, rawPoint: Point): CurlFrame {
  const W = s.width;
  const H = s.height;
  const span = sheetSpan(s);
  const c = cornerPoint(s);
  const p = constrainPoint(s, rawPoint);
  const sheet: Point[] = [
    { x: span.left, y: 0 },
    { x: span.right, y: 0 },
    { x: span.right, y: H },
    { x: span.left, y: H },
  ];
  const toSheetLocal = (q: Point): Point => ({ x: q.x - span.left, y: q.y });
  const depth = Math.hypot(c.x - p.x, c.y - p.y);

  if (depth < EPSILON) {
    const none: FoldLine = { x: 0, y: 0, angle: 0 };
    return {
      point: p,
      turned: 0,
      foldDepth: 0,
      sheetLeft: span.left,
      peelClip: sheet.map(toSheetLocal),
      flapMatrix: [1, 0, 0, 1, 0, 0],
      flapClip: [],
      castClip: [],
      peelFold: none,
      flapFold: none,
      castFold: none,
    };
  }

  // Fold line: through the midpoint m, with unit normal n pointing towards the corner.
  const n = { x: (c.x - p.x) / depth, y: (c.y - p.y) / depth };
  const m = { x: (c.x + p.x) / 2, y: (c.y + p.y) / 2 };

  const peel = clipHalfPlane(sheet, m, n, -1);
  const lifted = clipHalfPlane(sheet, m, n, 1);

  // Reflection across the fold line: x' = A x + b, with A = I - 2nnᵀ and b = 2(m·n)n.
  const a00 = 1 - 2 * n.x * n.x;
  const a01 = -2 * n.x * n.y;
  const a11 = 1 - 2 * n.y * n.y;
  const k = 2 * (m.x * n.x + m.y * n.y);
  const reflect = (q: Point): Point => ({
    x: a00 * q.x + a01 * q.y + k * n.x,
    y: a01 * q.x + a11 * q.y + k * n.y,
  });

  // The flap shows the sheet's back. Flap-local (u, v) sits at sheet point (right - u, v)
  // (the back is mirrored), which the fold then reflects into place. The two mirrors
  // compose into a rotation, so the page content is never shown mirrored.
  const flapMatrix: CurlFrame['flapMatrix'] = [
    -a00,
    -a01,
    a01,
    a11,
    a00 * span.right + k * n.x,
    a01 * span.right + k * n.y,
  ];
  let flapArea = lifted.map(reflect);
  // In single mode a sheet turned past the spine leaves the book; hide that part.
  if (s.mode === 'single') flapArea = clipToRect(flapArea, 0, W, H);
  const toFlapLocal = (q: Point): Point => {
    const r = reflect(q);
    return { x: span.right - r.x, y: r.y };
  };

  let cast = lifted;
  if (s.mode === 'single') cast = clipToRect(cast, 0, W, H);

  const mSheet = toSheetLocal(m);
  const normalAngle = Math.atan2(n.y, n.x);
  const mFlap = { x: span.right - m.x, y: m.y };

  return {
    point: p,
    turned: turnedAmount(s, p),
    foldDepth: depth,
    sheetLeft: span.left,
    peelClip: peel.map(toSheetLocal),
    flapMatrix,
    flapClip: flapArea.map(toFlapLocal),
    castClip: cast.map(toSheetLocal),
    peelFold: { ...mSheet, angle: normalAngle + Math.PI },
    castFold: { ...mSheet, angle: normalAngle },
    flapFold: { ...mFlap, angle: Math.atan2(n.y, -n.x) },
  };
}

/** Keeps the part of a convex polygon where sign·((q - m)·n) >= 0. */
export function clipHalfPlane(poly: Point[], m: Point, n: Point, sign: 1 | -1): Point[] {
  const out: Point[] = [];
  const side = (q: Point) => sign * ((q.x - m.x) * n.x + (q.y - m.y) * n.y);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = side(a);
    const db = side(b);
    if (da >= 0) out.push(a);
    if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function clipToRect(poly: Point[], left: number, right: number, bottom: number): Point[] {
  let out = clipHalfPlane(poly, { x: left, y: 0 }, { x: 1, y: 0 }, 1);
  out = clipHalfPlane(out, { x: right, y: 0 }, { x: -1, y: 0 }, 1);
  out = clipHalfPlane(out, { x: 0, y: 0 }, { x: 0, y: 1 }, 1);
  return clipHalfPlane(out, { x: 0, y: bottom }, { x: 0, y: -1 }, 1);
}

function limitDistance(p: Point, center: Point, radius: number): Point {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const d = Math.hypot(dx, dy);
  if (d <= radius || d === 0) return p;
  return { x: center.x + (dx * radius) / d, y: center.y + (dy * radius) / d };
}
