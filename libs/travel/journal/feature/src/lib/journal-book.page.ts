import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, input, SecurityContext, signal, untracked, viewChild } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { ActionSheetController, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, ModalController, ToastController } from '@ionic/angular';
import { startWith, switchMap } from 'rxjs';

import { BookTemplate, JournalBookModel, TRANSPORT_MODES, TransportMode } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { fill } from '@okr/shared-util-core';
import { JournalBookService } from '@okr/travel-journal-data-access';
import { BookCommentSetting, bookFontsReady, JournalBookEditor, JournalBookPreview, JournalBookSettingsModal } from '@okr/travel-journal-ui';
import {
  blockPagesOf, bookLabelsOf, COVER_PAGE_INDEX, JournalBookEdits, BookSettingsFormModel, bookSettingsOf, bookSettingsPatch, layoutBook, missingPrintsByAuthor, movePhotoTo, publishedFootprintsOf, spreadsOf, withTemplate,
} from '@okr/travel-journal-util';

import { JournalBookExport } from './journal-book-export';
import { domPaginate } from './journal-book-paginate';
import { JournalFileUrlService } from './journal-file-url.service';
import { JournalStore } from './journal.store';

/** Above this page count the page shows a hint: many print shops limit the pages of a bound book. */
const BOOK_PAGES_HINT = 200;
const SPREAD_GAP = 6;
const PAGE_MAX_W = 560;

/**
 * The book page (design 2026-10-24 §1, §5): desktop browser, authors only. The book is laid out with the same util
 * as the PDF (layoutBook, text measured in the DOM with the print fonts) and shown as spreads, the first page alone on
 * the right. A click on a page opens it in the side panel for editing; edits show at once and are saved 500 ms later.
 * The side panel also holds the page count, the warnings (a click jumps to the page), the print photos still missing
 * per author, and the export. Title, cover photo and print settings are an edit modal.
 */
