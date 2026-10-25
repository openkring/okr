import { signal } from '@angular/core';

import { BookPageOverride, JournalBookModel } from '@okr/shared-models';
import { JournalBookService } from '@okr/travel-journal-data-access';

/**
 * The book page's edits before they are saved (design §5.1: edits save as you go, debounced). Each edit lands here at
 * once — the preview reads `apply(book)` and shows it without waiting for Firestore — and 500 ms after the last edit
 * everything pending is written with the book service's targeted calls: album pages and comment choices through
 * `update` (one map entry each), «Zurücksetzen» through `removeAlbum`, hide/«ganz zeigen» per photo through
 * `setHidden` / `setFitWhole`, so the other author's edits of other entries survive (last write wins per entry).
 * An entry leaves the overlay when its write is done (or failed: then the stored book shows again).
 */
export interface BookComments { showComments: boolean; commentKeys: string[] }

interface Pending {
  albums: Record<string, BookPageOverride[] | null>; // null = reset
  footprints: Record<string, BookComments>;
  hidden: Record<string, boolean>;
  whole: Record<string, boolean>;
}
const EMPTY: Pending = { albums: {}, footprints: {}, hidden: {}, whole: {} };
const DEBOUNCE_MS = 500;

export interface BookEditTarget { journalKey: string; tenantId: string; personKey: string }

export class JournalBookEdits {
  private readonly pending = signal<Pending>(EMPTY);
  private timer?: ReturnType<typeof setTimeout>;
  public readonly saving = signal(false);

  public constructor(
    private readonly service: JournalBookService,
    private readonly target: () => BookEditTarget | undefined,
    private readonly onError: (error: unknown) => void,
  ) {}

  /** The book as the author sees it: stored values with the pending edits on top. */
  public apply(book: JournalBookModel): JournalBookModel {
    const p = this.pending();
    if (p === EMPTY) return book;
    const albums = { ...book.albums };
    for (const [k, v] of Object.entries(p.albums)) {
      if (v === null) delete albums[k];
      else albums[k] = { pages: v };
    }
    const toggle = (list: string[], changes: Record<string, boolean>) => {
      const set = new Set(list);
      for (const [k, on] of Object.entries(changes)) {
        if (on) set.add(k);
        else set.delete(k);
      }
      return [...set];
    };
    return {
      ...book, albums, footprints: { ...book.footprints, ...p.footprints },
      hiddenImageKeys: toggle(book.hiddenImageKeys ?? [], p.hidden), fitWhole: toggle(book.fitWhole ?? [], p.whole),
    };
  }

  public setAlbum(blockKey: string, pages: BookPageOverride[]): void {
    this.change((p) => ({ ...p, albums: { ...p.albums, [blockKey]: pages } }));
  }
  public resetAlbum(blockKey: string): void {
    this.change((p) => ({ ...p, albums: { ...p.albums, [blockKey]: null } }));
  }
  public setComments(footprintKey: string, value: BookComments): void {
    this.change((p) => ({ ...p, footprints: { ...p.footprints, [footprintKey]: value } }));
  }
  public setHidden(imageKey: string, hidden: boolean): void {
    this.change((p) => ({ ...p, hidden: { ...p.hidden, [imageKey]: hidden } }));
  }
  public setWhole(imageKey: string, whole: boolean): void {
    this.change((p) => ({ ...p, whole: { ...p.whole, [imageKey]: whole } }));
  }

  /** Writes what is pending now (also called when the page closes). */
  public async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    const target = this.target();
    const sent = this.pending();
    if (!target || sent === EMPTY) return;
    const { journalKey, tenantId, personKey } = target;
    this.saving.set(true);
    try {
      const albums = Object.fromEntries(Object.entries(sent.albums).filter(([, v]) => v !== null).map(([k, v]) => [k, { pages: v as BookPageOverride[] }]));
      const patch: Partial<JournalBookModel> = {};
      if (Object.keys(albums).length > 0) patch.albums = albums;
      if (Object.keys(sent.footprints).length > 0) patch.footprints = sent.footprints;
      const writes: Promise<void>[] = [];
      if (Object.keys(patch).length > 0) writes.push(this.service.update(journalKey, tenantId, patch, personKey));
      for (const [k, v] of Object.entries(sent.albums)) if (v === null) writes.push(this.service.removeAlbum(journalKey, tenantId, k, personKey));
      for (const [k, v] of Object.entries(sent.hidden)) writes.push(this.service.setHidden(journalKey, tenantId, k, v, personKey));
      for (const [k, v] of Object.entries(sent.whole)) writes.push(this.service.setFitWhole(journalKey, tenantId, k, v, personKey));
      const results = await Promise.allSettled(writes);
      const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed) this.onError(failed.reason);
    } finally {
      this.settle(sent);
      this.saving.set(false);
    }
  }

  private change(fn: (p: Pending) => Pending): void {
    this.pending.set(fn(this.pending()));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), DEBOUNCE_MS);
  }

  /** Drops the entries that were sent and not changed again meanwhile. */
  private settle(sent: Pending): void {
    const now = this.pending();
    const keep = <T>(cur: Record<string, T>, was: Record<string, T>) =>
      Object.fromEntries(Object.entries(cur).filter(([k, v]) => !(k in was) || was[k] !== v));
    const next: Pending = { albums: keep(now.albums, sent.albums), footprints: keep(now.footprints, sent.footprints), hidden: keep(now.hidden, sent.hidden), whole: keep(now.whole, sent.whole) };
    const empty = Object.values(next).every((r) => Object.keys(r).length === 0);
    this.pending.set(empty ? EMPTY : next);
  }
}
