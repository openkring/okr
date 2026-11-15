/**
 * Lazy entry points for the section editor.
 *
 * The barrel (`index.ts`) is imported statically by the dashboard AND dynamically by routes
 * (`import('@okr/cms-section-feature')`). A dynamically imported barrel is an esbuild entry
 * point, so every module it re-exports with `export *` is bound to the dashboard's eager chunk.
 * The editor (`SectionEditModal` → `SectionForm` and all section configurations, the card
 * picker, the section list) therefore must not be re-exported. Callers outside this lib load
 * it through these functions; inside the lib, use a relative `await import()`.
 */
export const loadSectionEditModal = () => import('./section-edit.modal').then(m => m.SectionEditModal);
export const loadCardSelectModal = () => import('./card-select.modal').then(m => m.CardSelectModal);
export const loadSectionAllList = () => import('./section-list').then(m => m.SectionAllList);
