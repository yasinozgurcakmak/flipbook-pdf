# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-15

### Added

- `PdfFlipbook` core: renders a PDF (URL or bytes) as a book with a page-curl animation.
- Page curl: grab any outer corner (top or bottom) and pull it left, right or down; hover hint on corners.
- Mouse, touch and pen input via Pointer Events, flick detection, keyboard navigation.
- Automatic single / double page layout with an optional standalone cover.
- Priority render queue with cancellation, LRU canvas cache, lazy-loaded pdf.js.
- `<pdf-flipbook>` web component, React adapter (`flipbook-pdf/react`), Vue adapter (`flipbook-pdf/vue`).
- Script-tag (IIFE) build that loads pdf.js from a CDN.
