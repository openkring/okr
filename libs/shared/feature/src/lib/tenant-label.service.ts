import { inject, Injectable } from '@angular/core';

import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { AvailableLanguages, I18nTenantOverrideCollection, I18nTenantOverrideModel } from '@okr/shared-models';
import { getSystemQuery, toI18nRef } from '@okr/shared-util-core';

import { AppStore } from './app.store';

/**
 * A tenant's own label for one i18n key (`i18nTenantOverride`), the only i18n layer writable at
 * runtime. Used by the AOC tag editor and the category editor; `toI18nRef` gives (module, key).
 */
@Injectable({ providedIn: 'root' })
export class TenantLabelService {
  private readonly appStore = inject(AppStore);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18nService = inject(I18nService);

  /** The tenant's override row for a (module, key) pair, if it has one. */
  public async findOverride(module: string, key: string, tenantId: string): Promise<I18nTenantOverrideModel | undefined> {
    // one consistent read: the first emission of searchData may be an empty cache snapshot
    const rows = await this.firestoreService.getDataOnce<I18nTenantOverrideModel>(
      I18nTenantOverrideCollection,
      [...getSystemQuery(tenantId), { key: 'module', operator: '==', value: module }, { key: 'key', operator: '==', value: key }],
      'key', 'asc'
    );
    return rows[0];
  }

  /** Whether neither a bundle nor the tenant names this i18n key, so that the raw key would show. */
  public async lacksLabel(i18nKey: string, tenantId: string): Promise<boolean> {
    const ref = toI18nRef(i18nKey);
    if (!ref || !await this.i18nService.lacksTranslation(i18nKey)) return false;
    return !await this.findOverride(ref.module, ref.key, tenantId);
  }

  /** Create or update the tenant's override row from the per-language values. */
  public async saveOverride(
    module: string, key: string, tenantId: string,
    values: Record<string, string>, existing?: I18nTenantOverrideModel,
    confirmMessage?: string, errorMessage?: string,
  ): Promise<void> {
    const labels = Object.fromEntries(AvailableLanguages.map(lang => [lang, (values[lang] ?? '').trim()]));
    // nothing entered and nothing stored → no row to write
    if (!existing && Object.values(labels).every(v => !v)) return;
    const model: I18nTenantOverrideModel = { ...(existing ?? new I18nTenantOverrideModel(tenantId)), module, key, ...labels };
    if (existing) {
      await this.firestoreService.updateModel<I18nTenantOverrideModel>(
        I18nTenantOverrideCollection, model, false, confirmMessage, errorMessage, this.appStore.currentUser());
      return;
    }
    await this.firestoreService.createModel<I18nTenantOverrideModel>(
      I18nTenantOverrideCollection, { ...model, okey: '' }, confirmMessage, errorMessage, this.appStore.currentUser());
  }
}
