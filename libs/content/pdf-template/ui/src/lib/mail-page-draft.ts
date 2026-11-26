// libs/content/pdf-template/ui/src/lib/mail-page-draft.ts
//
// The draft of one opened Versand composer (spec 1.176 §8.1): `mailPages/{key}` with one article whose blocks are the mail, and the
// undo history of the editor. Provided by the composer.
//
// Why here and not in the editor: the editor is created in the composer's «Editor» segment and destroyed when the sender switches to
// Vorschau or Zustellung. The history must survive that (undo covers everything since opening), the composer needs the blocks (send bar,
// errors) all the time, and before it asks the server to render, price, test or send the page, the last typed characters must have
// reached Firestore: the server reads the page from there.
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

import type { ArticleBlock, MailBlock } from '@okr/shared-models';
import { MailPageService } from '@okr/content-pdf-template-data-access';
import { draftOnTeardown, sameMailPageMeta, type MailPageMeta } from '@okr/content-pdf-template-util';
import {
  checkMailBlocks, createHistory, findBlock, mailArticle, mailBlocksHaveContent, record, replacePresent,
  type EditorHistory, type EditorState, type MailEditorDraft,
} from '@okr/cms-section-util';

/** Changes are written to Firestore after this pause (spec 1.176: autosave 600 ms). */
export const MAIL_PAGE_SAVE_DEBOUNCE_MS = 600;

type History = EditorHistory<EditorState>;

const EMPTY_META: MailPageMeta = { subject: '', layout: 'standard', webVersion: false };

function blocksOf(history: History): MailBlock[] {
  return history.present.section.properties?.blocks ?? [];
}

@Injectable()
export class MailPageDraft implements MailEditorDraft {
  private readonly mailPageService = inject(MailPageService);

  /** `mailPages/{pageKey}`; empty until the composer has created the draft. */
  public readonly pageKey = signal('');
  /** The doc id of the one article in `mailPages/{pageKey}/sections`; its pictures are stored under it. */
  public readonly articleKey = signal('');
  /** The draft exists and its blocks are known. False before, and from a discard until the next `start`. */
  public readonly loaded = signal(false);
  /** The draft could not be created: the editor segment says why instead of showing an empty mail. */
  public readonly createFailed = signal(false);
  /** The last write failed (shown as a note; the next change or `flush()` tries again). */
  public readonly saveFailed = signal(false);

  private readonly historyState = signal<History>(createHistory({ section: mailArticle('', []), copiedFrom: {} }));
  /** The editor's history: the mail's article with what is selected; kept here, so that it survives a change of the segment. */
  public readonly history = this.historyState.asReadonly();
  public readonly blocks = computed(() => blocksOf(this.history()), { equal: (a, b) => a === b });
  private readonly metaState = signal<MailPageMeta>(EMPTY_META);
  /** Subject, layout and web version as the page stores them. */
  public readonly meta = this.metaState.asReadonly();

  /** One run of the mail's rules for the editor, the send bar and the hint. */
  private readonly check = computed(() => checkMailBlocks(this.blocks()));
  public readonly errors = computed(() => this.check().errors);
  public readonly valid = computed(() => this.check().valid);
  /** How many blocks have errors (the hint names it); 0 with an error of the mail as a whole, such as too many blocks. */
  public readonly errorCount = computed(() => this.check().errorCount);
  public readonly hasContent = computed(() => mailBlocksHaveContent(this.blocks()));

