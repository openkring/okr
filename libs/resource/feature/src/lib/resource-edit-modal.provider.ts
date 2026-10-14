import { Provider } from '@angular/core';
import { RESOURCE_EDIT_MODAL } from '@okr/resource-ui';

/** Lets the OwnershipStore (used by the resource lists for their ActionSheet) open the resource edit modal. */
export const RESOURCE_EDIT_MODAL_PROVIDER: Provider = {
  provide: RESOURCE_EDIT_MODAL,
  useValue: () => import('./resource-edit.modal').then(m => m.ResourceEditModal)
};
