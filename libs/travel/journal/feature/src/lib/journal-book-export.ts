import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { IonButton, IonIcon, IonProgressBar } from '@ionic/angular';

import { JournalBookModel } from '@okr/shared-models';
import { JournalBookExportResult, JournalBookService } from '@okr/travel-journal-data-access';
import { SvgIconPipe } from '@okr/shared-pipes';
import { convertDateFormatToString, DateFormat, fill } from '@okr/shared-util-core';

import { NO_BOOK_EXPORT } from './journal-book-export.service';
import { JournalStore } from './journal.store';

const STALE_MS = 65 * 60 * 1000;

/**
 * The export part of the book page (design §5.2): «Druck-PDF erstellen» and «Bildschirm-PDF», the progress (maps drawn
 * here, then the PDF's pages from `book.export.progress`), and when done the download links (valid 24 h), page and
 * warning count. A failed or busy export says so; the last finished export of the book is named even after a reload
 * (its links are only known to the session that made it).
 */
@Component({
  selector: 'okr-journal-book-export',
  imports: [IonButton, IonIcon, IonProgressBar, SvgIconPipe],
  styles: [`
    :host { display: block; }
    h3 { margin: 12px 0 6px; font-size: 0.95rem; }
    .buttons { display: flex; flex-wrap: wrap; gap: 4px; }
    p { margin: 6px 0; font-size: 0.85rem; }
    .muted { color: var(--ion-color-medium); }
    .warn { color: var(--ion-color-warning-shade); }
    .error { color: var(--ion-color-danger); }
    a { display: inline-flex; align-items: center; gap: 4px; margin-right: 12px; }
  `],
  template: `
    <h3>{{ i18n.export_title() }}</h3>
    <div class="buttons">
      <ion-button size="small" [disabled]="busy()" (click)="start('print')">{{ i18n.export_print() }}</ion-button>
      <ion-button size="small" fill="outline" [disabled]="busy()" (click)="start('screen')">{{ i18n.export_screen() }}</ion-button>
    </div>
    <p class="muted">{{ i18n.export_screen_hint() }}</p>
    @if (line(); as line) {
      <p>{{ line }}</p>
      @if (progress() !== undefined) { <ion-progress-bar [value]="progress()" /> }
    }
    @if (incomplete(); as text) { <p class="warn">{{ text }}</p> }
    @if (mapsFailed(); as text) { <p class="error">{{ text }}</p> }
    @if (status().phase === 'failed') {
      <p class="error">{{ status().error === 'busy' ? i18n.export_busy() : i18n.export_failed() }}</p>
    }
    @if (result(); as r) {
      <p>
        <a [href]="r.bookUrl" target="_blank" rel="noopener" download><ion-icon src="{{ 'download' | svgIcon }}" />{{ i18n.export_book() }}</a>
        @if (r.coverUrl) {
          <a [href]="r.coverUrl" target="_blank" rel="noopener" download><ion-icon src="{{ 'download' | svgIcon }}" />{{ i18n.export_cover() }}</a>
        }
      </p>
      <p class="muted">{{ i18n.export_links_hint() }}</p>
    } @else if (last(); as text) {
      <p class="muted">{{ text }}</p>
    }
  `,
})
export class JournalBookExport {
  private readonly store = inject(JournalStore);
  private readonly bookService = inject(JournalBookService);
  protected readonly i18n = this.store.bookI18n;

  public readonly journalKey = input.required<string>();
  public readonly book = input<JournalBookModel | undefined>(undefined);
  public readonly beforeExport = input<() => Promise<void>>(() => Promise.resolve());

  protected readonly status = computed(() => {
    const s = this.store.bookExport();
    return s.journalKey === this.journalKey() ? s : NO_BOOK_EXPORT;
  });
  private readonly remoteRunning = computed(() => {
    const e = this.book()?.export;
    return e?.state === 'running' && Date.now() - Date.parse(e.startedAt) < STALE_MS;
  });
  protected readonly busy = computed(() => this.status().phase === 'maps' || this.status().phase === 'pdf' || this.remoteRunning());

  protected readonly line = computed(() => {
    const s = this.status();
    const e = this.book()?.export;
    if (s.phase === 'maps') return s.mapsTotal > 0 ? fill(this.i18n.export_maps(), { done: s.mapsDone, total: s.mapsTotal }) : this.i18n.export_preparing();
    if (s.phase === 'pdf' || this.remoteRunning()) {
      return e?.state === 'running' ? fill(this.i18n.export_running(), { progress: e.progress ?? 0 }) : this.i18n.export_preparing();
    }
    if (s.phase === 'done' && s.result) return fill(this.i18n.export_done(), { pages: s.result.pageCount, warnings: s.result.warnings });
    return '';
  });
  protected readonly progress = computed(() => {
    const s = this.status();
    if (s.phase === 'maps') return s.mapsTotal > 0 ? s.mapsDone / s.mapsTotal : undefined;
    const e = this.book()?.export;
    return (s.phase === 'pdf' || this.remoteRunning()) && e?.state === 'running' ? (e.progress ?? 0) / 100 : undefined;
  });
  protected readonly incomplete = computed(() => {
    const n = this.status().mapsIncomplete;
    return n > 0 ? fill(this.i18n.export_maps_incomplete(), { count: n }) : '';
  });
  protected readonly mapsFailed = computed(() => {
    const n = this.status().mapsFailed;
    return n > 0 ? fill(this.i18n.export_maps_failed(), { count: n }) : '';
  });
  /** Links of the last finished export after a reload (ruling R10), fetched once per finished export. */
  private readonly storedLinks = signal<Partial<JournalBookExportResult> | undefined>(undefined);
  private linksFor = '';
  protected readonly result = computed(() => {
    if (this.status().phase === 'done') return this.status().result;
    const stored = this.storedLinks();
    return this.book()?.export?.state === 'done' && stored?.bookUrl ? (stored as JournalBookExportResult) : undefined;
  });

  public constructor() {
    effect(() => {
      const e = this.book()?.export;
      const key = e?.state === 'done' && e.bookPath ? `${this.journalKey()}|${e.bookPath}` : '';
      if (!key || key === this.linksFor || this.status().phase === 'done') return;
      this.linksFor = key;
      untracked(() => {
        this.storedLinks.set(undefined);
        this.bookService.exportLinks(this.journalKey()).then((links) => this.storedLinks.set(links)).catch(() => undefined);
      });
    });
  }
  protected readonly last = computed(() => {
    const e = this.book()?.export;
    if (e?.state !== 'done' || !e.finishedAt) return '';
    const date = convertDateFormatToString(e.finishedAt.slice(0, 19), DateFormat.IsoDateTime, DateFormat.ViewDate, false);
    return fill(this.i18n.export_last(), { date, pages: e.pageCount ?? 0 });
  });

  protected async start(kind: 'print' | 'screen'): Promise<void> {
    await this.beforeExport()(); // pending edits first: the function lays out the stored book (ruling R12)
    await this.store.exportBook(this.journalKey(), kind);
  }
}
