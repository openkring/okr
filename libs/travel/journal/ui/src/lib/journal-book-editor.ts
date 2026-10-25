import { Component, computed, input, output } from '@angular/core';
import { IonButton, IonCheckbox, IonIcon, IonItem, IonLabel, IonList, IonToggle } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { fill } from '@okr/shared-util-core';
import { BookPageOverride, BookTemplate } from '@okr/shared-models';
import { BOOK_TEMPLATES, BookPage, CommentView, JournalBookI18n, photosFrom, slotCount, templateBoxes } from '@okr/travel-journal-util';

/** «Kommentare im Buch» of one footprint. */
export interface BookCommentSetting { showComments: boolean; commentKeys: string[] }

const MINI_W = 60; // px of a template pictogram (297 mm)
const MINI_SCALE = MINI_W / 297;

/**
 * Edits the selected page of the book (design §5.1). Photo pages: the template (five pictograms drawn from the
 * template geometry; a template that needs more photos than this page and the following ones of its block have is
 * disabled), per photo «verschieben nach Seite …» (the parent opens the choice), «ausblenden», «ganz zeigen»/«füllen»;
 * the block's hidden photos with «einblenden»; «Zurücksetzen» when the block has hand-set pages. The hero page offers
 * only the per-photo switches. For every page of a footprint: «Kommentare im Buch» and the checklist. Emits only.
 */
@Component({
  selector: 'okr-journal-book-editor',
  imports: [IonButton, IonIcon, IonList, IonItem, IonLabel, IonToggle, IonCheckbox, SvgIconPipe],
  styles: [`
    :host { display: block; }
    h3 { margin: 12px 0 6px; font-size: 0.95rem; }
    .hint { color: var(--ion-color-medium); font-size: 0.85rem; margin: 4px 0; }
    .templates { display: flex; flex-wrap: wrap; gap: 6px; }
    .tpl { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px; border: 2px solid transparent; border-radius: 6px;
      background: none; cursor: pointer; font-size: 0.7rem; color: inherit; }
    .tpl.active { border-color: var(--ion-color-tertiary); }
    .tpl:disabled { opacity: 0.35; cursor: default; }
    .mini { position: relative; background: #000; }
    .mini span { position: absolute; background: #9a9a9a; }
    .photo { display: flex; gap: 8px; align-items: center; margin: 4px 0; }
    .photo.active { background: var(--ion-color-light); border-radius: 6px; }
    .thumb { width: 64px; height: 44px; object-fit: cover; border-radius: 4px; background: var(--ion-color-light); flex: none; }
    .actions { display: flex; flex-wrap: wrap; }
  `],
  template: `
    @if (page(); as page) {
      <h3>{{ pageTitle() }}</h3>
      @if (page.role === 'photos') {
        <h3>{{ i18n().template() }}</h3>
        <div class="templates">
          @for (t of templates; track t.template) {
            <button type="button" class="tpl" [class.active]="page.template === t.template" [disabled]="t.slots > available()"
              (click)="templateChosen.emit(t.template)">
              <span class="mini" [style.width.px]="miniW" [style.height.px]="miniH">
                @for (b of t.boxes; track $index) {
                  <span [style.left.px]="b.x" [style.top.px]="b.y" [style.width.px]="b.w" [style.height.px]="b.h"></span>
                }
              </span>
              {{ templateLabel(t.template) }}
            </button>
          }
        </div>
      }
      @if (photoKeys().length > 0) {
        <h3>{{ i18n().photos() }}</h3>
        @for (key of photoKeys(); track key) {
          <div class="photo" [class.active]="key === selectedImageKey()">
            @if (thumbUrls()[key]; as url) { <img class="thumb" [src]="url" alt="" /> } @else { <span class="thumb"></span> }
            <div class="actions">
              @if (page.role === 'photos' && blockPages().length > 1) {
                <ion-button size="small" fill="clear" (click)="moveRequested.emit(key)">
                  <ion-icon slot="start" src="{{ 'swap-horizontal' | svgIcon }}" />{{ i18n().move() }}
                </ion-button>
              }
              <ion-button size="small" fill="clear" (click)="hiddenChanged.emit({ imageKey: key, hidden: true })">
                <ion-icon slot="start" src="{{ 'eye-off' | svgIcon }}" />{{ i18n().hide() }}
              </ion-button>
              <ion-button size="small" fill="clear" (click)="wholeChanged.emit({ imageKey: key, whole: !isWhole(key) })">
                <ion-icon slot="start" src="{{ (isWhole(key) ? 'expand' : 'contract') | svgIcon }}" />{{ isWhole(key) ? i18n().fill() : i18n().whole() }}
              </ion-button>
            </div>
          </div>
        }
      }
      @if (hiddenKeys().length > 0) {
        <h3>{{ i18n().hidden_title() }}</h3>
        @for (key of hiddenKeys(); track key) {
          <div class="photo">
            @if (thumbUrls()[key]; as url) { <img class="thumb" [src]="url" alt="" /> } @else { <span class="thumb"></span> }
            <ion-button size="small" fill="clear" (click)="hiddenChanged.emit({ imageKey: key, hidden: false })">
              <ion-icon slot="start" src="{{ 'eye-on' | svgIcon }}" />{{ i18n().show() }}
            </ion-button>
          </div>
        }
      }
      @if (hasOverride()) {
        <p class="hint">{{ i18n().reset_hint() }}</p>
        <ion-button size="small" fill="outline" (click)="resetRequested.emit()">
          <ion-icon slot="start" src="{{ 'reload' | svgIcon }}" />{{ i18n().reset() }}
        </ion-button>
      }
      @if (page.footprintKey) {
        <h3>{{ footprintTitle() }}</h3>
        <ion-list lines="none">
          <ion-item>
            <ion-toggle [checked]="commentSetting().showComments" (ionChange)="setShow($event.detail.checked)">{{ i18n().comments_switch() }}</ion-toggle>
          </ion-item>
          @if (commentSetting().showComments) {
            @for (c of comments(); track c.key) {
              <ion-item>
                <ion-checkbox slot="start" [checked]="isChosen(c.key)" (ionChange)="setChosen(c.key, $event.detail.checked)" />
                <ion-label class="ion-text-wrap"><p>{{ c.text }}</p><p>{{ c.authorName }}</p></ion-label>
              </ion-item>
            } @empty {
              <p class="hint">{{ i18n().comments_empty() }}</p>
            }
          }
        </ion-list>
      }
      @if (page.role !== 'photos' && page.role !== 'hero' && !page.footprintKey) {
        <p class="hint">{{ i18n().editor_auto() }}</p>
      }
    } @else {
      <p class="hint">{{ i18n().editor_hint() }}</p>
    }
  `,
})
export class JournalBookEditor {
  public readonly i18n = input.required<JournalBookI18n>();
  public readonly page = input<BookPage | undefined>(undefined);
  public readonly pageNumber = input(0);
  /** The photo pages of the selected page's album block and the selected page's index among them (-1: none). */
  public readonly blockPages = input<BookPageOverride[]>([]);
  public readonly blockIndex = input(-1);
  public readonly hiddenKeys = input<string[]>([]); // hidden photos of the block
  public readonly wholeKeys = input<string[]>([]);
  public readonly hasOverride = input(false);
  public readonly thumbUrls = input<Record<string, string>>({});
  public readonly selectedImageKey = input<string | undefined>(undefined);
  public readonly footprintTitle = input('');
  public readonly comments = input<CommentView[]>([]);
  public readonly commentSetting = input<BookCommentSetting>({ showComments: false, commentKeys: [] });

