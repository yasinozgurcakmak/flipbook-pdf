import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pdfjsVersion: string = JSON.parse(
  readFileSync(new URL('./node_modules/pdfjs-dist/package.json', import.meta.url), 'utf8'),
).version;

/**
 * Two builds:
 *  - default: tree-shakeable ESM entries (core, react, vue). pdfjs-dist stays external
 *    and is lazy-loaded with a dynamic import, so it lands in its own chunk in apps.
 *  - `--mode iife`: a single script for plain HTML pages (`<script src>`). pdf.js is
 *    loaded at runtime from a CDN instead of being bundled.
 */
export default defineConfig(({ mode }) => {
  const iife = mode === 'iife';

  return {
    define: {
      __PDFJS_VERSION__: JSON.stringify(pdfjsVersion),
    },
    resolve: iife
      ? {
          alias: [
            {
              find: /^\.\/pdfjs-import$/,
              replacement: fileURLToPath(new URL('./src/pdf/pdfjs-import.cdn.ts', import.meta.url)),
            },
          ],
        }
      : undefined,
    build: iife
      ? {
          outDir: 'dist',
          emptyOutDir: false,
          sourcemap: true,
          target: 'es2020',
          lib: {
            entry: 'src/browser.ts',
            name: 'PdfFlipbook',
            formats: ['iife'],
            fileName: () => 'flipbook-pdf.iife.js',
          },
        }
      : {
          outDir: 'dist',
          emptyOutDir: true,
          sourcemap: true,
          target: 'es2020',
          minify: false,
          lib: {
            entry: {
              index: 'src/index.ts',
              react: 'src/adapters/react.ts',
              vue: 'src/adapters/vue.ts',
            },
            formats: ['es'],
            fileName: (_format, name) => `${name}.js`,
          },
          rolldownOptions: {
            external: [/^pdfjs-dist(\/.*)?$/, /^react(\/.*)?$/, 'vue'],
            output: {
              // Stable file names keep diffs between releases readable.
              chunkFileNames: 'chunks/[name].js',
            },
            // The React entry keeps its 'use client' directive (needed by Next.js App Router).
            onLog(level, log, handler) {
              if (log.code === 'MODULE_LEVEL_DIRECTIVE') return;
              handler(level, log);
            },
          },
        },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
  };
});
