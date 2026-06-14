import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { FormDefinitionCollection, FormDefinitionModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';
import { generateFormKey } from '@bk2/forms-util';

const PFX = '@forms/feature.';

@Injectable({ providedIn: 'root' })
export class FormDefinitionService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
  });

  public list(): Observable<FormDefinitionModel[]> {
    return this.firestoreService.searchData<FormDefinitionModel>(
      FormDefinitionCollection,
      getSystemQuery(this.env.tenantId),
      'name',
      'asc',
    );
  }

  public read(bkey: string): Observable<FormDefinitionModel | undefined> {
    return findByKey<FormDefinitionModel>(this.list(), bkey);
  }

  public readByFormKey(formKey: string): Observable<FormDefinitionModel | undefined> {
    const query = [
      ...getSystemQuery(this.env.tenantId),
      { key: 'formKey', operator: '==', value: formKey },
    ];
    return this.firestoreService
      .searchData<FormDefinitionModel>(FormDefinitionCollection, query, 'name', 'asc')
      .pipe(map(results => results[0]));
  }

  public async create(form: FormDefinitionModel, currentUser?: UserModel): Promise<string | undefined> {
    form.formKey = generateFormKey(form.name);
    form.honeypotKey = generateFormKey('field').replace(/-[a-z0-9]{4}$/, '');  // random slug, no suffix
    form.createdAt = new Date().toISOString();
    form.updatedAt = new Date().toISOString();
    form.createdBy = currentUser?.bkey ?? '';
    return this.firestoreService.createModel<FormDefinitionModel>(
      FormDefinitionCollection,
      form,
      this.i18n.create_conf(),
      this.i18n.create_error(),
      currentUser,
    );
  }

  public async update(form: FormDefinitionModel, currentUser?: UserModel): Promise<void> {
    form.updatedAt = new Date().toISOString();
    form.version = (form.version ?? 0) + 1;
    await this.firestoreService.updateModel<FormDefinitionModel>(
      FormDefinitionCollection,
      form,
      false,
      this.i18n.update_conf(),
      this.i18n.update_error(),
      currentUser,
    );
  }

  public async archive(form: FormDefinitionModel, currentUser?: UserModel): Promise<void> {
    await this.update({ ...form, isArchived: true }, currentUser);
  }
}
