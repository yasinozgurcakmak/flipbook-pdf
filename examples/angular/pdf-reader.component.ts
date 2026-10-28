// Angular (standalone) usage example. Copy into an Angular app; not compiled in this repo.
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  AfterViewInit,
} from '@angular/core';
import { PdfFlipbook, type FlipbookOptions, type PageChangeEvent } from 'flipbook-pdf';

@Component({
  selector: 'app-pdf-reader',
  standalone: true,
  template: `<div #host style="width:100%;height:100%"></div>`,
  styles: [':host{display:block;height:600px}'],
})
export class PdfReaderComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) src!: string;
  @Input() options: Omit<FlipbookOptions, 'src'> = {};
  @Output() pageChange = new EventEmitter<PageChangeEvent>();

  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;
  private book?: PdfFlipbook;

  constructor(private zone: NgZone) {}

  ngAfterViewInit(): void {
    // Pointer events and requestAnimationFrame must not trigger change detection on every frame.
    this.book = this.zone.runOutsideAngular(
      () => new PdfFlipbook(this.host.nativeElement, { ...this.options, src: this.src }),
    );
    this.book.on('pagechange', (e) => this.zone.run(() => this.pageChange.emit(e)));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.book) return;
    if (changes['src'] || changes['options']) {
      this.zone.runOutsideAngular(() => this.book!.setOptions({ ...this.options, src: this.src }));
    }
  }

  next() {
    return this.zone.runOutsideAngular(() => this.book?.next());
  }

  prev() {
    return this.zone.runOutsideAngular(() => this.book?.prev());
  }

  goTo(page: number) {
    return this.zone.runOutsideAngular(() => this.book?.goTo(page));
  }

  ngOnDestroy(): void {
    this.book?.destroy();
  }
}

/*
 * Alternative: the web component. In a standalone component add
 *   schemas: [CUSTOM_ELEMENTS_SCHEMA]
 * call `defineFlipbookElement()` once (e.g. in main.ts) and use
 *   <pdf-flipbook [attr.src]="url" (pagechange)="onPage($any($event).detail)"></pdf-flipbook>
 */
