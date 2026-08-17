import type { Signal } from '@angular/core';

/**
 * Mirrors the lib's full physical path (`libs/tenant/util/src/i18n` → `assets/i18n/tenant/util`,
 * wired by `scripts/sync-i18n-assets.mjs`). MUST be 'tenant/util.', not a bare 'tenant.' — a
 * two-segment lib still needs both segments in the scope, or every key here 404s silently
 * (nothing in the build or test suite catches a wrong prefix). Verified against
 * `libs/security/audit/util/src/lib/privacy-audit-i18n.ts`'s `PFX = '@security/audit/util.'`,
 * a lib with the same `<domain>/<layer>` shape once its `security/audit` subdomain segment is
 * folded in. `libs/instruments/whiteboard/*` used to drop its `instruments` domain segment
 * (`'@whiteboard/util.'` against an `assets/i18n/instruments/whiteboard/util/` output) — that
 * mismatch is exactly this trap; it 404'd every whiteboard key until it was corrected.
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
  drift_title: PFX + 'picker.drift_title',
  drift_note: PFX + 'picker.drift_note',
  drift_apply: PFX + 'picker.drift_apply',
  drift_forked: PFX + 'picker.drift_forked',
  drift_edited: PFX + 'picker.drift_edited',
} satisfies Record<string, string>;

export type FeaturePickerI18n = { [K in keyof typeof FEATURE_PICKER_I18N_KEYS]: Signal<string> };
