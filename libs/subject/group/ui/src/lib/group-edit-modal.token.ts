import { InjectionToken, Type } from '@angular/core';

/** Resolves the group edit modal's component class on demand. A loader, not the class:
 *  providing the class itself would bind @okr/subject-group-feature into every app boot
 *  (spec 1.49, Task 5d). Provide it as `() => import('@okr/subject-group-feature').then(m => m.GroupEditModal)`. */
export type GroupEditModalLoader = () => Promise<Type<unknown>>;
export const GROUP_EDIT_MODAL = new InjectionToken<GroupEditModalLoader>('GROUP_EDIT_MODAL');
