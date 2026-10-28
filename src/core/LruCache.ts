/**
 * Least-recently-used cache. `canEvict` lets the owner protect entries that are
 * still in use (e.g. canvases currently on screen); protected entries may push the
 * cache temporarily over capacity instead of being dropped.
 */
export class LruCache<K, V> {
  private map = new Map<K, V>();

  constructor(
    private capacity: number,
    private onEvict?: (key: K, value: V) => void,
    private canEvict: (key: K) => boolean = () => true,
  ) {}

  get size(): number {
    return this.map.size;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  /** Reads without changing recency. */
  peek(key: K): V | undefined {
    return this.map.get(key);
  }

  /** Reads and marks as most recently used. */
  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key) as V;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    const previous = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    if (previous !== undefined && previous !== value) this.onEvict?.(key, previous);
    this.trim();
  }

  delete(key: K): void {
    if (!this.map.has(key)) return;
    const value = this.map.get(key) as V;
    this.map.delete(key);
    this.onEvict?.(key, value);
  }

  setCapacity(capacity: number): void {
    this.capacity = Math.max(1, capacity);
    this.trim();
  }

  clear(): void {
    const entries = [...this.map];
    this.map.clear();
    for (const [key, value] of entries) this.onEvict?.(key, value);
  }

  private trim(): void {
    if (this.map.size <= this.capacity) return;
    for (const key of [...this.map.keys()]) {
      if (this.map.size <= this.capacity) break;
      if (this.canEvict(key)) this.delete(key);
    }
  }
}
