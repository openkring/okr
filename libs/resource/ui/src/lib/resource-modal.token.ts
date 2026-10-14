import { InjectionToken, Type } from '@angular/core';

/** Resolves the resource edit modal's component class on demand. A loader, not the class: the modal
 *  lives in @okr/resource-feature, which depends on @okr/relationship-ownership-feature — the ownership
 *  lists open the modal through this token so that the dependency stays one-way.
 *  Provide it as `() => a dynamic import of the feature lib resolving ResourceEditModal`. */
export type ResourceEditModalLoader = () => Promise<Type<unknown>>;
export const RESOURCE_EDIT_MODAL = new InjectionToken<ResourceEditModalLoader>('ResourceEditModal');
