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

  // ─── the author's own list, view and form (Teilprojekt 3) ─────────────────
  plural:                 PFX + 'plural',
  singular:               PFX + 'singular',
  list_empty:             PFX + 'list.empty',
  list_all_years_hint:    PFX + 'list.allYearsHint',
  as_title:               PFX + 'actions.title',
  add:                    PFX + 'actions.add',
  view:                   PFX + 'actions.view',
  edit:                   PFX + 'actions.edit',
  delete:                 PFX + 'actions.delete',
  delete_confirm:         PFX + 'actions.deleteConfirm',
  weather_refresh:        PFX + 'actions.weatherRefresh',
  open_drive:             PFX + 'actions.openDrive',
  create_conf:            PFX + 'create.conf',
  create_error:           PFX + 'create.error',
  create_exists:          PFX + 'create.exists',
  delete_conf:            PFX + 'delete.conf',
  delete_error:           PFX + 'delete.error',
  save:                   '@save.label',

  state_all:              PFX + 'state.all',
  state_final:            PFX + 'state.final',
  state_draft:            PFX + 'state.draft',
  state_placeholder:      PFX + 'state.placeholder',
  scope_day:              PFX + 'scope.day',
  scope_month:            PFX + 'scope.month',
  scope_year:             PFX + 'scope.year',

  form_title_label:       PFX + 'form.title.label',
  form_title_placeholder: PFX + 'form.title.placeholder',
  form_scope_label:       PFX + 'form.scope.label',
  form_date_label:        PFX + 'form.date.label',
  form_year_label:        PFX + 'form.year.label',
  form_month_label:       PFX + 'form.month.label',
  form_status_label:      PFX + 'form.status.label',
  form_status_helper:     PFX + 'form.status.helper',
  form_text_label:        PFX + 'form.text.label',
  form_text_placeholder:  PFX + 'form.text.placeholder',
  form_done_label:        PFX + 'form.done.label',
  form_done_placeholder:  PFX + 'form.done.placeholder',
  form_location_label:    PFX + 'form.location.label',
  form_location_select:   PFX + 'form.location.select',
  form_people_label:      PFX + 'form.people.label',
  form_people_select:     PFX + 'form.people.select',
  form_custom_people_label: PFX + 'form.customPeople.label',
  form_custom_people_helper: PFX + 'form.customPeople.helper',
  form_places_label:      PFX + 'form.places.label',
  form_events_label:      PFX + 'form.events.label',
  form_trip_label:        PFX + 'form.trip.label',
  form_trip_select:       PFX + 'form.trip.select',
  form_trip_none:         PFX + 'form.trip.none',

  weather_line_none:      PFX + 'weather.none',
  weather_draft_hint:     PFX + 'weather.draftHint',
  weather_no_coords:      PFX + 'weather.noCoords',
  weather_conf:           PFX + 'weather.conf',
  images_in_drive:        PFX + 'view.imagesInDrive',
  view_done_title:        PFX + 'view.doneTitle',
  view_untitled:          PFX + 'view.untitled',

  ok:                     '@ok',
  cancel:                 '@cancel',
} satisfies Record<string, string>;

export type DiaryI18n = { [K in keyof typeof DIARY_I18N_KEYS]: Signal<string> };
