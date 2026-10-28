import {
  defineComponent,
  h,
  markRaw,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  type PropType,
} from 'vue';
import { PdfFlipbook } from '../core/PdfFlipbook';
import type { FlipbookEvents, FlipbookOptions, PdfSource, ViewMode } from '../core/types';

const EVENTS = ['ready', 'pagechange', 'flipstart', 'flipend', 'modechange', 'error'] as const;

/**
 * Vue 3 / Nuxt component.
 *
 * ```vue
 * <Flipbook ref="book" src="/book.pdf" style="height:600px" @pagechange="e => page = e.page" />
 * <!-- book.value.next(), book.value.goTo(10), book.value.instance -->
 * ```
 */
export const Flipbook = defineComponent({
  name: 'PdfFlipbook',
  props: {
    src: { type: [String, URL, ArrayBuffer, Uint8Array] as PropType<PdfSource>, default: undefined },
    mode: { type: String as PropType<ViewMode>, default: undefined },
    startPage: { type: Number, default: undefined },
    /** Any other `FlipbookOptions`; changes are applied with `setOptions`. */
    options: { type: Object as PropType<Omit<FlipbookOptions, 'src'>>, default: () => ({}) },
  },
  emits: {
    ready: (_e: FlipbookEvents['ready']) => true,
    pagechange: (_e: FlipbookEvents['pagechange']) => true,
    flipstart: (_e: FlipbookEvents['flipstart']) => true,
    flipend: (_e: FlipbookEvents['flipend']) => true,
    modechange: (_e: FlipbookEvents['modechange']) => true,
    error: (_e: FlipbookEvents['error']) => true,
  },
  setup(props, { emit, expose }) {
    const container = ref<HTMLDivElement | null>(null);
    // shallowRef + markRaw: Vue must never make the instance (or its DOM / pdf.js objects) reactive.
    const instance = shallowRef<PdfFlipbook | null>(null);

    const collect = (): FlipbookOptions => ({
      ...props.options,
      src: props.src,
      mode: props.mode ?? props.options.mode,
      startPage: props.startPage ?? props.options.startPage,
    });

    onMounted(() => {
      if (!container.value) return;
      const book = markRaw(new PdfFlipbook(container.value, collect()));
      for (const type of EVENTS) {
        book.on(type, (payload) => (emit as (event: string, payload: unknown) => void)(type, payload));
      }
      instance.value = book;
    });

    onBeforeUnmount(() => {
      instance.value?.destroy();
      instance.value = null;
    });

    watch(
      () => [props.src, props.mode, props.options] as const,
      () => instance.value?.setOptions(collect()),
      { deep: true },
    );

    expose({
      get instance() {
        return instance.value;
      },
      next: () => instance.value?.next() ?? Promise.resolve(false),
      prev: () => instance.value?.prev() ?? Promise.resolve(false),
      goTo: (page: number, options?: { animate?: boolean }) =>
        instance.value?.goTo(page, options) ?? Promise.resolve(false),
    });

    return () => h('div', { ref: container, style: 'position:relative;width:100%;height:100%' });
  },
});

export type { PdfFlipbook };
