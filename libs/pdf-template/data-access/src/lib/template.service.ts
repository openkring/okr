// libs/pdf-template/data-access/src/lib/template.service.ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { collectionData, docData } from 'rxfire/firestore';
import { collection, doc, query, orderBy, updateDoc } from 'firebase/firestore';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import {
  TemplateCollection, TemplateVersionSubcollection,
  TemplateModel, TemplateVersionModel, UserModel,
} from '@bk2/shared-models';
import { getTemplateIndex } from '@bk2/pdf-template-util';
import { getTodayStr, DateFormat, getSystemQuery } from '@bk2/shared-util-core';
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

  public async create(template: TemplateModel, currentUser?: UserModel): Promise<string | undefined> {
    template.index = getTemplateIndex(template);
    return this.firestoreService.createModel<TemplateModel>(
      TemplateCollection, template,
      this.i18n.create_conf(), this.i18n.create_error(),
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
    return collectionData(q, { idField: 'bkey' }) as Observable<TemplateVersionModel[]>;
  }

  public readVersion(templateKey: string, version: number): Observable<TemplateVersionModel | undefined> {
    return docData(
      doc(this.firestoreService.firestore, TemplateCollection, templateKey, TemplateVersionSubcollection, String(version)),
      { idField: 'bkey' }
    ) as Observable<TemplateVersionModel | undefined>;
  }

  public async saveDraftVersion(
    templateKey: string,
    version: TemplateVersionModel,
    currentUser?: UserModel
  ): Promise<string | undefined> {
    const versionPath = `${TemplateCollection}/${templateKey}/${TemplateVersionSubcollection}`;
    const { bkey, ...data } = version;
    data['createdBy'] = currentUser?.bkey ?? '';
    data['createdAt'] = getTodayStr(DateFormat.StoreDate);
    return this.firestoreService.createObject(
      versionPath,
      String(version.version),
      data
    );
  }

  public async publishVersion(
    templateKey: string,
    versionNum: number,
    changelog: string,
    currentUser?: UserModel
  ): Promise<void> {
    const now = getTodayStr(DateFormat.StoreDate);
    const userKey = currentUser?.bkey ?? '';
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
