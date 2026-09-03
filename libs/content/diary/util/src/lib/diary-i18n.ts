import { Signal } from '@angular/core';

/**
 * Scope prefix. It must mirror the path of the lib that SHIPS the JSON bundle
 * (`libs/content/diary/feature/src/i18n/`), not the lib that declares the keys — Transloco
 * fetches `assets/i18n/content/diary/feature/<lang>.json` from exactly this string.
 */
const PFX = '@content/diary/feature.';

export const DIARY_I18N_KEYS = {
  title:                  PFX + 'title',
  subtitle:               PFX + 'subtitle',

  // ─── import prerequisites (moved off the privacy-audit screen, spec 1.34) ────
  import_title:           PFX + 'import.title',
  drive_action:           PFX + 'drive.action',
  drive_running:          PFX + 'drive.running',
  drive_ok:               PFX + 'drive.ok',
  drive_failed:           PFX + 'drive.failed',
  dryrun_action:          PFX + 'dryrun.action',
  dryrun_running:         PFX + 'dryrun.running',
  dryrun_ok:              PFX + 'dryrun.ok',
  dryrun_failed:          PFX + 'dryrun.failed',
  dryrun_top_unresolved:  PFX + 'dryrun.topUnresolved',
  dryrun_first_error:     PFX + 'dryrun.firstError',
  commit_action:          PFX + 'commit.action',
  commit_running:         PFX + 'commit.running',
  commit_ok:              PFX + 'commit.ok',
  commit_failed:          PFX + 'commit.failed',
  commit_hint:            PFX + 'commit.hint',

  // ─── the two reference lists ─────────────────────────────────────────────────
  locations_title:        PFX + 'locations.title',
  locations_hint:         PFX + 'locations.hint',
  locations_action:       PFX + 'locations.action',
  persons_title:          PFX + 'persons.title',
  persons_hint:           PFX + 'persons.hint',
  persons_action:         PFX + 'persons.action',

  reference_search:       PFX + 'reference.search',
  reference_filter_all:        PFX + 'reference.filter.all',
  reference_filter_resolved:   PFX + 'reference.filter.resolved',
  reference_filter_unresolved: PFX + 'reference.filter.unresolved',
  reference_empty:        PFX + 'reference.empty',
  reference_unresolved:   PFX + 'reference.unresolved',

  usage_title:            PFX + 'usage.title',
  usage_empty:            PFX + 'usage.empty',
  usage_untitled:         PFX + 'usage.untitled',

  // ─── actions ─────────────────────────────────────────────────────────────────
  location_edit:          PFX + 'location.edit',
  location_add:           PFX + 'location.add',
  location_map:           PFX + 'location.map',
  person_edit:            PFX + 'person.edit',
  person_add:             PFX + 'person.add',
  person_map:             PFX + 'person.map',
  show_diaries:           PFX + 'show.diaries',

  person_duplicate_hint:  PFX + 'person.duplicateHint',

  update_conf:            PFX + 'update.conf',
  update_error:           PFX + 'update.error',

  loading:                PFX + 'loading',
  ok:                     '@ok',
  cancel:                 '@cancel',
} satisfies Record<string, string>;

export type DiaryI18n = { [K in keyof typeof DIARY_I18N_KEYS]: Signal<string> };
