import { inject, Injectable } from '@angular/core';

import { FirestoreService } from '@okr/shared-data-access';
import { CategoryCollection, CategoryListModel, FormDefinitionModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

/**
 * The category lists a form's 'category' fields need — also for anonymous visitors of a public
 * form. The AppStore loads categories only after sign-in, so a host passes what it already has
 * (`known`) and only a missing list costs a read. `categories` is world-readable (firestore.rules).
 */
@Injectable({ providedIn: 'root' })
export class FormCategoryService {
  private readonly firestoreService = inject(FirestoreService);

  public async fetchCategories(
    def: FormDefinitionModel | undefined,
    tenantId: string,
    known: CategoryListModel[] = [],
  ): Promise<CategoryListModel[]> {
    // dynamic: forms-util is lazy-loaded in this lib (form-submit.service), a static import is forbidden
    const { categoryNamesOf } = await import('@okr/forms-util');
    const names = categoryNamesOf(def?.fields ?? []);
    if (names.length === 0 || !tenantId) return [];
    const fromKnown = known.filter(c => names.includes(c.name));
    if (fromKnown.length === names.length) return fromKnown;
    // same query as AppStore.categoriesResource, so it is served by the same index
    const all = await this.firestoreService.getDataOnce<CategoryListModel>(
      CategoryCollection, getSystemQuery(tenantId), 'name', 'asc');
    return all.filter(c => names.includes(c.name));
  }
}
