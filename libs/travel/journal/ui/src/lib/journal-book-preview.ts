import { afterRenderEffect, Component, computed, ElementRef, input, output, signal, viewChildren } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { BookFrame, BookPage, JournalBookI18n, PAGE_H, PAGE_W, TextStyle } from '@okr/travel-journal-util';

import { bookTextClass, ensureBookStyles } from './journal-book-styles';

/** CSS px per mm at the natural size (CSS: 96 px per inch). */
const PX_PER_MM = 96 / 25.4;

type PhotoFrame = Extract<BookFrame, { kind: 'photo' }>;
type TextFrame = Extract<BookFrame, { kind: 'text' }>;
type MapFrame = Extract<BookFrame, { kind: 'map' }>;

/**
 * One page of the book preview (design §2 «Preview»): the page is drawn at its natural size (297 × 210 mm, text in pt
 * with the print fonts) and scaled down to `width` px with a transform, so lines break as in the measuring box. Black
 * background, the bleed is cut off; photo frames show the 2048 px photos (`imageUrls` by image key); map frames are
 * placeholders — the maps are drawn only for the export. A badge shows the page's warnings, another one «Text
 * abgeschnitten» when a text frame holds more than fits (frames clip, in the PDF too — e.g. a long footprint title).
 */
@Component({
  selector: 'okr-journal-book-preview',
  imports: [IonIcon, SvgIconPipe],
  styles: [`
    :host { display: block; }
    .sheet { position: relative; overflow: hidden; background: #000; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35); cursor: pointer; }
    .sheet.selected { outline: 3px solid var(--ion-color-tertiary); outline-offset: 2px; }
    .page { position: absolute; left: 0; top: 0; transform-origin: 0 0; overflow: hidden; background: #000; }
    .frame { position: absolute; overflow: hidden; }
    .photo { background: #1b1b1b; }
    .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .photo img.whole { object-fit: contain; }
    .photo.active { outline: 6px solid var(--ion-color-tertiary); outline-offset: -6px; }
    .map { background: #10253d; color: #9fb3c8; display: flex; align-items: center; justify-content: center; font: 600 14pt sans-serif; }
    .number { position: absolute; bottom: 2px; right: 6px; font-size: 0.7rem; color: #8a8a8a; }
    .badges { position: absolute; top: 4px; right: 4px; display: flex; gap: 4px; }
    .badge { display: flex; align-items: center; gap: 2px; padding: 1px 6px; border-radius: 8px;
      font-size: 0.7rem; background: var(--ion-color-warning); color: var(--ion-color-warning-contrast); }
  `],
  template: `
    <div class="sheet" [class.selected]="selected()" [style.width.px]="width()" [style.height.px]="height()">
      <div class="page" [style.width.mm]="pageW" [style.height.mm]="pageH" [style.transform]="transform()">
        @for (f of page().frames; track $index) {
          @if (photoOf(f); as p) {
            <div class="frame photo" [class.active]="p.imageKey === selectedImageKey()" [style.left.mm]="p.box.x" [style.top.mm]="p.box.y"
              [style.width.mm]="p.box.w" [style.height.mm]="p.box.h" (click)="photoClicked.emit(p.imageKey)">
              @if (imageUrls()[p.imageKey]; as url) { <img [src]="url" [class.whole]="p.fit === 'whole'" loading="lazy" alt="" /> }
            </div>
          }
          @if (textOf(f); as t) {
            <div #textFrame [class]="'frame ' + textClass(t.style)" [style.left.mm]="t.box.x" [style.top.mm]="t.box.y" [style.width.mm]="t.box.w"
              [style.height.mm]="t.box.h" [innerHTML]="t.html"></div>
          }
          @if (mapOf(f); as m) {
            <div class="frame map" [style.left.mm]="m.box.x" [style.top.mm]="m.box.y" [style.width.mm]="m.box.w" [style.height.mm]="m.box.h">
              {{ i18n().map() }}
            </div>
          }
        }
      </div>
      <span class="number">{{ number() }}</span>
      @if (warnings() > 0 || clipped()) {
        <span class="badges">
          @if (clipped()) { <span class="badge">{{ i18n().text_clipped() }}</span> }
          @if (warnings() > 0) { <span class="badge"><ion-icon src="{{ 'warning' | svgIcon }}" />{{ warnings() }}</span> }
        </span>
      }
    </div>
  `,
})
export class JournalBookPreview {
  public readonly page = input.required<BookPage>();
  public readonly number = input.required<number>(); // 1-based
  public readonly width = input.required<number>(); // px
  public readonly imageUrls = input<Record<string, string>>({});
  public readonly warnings = input(0);
  public readonly selected = input(false);
  public readonly selectedImageKey = input<string | undefined>(undefined);
  public readonly i18n = input.required<JournalBookI18n>();

  public readonly photoClicked = output<string>();

  private readonly textFrames = viewChildren<ElementRef<HTMLElement>>('textFrame');
  /** True when a text frame's content is taller than the frame (measured after each render of the page). */
  protected readonly clipped = signal(false);

  protected readonly pageW = PAGE_W;
  protected readonly pageH = PAGE_H;
  protected readonly height = computed(() => (this.width() * PAGE_H) / PAGE_W);
  protected readonly transform = computed(() => `scale(${this.width() / (PAGE_W * PX_PER_MM)})`);

  public constructor() {
    ensureBookStyles();
    afterRenderEffect({
      read: () => {
        this.page(); // the frames' HTML is bound with innerHTML: a new page re-measures even with the same elements
        // layout sizes, not the scaled ones: scrollHeight / clientHeight ignore the page's transform
        this.clipped.set(this.textFrames().some(({ nativeElement: el }) => el.scrollHeight > el.clientHeight + 1));
      },
    });
  }

  protected photoOf(f: BookFrame): PhotoFrame | undefined {
    return f.kind === 'photo' ? f : undefined;
  }
  protected textOf(f: BookFrame): TextFrame | undefined {
    return f.kind === 'text' ? f : undefined;
  }
  protected mapOf(f: BookFrame): MapFrame | undefined {
    return f.kind === 'map' ? f : undefined;
  }
  protected textClass(style: TextStyle): string {
    return bookTextClass(style);
  }
}
