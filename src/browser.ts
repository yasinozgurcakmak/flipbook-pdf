/**
 * Entry of the `<script>` (IIFE) build. Exposes everything on `window.PdfFlipbook`
 * and registers the `<pdf-flipbook>` element automatically.
 */
import { defineFlipbookElement } from './element/defineElement';

export * from './index';

defineFlipbookElement();
