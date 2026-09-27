// libs/content/pdf-template/data-access/src/lib/template.service.ts
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { collectionData, docData } from 'rxfire/firestore';
import { collection, doc, query, orderBy, updateDoc } from 'firebase/firestore';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import {
  TemplateCollection, TemplateVersionSubcollection,
  TemplateModel, TemplateVersionModel, UserModel,
} from '@okr/shared-models';
import { copyTemplate, copyTemplateVersion, getTemplateIndex } from '@okr/content-pdf-template-util';
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

  public list(): Observable<TemplateModel[]> {
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
