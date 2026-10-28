# flipbook-pdf

**Turn any PDF into a book you can actually flip.**

Grab a page corner, pull it, and the paper curls over to reveal the next page.<br>
Framework-agnostic: plain HTML, React / Next.js, Vue / Nuxt, Angular.

[![npm version](https://img.shields.io/npm/v/flipbook-pdf.svg?color=3b82f6)](https://www.npmjs.com/package/flipbook-pdf)
[![bundle size](https://img.shields.io/bundlephobia/minzip/flipbook-pdf?label=minzipped)](https://bundlephobia.com/package/flipbook-pdf)
[![CI](https://github.com/yasinozgurcakmak/flipbook-pdf/actions/workflows/ci.yml/badge.svg)](https://github.com/yasinozgurcakmak/flipbook-pdf/actions/workflows/ci.yml)
[![types](https://img.shields.io/npm/types/flipbook-pdf.svg)](https://www.npmjs.com/package/flipbook-pdf)
[![license](https://img.shields.io/npm/l/flipbook-pdf.svg)](LICENSE)

</div>

---

## Features

- 📖 **Realistic page curl.** Pull any outer corner (top or bottom) left, right or down. The sheet folds along a true fold line, shows its back side, and casts a shadow on the page underneath.
- 🖱️ **Every input.** Mouse, touch and pen through one Pointer Events path, flick detection, click-to-turn, a corner lift on hover, and keyboard shortcuts.
- 📱 **Responsive layout.** Two-page spreads with an optional standalone cover on wide screens, single pages on phones, chosen automatically.
- ⚡ **Built for speed.** No layout work during animation, a prioritized and cancellable render queue, an LRU canvas cache, and lazy-loaded [pdf.js](https://mozilla.github.io/pdf.js/).
- 🧩 **Use it anywhere.** A `<pdf-flipbook>` web component, a JavaScript API, a React component, a Vue component, and a single-file `<script>` build.
- 🛡️ **Production ready.** Written in TypeScript, safe to import during SSR, accessible controls, `prefers-reduced-motion` support, and theming through CSS variables.

## Contents

- [Installation](#installation)
- [Quick start](#quick-start): [HTML](#plain-html) · [JavaScript](#javascript--typescript) · [React / Next.js](#react--nextjs) · [Vue / Nuxt](#vue-3--nuxt) · [Angular](#angular)
- [Interactions](#interactions)
- [Options](#options)
- [API](#api)
- [Events](#events)
- [Theming](#theming)
- [Localization](#localization)
- [Hosting the pdf.js worker](#hosting-the-pdfjs-worker)
- [Performance](#performance)
- [How the page curl works](#how-the-page-curl-works)
- [Development](#development)

## Installation

```bash
npm install flipbook-pdf
```

`pdfjs-dist` is installed as a dependency. It is loaded **lazily** when the first PDF opens, so it stays out of your initial bundle.

> [!IMPORTANT]
> The container must have a height. The book scales to fill it.

## Quick start

### Plain HTML

No build step needed. The script build loads pdf.js from jsDelivr at runtime.

```html
<script src="https://unpkg.com/flipbook-pdf"></script>

<!-- Option A: web component -->
<pdf-flipbook src="/book.pdf" style="height: 80vh"></pdf-flipbook>

<!-- Option B: JavaScript API -->
<div id="reader" style="height: 80vh"></div>
<script>
  const book = PdfFlipbook.createFlipbook('#reader', { src: '/book.pdf' });
  book.on('pagechange', (e) => console.log(`page ${e.page} of ${e.pageCount}`));
</script>
```

### JavaScript / TypeScript

```ts
import { PdfFlipbook } from 'flipbook-pdf';

const book = new PdfFlipbook('#reader', {
  src: 'https://example.com/book.pdf',
  startPage: 1,
});

await book.ready;
book.next();
book.goTo(12);

// Later: removes listeners and frees canvases and the pdf.js worker.
book.destroy();
```

### React / Next.js

```tsx
'use client';
import { useRef } from 'react';
import { Flipbook, type PdfFlipbook } from 'flipbook-pdf/react';

export default function Reader() {
  const book = useRef<PdfFlipbook>(null);

  return (
    <div style={{ height: '80vh' }}>
      <Flipbook ref={book} src="/book.pdf" onPageChange={(e) => console.log(e.page)} />
      <button onClick={() => book.current?.next()}>Next</button>
    </div>
  );
}
```

The instance is created inside `useEffect`, so server rendering is safe, and the adapter already includes the `'use client'` directive. Changed props are applied with `setOptions`. Changing `src` loads the new PDF.

### Vue 3 / Nuxt

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { Flipbook } from 'flipbook-pdf/vue';

const book = ref();
</script>

<template>
  <div style="height: 80vh">
    <Flipbook ref="book" src="/book.pdf" :options="{ flipDuration: 600 }" @pagechange="(e) => console.log(e.page)" />
  </div>
  <button @click="book.next()">Next</button>
</template>
```

In Nuxt, wrap the component in `<ClientOnly>`.

### Angular

A ready-made standalone component is in [`examples/angular/pdf-reader.component.ts`](examples/angular/pdf-reader.component.ts). It creates the book inside `NgZone.runOutsideAngular`, so pointer events and animation frames don't trigger change detection on every frame.

You can also use the web component: add `CUSTOM_ELEMENTS_SCHEMA` and call `defineFlipbookElement()` once.

```ts
import { defineFlipbookElement } from 'flipbook-pdf';
defineFlipbookElement(); // registers <pdf-flipbook>
```

## Interactions

| Action | Mouse | Touch | Keyboard |
|---|---|---|---|
| Next page | Click the right half, or pull a right corner | Swipe left, or pull a right corner | `→` `PageDown` `Space` |
| Previous page | Click the left half, or pull a left corner | Swipe right, or pull a left corner | `←` `PageUp` `Shift+Space` |
| First / last page | | | `Home` / `End` |
| Corner hint | Hover a corner | | |

When you release a drag, the page turns if it was flicked or pulled past the spine. Otherwise it falls back. Corner drags can go in any direction, including straight down. Outside the corners, vertical swipes are left to the browser, so the page that embeds the book still scrolls.

## Options

All options are optional. Change them at runtime with `book.setOptions({...})`; only what changed is re-applied.

| Option | Default | Description |
|---|---|---|
| `src` | | PDF URL, `URL`, `ArrayBuffer` or `Uint8Array`. Can also be provided later with `load()`. |
| `startPage` | `1` | Page to open first (1-based). |
| `mode` | `'auto'` | `'auto'`, `'single'` or `'double'`. |
| `singlePageBreakpoint` | `640` | In `auto` mode, containers narrower than this (px) always show a single page. |
| `showCover` | `true` | In double mode, show the first page alone on the right, like a book cover. |
| `flipDuration` | `800` | Page-turn duration in ms. |
| `preloadSpreads` | `1` | Spreads pre-rendered ahead of and behind the current one. |
| `maxPixelRatio` | `2` | Upper bound for `devicePixelRatio` when rendering (sharpness vs. memory). |
| `maxCanvasPixels` | `16777216` | Pixel cap for a single canvas. Mobile browsers fail above about 16M. |
| `cacheSize` | `12` | Rendered pages kept in memory (LRU). |
| `padding` | `16` | Space around the book in px. |
| `swipe` | `true` | Turn pages by dragging. |
| `clickToFlip` | `true` | Turn pages by clicking or tapping the left or right half. |
| `keyboard` | `true` | Keyboard shortcuts while the book has focus. |
| `cornerHint` | `true` | Lift a corner slightly when the mouse hovers it. |
| `controls` | `true` | Built-in previous/next buttons and page counter. |
| `dragThreshold` | `6` | Pixels the pointer must travel before a drag starts. |
| `respectReducedMotion` | `true` | Skip animations when the OS asks for reduced motion. |
| `injectStyles` | `true` | Inject the default stylesheet. Turn it off and ship `flipbookCss` yourself under a strict CSP. |
| `pageBackground` | `'#ffffff'` | Canvas background used while rendering. |
| `labels` | English | UI and accessibility texts. See [Localization](#localization). |
| `pdfjs` | | `{ lib, workerSrc, cdnBaseUrl, documentParams }`. Provide pdf.js yourself, self-host the worker, or pass `getDocument()` parameters such as `httpHeaders`, `withCredentials` or `password`. |

## API

```ts
const book = new PdfFlipbook(container: HTMLElement | string, options?: FlipbookOptions);
```

| Member | Description |
|---|---|
| `next()` / `prev()` | Turn one spread. Resolves `true` if the visible page changed. |
| `first()` / `last()` | Jump to the first or last page. |
| `goTo(page, { animate })` | Go to a 1-based page. Distant pages are reached with a single turn. |
| `load(src)` | Open another PDF in the same book. |
| `setOptions(partial)` / `setMode(mode)` | Update options at runtime. |
| `ready` | Promise that resolves when the document is loaded. |
| `currentPage` / `visiblePages` / `pageCount` | Current position (1-based). |
| `mode` / `isFlipping` / `element` | Resolved layout mode, animation state, and root element. |
| `on(event, fn)` / `once` / `off` | Event subscription. `on()` returns an unsubscribe function. |
| `destroy()` | Remove everything and release memory. |

`createFlipbook(container, options)` is a factory alias. The script build exposes everything on `window.PdfFlipbook`.

### Web component attributes

`src`, `mode`, `start-page`, `show-cover`, `flip-duration`, `controls`, `swipe`, `click-to-flip`, `keyboard`, `worker-src`. Boolean attributes accept `"true"` or `"false"`. For options without an attribute (such as `labels`), set the element's `options` property. Methods: `next()`, `prev()`, `goTo()`. Properties: `page`, `pageCount`, `flipbook` (the underlying instance).

## Events

| Event | Payload |
|---|---|
| `ready` | `{ pageCount }` |
| `pagechange` | `{ page, pages, pageCount }` |
| `flipstart` | `{ direction: 'forward' \| 'backward', fromPage, toPage }` |
| `flipend` | `{ page, changed }` (`changed` is `false` when a drag fell back) |
| `modechange` | `{ mode: 'single' \| 'double' }` |
| `error` | `{ error, page? }` |

The web component dispatches the same events as `CustomEvent`s, with the payload in `event.detail`. In React, use `onReady`, `onPageChange`, `onFlipStart`, `onFlipEnd`, `onModeChange` and `onError`. In Vue, use `@ready`, `@pagechange` and so on.

## Theming

Set CSS custom properties on the container or on `<pdf-flipbook>`:

```css
#reader {
  --pfb-background: #1f2937;          /* area around the book */
  --pfb-page-bg: #ffffff;             /* page colour while loading */
  --pfb-page-shadow: 0 4px 18px rgb(0 0 0 / 0.18);
  --pfb-accent: #3b82f6;              /* focus ring, spinner */
  --pfb-control-bg: rgb(17 24 39 / 0.55);
  --pfb-control-color: #ffffff;
  --pfb-counter-space: 36px;          /* strip below the book for the page counter */
  --pfb-message-color: #6b7280;       /* loading and error text */
}
```

All classes are prefixed with `pfb-`. For full control, set `injectStyles: false` and start from the exported `flipbookCss` string.

## Localization

```ts
new PdfFlipbook('#reader', {
  src: '/book.pdf',
  labels: {
    book: 'PDF Book',
    prev: 'Previous Page',
    next: 'Next Page',
    loading: 'Loading…',
    error: 'The document could not be uploaded.',
    counter: (pages, total) => `${pages} / ${total}`,
    page: (n) => `Page ${n}`,
  },
});
```

## Hosting the pdf.js worker

By default the pdf.js worker is loaded from jsDelivr, using the same version as the installed `pdfjs-dist`. In production, serve the worker yourself for CSP, offline use and privacy. With Vite:

```ts
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

new PdfFlipbook('#reader', { src: '/book.pdf', pdfjs: { workerSrc } });
```

With other bundlers, copy `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` to your public folder and pass its URL.

## Performance

- **No layout during animation.** Each frame changes only `transform`, `clip-path` and `opacity`. Shadows are static gradients that get rotated and scaled.
- **One update per frame.** High-frequency pointer events are coalesced with `requestAnimationFrame`.
- **Smart rendering.** Visible pages render first, then neighbours in the reading direction. Work that is no longer needed is cancelled, and non-urgent rendering pauses while a page is turning.
- **Bounded memory.** An LRU canvas cache frees evicted canvases immediately, and only visible pages are in the DOM. Resolution is capped by `maxPixelRatio` and `maxCanvasPixels`.
- **Sharp after resizing.** Pages scale with CSS right away and re-render at the new size once resizing stops.
- **Small footprint.** About 13 kB minified and gzipped. pdf.js is loaded lazily in its own chunk.

## How the page curl works

The turning sheet is folded along the perpendicular bisector of the segment between its grabbed corner `C` and the point `P` where the corner currently is.

- **Peel:** the part still lying flat, clipped at the fold line.
- **Flap:** the sheet's back side, reflected across the fold line. Two reflections compose into a rotation, so the content is never shown mirrored.
- **Reveal:** the uncovered area shows the page underneath, and the flap casts its shadow there.
- **Constraint:** the corner stays within one page width of the spine's near end and within the page diagonal of its far end, so the paper never tears off the spine.

The geometry is pure, unit-tested code in [`src/view/curl.ts`](src/view/curl.ts). Drawing happens only in `BookView.setCurl`, so you can change the effect without touching the core.

```
src/
  core/       PdfFlipbook (state machine), spreads & layout, LRU cache, events, options
  pdf/        pdf.js loader, cancellable page rendering, priority render queue
  view/       curl geometry, DOM view, styles
  input/      pointer gestures, keyboard
  element/    <pdf-flipbook> web component
  adapters/   React and Vue wrappers
```

## Development

```bash
npm install
npm run sample      # generates examples/sample.pdf
npm run dev         # http://localhost:5173/examples/index.html
npm test            # unit tests (Vitest)
npm run typecheck
npm run build       # dist/: ESM entries, React/Vue adapters, script build, type declarations
```

Demo pages: `examples/index.html` (API and controls), `examples/script-tag.html` (script build and web component; run `npm run build` first), and `examples/adapters.html` (React and Vue).

Issues and pull requests are welcome. Please run `npm test` and `npm run typecheck` before opening a PR.

## License

[MIT](LICENSE) © Yasin Özgür Çakmak
