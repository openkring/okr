// libs/content/pdf-template/data-access/src/lib/template.service.ts
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, map, Observable } from 'rxjs';
import { collectionData, docData } from 'rxfire/firestore';
import { collection, doc, getDoc, getDocs, query, orderBy, updateDoc } from 'firebase/firestore';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import {
  TemplateCollection, TemplateVersionSubcollection,
  TemplateModel, TemplateVersionModel, UserModel,
} from '@okr/shared-models';
import { copyTemplate, copyTemplateVersion, emailCopyKey, emailCopyPlan, getTemplateIndex, isEmailTemplate, templateKindOf } from '@okr/content-pdf-template-util';
import { getTodayStr, DateFormat, getSystemQuery } from '@okr/shared-util-core';
import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class TemplateService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
  });

  // ── Template CRUD ──────────────────────────────────────────────────────

  /** The PDF templates. Email templates share the collection and are kept out of every PDF picker. */
  public list(): Observable<TemplateModel[]> {
    return this.listAll().pipe(map(list => list.filter(t => templateKindOf(t) === 'pdf')));
  }

  /** The email templates (layouts and texts), the counterpart of {@link list}. */
  public listEmailTemplates(): Observable<TemplateModel[]> {
    return this.listAll().pipe(map(list => list.filter(t => isEmailTemplate(t))));
  }

  private listAll(): Observable<TemplateModel[]> {
    return this.firestoreService.searchData<TemplateModel>(
      TemplateCollection, getSystemQuery(this.env.tenantId), 'name'
    );
  }

  public read(key: string): Observable<TemplateModel | undefined> {
    return this.firestoreService.readModel<TemplateModel>(TemplateCollection, key);
  }

  /**
   * @param silent when true no confirmation toast is shown. Used for the provisional
   *        document behind 'add template': it only becomes a template the user was told
   *        about once they actually save it (see {@link discardUnsaved}).
   */
  public async create(
    template: TemplateModel,
    currentUser?: UserModel,
    silent = false
  ): Promise<string | undefined> {
    template.index = getTemplateIndex(template);
    return this.firestoreService.createModel<TemplateModel>(
      TemplateCollection, template,
      silent ? undefined : this.i18n.create_conf(), this.i18n.create_error(),
      currentUser
    );
  }

  /**
   * Discard the provisional document of a template that was created by 'add template'
   * but never saved: it carries no name, no version and nothing references it.
   *
   * Archives rather than hard-deletes — `templates` only allows a delete for an admin,
   * while the creator is typically a contentAdmin, and archiving is this app's delete
   * (the stub disappears from every list). Quiet on purpose: the user was never told
   * the template had been created, so they must not be told it was removed.
   */
  public async discardUnsaved(template: TemplateModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<TemplateModel>(
      TemplateCollection, template,
      undefined, undefined,
      currentUser
    );
  }

  public async update(template: TemplateModel, currentUser?: UserModel): Promise<string | undefined> {
    template.index = getTemplateIndex(template);
    return this.firestoreService.updateModel<TemplateModel>(
      TemplateCollection, template, false,
      this.i18n.update_conf(), this.i18n.update_error(),
      currentUser
    );
  }

  /**
   * Copy a template: create a new template document from the source's settings and
   * copy the content of its effective version (the draft if there is one, otherwise the
   * published one) into the copy's first draft version. The copy therefore starts as an
   * unpublished draft (v1*) and the source is left untouched.
   *
   * @param template the template to copy
   * @param nameSuffix appended to the source name, e.g. '(Kopie)'
   * @return the key of the new template, or undefined if the write failed
   */
  public async copy(
    template: TemplateModel,
    nameSuffix: string,
    currentUser?: UserModel
  ): Promise<string | undefined> {
    const copy = copyTemplate(template, nameSuffix);
    const newKey = await this.firestoreService.createModel<TemplateModel>(
      TemplateCollection, copy,
      undefined, undefined,
      currentUser
    );
    if (!newKey) return undefined;

    // carry over the content of the source's effective version as the copy's first draft
    const sourceVersion = template.draftVersion ?? template.currentVersion;
    if (sourceVersion > 0) {
      const source = await firstValueFrom(this.readVersion(template.okey, sourceVersion));
      if (source) {
        await this.saveDraftVersion(newKey, copyTemplateVersion(source, 1), currentUser);
        await updateDoc(doc(this.firestoreService.firestore, TemplateCollection, newKey), { draftVersion: 1 });
      }
    }
    return newKey;
  }

  /**
   * Give the tenant its own copy of a shared email template, under the fixed id
   * `<okey>_<tenantId>` (design 7.3; a key that already ends in `_<tenantId>` is used as is). The name stays unchanged. The copy starts as an
   * unpublished draft (`currentVersion` 0), which the server does not use, so the shared
   * text stays in effect until the tenant publishes.
   *
   * The document under the fixed id is read with `getDoc`, because a tenant's delete only
   * archives it and a cached read could hide that:
   * - none: create it with the source content as draft 1
   * - live: nothing is written, the key is returned (unless an interrupted copy left it with no
   *   version at all, then it is reset like an archived one)
   * - archived: reset it and save the source content as the next free draft number
   *
   * @return the key of the tenant's copy, or undefined if the source could not be read or a write failed
   */
  public async copyEmailTemplate(template: TemplateModel, currentUser?: UserModel): Promise<string | undefined> {
    const fs = this.firestoreService.firestore;
    const key = emailCopyKey(template.okey, this.env.tenantId);
    try {
      const existing = await getDoc(doc(fs, TemplateCollection, key));
      const plan = emailCopyPlan(existing.exists() ? (existing.data() as TemplateModel) : undefined);
      if (plan === 'open') return key;

      // the source content: the version its template points at, read fresh
      const sourceTemplate = await getDoc(doc(fs, TemplateCollection, template.okey));
      if (!sourceTemplate.exists()) return undefined;
      const sourceVersionNo = (sourceTemplate.data() as TemplateModel).currentVersion;
      if (!sourceVersionNo) return undefined;
      const sourceVersion = await getDoc(
        doc(fs, TemplateCollection, template.okey, TemplateVersionSubcollection, String(sourceVersionNo))
      );
      if (!sourceVersion.exists()) return undefined;
      const source = sourceVersion.data() as TemplateVersionModel;

      let draftNo = 1;
      if (plan === 'create') {
        const created = await this.firestoreService.createModel<TemplateModel>(
          TemplateCollection, { ...copyTemplate(template, ''), okey: key },
          undefined, undefined, currentUser
        );
        if (!created) return undefined;
      } else {
        const versions = await getDocs(collection(fs, TemplateCollection, key, TemplateVersionSubcollection));
        draftNo = 1 + versions.docs.reduce(
          (max, d) => Math.max(max, Number((d.data() as TemplateVersionModel).version) || Number(d.id) || 0), 0
        );
      }

      // the draft is saved before the template points at it, so a failed write leaves an archived doc unchanged
      const saved = await this.saveDraftVersion(key, copyTemplateVersion(source, draftNo), currentUser);
      if (!saved) return undefined;
      const pointer = plan === 'create'
        ? { draftVersion: draftNo }
        : {
            isArchived: false, currentVersion: 0, status: 'draft', draftVersion: draftNo,
            updatedAt: getTodayStr(DateFormat.StoreDate), updatedBy: currentUser?.okey ?? '',
          };
      await updateDoc(doc(fs, TemplateCollection, key), pointer);
      return key;
    } catch (ex) {
      // an interrupted copy leaves a live doc with no version pointer; the next call resets it
      console.error(`TemplateService.copyEmailTemplate(${template.okey}) -> ERROR:`, ex);
      return undefined;
    }
  }

  public async delete(template: TemplateModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<TemplateModel>(
      TemplateCollection, template,
      this.i18n.delete_conf(), this.i18n.delete_error(),
      currentUser
    );
  }

  // ── Version operations ──────────────────────────────────────────────────

  public listVersions(templateKey: string): Observable<TemplateVersionModel[]> {
    const q = query(
      collection(this.firestoreService.firestore, TemplateCollection, templateKey, TemplateVersionSubcollection),
      orderBy('version', 'desc')
    );
    return collectionData(q, { idField: 'okey' }) as Observable<TemplateVersionModel[]>;
  }

  public readVersion(templateKey: string, version: number): Observable<TemplateVersionModel | undefined> {
    return docData(
      doc(this.firestoreService.firestore, TemplateCollection, templateKey, TemplateVersionSubcollection, String(version)),
      { idField: 'okey' }
    ) as Observable<TemplateVersionModel | undefined>;
  }

  public async saveDraftVersion(
    templateKey: string,
    version: TemplateVersionModel,
    currentUser?: UserModel
  ): Promise<string | undefined> {
    const versionPath = `${TemplateCollection}/${templateKey}/${TemplateVersionSubcollection}`;
    const { okey, ...data } = version;
    data['createdBy'] = currentUser?.okey ?? '';
    data['createdAt'] = getTodayStr(DateFormat.StoreDate);
    return this.firestoreService.createObject(
      versionPath,
      String(version.version),
      data
    );
  }

  /**
   * Discard the active (unpublished) draft: delete its version document and
   * reset the template back to its current published version.
   */
  public async discardDraft(template: TemplateModel, currentUser?: UserModel): Promise<void> {
    const draft = template.draftVersion;
    if (!draft) return;
    const deleted = await this.firestoreService.deleteObject(
      `${TemplateCollection}/${template.okey}/${TemplateVersionSubcollection}`,
      String(draft)
    );
    // Don't clear the pointer while the version document is still there — that would
    // strand the draft as an unreachable orphan.
    if (!deleted) return;
    await this.update({ ...template, status: 'published' }, currentUser);
    await this.clearDraftPointer(template.okey);
  }

  /**
   * Roll the published pointer back to the previous version (N → N-1).
   * Non-destructive: the newer version document is kept intact, so the next
   * new draft must use max(existing version) + 1 to avoid overwriting it.
   */
  public async rollbackVersion(template: TemplateModel, currentUser?: UserModel): Promise<void> {
    if (template.currentVersion <= 1) return;
    await this.update(
      {
        ...template,
        currentVersion: template.currentVersion - 1,
        status: 'published',
      },
      currentUser
    );
    await this.clearDraftPointer(template.okey);
  }

  /**
   * Remove the active-draft pointer from a template.
   *
   * It needs its own write: `updateModel` strips undefined fields and merges, so passing
   * `draftVersion: undefined` in the model left the old value untouched in Firestore and
   * the template kept pointing at a draft that no longer exists. `null` is what
   * `publishVersion` writes too, and every read treats it as 'no draft'.
   */
  private async clearDraftPointer(templateKey: string): Promise<void> {
    await updateDoc(
      doc(this.firestoreService.firestore, TemplateCollection, templateKey),
      { draftVersion: null }
    );
  }

  public async publishVersion(
    templateKey: string,
    versionNum: number,
    changelog: string,
    currentUser?: UserModel
  ): Promise<void> {
    const now = getTodayStr(DateFormat.StoreDate);
    const userKey = currentUser?.okey ?? '';
    const fs = this.firestoreService.firestore;

    await updateDoc(
      doc(fs, TemplateCollection, templateKey, TemplateVersionSubcollection, String(versionNum)),
      { status: 'published', publishedAt: now, publishedBy: userKey, changelog }
    );

    await updateDoc(
      doc(fs, TemplateCollection, templateKey),
      { status: 'published', currentVersion: versionNum, draftVersion: null, updatedAt: now, updatedBy: userKey }
    );
  }
}
