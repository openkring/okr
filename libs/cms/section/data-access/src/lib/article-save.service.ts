import { Injectable, inject } from '@angular/core';

import { ARTICLE_COMPARED_FIELDS, changedMeanwhile } from '@okr/cms-section-util';
import { ENV } from '@okr/shared-config';
import type { CheckedDecision } from '@okr/shared-data-access';
import { ARTICLE_SECTION_SHAPE, articleBlocksOf, type ArticleSection, type SectionModel, type UserModel } from '@okr/shared-models';
import { belongsToTenant, forkKeyFor, isOwnedBy } from '@okr/shared-util-core';

import { ArticleBlocksGate } from './article-blocks-gate.service';
import { SectionService } from './section.service';

/**
 * - `saved`     written; `key` is the document written, for a shared article the key of the tenant's own copy. With `trial`
 *               (trial mode) nothing was written and there may be no such document: never store that key anywhere
 * - `conflict`  somebody changed the article meanwhile: ask, then save with `force`
 * - `gone`      deleted, archived or no longer of this tenant: cannot be saved, also not with `force`
 * - `offline`   the server could not be read. Nothing was written, or (an answer was lost) it is not known; saving again is safe
 * - `failed`    not written; an error toast was shown
 */
export type ArticleSaveResult =
  | { status: 'saved'; key: string; trial?: true }
  | { status: 'conflict' } | { status: 'gone' } | { status: 'offline' } | { status: 'failed' };

export interface ArticleSaveOptions { isNew: boolean; force: boolean; currentUser?: UserModel }

interface RunningSave { section: ArticleSection; isNew: boolean; force: boolean; result: Promise<ArticleSaveResult> }
type Refusal = 'conflict' | 'gone';
type Read = (key: string) => Promise<SectionModel | null>;

/** What a compared field is when it is not set. */
const EMPTY_FIELDS: Partial<Record<string, unknown>> = { ...ARTICLE_SECTION_SHAPE, intro: '', introPosition: 'below' };

/**
 * An update merges top-level fields: a field that the article does not have (any more) but the document on the server has is written
 * with its empty or default value, so that a cleared value does not come back.
 */
function withClearedFields(section: ArticleSection, stored: SectionModel): ArticleSection {
  const [own, theirs] = [section as unknown as Record<string, unknown>, stored as unknown as Record<string, unknown>];
  const cleared = ARTICLE_COMPARED_FIELDS.filter((key) => own[key] === undefined && theirs[key] !== undefined && theirs[key] !== null);
  return { ...section, ...Object.fromEntries(cleared.map((key) => [key, EMPTY_FIELDS[key]])) } as ArticleSection;
}

/**
 * Saves an article of the block editor without overwriting somebody else's newer change silently (spec 1.175 §7.8): in one
 * transaction the document is read from the server, compared with the state at opening, and written.
 */
@Injectable({ providedIn: 'root' })
export class ArticleSaveService {
  private readonly env = inject(ENV);
  private readonly sectionService = inject(SectionService);
  private readonly gate = inject(ArticleBlocksGate);

  /** The last save per okey, while it runs. */
  private readonly running = new Map<string, RunningSave>();
  /** New articles: what this service sent last for an okey that is (or may be) on the server. */
  private readonly sent = new Map<string, SectionModel>();

  /**
   * Never rejects. A second call at once with the same `section` object and the same options returns the result of the first; any
   * other call for the same article waits for the first and then runs itself, with its own `loaded`.
   * Articles that have blocks already may be saved with a closed gate; blocks are not introduced then (`failed`).
   * @param section the article to write, after `prepareArticleForSave`. Not changed
   * @param loaded the section as it was passed to the editor, before `openArticle` (as read, without model defaults or
   *        classic fields). Not used for a new article
   */
  public async save(section: ArticleSection, loaded: SectionModel, options: ArticleSaveOptions): Promise<ArticleSaveResult> {
    try {
      if (this.gate.trial) {
        console.info('ArticleSaveService: trial mode, nothing is written', section, options);
        return { status: 'saved', key: section.okey, trial: true };
      }
      return await this.inTurn(section, loaded, options);
    } catch (error) {
      console.error('ArticleSaveService: the save failed', error);
      return { status: 'failed' };
    }
  }