@Component({
  selector: 'okr-journal-book-page',
  imports: [IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonIcon, SvgIconPipe, JournalBookPreview, JournalBookEditor, JournalBookExport],
  styles: [`
    .layout { display: flex; gap: 16px; padding: 12px; align-items: flex-start; }
    .spreads { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 18px; align-items: center; }
    .spread { display: flex; gap: ${SPREAD_GAP}px; }
    .side { flex: 0 0 340px; position: sticky; top: 0; max-height: calc(100vh - 80px); overflow-y: auto; }
    @media (width < 900px) { .layout { flex-direction: column-reverse; } .side { position: static; flex: none; width: 100%; max-height: none; } }
    .muted { color: var(--ion-color-medium); }
    .warn { color: var(--ion-color-warning-shade); }
    p { margin: 6px 0; font-size: 0.85rem; }
    .link { background: none; border: none; padding: 0; color: var(--ion-color-primary); cursor: pointer; font: inherit; text-align: left; }
    ul { margin: 4px 0; padding-left: 18px; font-size: 0.8rem; }
    hr { border: none; border-top: 1px solid var(--ion-color-light); margin: 12px 0; }
  `],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button [defaultHref]="'/journal/' + journalKey()" /></ion-buttons>
        <ion-title>{{ i18n.title() }}{{ layout()?.title ? ' · ' + layout()?.title : '' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button [disabled]="!bookLoaded()" (click)="openSettings()"><ion-icon slot="start" src="{{ 'settings' | svgIcon }}" />{{ i18n.settings() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="layout">
        <div class="spreads" #column>
          @if (layout(); as layout) {
            @for (spread of spreads(); track $index) {
              <div class="spread">
                @for (i of spread; track $index) {
                  @if (i !== undefined) {
                    <okr-journal-book-preview [id]="'book-page-' + i" [page]="layout.pages[i]" [number]="i + 1" [width]="pageWidth()"
                      [imageUrls]="imageUrls()" [warnings]="warningCount()[i] ?? 0" [selected]="i === selectedIndex()"
                      [selectedImageKey]="i === selectedIndex() ? selectedImageKey() : undefined" [i18n]="i18n"
                      (click)="select(i)" (photoClicked)="selectPhoto(i, $event)" />
                  } @else {
                    <div [style.width.px]="pageWidth()"></div>
                  }
                }
              </div>
            }
          } @else {
            <p class="muted">{{ i18n.loading() }}</p>
          }
        </div>
        <aside class="side">
          @if (layout(); as layout) {
            <p><b>{{ pagesLine() }}</b></p>
            @if (layout.pages.length > pagesHint) { <p class="warn">{{ pagesMaxLine() }}</p> }
            @for (line of missingLines(); track $index) { <p class="warn">{{ line }}</p> }
            @if (missingLines().length > 0) { <p class="muted">{{ i18n.prints_hint() }}</p> }
            @if (warningLines().length > 0) {
              <p><button type="button" class="link" (click)="warningsOpen.set(!warningsOpen())">{{ warningsLine() }}</button></p>
              @if (warningsOpen()) {
                <ul>
                  @for (w of warningLines(); track $index) {
                    <li><button type="button" class="link" (click)="jumpTo(w.pageIndex, w.imageKey)">{{ w.text }}</button></li>
                  }
                </ul>
              }
            } @else {
              <p class="muted">{{ i18n.warnings_none() }}</p>
            }
            <hr />
            <okr-journal-book-editor [i18n]="i18n" [page]="selectedPage()" [pageNumber]="(selectedIndex() ?? 0) + 1"
              [blockPages]="blockPages()" [blockIndex]="blockIndex()" [hiddenKeys]="hiddenInBlock()" [wholeKeys]="book().fitWhole"
              [hasOverride]="hasOverride()" [thumbUrls]="thumbUrls()" [selectedImageKey]="selectedImageKey()"
              [footprintTitle]="footprintTitle()" [comments]="comments()" [commentSetting]="commentSetting()"
              (templateChosen)="setTemplate($event)" (moveRequested)="move($event)" (hiddenChanged)="setHidden($event.imageKey, $event.hidden)"
              (wholeChanged)="edits.setWhole($event.imageKey, $event.whole)" (resetRequested)="reset()" (commentsChanged)="setComments($event)" />
            <hr />
            <okr-journal-book-export [journalKey]="journalKey()" [book]="remoteBook() ?? undefined" [beforeExport]="flushEdits" />
          }
        </aside>
      </div>
    </ion-content>
  `,
})
export class JournalBookPage {
  protected readonly store = inject(JournalStore);
  private readonly bookService = inject(JournalBookService);
  private readonly fileUrl = inject(JournalFileUrlService);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly modalController = inject(ModalController);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly toastController = inject(ToastController);
  protected readonly i18n = this.store.bookI18n;

  public readonly journalKey = input.required<string>();

  protected readonly pagesHint = BOOK_PAGES_HINT;
  protected readonly journal = computed(() => this.store.journals().find((j) => j.key === this.journalKey()));
  /** null until the first snapshot of the book document arrived (undefined: no book document yet). */
  protected readonly remoteBook = toSignal(
    toObservable(this.journalKey).pipe(switchMap((k) => this.bookService.book$(k).pipe(startWith(null)))), { initialValue: null });
  protected readonly bookLoaded = computed(() => this.remoteBook() !== null);
  protected readonly edits = new JournalBookEdits(this.bookService, () => this.target(), () => void this.toast(this.i18n.save_failed()));
  protected readonly book = computed(() => this.edits.apply(this.remoteBook() ?? new JournalBookModel()));

  private readonly fontsReady = signal(false);
  private readonly paginate = domPaginate((html) => this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '');
  private readonly images = computed(() => this.store.images(this.journalKey()));
  /** What the book prints: published footprints without conflict copies (spec 1.126 §6.3). */
  private readonly footprints = computed(() => publishedFootprintsOf(this.store.journalState(), this.journalKey()));
  private readonly labels = computed(() => {
    const transport = Object.fromEntries(TRANSPORT_MODES.map((m) => [m, this.store.i18n[`transport_${m}`]()])) as Record<TransportMode, string>;
    const credits = this.store.mapLayersFor(this.journalKey()).filter((l) => l.kind !== 'vector').map((l) => l.attribution);
    return bookLabelsOf(this.i18n, transport, credits);
  });
  /** Ruling R13: the names the preview prints are the names the export request carries (store.bookAuthorNames). */
  private readonly authorNames = computed(() => this.store.bookAuthorNames(this.journalKey()));
  protected readonly layout = computed(() => {
    // no layout and no editing before the stored book is known: an edit on the defaults would overwrite it
    if (!this.fontsReady() || !this.journal() || !this.bookLoaded()) return undefined;
    return layoutBook({
      state: this.store.journalState(), journalKey: this.journalKey(), book: this.book(), labels: this.labels(),
      authorName: (k) => this.authorName(k), paginate: this.paginate,
    });
  });

  // preview
  private readonly spreadsEl = viewChild<ElementRef<HTMLElement>>('column');
  private readonly columnWidth = signal(900);
  protected readonly pageWidth = computed(() => Math.max(160, Math.min(PAGE_MAX_W, Math.floor((this.columnWidth() - SPREAD_GAP) / 2))));
  protected readonly spreads = computed(() => spreadsOf(this.layout()?.pages.length ?? 0));
  protected readonly imageUrls = computed(() => this.urls('path2048'));
  protected readonly thumbUrls = computed(() => this.urls('path400'));
  protected readonly warningCount = computed(() => {
    const out: Record<number, number> = {};
    for (const w of this.layout()?.warnings ?? []) out[w.pageIndex] = (out[w.pageIndex] ?? 0) + 1;
    return out;
  });

  // summary
  protected readonly warningsOpen = signal(false);
  protected readonly pagesLine = computed(() => fill(this.i18n.pages(), { count: this.layout()?.pages.length ?? 0 }));
  protected readonly pagesMaxLine = computed(() => fill(this.i18n.pages_max(), { max: BOOK_PAGES_HINT }));
  protected readonly warningsLine = computed(() => fill(this.i18n.warnings(), { count: this.layout()?.warnings.length ?? 0 }));
  protected readonly warningLines = computed(() => (this.layout()?.warnings ?? []).map((w) => {
    const template = w.level === 'missing' ? this.i18n.warning_missing() : w.level === 'veryPoor' ? this.i18n.warning_very_poor() : this.i18n.warning_poor();
    const where = w.pageIndex === COVER_PAGE_INDEX ? this.i18n.warning_cover() : fill(this.i18n.page(), { page: w.pageIndex + 1 });
    return { pageIndex: w.pageIndex, imageKey: w.imageKey, text: fill(template, { where, dpi: w.dpi ?? '–' }) };
  }));
  protected readonly missingLines = computed(() => {
    const layout = this.layout();
    if (!layout) return [];
    return [...missingPrintsByAuthor(layout, this.book(), this.images())].map(([author, count]) => {
      const name = author ? this.authorName(author) : '';
      return name ? fill(this.i18n.prints_missing(), { count, name }) : fill(this.i18n.prints_missing_unknown(), { count });
    });
  });

  // selection and editing
  protected readonly selectedIndex = signal<number | undefined>(undefined);
  protected readonly selectedImageKey = signal<string | undefined>(undefined);
  protected readonly selectedPage = computed(() => {
    const i = this.selectedIndex();
    return i === undefined ? undefined : this.layout()?.pages[i];
  });
  private readonly blockKey = computed(() => this.selectedPage()?.blockKey);
  protected readonly blockPages = computed(() => {
    const layout = this.layout();
    const key = this.blockKey();
    return layout && key ? blockPagesOf(layout, key) : [];
  });
  /** Layout indexes of the photo pages of the selected block, in order (blockPages[j] is page blockPageIndexes[j]). */
  private readonly blockPageIndexes = computed(() => {
    const key = this.blockKey();
    return (this.layout()?.pages ?? []).flatMap((p, i) => (p.role === 'photos' && p.blockKey === key ? [i] : []));
  });
  protected readonly blockIndex = computed(() => this.blockPageIndexes().indexOf(this.selectedIndex() ?? -1));
  protected readonly hiddenInBlock = computed(() => {
    const key = this.blockKey();
    const block = this.footprints().flatMap((f) => f.blocks).find((b) => b.key === key);
    const hidden = new Set(this.book().hiddenImageKeys);
    return (block?.imageKeys ?? []).filter((k) => hidden.has(k));
  });
  protected readonly hasOverride = computed(() => {
    const key = this.blockKey();
    return !!key && !!this.book().albums?.[key];
  });
  private readonly footprint = computed(() => this.footprints().find((f) => f.key === this.selectedPage()?.footprintKey));
  protected readonly footprintTitle = computed(() => this.footprint()?.title ?? '');
  protected readonly comments = computed(() => {
    const fp = this.footprint();
    return fp ? this.store.comments(fp.key) : [];
  });
  protected readonly commentSetting = computed<BookCommentSetting>(() => {
    const fp = this.footprint();
    return (fp && this.book().footprints?.[fp.key]) || { showComments: false, commentKeys: [] };
  });

  public constructor() {
    void bookFontsReady().then(() => this.fontsReady.set(true));
    // authors only, desktop only (design §1): the native app has no book page; a journal not among the authored ones is not ours
    effect(() => {
      const native = this.store.native();
      const loaded = this.store.webLoaded();
      const journal = this.journal();
      untracked(() => {
        if (native) void this.router.navigate(['/journal', this.journalKey()]);
        else if (loaded && !journal) void this.router.navigate(['/journal']);
      });
    });
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.spreadsEl()?.nativeElement;
      if (!el || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(([entry]) => this.columnWidth.set(entry.contentRect.width));
      observer.observe(el);
      destroyRef.onDestroy(() => observer.disconnect());
    });
    destroyRef.onDestroy(() => void this.edits.flush());
  }

  /** Pending edits are written before an export starts: the function lays out the stored book. */
  protected readonly flushEdits = (): Promise<void> => this.edits.flush();

  protected select(index: number): void {
    if (this.selectedIndex() !== index) this.selectedImageKey.set(undefined);
    this.selectedIndex.set(index);
  }

  protected selectPhoto(index: number, imageKey: string): void {
    this.selectedIndex.set(index);
    this.selectedImageKey.set(imageKey);
  }

  protected jumpTo(pageIndex: number, imageKey?: string): void {
    if (pageIndex === COVER_PAGE_INDEX) {
      void this.openSettings(); // the cover photo is chosen in the settings
      return;
    }
    this.selectPhoto(pageIndex, imageKey ?? '');
    document.getElementById(`book-page-${pageIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  protected setTemplate(template: BookTemplate): void {
    const key = this.blockKey();
    if (key) this.edits.setAlbum(key, withTemplate(this.blockPages(), this.blockIndex(), template));
  }

  /** «Verschieben nach Seite …»: the other photo pages of the same block. */
  protected async move(imageKey: string): Promise<void> {
    const key = this.blockKey();
    const pages = this.blockPages();
    const indexes = this.blockPageIndexes();
    if (!key) return;
    const buttons = indexes.map((pageIndex, j) => ({ j, pageIndex })).filter((b) => b.j !== this.blockIndex()).map((b) => ({
      text: fill(this.i18n.page(), { page: b.pageIndex + 1 }),
      handler: () => {
        this.edits.setAlbum(key, movePhotoTo(pages, imageKey, b.j, this.images()));
        this.selectedImageKey.set(undefined);
      },
    }));
    const sheet = await this.actionSheetController.create({ header: this.i18n.move_title(), buttons: [...buttons, { text: this.store.i18n.cancel(), role: 'cancel' }] });
    await sheet.present();
  }

  protected setHidden(imageKey: string, hidden: boolean): void {
    this.edits.setHidden(imageKey, hidden);
    if (hidden && this.selectedImageKey() === imageKey) this.selectedImageKey.set(undefined);
  }

  protected reset(): void {
    const key = this.blockKey();
    if (key) this.edits.resetAlbum(key);
  }

  protected setComments(value: BookCommentSetting): void {
    const fp = this.footprint();
    if (fp) this.edits.setComments(fp.key, value);
  }

  protected async openSettings(): Promise<void> {
    if (!this.bookLoaded()) return;
    const images = this.images();
    const seen = new Set<string>();
    const covers = this.footprints().flatMap((f) => f.blocks).flatMap((b) => b.imageKeys ?? [])
      .filter((k) => images.has(k) && !seen.has(k) && seen.add(k))
      .map((key) => ({ key, url: this.fileUrl.url(images.get(key)?.path400) }));
    const modal = await this.modalController.create({
      component: JournalBookSettingsModal, componentProps: { settings: bookSettingsOf(this.book(), this.journal()), covers },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<BookSettingsFormModel>();
    const target = this.target();
    if (role !== 'confirm' || !data || !target) return;
    try {
      await this.bookService.update(target.journalKey, target.tenantId, bookSettingsPatch(data), target.personKey);
    } catch {
      await this.toast(this.i18n.save_failed());
    }
  }

  private target(): { journalKey: string; tenantId: string; personKey: string } | undefined {
    const tenantId = this.store.appStore.tenantId();
    const personKey = this.store.appStore.currentUser()?.personKey;
    return tenantId && personKey ? { journalKey: this.journalKey(), tenantId, personKey } : undefined;
  }

  /** A member's printed name (store.bookAuthorNames), '' when unknown — the book then prints no name line. */
  private authorName(personKey: string): string {
    return this.authorNames()[personKey] ?? '';
  }

  private urls(field: 'path2048' | 'path400'): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, image] of this.images()) out[key] = this.fileUrl.url(image[field]);
    return out;
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 3000 });
    await toast.present();
  }
}
