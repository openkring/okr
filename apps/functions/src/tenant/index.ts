// apps/functions/src/tenant/index.ts
//
// `applyFeatureSelection` (task 8) is exported as a FACTORY, `createApplyFeatureSelection
// (catalogue)`, not as a wired `onCall` instance — see the long comment above that export
// in `apply-feature-selection.ts` for why. This app cannot import `FEATURE_CATALOGUE`
// from `@okr/tenant-feature` (it drags Angular/`@okr/auth-feature` into the Cloud
// Functions bundle; empirically verified, see the task-8 report). Until the repo owner
// decides where an Angular-free copy of the block data lives, main.ts deliberately does
// NOT wire this callable — do not add `export const applyFeatureSelection = ...` there
// with a placeholder or partial catalogue.
export { createApplyFeatureSelection, applySelection, planSelection } from './apply-feature-selection';
export type { ApplyFeatureSelectionResult, SelectionPlan } from './apply-feature-selection';
