'use client';

import {
  createElement,
  forwardRef,
  useEffect,
  useRef,
  type CSSProperties,
  type ForwardedRef,
} from 'react';
import { PdfFlipbook } from '../core/PdfFlipbook';
import type { FlipbookEvents, FlipbookOptions, PdfSource } from '../core/types';

export interface FlipbookProps extends Omit<FlipbookOptions, 'src'> {
  src?: PdfSource;
  className?: string;
  style?: CSSProperties;
  onReady?: (event: FlipbookEvents['ready']) => void;
  onPageChange?: (event: FlipbookEvents['pagechange']) => void;
  onFlipStart?: (event: FlipbookEvents['flipstart']) => void;
  onFlipEnd?: (event: FlipbookEvents['flipend']) => void;
  onModeChange?: (event: FlipbookEvents['modechange']) => void;
  onError?: (event: FlipbookEvents['error']) => void;
}

const HANDLERS = {
  ready: 'onReady',
  pagechange: 'onPageChange',
  flipstart: 'onFlipStart',
  flipend: 'onFlipEnd',
  modechange: 'onModeChange',
  error: 'onError',
} as const satisfies Record<keyof FlipbookEvents, keyof FlipbookProps>;

function assignRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

function splitProps(props: FlipbookProps): FlipbookOptions {
  const {
    className: _className,
    style: _style,
    onReady: _onReady,
    onPageChange: _onPageChange,
    onFlipStart: _onFlipStart,
    onFlipEnd: _onFlipEnd,
    onModeChange: _onModeChange,
    onError: _onError,
    ...options
  } = props;
  return options;
}

/**
 * React / Next.js component. The ref receives the `PdfFlipbook` instance.
 *
 * ```tsx
 * const book = useRef<PdfFlipbook>(null);
 * <Flipbook ref={book} src="/book.pdf" style={{ height: 600 }} onPageChange={(e) => setPage(e.page)} />
 * ```
 * Pass a memoized value for binary `src` (Uint8Array) to avoid reloading on every render.
 */
export const Flipbook = forwardRef<PdfFlipbook, FlipbookProps>(function Flipbook(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<PdfFlipbook | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const book = new PdfFlipbook(container, splitProps(propsRef.current));
    for (const type of Object.keys(HANDLERS) as (keyof FlipbookEvents)[]) {
      const name = HANDLERS[type];
      // Always calls the latest handler without re-subscribing.
      book.on(type, (payload) => {
        (propsRef.current[name] as ((event: typeof payload) => void) | undefined)?.(payload);
      });
    }
    bookRef.current = book;
    assignRef(ref, book);
    return () => {
      assignRef(ref, null);
      bookRef.current = null;
      book.destroy();
    };
    // The instance lives for the component's lifetime; option changes go through setOptions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // setOptions diffs internally, so calling it after every render is cheap.
  useEffect(() => {
    bookRef.current?.setOptions(splitProps(props));
  });

  return createElement('div', {
    ref: containerRef,
    className: props.className,
    style: { position: 'relative', width: '100%', height: '100%', ...props.style },
  });
});

export type { PdfFlipbook };
