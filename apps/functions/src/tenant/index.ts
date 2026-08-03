// apps/functions/src/tenant/index.ts
//
// `applyFeatureSelection` is wired here with `FEATURE_BLOCKS` — the Angular-free metadata
// half of the feature catalogue, imported from `@okr/tenant-util`. This app must NOT import
// `FEATURE_ROUTES`/`FEATURE_CATALOGUE` from `@okr/tenant-routes`: that half names feature
// libs via lazy `loadComponent` imports and eagerly imports `isAdminGuard`/
// `isAuthenticatedGuard` from `@okr/auth-feature`, which drags `@angular/core` and an NgRx
// Signal Store into the Cloud Functions bundle (empirically verified, see the long comment
// on `createApplyFeatureSelection` in `apply-feature-selection.ts` and the task-8/8b
// reports). `planSelection`/`applySelection` never call a block's `.routes()`, so the
// metadata-only array is sufficient here.
import { FEATURE_BLOCKS } from '@okr/tenant-util';
import { createApplyFeatureSelection } from './apply-feature-selection';

export const applyFeatureSelection = createApplyFeatureSelection(FEATURE_BLOCKS);

export { createApplyFeatureSelection, applySelection, planSelection } from './apply-feature-selection';
export type { ApplyFeatureSelectionResult, SelectionPlan } from './apply-feature-selection';
