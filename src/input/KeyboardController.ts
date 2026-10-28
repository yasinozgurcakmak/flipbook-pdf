export interface KeyboardHandlers {
  next(): void;
  prev(): void;
  first(): void;
  last(): void;
  enabled(): boolean;
}

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

export class KeyboardController {
  private readonly abort = new AbortController();

  constructor(el: HTMLElement, private readonly handlers: KeyboardHandlers) {
    el.addEventListener('keydown', this.onKeyDown, { signal: this.abort.signal });
  }

  destroy(): void {
    this.abort.abort();
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.handlers.enabled() || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target instanceof Element && e.target.closest(EDITABLE)) return;

    const action = this.actionFor(e);
    if (!action) return;
    e.preventDefault();
    this.handlers[action]();
  };

  private actionFor(e: KeyboardEvent): 'next' | 'prev' | 'first' | 'last' | null {
    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
        return 'next';
      case 'ArrowLeft':
      case 'PageUp':
        return 'prev';
      case ' ':
        // Space only when the book itself has focus, so buttons keep their default.
        if (e.target !== e.currentTarget) return null;
        return e.shiftKey ? 'prev' : 'next';
      case 'Home':
        return 'first';
      case 'End':
        return 'last';
      default:
        return null;
    }
  }
}
