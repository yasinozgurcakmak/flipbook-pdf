export interface QueueJob<T = unknown> {
  /** Identity of the work (e.g. page + resolution). Duplicate keys are not run twice. */
  key: string;
  /** Urgent jobs still run while the queue is paused (e.g. pages needed on screen right now). */
  urgent?: boolean;
  run(signal: AbortSignal): Promise<T>;
  onDone?(result: T): void;
  onError?(error: unknown): void;
}

/**
 * Priority render queue. `schedule()` replaces everything that hasn't started yet,
 * so the newest navigation state always wins; obsolete running jobs can be aborted.
 * Pausing (during page-turn animations) keeps main-thread rasterization away from
 * animation frames, except for urgent jobs.
 */
export class RenderQueue {
  private pending: QueueJob<never>[] = [];
  private running = new Map<string, AbortController>();
  private paused = false;

  constructor(private readonly concurrency = 1) {}

  get activeCount(): number {
    return this.running.size;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  /** Replaces pending jobs. Jobs are expected in priority order (first = most important). */
  schedule<T>(jobs: QueueJob<T>[]): void {
    this.pending = jobs.filter((job) => !this.running.has(job.key)) as QueueJob<never>[];
    this.pump();
  }

  /** Aborts running jobs whose key is not in `keep`. */
  cancelExcept(keep: ReadonlySet<string>): void {
    for (const [key, controller] of this.running) {
      if (keep.has(key)) continue;
      controller.abort();
      this.running.delete(key);
    }
    this.pump();
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.pump();
  }

  clear(): void {
    this.pending = [];
    for (const controller of this.running.values()) controller.abort();
    this.running.clear();
  }

  private pump(): void {
    while (this.running.size < this.concurrency && this.pending.length) {
      const index = this.paused ? this.pending.findIndex((job) => job.urgent) : 0;
      if (index < 0) return;
      const [job] = this.pending.splice(index, 1);
      this.start(job);
    }
  }

  private start(job: QueueJob<never>): void {
    const controller = new AbortController();
    this.running.set(job.key, controller);
    const finish = () => {
      if (this.running.get(job.key) === controller) this.running.delete(job.key);
      this.pump();
    };
    job.run(controller.signal).then(
      (result) => {
        finish();
        if (!controller.signal.aborted) job.onDone?.(result);
      },
      (error: unknown) => {
        finish();
        if (!controller.signal.aborted) job.onError?.(error);
      },
    );
  }
}
