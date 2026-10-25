import { inject, Injectable } from '@angular/core';
import { captureException } from '@sentry/angular';
import { firstValueFrom } from 'rxjs';

import { JournalBookModel } from '@okr/shared-models';
import { JournalBookExportResult, JournalBookService } from '@okr/travel-journal-data-access';
// renderBookMap imports MapLibre itself, lazily (journal-maplibre.ts): this static import keeps it out of the start bundle
import { renderBookMap } from '@okr/travel-journal-ui';
import { BookLabels, bookMapPlan, JournalState, JournalTileSource, layoutBook, MAP_BACK } from '@okr/travel-journal-util';

/**
 * The browser side of the book export (design §5.2, §8): the maps the book needs are drawn with MapLibre at 300 dpi and
 * uploaded as `book-map-*.jpg` into the journal folder, then exportJournalBook writes the PDF. Every export draws all
 * maps again and overwrites the old files (ruling R9: footprints may have moved or been renumbered). A map whose tiles
 * did not all arrive is still uploaded and counted as incomplete (ruling R8); a map that cannot be drawn or uploaded
 * is counted as failed and reported (console + Sentry) — the PDF then shows the old file or a black frame.
 */
export interface BookExportStatus {
  journalKey: string;
  kind: 'print' | 'screen';
  phase: 'idle' | 'maps' | 'pdf' | 'done' | 'failed';
  mapsDone: number;
  mapsTotal: number;
  mapsIncomplete: number;
  mapsFailed: number;
  result?: JournalBookExportResult;
  error: '' | 'busy' | 'failed';
}
export const NO_BOOK_EXPORT: BookExportStatus = {
  journalKey: '', kind: 'print', phase: 'idle', mapsDone: 0, mapsTotal: 0, mapsIncomplete: 0, mapsFailed: 0, error: '',
};

export interface BookExportInput {
  journalKey: string;
  kind: 'print' | 'screen';
  state: JournalState;
  layers: JournalTileSource[];
  labels: BookLabels;
}

const MAP_DPI = 300;
/** Upload URLs are valid for 15 minutes: they are fetched for a few maps at a time, just before drawing them. */
const MAP_BATCH = 8;
/** As the function's guard (EXPORT_STALE_MS): a running export older than this is considered dead. */
const EXPORT_STALE_MS = 65 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class JournalBookExporter {
  private readonly bookService = inject(JournalBookService);

  public async run(input: BookExportInput, setStatus: (s: BookExportStatus) => BookExportStatus): Promise<BookExportStatus> {
    const { journalKey, kind, state, layers, labels } = input;
    let status = setStatus({ ...NO_BOOK_EXPORT, journalKey, kind, phase: 'maps' });
    try {
      const book = (await firstValueFrom(this.bookService.book$(journalKey))) ?? new JournalBookModel();
      const running = book.export?.state === 'running' && Date.now() - Date.parse(book.export.startedAt) < EXPORT_STALE_MS;
      if (running) return setStatus({ ...status, phase: 'failed', error: 'busy' });

      // maps are drawn at the print geometry (with bleed) for both kinds; the screen PDF has no cover
      const layout = layoutBook({ state, journalKey, book, labels, authorName: () => '', paginate: (html) => [html] });
      const plan = bookMapPlan(state, journalKey, book, layout).filter((p) => kind === 'print' || p.file !== MAP_BACK);
      for (let i = 0; i < plan.length; i += MAP_BATCH) {
        const batch = plan.slice(i, i + MAP_BATCH);
        const uploads = await this.bookService.prepareUploads(journalKey, batch.map((p) => p.file), true);
        const todo = batch.flatMap((p) => {
          const upload = uploads.find((u) => u.file === p.file);
          return upload && !upload.done && upload.url ? [{ p, upload }] : [];
        });
        status = setStatus({ ...status, mapsTotal: status.mapsTotal + todo.length });
        if (todo.length === 0) continue;
        for (const { p, upload } of todo) {
          let incomplete = false;
          let failed = false;
          try {
            const map = await renderBookMap({ box: p.box, dpi: MAP_DPI, layers, route: p.route, stops: p.stops, legPath: p.legPath });
            incomplete = map.incomplete;
            await this.bookService.putFile(upload, map.blob);
          } catch (error) {
            failed = true;
            console.error(`journal book: map ${p.file} could not be drawn or uploaded`, error);
            captureException(error, { tags: { feature: 'journal-book', step: 'map', file: p.file } });
          }
          status = setStatus({
            ...status, mapsDone: status.mapsDone + 1, mapsIncomplete: status.mapsIncomplete + (incomplete && !failed ? 1 : 0), mapsFailed: status.mapsFailed + (failed ? 1 : 0),
          });
        }
      }

      status = setStatus({ ...status, phase: 'pdf' });
      const result = await this.bookService.exportBook(journalKey, kind, labels);
      return setStatus({ ...status, phase: 'done', result });
    } catch (error) {
      const code = (error as { code?: string } | undefined)?.code;
      return setStatus({ ...status, phase: 'failed', error: code === 'functions/failed-precondition' ? 'busy' : 'failed' });
    }
  }
}
