import { signal } from '@angular/core';

import { BookPageOverride, JournalBookModel } from '@okr/shared-models';

/**
 * The book page's edits before they are saved (design §5.1: edits save as you go, debounced). Each edit lands here at
 * once — the preview reads `apply(book)` and shows it without waiting for Firestore — and 500 ms after the last edit
 * everything pending is written with the book service's targeted calls: album pages and comment choices through
 * `update` (one map entry each), «Zurücksetzen» through `removeAlbum`, hide/«ganz zeigen» per photo through
 * `setHidden` / `setFitWhole`, so the other author's edits of other entries survive (last write wins per entry).
 *
 * Every edit of an entry gets a new generation. When a write is done (or failed: then the stored book shows again),
 * only the entries whose generation is not newer than the one that was sent leave the overlay — an entry changed
 * again while the write was in flight stays, with its newer value, until its own write is done.
 */
export interface BookComments { showComments: boolean; commentKeys: string[] }

/** The writes the overlay needs; JournalBookService (data-access) provides them. */
export interface BookEditWriter {
  update(journalKey: string, tenantId: string, patch: Partial<JournalBookModel>, personKey: string): Promise<void>;
  removeAlbum(journalKey: string, tenantId: string, albumKey: string, personKey: string): Promise<void>;
  setHidden(journalKey: string, tenantId: string, imageKey: string, hidden: boolean, personKey: string): Promise<void>;
  setFitWhole(journalKey: string, tenantId: string, imageKey: string, fit: boolean, personKey: string): Promise<void>;
}

export interface BookEditTarget { journalKey: string; tenantId: string; personKey: string }

interface Entry<T> { value: T; gen: number }
type Entries<T> = Record<string, Entry<T>>;
interface Pending {
  albums: Entries<BookPageOverride[] | null>; // null = reset
  footprints: Entries<BookComments>;
  hidden: Entries<boolean>;
  whole: Entries<boolean>;
}
const EMPTY: Pending = { albums: {}, footprints: {}, hidden: {}, whole: {} };
export const BOOK_EDIT_DEBOUNCE_MS = 500;

const valuesOf = <T>(e: Entries<T>): [string, T][] => Object.entries(e).map(([k, v]) => [k, v.value]);

export class JournalBookEdits {
  private readonly pending = signal<Pending>(EMPTY);
  private timer?: ReturnType<typeof setTimeout>;
  private gen = 0;
  private inFlight = 0;
  public readonly saving = signal(false);

  public constructor(
    private readonly writer: BookEditWriter,
    private readonly target: () => BookEditTarget | undefined,
    private readonly onError: (error: unknown) => void,
    private readonly debounceMs = BOOK_EDIT_DEBOUNCE_MS,
  ) {}

  /** The book as the author sees it: stored values with the pending edits on top. */
  public apply(book: JournalBookModel): JournalBookModel {
    const p = this.pending();
    if (p === EMPTY) return book;
    const albums = { ...book.albums };
    for (const [k, v] of valuesOf(p.albums)) {
      if (v === null) delete albums[k];
      else albums[k] = { pages: v };
    }
    const toggle = (list: string[], changes: Entries<boolean>) => {
      const set = new Set(list);
      for (const [k, on] of valuesOf(changes)) {
        if (on) set.add(k);
        else set.delete(k);
      }
      return [...set];
    };
    return {
      ...book, albums, footprints: { ...book.footprints, ...Object.fromEntries(valuesOf(p.footprints)) },
      hiddenImageKeys: toggle(book.hiddenImageKeys ?? [], p.hidden), fitWhole: toggle(book.fitWhole ?? [], p.whole),
    };
  }

  public setAlbum(blockKey: string, pages: BookPageOverride[]): void {
    this.change('albums', blockKey, pages);
  }
  public resetAlbum(blockKey: string): void {
    this.change('albums', blockKey, null);
  }
  public setComments(footprintKey: string, value: BookComments): void {
    this.change('footprints', footprintKey, value);
  }
  public setHidden(imageKey: string, hidden: boolean): void {
    this.change('hidden', imageKey, hidden);
  }
  public setWhole(imageKey: string, whole: boolean): void {
    this.change('whole', imageKey, whole);
  }

  /** Writes what is pending now (also called when the page closes and before an export). */
  public async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    const target = this.target();
    const sent = this.pending();
    if (!target || sent === EMPTY) return;
    const { journalKey, tenantId, personKey } = target;
    this.inFlight += 1;
    this.saving.set(true);
    try {
      const albums = Object.fromEntries(valuesOf(sent.albums).filter(([, v]) => v !== null).map(([k, v]) => [k, { pages: v as BookPageOverride[] }]));
      const patch: Partial<JournalBookModel> = {};
      if (Object.keys(albums).length > 0) patch.albums = albums;
      if (Object.keys(sent.footprints).length > 0) patch.footprints = Object.fromEntries(valuesOf(sent.footprints));
      const writes: Promise<void>[] = [];
      if (Object.keys(patch).length > 0) writes.push(this.writer.update(journalKey, tenantId, patch, personKey));
      for (const [k, v] of valuesOf(sent.albums)) if (v === null) writes.push(this.writer.removeAlbum(journalKey, tenantId, k, personKey));
      for (const [k, v] of valuesOf(sent.hidden)) writes.push(this.writer.setHidden(journalKey, tenantId, k, v, personKey));
      for (const [k, v] of valuesOf(sent.whole)) writes.push(this.writer.setFitWhole(journalKey, tenantId, k, v, personKey));
      const results = await Promise.allSettled(writes);
      const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed) this.onError(failed.reason);
    } finally {
      this.settle(sent);
      this.inFlight -= 1;
      this.saving.set(this.inFlight > 0);
    }
  }

  private change<K extends keyof Pending>(kind: K, key: string, value: Pending[K][string]['value']): void {
    const p = this.pending();
    this.gen += 1;
    this.pending.set({ ...p, [kind]: { ...p[kind], [key]: { value, gen: this.gen } } });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.debounceMs);
  }

  /** Drops the entries that were sent and not changed again meanwhile (generation not newer than the sent one). */
  private settle(sent: Pending): void {
    const now = this.pending();
    const keep = <T>(cur: Entries<T>, was: Entries<T>): Entries<T> =>
      Object.fromEntries(Object.entries(cur).filter(([k, e]) => !(k in was) || e.gen > was[k].gen));
    const next: Pending = {
      albums: keep(now.albums, sent.albums), footprints: keep(now.footprints, sent.footprints),
      hidden: keep(now.hidden, sent.hidden), whole: keep(now.whole, sent.whole),
    };
    const empty = Object.values(next).every((r) => Object.keys(r).length === 0);
    this.pending.set(empty ? EMPTY : next);
  }
}
