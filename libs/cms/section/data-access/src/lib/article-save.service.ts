import { Injectable, inject } from '@angular/core';

import { changedMeanwhile } from '@okr/cms-section-util';
import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { SectionCollection, type ArticleSection, type SectionModel, type UserModel } from '@okr/shared-models';
import { belongsToTenant, forkKeyFor, isOwnedBy } from '@okr/shared-util-core';

import { ArticleBlocksGate } from './article-blocks-gate.service';
import { SectionService } from './section.service';

/**
 * - `saved`     written; `key` is the document written, for a shared article the key of the tenant's own copy
 * - `conflict`  somebody changed the article meanwhile: ask, then save with `force`
 * - `gone`      deleted, archived or no longer of this tenant: cannot be saved, also not with `force`
 * - `offline`   it could not be read from the server: nothing was written
 * - `failed`    the write failed
 */
export type ArticleSaveResult =
  | { status: 'saved'; key: string }
  | { status: 'conflict' } | { status: 'gone' } | { status: 'offline' } | { status: 'failed' };

export interface ArticleSaveOptions { isNew: boolean; force: boolean; currentUser?: UserModel }

/**
 * Saves an article of the block editor without overwriting somebody else's newer change silently (spec 1.175 §7.8): right
 * before writing, the document that will be written is read from the server and compared with the state at opening.
 */
@Injectable({ providedIn: 'root' })
export class ArticleSaveService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly sectionService = inject(SectionService);
  private readonly gate = inject(ArticleBlocksGate);

  /** Running saves by okey. */
  private readonly saving = new Map<string, Promise<ArticleSaveResult>>();

  /**
   * Never rejects. Of two calls at once for the same article the second waits for and returns the first's result.
   * @param section the article to write, after `prepareArticleForSave`
   * @param loaded the section as it was passed to the editor, before `openArticle` (as read, without model defaults or classic fields)
   */
  public save(section: ArticleSection, loaded: SectionModel, options: ArticleSaveOptions): Promise<ArticleSaveResult> {
    if (this.gate.trial) {
      console.info('ArticleSaveService: trial mode, nothing is written', section, options);
      return Promise.resolve({ status: 'saved', key: section.okey });
    }
    // without an okey a create would not be guarded, and there is no document to compare with
    if (!section.okey) return Promise.resolve({ status: 'failed' });

    const running = this.saving.get(section.okey);
    if (running) return running;
    const result = this.write(section, loaded, options).finally(() => this.saving.delete(section.okey));
    this.saving.set(section.okey, result);
    return result;
  }

  private async write(section: ArticleSection, loaded: SectionModel, options: ArticleSaveOptions): Promise<ArticleSaveResult> {
    const { isNew, force, currentUser } = options;
    if (isNew) return this.result(() => this.sectionService.create(section, currentUser));

    const tenantId = this.env.tenantId;
    const forkKey = forkKeyFor(section.okey, tenantId);
    let original: SectionModel | null;
    let fork: SectionModel | null = null;
    try {
      original = await this.read(section.okey);
      if (!original || !this.isLive(original) || !this.isOwn(original)) fork = await this.read(forkKey);
    } catch (error) {
      console.warn(`ArticleSaveService: ${section.okey} cannot be read, nothing is written`, error);
      return { status: 'offline' };
    }

    if (fork && !fork.isArchived) {
      if (!force) return { status: 'conflict' };
      if (!this.isOwn(fork)) return { status: 'failed' };         // nobody's copy but our own is ever written over
      return this.update({ ...section, okey: forkKey, tenants: [tenantId] }, currentUser);
    }
    if (!original || !this.isLive(original)) return { status: 'gone' };
    if (!force && changedMeanwhile(loaded, original)) return { status: 'conflict' };
    if (fork && !this.isOwn(fork)) return { status: 'failed' };   // update() would replace it by the copy
    // the tenants of the server: they decide between updating and copying, and a tenant added meanwhile must not be dropped
    return this.update({ ...section, tenants: original.tenants }, currentUser);
  }

  private update(section: ArticleSection, currentUser?: UserModel): Promise<ArticleSaveResult> {
    return this.result(() => this.sectionService.update(section, currentUser));
  }

  /** The section service answers `undefined` when the write failed; it may also throw on data it cannot handle. */
  private async result(write: () => Promise<string | undefined>): Promise<ArticleSaveResult> {
    try {
      const key = await write();
      return key ? { status: 'saved', key } : { status: 'failed' };
    } catch (error) {
      console.error('ArticleSaveService: the write failed', error);
      return { status: 'failed' };
    }
  }

  /** The document on the server as stored; null when it does not exist. Rejects when it cannot be read. */
  private read(okey: string): Promise<SectionModel | null> {
    return this.firestoreService.readObjectStrict<SectionModel>(`${SectionCollection}/${okey}`);
  }

  /** What `SectionService.read` would show: not archived, and of this tenant or of all ('system'). */
  private isLive(section: SectionModel): boolean {
    return !section.isArchived && belongsToTenant(section, this.env.tenantId);
  }

  private isOwn(section: SectionModel): boolean {
    return isOwnedBy(section, this.env.tenantId);
  }
}
