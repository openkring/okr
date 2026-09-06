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
  save: PFX + 'picker.save',
  cancel: PFX + 'picker.cancel',
  cancel_confirm: PFX + 'picker.cancel_confirm',
  // Proposal 6 — named block selections. The per-profile `label`/`description` keys are NOT
  // listed here: like block and bundle labels they are resolved dynamically per catalogue
  // entry (see `FeaturePicker`), because the profile list is data, not a fixed key set.
  profiles_title: PFX + 'picker.profiles_title',
  profile_confirm: PFX + 'picker.profile_confirm',
  profile_applied: PFX + 'picker.profile_applied',
  core_note: PFX + 'picker.core_note',
  /**
   * Per-block menu outline (name, route, action, role) — the answer to "which menu does this
   * toggle switch on?", which the block label alone never gave.
   */
  details_title: PFX + 'picker.details_title',
  details_block_id: PFX + 'picker.details_block_id',
  details_no_menu: PFX + 'picker.details_no_menu',
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
  /**
   * What the two badges above actually MEAN, and what each implies for the next save. A
   * reader who does not already know D-BB-8's fork rule cannot infer either from the badge.
   */
  drift_legend_forked: PFX + 'picker.drift_legend_forked',
  drift_legend_edited: PFX + 'picker.drift_legend_edited',
  /** Origin of a drifted entry — which block owns it, which menu holds it, which document. */
  drift_owner: PFX + 'picker.drift_owner',
  drift_parent: PFX + 'picker.drift_parent',
  drift_doc: PFX + 'picker.drift_doc',
  /** Proposal 5 — the other exit from a drift entry: the LIVE value is the right one. */
  drift_keep_live: PFX + 'picker.drift_keep_live',
  /** Column captions on a drift row. Without them a bare `a → b` does not say which side is
   *  which, nor which button writes which — the first thing a reader asked about. */
  drift_col_live: PFX + 'picker.drift_col_live',
  drift_col_catalogue: PFX + 'picker.drift_col_catalogue',
  drift_keep_live_copied: PFX + 'picker.drift_keep_live_copied',
  // Guards that name what a write will actually change. Resolved through
  // `translateOnce(key, params)`, so these use Transloco's own `{{...}}` interpolation —
  // unlike the store-driven keys, which must use single braces and `fill()`.
  drift_confirm: PFX + 'picker.drift_confirm',
  /**
   * The app's catalogue and the DEPLOYED functions' catalogue disagree — the failure that
   * made an apply report success while changing nothing (or changing it to a third value).
   * Shown inside the confirmation, never as a toast afterwards: the only useful moment is
   * before the write.
   */
  drift_skew_warning: PFX + 'picker.drift_skew_warning',
  /** The server plans no write at all, so there is nothing to confirm. */
  drift_nothing_planned: PFX + 'picker.drift_nothing_planned',
  // Proposal 4 — the server-side dry run, named op by op before the save commits.
  preview_confirm: PFX + 'picker.preview_confirm',
  preview_created: PFX + 'picker.preview_created',
  preview_extended: PFX + 'picker.preview_extended',
  preview_seeded: PFX + 'picker.preview_seeded',
  menu_impact_confirm: PFX + 'picker.menu_impact_confirm',
  menu_impact_removed: PFX + 'picker.menu_impact_removed',
  menu_impact_readded: PFX + 'picker.menu_impact_readded',
} satisfies Record<string, string>;

export type FeaturePickerI18n = { [K in keyof typeof FEATURE_PICKER_I18N_KEYS]: Signal<string> };
