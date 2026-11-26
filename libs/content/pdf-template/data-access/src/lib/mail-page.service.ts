// libs/content/pdf-template/data-access/src/lib/mail-page.service.ts
//
// The draft page of a Versand (spec 1.172): `mailPages/{pk}` with its sections in `mailPages/{pk}/sections`.
// The client writes these directly under the Firestore rules; every write here is shaped for them:
//  - the page is created with exactly one tenant, `senderUid` = the caller, `createdAt`, and no `mailingKey`
//    at all (the server sets it on send); `groupKey` only when given (the rules check the group admin);
//  - the first section is created in the same batch as the page (the rules read it with `getAfter`);
//  - a draft of 1.176 is one article whose blocks are the mail (`mailArticle`), written with the page's subject, layout and web version;
//  - a section's doc id equals the key in `page.sections`, which is the order the server renders in;
//  - a discard deletes the sections first, then the page, in one batch.
// Reads (spec 1.176 §8.5): the sender's own pages by the query `senderUid == uid` (the rules allow exactly that one), and a page with
// its sections by key: the own ones, and sent ones of the tenant for a member admin or privileged user. Copying never writes the source.
import { inject, Injectable } from '@angular/core';
import {
  arrayRemove, arrayUnion, collection, deleteField, doc, DocumentReference, getDoc, getDocs, limit, orderBy, query, runTransaction, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { docData, collectionData } from 'rxfire/firestore';
import { combineLatest, map, Observable } from 'rxjs';

import { FIRESTORE } from '@okr/shared-config';
import {
  articleBlocksOf, ArticleSection, MailBlock, MailPageCollection, MailPageModel, MailPageSectionCollection, OkrModel, SectionModel,
} from '@okr/shared-models';
import { removeKeyFromOkrModel, removeUndefinedFields } from '@okr/shared-util-core';
import { newMailPage, type MailPageMeta } from '@okr/content-pdf-template-util';
import { mailArticle, mailBlocksFromBody, mailBlocksFromSections } from '@okr/cms-section-util';

/** At most this many own pages are read for the start step, the newest first (drafts and sent ones). */
export const OWN_PAGES_MAX = 100;

/** A draft the composer works on: the page, its one article and what the page keeps besides the blocks. */
export interface StartedDraft {
  pageKey: string;
  articleKey: string;
  blocks: MailBlock[];
  meta: MailPageMeta;
}

/**
 * Continuing an own draft (§8.5): `ok` with the draft to start; `sent` / `gone` when it was sent or deleted meanwhile (or is not the
 * caller's any more); `refused` when the rules refused the write (the role or the group lost), the draft is then untouched; `failed`
 * for anything else (offline).
 */
export type ContinueResult =
  | ({ status: 'ok' } & Omit<StartedDraft, 'meta'> & { meta: Partial<MailPageMeta> })
  | { status: 'sent' | 'gone' | 'refused' | 'failed' };

function errorCode(err: unknown): string {
  const code = (err as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code.replace(/^firestore\//, '') : '';
}

/** The sections in the order of the page (the order the server renders in); with no order stored, as read. Unlisted ones are left out. */
function inPageOrder(sections: SectionModel[], order: unknown): SectionModel[] {
  if (!Array.isArray(order) || order.length === 0) return sections;
  const byKey = new Map(sections.map((section) => [section.okey, section]));
  return order.map((key) => byKey.get(key)).filter((section): section is SectionModel => !!section);
}

/** Subject, layout and web version as a page stores them; absent fields stay absent. */
function storedMeta(page: Partial<MailPageModel> | undefined): Partial<MailPageMeta> {
  return {
    ...(typeof page?.subject === 'string' ? { subject: page.subject } : {}),
    ...(typeof page?.layout === 'string' && page.layout !== '' ? { layout: page.layout } : {}),
    ...(typeof page?.webVersion === 'boolean' ? { webVersion: page.webVersion } : {}),
  };
}

@Injectable({ providedIn: 'root' })
export class MailPageService {
  private readonly firestore = inject(FIRESTORE);

  /** `okey` is the doc id and is never stored; undefined values are dropped (Firestore refuses them). */
  private stored(model: object): Record<string, unknown> {
    return removeUndefinedFields(removeKeyFromOkrModel(structuredClone(model) as OkrModel)) as Record<string, unknown>;
  }

  private pageRef(pageKey: string) {
    return doc(this.firestore, MailPageCollection, pageKey);
  }

  private sectionsRef(pageKey: string) {
    return collection(this.firestore, MailPageCollection, pageKey, MailPageSectionCollection);
  }

  /**
   * Creates the draft page and its one article in one batch (the rules read the page with `getAfter`). The page's `sections` lists the
   * article's doc id; `meta` (subject, layout, web version) and `changedAt` are stored with it (spec 1.176 §7).
   */
  public async createDraft(
    tenantId: string, uid: string, groupKey: string | undefined, article: ArticleSection, meta: MailPageMeta,
  ): Promise<{ pageKey: string; articleKey: string }> {
    const pageRef = doc(collection(this.firestore, MailPageCollection));
    const articleRef = doc(this.sectionsRef(pageRef.id));
    const page: MailPageModel = { ...newMailPage(tenantId, uid, groupKey), ...meta, changedAt: new Date().toISOString() };
    page.sections = [articleRef.id];

    const batch = writeBatch(this.firestore);
    batch.set(pageRef, this.stored(page));
    batch.set(articleRef, this.stored({ ...article, okey: articleRef.id }));
    await batch.commit();
    return { pageKey: pageRef.id, articleKey: articleRef.id };
  }

  /**
   * Writes the draft's article (overwritten as a whole, so that no old field stays beside its blocks) and the page's subject, layout,
   * web version and `changedAt`, in one batch.
   */
  public async saveDraft(pageKey: string, articleKey: string, article: ArticleSection, meta: MailPageMeta, changedAt: string): Promise<void> {
    const batch = writeBatch(this.firestore);
    batch.set(doc(this.sectionsRef(pageKey), articleKey), this.stored({ ...article, okey: articleKey }));
    batch.update(this.pageRef(pageKey), this.stored({ ...meta, changedAt }));
    await batch.commit();
  }

  /**
   * The caller's newest own pages of the tenant, drafts and sent ones (§8.5), at most `OWN_PAGES_MAX`. The query is `senderUid == uid`
   * (the one the rules allow) ordered by `createdAt`; the tenant is filtered here. Unsent drafts are reaped after 30 days, but sent pages
   * stay with their mailings and grow with every Versand, hence the limit. Until the composite index (senderUid, createdAt desc) is
   * deployed the query fails with `failed-precondition`: then the unordered query is used and cut here.
   */
  public async ownPages(uid: string, tenantId: string): Promise<MailPageModel[]> {
    if (!uid) return [];
    const pages = collection(this.firestore, MailPageCollection);
    let docs;
    try {
      docs = (await getDocs(query(pages, where('senderUid', '==', uid), orderBy('createdAt', 'desc'), limit(OWN_PAGES_MAX)))).docs;
    } catch (err) {
      if (errorCode(err) !== 'failed-precondition') throw err;
      console.warn('MailPageService.ownPages: the index is missing, reading unordered', err);
      docs = (await getDocs(query(pages, where('senderUid', '==', uid)))).docs;
    }
    return docs
      .map((d) => ({ ...d.data(), okey: d.id }) as MailPageModel)
      .filter((page) => Array.isArray(page.tenants) && page.tenants.includes(tenantId))
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
      .slice(0, OWN_PAGES_MAX);
  }

  private async readSections(pageKey: string): Promise<{ sections: SectionModel[]; refs: DocumentReference[] }> {
    const snap = await getDocs(this.sectionsRef(pageKey));
    return { sections: snap.docs.map((d) => ({ ...d.data(), okey: d.id }) as SectionModel), refs: snap.docs.map((d) => d.ref) };
  }

  /**
   * The blocks of a page as copies with new ids (one read of its sections; a 1.172 page is converted as its mail showed it). `order` is
   * the page's `sections`; without it the page is read first. Throws when a read is refused.
   */
  public async loadBlocks(pageKey: string, order?: string[]): Promise<MailBlock[]> {
    const sectionOrder = order ?? ((await getDoc(this.pageRef(pageKey))).data()?.['sections'] as string[] | undefined);
    const { sections } = await this.readSections(pageKey);
    return mailBlocksFromSections(inPageOrder(sections, sectionOrder), () => crypto.randomUUID());
  }

  /**
   * Continues an own draft (§8.5), in one transaction that reads the page and its listed sections again: sent or deleted meanwhile,
   * nothing is written. Otherwise `groupKey` becomes the current composer's (removed without one) and `changedAt` is set. A page that lists
   * exactly one article with blocks is adopted as it is — also one another window converted a moment ago. A draft of 1.172 (sections)
   * has its sections replaced by the one article of their blocks in the same transaction, so that an older server cannot send the old
   * content. The rules decide whether the caller may still write it: a refusal leaves the draft as it was.
   */
  public async continueDraft(pageKey: string, ctx: { tenantId: string; uid: string; groupKey?: string }): Promise<ContinueResult> {
    const pageRef = this.pageRef(pageKey);
    // every section doc, also one the page does not list: a conversion removes them all (a transaction cannot query)
    let strays: DocumentReference[];
    try {
      strays = (await this.readSections(pageKey)).refs;
    } catch (err) {
      console.warn('MailPageService.continueDraft: reading the draft failed', err);
      return { status: errorCode(err) === 'permission-denied' ? 'gone' : 'failed' };
    }
    try {
      return await runTransaction(this.firestore, async (tx): Promise<ContinueResult> => {
        const page = (await tx.get(pageRef)).data() as Partial<MailPageModel> | undefined;
        if (!page) return { status: 'gone' };
        if (typeof page.mailingKey === 'string' && page.mailingKey !== '') return { status: 'sent' };
        if (page.senderUid !== ctx.uid || !page.tenants?.includes(ctx.tenantId)) return { status: 'gone' };
        const order = (Array.isArray(page.sections) ? page.sections : []).filter((key): key is string => typeof key === 'string' && key !== '' && !key.includes('/'));
        const sections: SectionModel[] = [];
        for (const key of order) {
          const snap = await tx.get(doc(this.sectionsRef(pageKey), key));
          if (snap.exists()) sections.push({ ...snap.data(), okey: key } as SectionModel);
        }
        const changes: Record<string, unknown> = { groupKey: ctx.groupKey ? ctx.groupKey : deleteField(), changedAt: new Date().toISOString() };
        const only = order.length === 1 && sections.length === 1 ? sections[0] : undefined;
        const stored = only?.type === 'article' ? articleBlocksOf(only) : undefined;
        if (only && stored) {
          tx.update(pageRef, changes);
          return { status: 'ok', pageKey, articleKey: only.okey, blocks: structuredClone(stored) as MailBlock[], meta: storedMeta(page) };
        }
        // a draft of 1.172: its sections become the one article of a mail
        const blocks = mailBlocksFromSections(sections, () => crypto.randomUUID());
        const articleRef = doc(this.sectionsRef(pageKey));
        const doomed = new Map<string, DocumentReference>(strays.map((ref) => [ref.id, ref]));
        for (const key of order) doomed.set(key, doc(this.sectionsRef(pageKey), key));
        doomed.forEach((ref) => tx.delete(ref));
        tx.set(articleRef, this.stored({ ...mailArticle(ctx.tenantId, blocks), okey: articleRef.id }));
        tx.update(pageRef, { ...changes, sections: [articleRef.id] });
        return { status: 'ok', pageKey, articleKey: articleRef.id, blocks, meta: storedMeta(page) };
      });
    } catch (err) {
      console.warn('MailPageService.continueDraft: writing the draft failed', err);
      const code = errorCode(err);
      return { status: code === 'permission-denied' ? 'refused' : code === 'not-found' ? 'gone' : 'failed' };
    }
  }

  /**
   * A new draft (§8.5): empty without `sourceKey`, else a copy of that page — its blocks with new ids, its subject (else
   * `fallback.subject`, e.g. the mailing's), template and web version (else `fallback.webVersion`). Created in one batch by `createDraft`;
   * the source is only read, never written. Throws when the source cannot be read or the draft cannot be created.
   */
  public async startFrom(
    sourceKey: string | undefined,
    ctx: { tenantId: string; uid: string; groupKey?: string },
    fallback: MailPageMeta,
  ): Promise<StartedDraft> {
    const newId = () => crypto.randomUUID();
    let blocks: MailBlock[] = [];
    let meta: MailPageMeta = { ...fallback };
    if (sourceKey) {
      const source = (await getDoc(this.pageRef(sourceKey))).data() as Partial<MailPageModel> | undefined;
      if (!source) throw Object.assign(new Error('The mail to copy does not exist.'), { code: 'not-found' });
      blocks = await this.loadBlocks(sourceKey, source.sections ?? []);
      const stored = storedMeta(source);
      meta = { subject: stored.subject || fallback.subject, layout: stored.layout ?? fallback.layout, webVersion: stored.webVersion ?? fallback.webVersion };
    }
    // a mail starts with one text, also a copy of a page whose content is gone
    if (blocks.length === 0) blocks = mailBlocksFromBody('', newId);
    const { pageKey, articleKey } = await this.createDraft(ctx.tenantId, ctx.uid, ctx.groupKey, mailArticle(ctx.tenantId, blocks), meta);
    return { pageKey, articleKey, blocks, meta };
  }

  /** The page's sections in the order of `page.sections`; keys without a section doc are left out, live. */
  public sections$(pageKey: string): Observable<SectionModel[]> {
    return combineLatest([
      docData(this.pageRef(pageKey)) as Observable<Partial<MailPageModel> | undefined>,
      collectionData(this.sectionsRef(pageKey), { idField: 'okey' }) as Observable<SectionModel[]>,
    ]).pipe(
      map(([page, sections]) => {
        const byKey = new Map(sections.map(s => [s.okey, s]));
        return (page?.sections ?? []).map(key => byKey.get(key)).filter((s): s is SectionModel => !!s);
      }),
    );
  }

  /**
   * Saves a section. One with an `okey` is overwritten; one without gets a new doc id, which is appended to
   * `page.sections` in the same batch. Returns the section's key.
   */
  public async saveSection(pageKey: string, section: SectionModel): Promise<string> {
    const isNew = !section.okey;
    const ref = isNew ? doc(this.sectionsRef(pageKey)) : doc(this.sectionsRef(pageKey), section.okey);
    const batch = writeBatch(this.firestore);
    batch.set(ref, this.stored(section));
    if (isNew) batch.update(this.pageRef(pageKey), { sections: arrayUnion(ref.id) });
    await batch.commit();
    return ref.id;
  }

  /** Removes the section and its key from the page's order, in one batch. */
  public async deleteSection(pageKey: string, sectionKey: string): Promise<void> {
    const batch = writeBatch(this.firestore);
    batch.delete(doc(this.sectionsRef(pageKey), sectionKey));
    batch.update(this.pageRef(pageKey), { sections: arrayRemove(sectionKey) });
    await batch.commit();
  }

  /** Moves a section one place up (-1) or down (1); at either end nothing happens. */
  public async move(pageKey: string, sectionKey: string, dir: -1 | 1): Promise<void> {
    const snap = await getDoc(this.pageRef(pageKey));
    const order = [...((snap.data()?.['sections'] as string[] | undefined) ?? [])];
    const from = order.indexOf(sectionKey);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    await updateDoc(this.pageRef(pageKey), { sections: order });
  }

  /** Throws the draft away: its sections first, then the page, in one batch. */
  public async discardDraft(pageKey: string): Promise<void> {
    const sections = await getDocs(this.sectionsRef(pageKey));
    const batch = writeBatch(this.firestore);
    sections.forEach(s => batch.delete(s.ref));
    batch.delete(this.pageRef(pageKey));
    await batch.commit();
  }
}
