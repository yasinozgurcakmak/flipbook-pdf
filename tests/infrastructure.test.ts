import { describe, expect, it, vi } from 'vitest';
import { LruCache } from '../src/core/LruCache';
import { EventEmitter } from '../src/core/EventEmitter';
import { resolveOptions, DEFAULT_OPTIONS } from '../src/core/options';
import { RenderQueue } from '../src/pdf/RenderQueue';

describe('LruCache', () => {
  it('evicts the least recently used entry', () => {
    const evicted: string[] = [];
    const cache = new LruCache<string, number>(2, (key) => evicted.push(key));
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    expect(evicted).toEqual(['b']);
    expect(cache.has('a') && cache.has('c')).toBe(true);
  });

  it('never evicts protected entries', () => {
    const cache = new LruCache<string, number>(1, undefined, (key) => key !== 'pinned');
    cache.set('pinned', 1);
    cache.set('x', 2);
    expect(cache.has('pinned')).toBe(true);
    expect(cache.size).toBe(1);
  });

  it('reports replaced values as evicted', () => {
    const onEvict = vi.fn();
    const cache = new LruCache<string, object>(5, onEvict);
    const first = {};
    cache.set('a', first);
    cache.set('a', {});
    expect(onEvict).toHaveBeenCalledWith('a', first);
  });
});

describe('EventEmitter', () => {
  class Emitter extends EventEmitter<{ ping: number }> {
    fire(n: number) {
      this.emit('ping', n);
    }
  }

  it('supports on/off/once and isolates listener errors', () => {
    const e = new Emitter();
    const seen: number[] = [];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    e.on('ping', () => {
      throw new Error('boom');
    });
    const off = e.on('ping', (n) => seen.push(n));
    e.once('ping', (n) => seen.push(n * 10));
    e.fire(1);
    off();
    e.fire(2);
    expect(seen).toEqual([1, 10]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('resolveOptions', () => {
  it('ignores undefined values and merges labels', () => {
    const base = resolveOptions({ flipDuration: undefined, labels: { next: 'Sonraki' } });
    expect(base.flipDuration).toBe(DEFAULT_OPTIONS.flipDuration);
    expect(base.labels.next).toBe('Sonraki');
    expect(base.labels.prev).toBe('Previous page');
    const updated = resolveOptions({ labels: { prev: 'Önceki' } }, base);
    expect(updated.labels).toMatchObject({ next: 'Sonraki', prev: 'Önceki' });
  });
});

describe('RenderQueue', () => {
  const deferred = () => {
    let resolve!: (v: string) => void;
    const promise = new Promise<string>((r) => (resolve = r));
    return { promise, resolve };
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('runs jobs in priority order with limited concurrency', async () => {
    const queue = new RenderQueue(1);
    const order: string[] = [];
    const jobs = ['a', 'b', 'c'].map((key) => ({
      key,
      run: async () => {
        order.push(key);
        return key;
      },
    }));
    queue.schedule(jobs);
    expect(queue.activeCount).toBe(1);
    await flush();
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('only starts urgent jobs while paused', async () => {
    const queue = new RenderQueue(1);
    const order: string[] = [];
    queue.pause();
    queue.schedule([
      { key: 'later', run: async () => order.push('later') },
      { key: 'now', urgent: true, run: async () => order.push('now') },
    ]);
    await flush();
    expect(order).toEqual(['now']);
    queue.resume();
    await flush();
    expect(order).toEqual(['now', 'later']);
  });

  it('aborts obsolete running jobs and suppresses their callbacks', async () => {
    const queue = new RenderQueue(1);
    const d = deferred();
    let aborted = false;
    const onDone = vi.fn();
    queue.schedule([
      {
        key: 'old',
        run: (signal: AbortSignal) => {
          signal.addEventListener('abort', () => (aborted = true));
          return d.promise;
        },
        onDone,
      },
    ]);
    queue.cancelExcept(new Set(['new']));
    d.resolve('late');
    await flush();
    expect(aborted).toBe(true);
    expect(onDone).not.toHaveBeenCalled();
    expect(queue.activeCount).toBe(0);
  });

  it('schedule() replaces pending work', async () => {
    const queue = new RenderQueue(1);
    const d = deferred();
    const ran: string[] = [];
    queue.schedule([
      { key: 'busy', run: async () => { await d.promise; } },
      { key: 'stale', run: async () => { ran.push('stale'); } },
    ]);
    queue.schedule([{ key: 'fresh', run: async () => { ran.push('fresh'); } }]);
    d.resolve('done');
    await flush();
    expect(ran).toEqual(['fresh']);
  });
});
