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
  // Generic confirm/cancel button labels, shared by `BlockEnableModal`'s change-confirmation.
  save: PFX + 'picker.save',
  cancel: PFX + 'picker.cancel',
  // The two IonSegment tabs — "Bausteine" and "Menüzeilen".
  segment_blocks: PFX + 'picker.segment_blocks',
  segment_rows: PFX + 'picker.segment_rows',
  segment_rows_placeholder: PFX + 'picker.segment_rows_placeholder',
  // Per-block actions — one confirmed act each, no global save (spec Task 10).
  enable_button: PFX + 'picker.enable_button',
  disable_button: PFX + 'picker.disable_button',
  /** «Ausschalten» confirmation — must say plainly: rows stay and are only hidden, data
   *  is untouched. Nothing is deleted, unlike the old checkbox model's implied removal. */
  disable_confirm: PFX + 'picker.disable_confirm',
  enabled_toast: PFX + 'picker.enabled_toast',
  disabled_toast: PFX + 'picker.disabled_toast',
  // Proposal 6 — named block selections. The per-profile `label`/`description` keys are NOT
  // listed here: like block and bundle labels they are resolved dynamically per catalogue
  // entry (see `FeaturePicker`), because the profile list is data, not a fixed key set.
  profiles_title: PFX + 'picker.profiles_title',
  /**
   * «Profil anwenden» no longer writes anything — it only highlights the blocks the profile
   * would add. Shown once something is highlighted, so the admin knows the highlight is not
   * itself an action: every highlighted block still needs its own «Einschalten».
   */
  profile_highlight_note: PFX + 'picker.profile_highlight_note',
  core_note: PFX + 'picker.core_note',
  details_no_menu: PFX + 'picker.details_no_menu',
  unavailable_reason_fallback: PFX + 'picker.unavailable_reason_fallback',
  // Guards/toasts that name what a write actually changed. Resolved through
  // `translateOnce(key, params)` (`FeaturePicker.translateOrFallback`), so these use
  // Transloco's own `{{...}}` interpolation — unlike the store-driven keys, which must use
  // single braces and `fill()`.
  withheld_toast: PFX + 'picker.withheld_toast',
  // Task 8 — the whitelist dialog (`BlockEnableModal` in `@okr/tenant-ui`): which of a
  // block's own menu rows an admin actually wants attached, ticked one by one.
  /**
   * Intro line above the checkbox list — the reason this screen exists. Must say, on the spot,
   * that unticking a row does not delete or lose anything: the row is simply never created,
   * and can be added later from the Menüzeilen table (segment 2). Without this the dialog
   * silently repeats the old checkbox model's implied "uncheck = remove" fear.
   */
  enable_dialog_intro: PFX + 'picker.enable_dialog_intro',
  /** A row already reachable in this tenant's menu — shown ticked and disabled. */
  enable_already_present: PFX + 'picker.enable_already_present',
  /**
   * Divider label over a mitaktiviert (dependency-forced) block's own read-only outline,
   * used only when the dry-run preview carries no matching `block-enabled` entry for it
   * (defensive fallback — the normal case shows that entry's own `consequence` sentence).
   */
  enable_dependency_reason_fallback: PFX + 'picker.enable_dependency_reason_fallback',

  // Task 11 — Segment 2 (Menüzeilen): the table, its two modals, and the toolbar help icon
  // reachable from both segments.
  rows_col_menu: PFX + 'picker.rows_col_menu',
  rows_col_role: PFX + 'picker.rows_col_role',
  rows_col_action: PFX + 'picker.rows_col_action',
  rows_absent: PFX + 'picker.rows_absent',
  /** Tooltip text of the «≠» badge on `url`/`action` drift shown next to `roleNeeded`. */
  rows_other_drift: PFX + 'picker.rows_other_drift',
  rows_pinned_note: PFX + 'picker.rows_pinned_note',
  // The three exits off a drifted row — «der Katalog schlägt vor, der Mandant entscheidet».
  rows_apply_button: PFX + 'picker.rows_apply_button',
  rows_pin_button: PFX + 'picker.rows_pin_button',
  rows_adjust_catalogue_button: PFX + 'picker.rows_adjust_catalogue_button',
  rows_unpin_button: PFX + 'picker.rows_unpin_button',
  rows_add_button: PFX + 'picker.rows_add_button',
  rows_apply_toast: PFX + 'picker.rows_apply_toast',
  rows_pin_toast: PFX + 'picker.rows_pin_toast',
  rows_unpin_toast: PFX + 'picker.rows_unpin_toast',
  rows_add_toast: PFX + 'picker.rows_add_toast',
  /** «Katalog anpassen» writes nothing and needs no confirmation — this is the toast alone. */
  rows_adjust_catalogue_toast: PFX + 'picker.rows_adjust_catalogue_toast',
  /** Shown when a dry run's own preview reports nothing to write (e.g. every differing
   *  field on the row turned out to be pinned by the time the write actually ran). */
  rows_nothing_planned: PFX + 'picker.rows_nothing_planned',
  // `MenuCompareModal` (the (i) icon on each table row).
  compare_title: PFX + 'picker.compare_title',
  compare_col_field: PFX + 'picker.compare_col_field',
  compare_col_database: PFX + 'picker.compare_col_database',
  compare_col_catalogue: PFX + 'picker.compare_col_catalogue',
  /** Caption in front of the owner tag (`Katalog`/`fixiert`/`Mandant`) shown under each
   *  field's name — without it that tag renders as an unlabelled second line. */
  compare_col_owner: PFX + 'picker.compare_col_owner',
  compare_owner_catalogue: PFX + 'picker.compare_owner_catalogue',
  compare_owner_pinned: PFX + 'picker.compare_owner_pinned',
  compare_owner_tenant: PFX + 'picker.compare_owner_tenant',
  compare_close: PFX + 'picker.compare_close',
  /**
   * Shown only on a forked document, in place of the shared-original column the modal
   * deliberately does NOT have (task 11 review round 1: a column that can never resolve
   * and always renders a dash is worse than no column — the tenant's `MenuService.list()`
   * cannot see a document it just detached from). Names `forkedFrom` as the identifier a
   * developer would use to find the original elsewhere. Intended German meaning: "Dies ist
   * deine eigene Kopie. Das gemeinsame Original gehört anderen Mandanten und kann hier
   * nicht angezeigt werden."
   */
  compare_fork_note: PFX + 'picker.compare_fork_note',
  compare_bool_true: PFX + 'picker.compare_bool_true',
  compare_bool_false: PFX + 'picker.compare_bool_false',
  /** Field captions on the compare table — the model's own field names (`url`, `action`, …)
   *  are not German and not something a tenant admin should have to decode. */
  compare_field_url: PFX + 'picker.compare_field_url',
  compare_field_action: PFX + 'picker.compare_field_action',
  compare_field_role_needed: PFX + 'picker.compare_field_role_needed',
  compare_field_label: PFX + 'picker.compare_field_label',
  compare_field_icon: PFX + 'picker.compare_field_icon',
  compare_field_icon_alt: PFX + 'picker.compare_field_icon_alt',
  compare_field_label_alt: PFX + 'picker.compare_field_label_alt',
  compare_field_index: PFX + 'picker.compare_field_index',
  compare_field_description: PFX + 'picker.compare_field_description',
  compare_field_tags: PFX + 'picker.compare_field_tags',
  compare_field_tenants: PFX + 'picker.compare_field_tenants',
  compare_field_menu_items: PFX + 'picker.compare_field_menu_items',
  compare_field_is_archived: PFX + 'picker.compare_field_is_archived',
  compare_field_forked_from: PFX + 'picker.compare_field_forked_from',
  compare_field_owned_fields: PFX + 'picker.compare_field_owned_fields',
  // `PickerHelpModal` (the (i) icon in the toolbar, both segments).
  help_title: PFX + 'picker.help_title',
  help_button: PFX + 'picker.help_button',
  help_close: PFX + 'picker.help_close',
  /** What a Baustein is, versus a Menüzeile. */
  help_blocks_vs_rows: PFX + 'picker.help_blocks_vs_rows',
  /** The three actions plus the test that tells «Fixieren» and «Katalog anpassen» apart:
   *  "würdest du diesen Wert auch den anderen Mandanten wünschen?" */
  help_actions: PFX + 'picker.help_actions',
  /** What «fixiert» means going forward (the catalogue stops writing the field). */
  help_pinned: PFX + 'picker.help_pinned',
  /** The promise: this screen deletes nothing and changes no existing row without consent. */
  help_promise: PFX + 'picker.help_promise',
} satisfies Record<string, string>;

export type FeaturePickerI18n = { [K in keyof typeof FEATURE_PICKER_I18N_KEYS]: Signal<string> };