  private tenantId = '';
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Something changed that is not written yet (also after a failed write, until a write succeeds). */
  private dirty = false;
  private readonly inFlight = new Set<Promise<void>>();
  /** No write and no delete any more: thrown away. */
  private discarded = false;
  /** The page became a mailing: nothing is written to it any more (the rules would refuse it), a discard leaves it. */
  private sent = false;
  /** «Entwurf behalten»: a discard leaves the page. */
  private kept = false;
  /** The composer went: a change that is still waiting is never written. */
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.timer);
      this.timer = undefined;
    });
  }

  /** Works on a newly created draft from now on (also a fresh one after «Zurücksetzen»). Nothing is written: it was created so. */
  public start(draft: { pageKey: string; articleKey: string; tenantId: string; blocks: MailBlock[]; meta: MailPageMeta; selectedId?: string }): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.dirty = false;
    this.discarded = false;
    this.sent = false;
    this.kept = false;
    this.tenantId = draft.tenantId;
    this.historyState.set(createHistory({ section: mailArticle(draft.tenantId, draft.blocks), copiedFrom: {}, ...(draft.selectedId ? { selectedId: draft.selectedId } : {}) }));
    this.metaState.set(draft.meta);
    this.saveFailed.set(false);
    this.createFailed.set(false);
    this.articleKey.set(draft.articleKey);
    this.pageKey.set(draft.pageKey);
    this.loaded.set(true);
  }

  /** A change of the editor. A change of the blocks is written after a pause; a selection alone is not. */
  public setHistory(history: History): void {
    const before = this.historyState();
    if (history === before) return;
    this.historyState.set(history);
    if (blocksOf(history) !== blocksOf(before)) this.schedule();
  }

  /** New blocks as one step of the history (e.g. something inserted from outside the editor). */
  public setBlocks(blocks: MailBlock[]): void {
    const history = this.historyState();
    const section = history.present.section;
    this.setHistory(record(history, { ...history.present, section: { ...section, properties: { ...section.properties, blocks: blocks as ArticleBlock[] } } }));
  }

  /**
   * Selects a block from outside the editor (a block the server refused, spec 1.176 §13), so that the editor shows it selected when it is
   * created. Not a step of the history and nothing to write. False when the mail has no such block.
   */
  public select(id: string): boolean {
    const history = this.historyState();
    if (!findBlock(blocksOf(history), id)) return false;
    if (history.present.selectedId !== id) this.historyState.set(replacePresent(history, { ...history.present, selectedId: id }));
    return true;
  }

  /** Subject, layout or web version changed in the composer: written with the blocks. */
  public setMeta(meta: MailPageMeta): void {
    if (sameMailPageMeta(meta, this.metaState())) return;
    this.metaState.set({ ...meta });
    this.schedule();
  }

  /**
   * Writes what is still waiting for its pause, waits for every write under way, and tries a failed one once more. The composer calls it
   * before it asks the server to render, price, test or send the page. False when a change could not be stored: the server would miss it.
   */
  public async flush(): Promise<boolean> {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
      this.write();
    }
    await Promise.allSettled([...this.inFlight]);
    if (this.dirty && !this.discarded && !this.sent && this.timer === undefined) {
      this.write();
      await Promise.allSettled([...this.inFlight]);
    }
    return !this.dirty || this.discarded || this.sent;
  }

  /**
   * The page became a mailing: it belongs to it now. A later discard never deletes it, and nothing is written to it any more: a change
   * still waiting is dropped (the server sent what was stored).
   */
  public markSent(): void {
    this.sent = true;
    this.dirty = false;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  /**
   * «Entwurf behalten»: written now and never deleted by a discard. False when the last change could not be stored; the draft is then
   * not kept, so that a later «Verwerfen» still deletes it.
   */
  public async keep(): Promise<boolean> {
    this.kept = true;
    const stored = await this.flush();
    if (!stored) this.kept = false;
    return stored;
  }

  /**
   * Throws the draft away (the composer closed without sending, or «Zurücksetzen»). Changes not yet written are dropped; writes under way
   * are awaited first, so that none of them lands after the delete. A page that was sent or kept stays.
   */
  public async discard(): Promise<void> {
    const pageKey = this.pageKey();
    if (this.discarded) return;
    this.discarded = true;
    this.loaded.set(false);
    clearTimeout(this.timer);
    this.timer = undefined;
    await Promise.allSettled([...this.inFlight]);
    if (pageKey && !this.sent && !this.kept) await this.mailPageService.discardDraft(pageKey);
  }

  /**
   * The composer went (spec 1.176 §8.5, §13): the draft is deleted only when it is empty or the sender chose «Verwerfen» (`discardChosen`).
   * A forced dismiss or a teardown keeps a draft with content, with what was still waiting written; the nightly reap removes it after
   * 30 days. A sent or kept page always stays.
   */
  public async leave(discardChosen = false): Promise<void> {
    if (this.discarded) return;
    const decision = draftOnTeardown({ sent: this.sent, kept: this.kept, discardChosen, hasContent: this.hasContent() });
    if (decision === 'delete') {
      await this.discard();
      return;
    }
    await this.flush();
  }

  private schedule(): void {
    if (this.discarded || this.sent || this.destroyed || !this.pageKey()) return;
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.write();
    }, MAIL_PAGE_SAVE_DEBOUNCE_MS);
  }

  /** Writes the blocks and the meta as they are now: always the whole article, built anew, so that no old field is stored beside them. */
  private write(): void {
    const pageKey = this.pageKey();
    if (!this.dirty || this.discarded || this.sent || !pageKey) return;
    this.dirty = false;
    const article = mailArticle(this.tenantId, this.blocks());
    const written = this.mailPageService.saveDraft(pageKey, this.articleKey(), article, this.meta(), new Date().toISOString()).then(
      () => { if (!this.dirty) this.saveFailed.set(false); },
      (err) => {
        console.error('MailPageDraft: writing the draft failed', err);
        // a draft of another page (after «Zurücksetzen») is not this one's concern
        if (this.pageKey() !== pageKey) return;
        this.dirty = true;
        this.saveFailed.set(true);
      },
    );
    this.inFlight.add(written);
    void written.finally(() => this.inFlight.delete(written));
  }
}