  public readonly templateChosen = output<BookTemplate>();
  public readonly moveRequested = output<string>();
  public readonly hiddenChanged = output<{ imageKey: string; hidden: boolean }>();
  public readonly wholeChanged = output<{ imageKey: string; whole: boolean }>();
  public readonly resetRequested = output<void>();
  public readonly commentsChanged = output<BookCommentSetting>();

  protected readonly miniW = MINI_W;
  protected readonly miniH = MINI_W * (210 / 297);
  protected readonly templates = BOOK_TEMPLATES.map((template) => ({
    template,
    slots: slotCount(template),
    boxes: templateBoxes(template, 0).map((b) => ({ x: b.x * MINI_SCALE, y: b.y * MINI_SCALE, w: b.w * MINI_SCALE, h: b.h * MINI_SCALE })),
  }));

  protected readonly pageTitle = computed(() => fill(this.i18n().page(), { page: this.pageNumber() }));
  protected readonly available = computed(() => photosFrom(this.blockPages(), this.blockIndex()));
  protected readonly photoKeys = computed(() => (this.page()?.frames ?? []).flatMap((f) => (f.kind === 'photo' ? [f.imageKey] : [])));
  private readonly whole = computed(() => new Set(this.wholeKeys()));
  private readonly chosen = computed(() => new Set(this.commentSetting().commentKeys));

  protected isWhole(key: string): boolean {
    return this.whole().has(key);
  }
  protected isChosen(key: string): boolean {
    return this.chosen().has(key);
  }

  protected templateLabel(t: BookTemplate): string {
    const i18n = this.i18n();
    switch (t) {
      case 'full': return i18n.template_full();
      case 'two-portrait': return i18n.template_two_portrait();
      case 'two-landscape': return i18n.template_two_landscape();
      case 'hero-2': return i18n.template_hero_2();
      case 'hero-3': return i18n.template_hero_3();
    }
  }

  protected setShow(show: boolean): void {
    this.commentsChanged.emit({ ...this.commentSetting(), showComments: show });
  }

  protected setChosen(key: string, chosen: boolean): void {
    const keys = this.commentSetting().commentKeys.filter((k) => k !== key);
    this.commentsChanged.emit({ showComments: true, commentKeys: chosen ? [...keys, key] : keys });
  }
}
