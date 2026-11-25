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
// Reads are the sender's own draft only (a document read by key); no query over drafts is made here.
import { inject, Injectable } from '@angular/core';
import { arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, updateDoc, writeBatch } from 'firebase/firestore';
import { docData, collectionData } from 'rxfire/firestore';
import { combineLatest, map, Observable } from 'rxjs';

import { FIRESTORE } from '@okr/shared-config';
import { ArticleSection, MailPageCollection, MailPageModel, MailPageSectionCollection, OkrModel, SectionModel } from '@okr/shared-models';
import { removeKeyFromOkrModel, removeUndefinedFields } from '@okr/shared-util-core';
import { newMailPage, type MailPageMeta } from '@okr/content-pdf-template-util';

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
