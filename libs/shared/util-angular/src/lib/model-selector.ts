import { InjectionToken } from '@angular/core';

import { AvatarInfo, GroupModel, OrgModel, PersonModel, ResponsibilityModel } from '@okr/shared-models';

/**
 * Narrows who the person picker offers. Both are opt-in: without them the picker behaves as before.
 */
export type PersonSelectOptions = {
  /**
   * Tenant id: two-level lookup — persons holding an app account in THAT tenant first, everybody
   * else below a divider (the invite path). A tenant rather than a boolean because an account
   * belongs to exactly one tenant.
   */
  accountsFirst?: string;
  /** okeys never offered, e.g. those the caller has already picked. */
  excludeKeys?: string[];
};

/**
 * The model pickers a ui-layer form may open. The pickers themselves are feature-layer modals
 * (`ModelSelectService` in `@okr/shared-feature`); ui libs must not import them directly
 * (module boundary), so they ask for this contract instead.
 * Every app binds it once via `provideModelSelector()` from `@okr/shared-feature`.
 */
export interface ModelSelector {
  selectPerson(selectedTag?: string): Promise<PersonModel | undefined>;
  selectPersonAvatar(selectedTag?: string, label?: string, allowCustom?: boolean, membersFirst?: boolean, options?: PersonSelectOptions): Promise<AvatarInfo | undefined>;
  selectOrg(selectedTag?: string): Promise<OrgModel | undefined>;
  selectGroup(selectedTag?: string): Promise<GroupModel | undefined>;
  selectResponsibility(): Promise<ResponsibilityModel | undefined>;
}

export const MODEL_SELECTOR = new InjectionToken<ModelSelector>('ModelSelector');