  private inTurn(section: ArticleSection, loaded: SectionModel, options: ArticleSaveOptions): Promise<ArticleSaveResult> {
    const { okey } = section;
    const { isNew, force } = options;
    const before = this.running.get(okey);
    if (before && before.section === section && before.isNew === isNew && before.force === force) return before.result;

    const write = () => this.write(section, loaded, options);
    const own: RunningSave = { section, isNew, force, result: before ? before.result.then(write, write) : write() };
    own.result = own.result.finally(() => { if (this.running.get(okey) === own) this.running.delete(okey); });
    this.running.set(okey, own);
    return own.result;
  }

  private async write(section: ArticleSection, loaded: SectionModel, options: ArticleSaveOptions): Promise<ArticleSaveResult> {
    const result = await this.sectionService.saveChecked<Refusal>(
      (read) => this.decide(read, section, loaded, options),
      (sent, stored) => !stored.isArchived && this.isOwn(stored) && !changedMeanwhile(sent, stored),
      options.currentUser,
    );
    // 'failed': it was not there when read afterwards, but may still arrive; what is known to be there is not replaced
    if (options.isNew && 'sent' in result && result.sent && (result.status !== 'failed' || !this.sent.has(section.okey))) {
      this.sent.set(section.okey, result.sent);
    }
    switch (result.status) {
      case 'written': return { status: 'saved', key: result.key };
      case 'refused': return { status: result.reason };
      default: return { status: result.status };
    }
  }

  /** Runs inside the transaction, possibly several times: no side effects. */
  private async decide(read: Read, section: ArticleSection, loaded: SectionModel, options: ArticleSaveOptions): Promise<CheckedDecision<SectionModel, Refusal>> {
    const { isNew, force } = options;
    const { okey } = section;
    const tenantId = this.env.tenantId;
    if (!okey) return { kind: 'fail', message: 'the article has no okey' };
    if (!this.gate.mayWrite() && articleBlocksOf(section) && (isNew || !articleBlocksOf(loaded))) {
      return { kind: 'fail', message: 'the gate is closed: no article may get blocks' };
    }

    const original = await read(okey);
    let base = loaded;
    if (isNew) {
      const sent = this.sent.get(okey);
      if (!original || !sent) return { kind: 'create', key: okey, model: section };   // refused when the key is taken
      base = sent;                                                                    // ours, from an earlier save
    }

    const forkKey = forkKeyFor(okey, tenantId);
    const fork = original && this.isLive(original) && this.isOwn(original) ? null : await read(forkKey);
    if (fork && !fork.isArchived) {
      if (!force) return { kind: 'refuse', reason: 'conflict' };
      if (!this.isOwn(fork)) return { kind: 'fail', message: 'the copy does not belong to this tenant alone' };
      return { kind: 'update', key: forkKey, model: { ...withClearedFields(section, fork), okey: forkKey, tenants: [tenantId] } };
    }
    if (!original || !this.isLive(original)) return { kind: 'refuse', reason: 'gone' };
    if (!force && changedMeanwhile(base, original)) return { kind: 'refuse', reason: 'conflict' };
    if (this.isOwn(original)) return { kind: 'update', key: okey, model: { ...withClearedFields(section, original), tenants: [tenantId] } };
    if (fork && !this.isOwn(fork)) return { kind: 'fail', message: 'an archived copy of others has the key' };
    return { kind: 'fork', key: forkKey, model: section, original: okey };
  }

  /** What `SectionService.read` would show: not archived, and of this tenant or of all ('system'). */
  private isLive(section: SectionModel): boolean {
    return !section.isArchived && belongsToTenant(section, this.env.tenantId);
  }

  private isOwn(section: SectionModel): boolean {
    return isOwnedBy(section, this.env.tenantId);
  }
}
