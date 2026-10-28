import { PdfFlipbook } from '../core/PdfFlipbook';
import type { FlipbookEvents, FlipbookOptions, ViewMode } from '../core/types';

/**
 * `<pdf-flipbook>` custom element. Works anywhere custom elements do: plain HTML,
 * Vue, Angular (CUSTOM_ELEMENTS_SCHEMA), Svelte, React 19...
 *
 * Attributes: src, mode, start-page, show-cover, flip-duration, controls, swipe,
 * click-to-flip, keyboard, worker-src.
 * Events (CustomEvent, `detail` = payload): ready, pagechange, flipstart, flipend,
 * modechange, error.
 */
export interface PdfFlipbookElement extends HTMLElement {
  /** The underlying instance (null while disconnected). */
  readonly flipbook: PdfFlipbook | null;
  /** Options that can't be expressed as attributes (labels, pdfjs.lib, ...). */
  options: FlipbookOptions;
  readonly page: number;
  readonly pageCount: number;
  next(): Promise<boolean>;
  prev(): Promise<boolean>;
  goTo(page: number, options?: { animate?: boolean }): Promise<boolean>;
}

const EVENTS: (keyof FlipbookEvents)[] = ['ready', 'pagechange', 'flipstart', 'flipend', 'modechange', 'error'];

const BOOLEAN_ATTRS = {
  'show-cover': 'showCover',
  controls: 'controls',
  swipe: 'swipe',
  'click-to-flip': 'clickToFlip',
  keyboard: 'keyboard',
} as const;

const HOST_CSS = ':host{display:block;position:relative;height:100%;min-height:320px}:host([hidden]){display:none}';

function readBoolean(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  return value !== 'false' && value !== '0';
}

function readNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function createElementClass(): CustomElementConstructor {
  return class extends HTMLElement implements PdfFlipbookElement {
    static observedAttributes = [
      'src',
      'mode',
      'start-page',
      'flip-duration',
      'worker-src',
      ...Object.keys(BOOLEAN_ATTRS),
    ];

    private instance: PdfFlipbook | null = null;
    private extraOptions: FlipbookOptions = {};
    private readonly mount: HTMLDivElement;

    constructor() {
      super();
      const shadow = this.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = HOST_CSS;
      this.mount = document.createElement('div');
      this.mount.style.cssText = 'position:absolute;inset:0';
      shadow.append(style, this.mount);
    }

    get flipbook(): PdfFlipbook | null {
      return this.instance;
    }

    get options(): FlipbookOptions {
      return this.extraOptions;
    }

    set options(value: FlipbookOptions) {
      this.extraOptions = value ?? {};
      this.instance?.setOptions(this.collectOptions());
    }

    get page(): number {
      return this.instance?.currentPage ?? 0;
    }

    get pageCount(): number {
      return this.instance?.pageCount ?? 0;
    }

    next(): Promise<boolean> {
      return this.instance?.next() ?? Promise.resolve(false);
    }

    prev(): Promise<boolean> {
      return this.instance?.prev() ?? Promise.resolve(false);
    }

    goTo(page: number, options?: { animate?: boolean }): Promise<boolean> {
      return this.instance?.goTo(page, options) ?? Promise.resolve(false);
    }

    connectedCallback(): void {
      if (this.instance) return;
      const book = new PdfFlipbook(this.mount, this.collectOptions());
      for (const type of EVENTS) {
        book.on(type, (detail) => {
          this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
        });
      }
      this.instance = book;
    }

    disconnectedCallback(): void {
      // Moving the element in the DOM disconnects and reconnects it synchronously; keep the
      // instance alive in that case.
      queueMicrotask(() => {
        if (this.isConnected || !this.instance) return;
        this.instance.destroy();
        this.instance = null;
      });
    }

    attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null): void {
      if (oldValue === newValue || !this.instance) return;
      this.instance.setOptions(this.collectOptions());
    }

    private collectOptions(): FlipbookOptions {
      const options: FlipbookOptions = { ...this.extraOptions };
      const src = this.getAttribute('src');
      if (src) options.src = src;
      const mode = this.getAttribute('mode');
      if (mode === 'auto' || mode === 'single' || mode === 'double') options.mode = mode as ViewMode;
      const startPage = readNumber(this.getAttribute('start-page'));
      if (startPage !== undefined) options.startPage = startPage;
      const duration = readNumber(this.getAttribute('flip-duration'));
      if (duration !== undefined) options.flipDuration = duration;
      for (const [attr, key] of Object.entries(BOOLEAN_ATTRS)) {
        const value = readBoolean(this.getAttribute(attr));
        if (value !== undefined) options[key] = value;
      }
      const workerSrc = this.getAttribute('worker-src');
      if (workerSrc) options.pdfjs = { ...options.pdfjs, workerSrc };
      return options;
    }
  };
}

/**
 * Registers `<pdf-flipbook>` (or a custom tag name). Safe to call on the server and
 * more than once.
 */
export function defineFlipbookElement(tagName = 'pdf-flipbook'): void {
  if (typeof customElements === 'undefined' || customElements.get(tagName)) return;
  customElements.define(tagName, createElementClass());
}

declare global {
  interface HTMLElementTagNameMap {
    'pdf-flipbook': PdfFlipbookElement;
  }
}
