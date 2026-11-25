// libs/content/pdf-template/ui/src/lib/mail-page-sections-draft.ts
//
// The draft page of 1.172 as a list of sections, for `okr-mail-page-editor` only. Since 1.176 the composer uses `MailPageDraft`
// (one article of blocks); this file and the page editor are no longer used and go with Task 15 of 1.176.
//
// Why a shared object rather than state inside the editor: the editor lives in the composer's «Editor» segment
// and is destroyed when the sender switches to Vorschau or Zustellung, while the composer still needs the
// sections (the send bar waits for content) and must wait for the last typed characters to reach Firestore
// before it asks the server to render, price or send the page — the server reads the page from Firestore.
import { computed, inject, Injectable, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap } from 'rxjs';

import { SectionModel } from '@okr/shared-models';
import { MailPageService } from '@okr/content-pdf-template-data-access';
import { mailPageHasContent } from '@okr/content-pdf-template-util';

/** Typing in an article is written to Firestore after this pause. */
const MAIL_PAGE_SAVE_DEBOUNCE_MS = 600;

@Injectable()
export class MailPageSectionsDraft {
  private readonly mailPageService = inject(MailPageService);

  /** `mailPages/{pageKey}`; empty until the composer has created the draft. */
  public readonly pageKey = signal('');
  /** The draft could not be created: the page editor shows why instead of an empty page. */
  public readonly createFailed = signal(false);
  /** The last write of a section failed (shown as a note; the next change tries again). */
  public readonly saveFailed = signal(false);

  /** The sections as Firestore has them, in page order, tagged with their page (a fresh draft must not show the old one's). */
  private readonly remote = toSignal(toObservable(this.pageKey).pipe(
    switchMap((key) => !key ? of(undefined) : this.mailPageService.sections$(key).pipe(
      map((sections) => ({ key, sections })),
      catchError((err) => {
        console.error('MailPageSectionsDraft: reading the sections failed', err);
        return of({ key, sections: [] as SectionModel[] });
      }),
    )),
  ), { initialValue: undefined });

  /** Edits typed but not yet written: they win over the stored version, so nothing jumps back while saving. */
  private readonly pending = signal<Record<string, SectionModel>>({});

  /** The sections of the current draft have arrived. */
  public readonly loaded = computed(() => !!this.pageKey() && this.remote()?.key === this.pageKey());
  public readonly sections = computed<SectionModel[]>(() => {
    if (!this.loaded()) return [];
    const pending = this.pending();
    return (this.remote()?.sections ?? []).map((s) => pending[s.okey] ?? s);
  });
  public readonly hasContent = computed(() => mailPageHasContent(this.sections()));

  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly inFlight = new Set<Promise<unknown>>();
  /** Sections whose last write failed: their edit is still pending and is tried again by `flush()`. */
  private readonly failedKeys = new Set<string>();
  private discarded = false;

  /** Works on the draft `pageKey` from now on (a fresh one after the composer's «Zurücksetzen»). */
  public start(pageKey: string): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.pending.set({});
    this.failedKeys.clear();
    this.saveFailed.set(false);
    this.discarded = false;
    this.pageKey.set(pageKey);
  }

  /** Keeps the edit and writes it after a typing pause (only for sections that already exist). */
  public scheduleSave(section: SectionModel): void {
    if (!section.okey || this.discarded) return;
    const key = section.okey;
    this.pending.update((map) => ({ ...map, [key]: section }));
    clearTimeout(this.timers.get(key));
    this.timers.set(key, setTimeout(() => this.writePending(key), MAIL_PAGE_SAVE_DEBOUNCE_MS));
  }

  /** Writes a section now (a new one gets its key and is appended to the page). Resolves to its key. */
  public async save(section: SectionModel): Promise<string | undefined> {
    if (!this.pageKey() || this.discarded) return undefined;
    if (section.okey) {
      clearTimeout(this.timers.get(section.okey));
      this.timers.delete(section.okey);
      this.pending.update((map) => ({ ...map, [section.okey]: section }));
    }
    return this.track(this.mailPageService.saveSection(this.pageKey(), section).then((key) => {
      this.dropPending(key, section);
      this.markWritten(key);
      return key;
    }), section.okey || undefined);
  }

  public async delete(sectionKey: string): Promise<void> {
    if (!this.pageKey()) return;
    clearTimeout(this.timers.get(sectionKey));
    this.timers.delete(sectionKey);
    await this.flush();
    this.dropPending(sectionKey);
    this.failedKeys.delete(sectionKey);
    await this.track(this.mailPageService.deleteSection(this.pageKey(), sectionKey));
  }

  public async move(sectionKey: string, dir: -1 | 1): Promise<void> {
    if (!this.pageKey()) return;
    await this.track(this.mailPageService.move(this.pageKey(), sectionKey, dir));
  }

  /**
   * Writes every edit still waiting for its typing pause, tries a failed write once more, and waits for all writes
   * under way. The composer calls this before it asks the server to render, price or send the page, which reads
   * the page from Firestore. Resolves to false when an edit could not be stored: the server would miss it.
   */
  public async flush(): Promise<boolean> {
    for (const [key, timer] of [...this.timers]) {
      clearTimeout(timer);
      this.writePending(key);
    }
    await Promise.allSettled([...this.inFlight]);
    const retry = [...this.failedKeys].filter((key) => key in this.pending() && !this.timers.has(key));
    if (retry.length > 0) {
      for (const key of retry) this.writePending(key);
      await Promise.allSettled([...this.inFlight]);
    }
    return this.failedKeys.size === 0;
  }

  /**
   * Throws the draft away (the composer closed without sending). Unwritten edits are dropped, writes under way
   * are awaited first, so none of them lands after the delete.
   */
  public async discard(): Promise<void> {
    const pageKey = this.pageKey();
    if (this.discarded) return;
    this.discarded = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    await Promise.allSettled([...this.inFlight]);
    if (pageKey) await this.mailPageService.discardDraft(pageKey);
  }

  private writePending(key: string): void {
    this.timers.delete(key);
    const section = this.pending()[key];
    if (!section || !this.pageKey()) return;
    void this.track(this.mailPageService.saveSection(this.pageKey(), section).then(() => {
      this.dropPending(key, section);
      this.markWritten(key);
    }), key).catch(() => undefined);
  }

  /** Forgets a pending edit once it is stored, unless a newer one arrived meanwhile. */
  private dropPending(key: string, written?: SectionModel): void {
    this.pending.update((map) => {
      if (!(key in map) || (written && map[key] !== written)) return map;
      const next = { ...map };
      delete next[key];
      return next;
    });
  }

  private markWritten(key: string): void {
    this.failedKeys.delete(key);
    this.saveFailed.set(this.failedKeys.size > 0);
  }

  /** `sectionKey`: the section a failed write leaves unsaved (a new section or a move/delete has none). */
  private track<T>(promise: Promise<T>, sectionKey?: string): Promise<T> {
    const tracked = promise.catch((err) => {
      console.error('MailPageSectionsDraft: writing the page failed', err);
      if (sectionKey) this.failedKeys.add(sectionKey);
      this.saveFailed.set(true);
      throw err;
    });
    const settled = tracked.then(() => undefined, () => undefined);
    this.inFlight.add(settled);
    void settled.finally(() => this.inFlight.delete(settled));
    return tracked;
  }
}
