import type { Signal } from '@angular/core';

/**
 * Mirrors the lib's full physical path (`libs/tenant/util/src/i18n` → `assets/i18n/tenant/util`,
 * wired by `scripts/sync-i18n-assets.mjs`). MUST be 'tenant/util.', not a bare 'tenant.' — a
 * two-segment lib still needs both segments in the scope, or every key here 404s silently
 * (nothing in the build or test suite catches a wrong prefix). Verified against
 * `libs/security/audit/util/src/lib/privacy-audit-i18n.ts`'s `PFX = '@security/audit/util.'`,
 * a lib with the same `<domain>/<layer>` shape once its `security/audit` subdomain segment is
 * folded in — the sibling `libs/instruments/whiteboard/util` uses only `'@whiteboard/util.'`
 * (dropping its `instruments` domain segment) even though its asset output is
 * `assets/i18n/instruments/whiteboard/util/` — that mismatch is exactly this trap, already
 * live in the repo; do not copy it.
 */
const PFX = '@tenant/util.';

/**
 * `FEATURE_BUNDLES[].label` / `FeatureBlock.label` keys (`bundle.<id>.label` /
 * `feature.<id>.label`) live in this SAME scope file but are resolved dynamically per
 * catalogue entry (the id set grows with Tasks 12-18) — see `FeaturePicker`, which builds
 * that lookup with `I18nService.translateAll` from `FEATURE_BLOCKS`/`FEATURE_BUNDLES`
 * directly rather than hand-listing keys here.
 */
export const FEATURE_PICKER_I18N_KEYS = {
  title: PFX + 'picker.title',
  core_note: PFX + 'picker.core_note',
  unavailable_reason_fallback: PFX + 'picker.unavailable_reason_fallback',
  dependents_confirm: PFX + 'picker.dependents_confirm',
  removal_confirm: PFX + 'picker.removal_confirm',
  withheld_toast: PFX + 'picker.withheld_toast',
  applied_toast: PFX + 'picker.applied_toast',
} satisfies Record<string, string>;

export type FeaturePickerI18n = { [K in keyof typeof FEATURE_PICKER_I18N_KEYS]: Signal<string> };
