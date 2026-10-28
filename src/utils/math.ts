export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export type Easing = (t: number) => number;

export const easeInOutCubic: Easing = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - t, 3);
