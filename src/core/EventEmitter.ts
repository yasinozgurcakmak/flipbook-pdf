export type Listener<T> = (payload: T) => void;

/** Small typed event emitter; listener errors are isolated so one bad handler can't break the book. */
export class EventEmitter<Events extends object> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  /** Subscribes to an event. Returns an unsubscribe function. */
  on<K extends keyof Events>(type: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(listener as Listener<never>);
    return () => this.off(type, listener);
  }

  once<K extends keyof Events>(type: K, listener: Listener<Events[K]>): () => void {
    const off = this.on(type, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  off<K extends keyof Events>(type: K, listener: Listener<Events[K]>): void {
    this.listeners.get(type)?.delete(listener as Listener<never>);
  }

  protected emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        (listener as Listener<Events[K]>)(payload);
      } catch (error) {
        console.error(`[pdf-flipbook] "${String(type)}" listener threw:`, error);
      }
    }
  }

  protected removeAllListeners(): void {
    this.listeners.clear();
  }
}
