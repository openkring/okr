import { InjectionToken, Type } from '@angular/core';

/** Resolves the person edit modal's component class on demand. A loader, not the class:
 *  providing the class itself would bind @okr/subject-person-feature into every app boot
 *  (spec 1.49, Task 5d). Provide it as `() => import('@okr/subject-person-feature').then(m => m.PersonEditModal)`. */
export type PersonEditModalLoader = () => Promise<Type<unknown>>;
export const PERSON_EDIT_MODAL = new InjectionToken<PersonEditModalLoader>('PersonEditModal');
