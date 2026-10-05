import { InjectionToken, Type } from '@angular/core';

/** Resolves the org edit modal's component class on demand. A loader, not the class: providing
 *  the class itself would bind @okr/subject-org-feature into every app boot, and libs that
 *  @okr/subject-org-feature itself depends on (finance bill/invoice) cannot import it.
 *  Provide it as `() => a dynamic import of the feature lib resolving OrgEditModal`. */
export type OrgEditModalLoader = () => Promise<Type<unknown>>;
export const ORG_EDIT_MODAL = new InjectionToken<OrgEditModalLoader>('OrgEditModal');
