import type { Signal } from '@angular/core';

// Global translation keys (no scope prefix → resolved from the app's global de.json).
const PFX = '@vcard.';
// Lazy scope of @okr/vcard-feature (libs/vcard/feature/src/i18n) — every key added since spec 1.159.
const SPFX = '@vcard/feature.';

export const VCARD_I18N_KEYS = {
  action_label: PFX + 'action.label',

  modal_title: PFX + 'modal.title',
  modal_intro: PFX + 'modal.intro',

  scope_addresses: PFX + 'scope.addresses',
  scope_phone: PFX + 'scope.phone',
  scope_email: PFX + 'scope.email',
  scope_postal: PFX + 'scope.postal',
  scope_web: PFX + 'scope.web',
  scope_birthday: PFX + 'scope.birthday',
  scope_photo: PFX + 'scope.photo',
  scope_workRels: PFX + 'scope.workRels',
  scope_personalRels: PFX + 'scope.personalRels',
  scope_orgLinks: PFX + 'scope.orgLinks',

  export_conf: PFX + 'export.conf',
  export_error: PFX + 'export.error',
  not_allowed: PFX + 'export.notAllowed',

  import_label: PFX + 'import.label',
  import_title: PFX + 'import.title',
  import_intro: PFX + 'import.intro',
  import_status_new: PFX + 'import.status.new',
  import_status_duplicate: PFX + 'import.status.duplicate',
  import_action_import: PFX + 'import.action.import',
  import_action_merge: PFX + 'import.action.merge',
  import_action_skip: PFX + 'import.action.skip',
  import_action_createAnyway: PFX + 'import.action.createAnyway',
  import_create_org: PFX + 'import.create.org',
  import_create_person: PFX + 'import.create.person',
  import_link_none: PFX + 'import.link.none',
  import_notes_label: PFX + 'import.notes.label',
  import_summary: PFX + 'import.summary',
  import_noCards: PFX + 'import.noCards',
  import_notAllowed: PFX + 'import.notAllowed',
  import_running: PFX + 'import.running',
  import_start: PFX + 'import.start',
  import_skippedCards: PFX + 'import.skippedCards',

  import_notes_header: PFX + 'import.notes.header',
  import_notes_truncated: PFX + 'import.notes.truncated',
  import_notes_notImported: PFX + 'import.notes.notImported',

  import_warning_unknownUsage: PFX + 'import.warning.unknownUsage',
  import_warning_unknownCountry: PFX + 'import.warning.unknownCountry',
  import_warning_badDate: PFX + 'import.warning.badDate',
  import_warning_noName: PFX + 'import.warning.noName',
  import_warning_unterminated: PFX + 'import.warning.unterminated',
  import_warning_sensitiveDropped: PFX + 'import.warning.sensitiveDropped',
  import_warning_notesTruncated: PFX + 'import.warning.notesTruncated',
  import_warning_photoFormat: PFX + 'import.warning.photoFormat',
  import_warning_photoFailed: PFX + 'import.warning.photoFailed',

  // spec 1.159 — new strings live in the lazy scope of vcard-feature
  import_reading: SPFX + 'import.reading',
  import_filter_all: SPFX + 'import.filter.all',
  import_filter_new: SPFX + 'import.filter.new',
  import_filter_duplicates: SPFX + 'import.filter.duplicates',
  import_filter_warnings: SPFX + 'import.filter.warnings',
  import_bulk_label: SPFX + 'import.bulk.label',
  import_bulk_import: SPFX + 'import.bulk.import',
  import_bulk_merge: SPFX + 'import.bulk.merge',
  import_bulk_skip: SPFX + 'import.bulk.skip',
  import_photos: SPFX + 'import.photos',
  import_keepAwake: SPFX + 'import.keepAwake',

  // «Adressbuch auf Mac und iPhone» (spec 1.159 §7.4)
  dav_title: SPFX + 'dav.title',
  dav_intro: SPFX + 'dav.intro',
  dav_server: SPFX + 'dav.server',
  dav_username: SPFX + 'dav.username',
  dav_password: SPFX + 'dav.password',
  dav_copy: SPFX + 'dav.copy',
  dav_copied: SPFX + 'dav.copied',
  dav_create: SPFX + 'dav.create',
  dav_regenerate: SPFX + 'dav.regenerate',
  dav_regenerateConfirm: SPFX + 'dav.regenerateConfirm',
  dav_shownOnce: SPFX + 'dav.shownOnce',
  dav_noPassword: SPFX + 'dav.noPassword',
  dav_revoke: SPFX + 'dav.revoke',
  dav_revokeConfirm: SPFX + 'dav.revokeConfirm',
  dav_lastUsed: SPFX + 'dav.lastUsed',
  dav_neverUsed: SPFX + 'dav.neverUsed',
  dav_steps_title: SPFX + 'dav.steps.title',
  dav_steps_mac: SPFX + 'dav.steps.mac',
  dav_steps_iphone: SPFX + 'dav.steps.iphone',
  dav_book_title: SPFX + 'dav.book.title',
  dav_book_state: SPFX + 'dav.book.state',
  dav_book_empty: SPFX + 'dav.book.empty',
  dav_refresh: SPFX + 'dav.refresh',
  dav_refreshDone: SPFX + 'dav.refreshDone',
  dav_refreshTooSoon: SPFX + 'dav.refreshTooSoon',
  dav_interval_label: SPFX + 'dav.interval.label',
  dav_interval_weekly: SPFX + 'dav.interval.weekly',
  dav_interval_daily: SPFX + 'dav.interval.daily',
  dav_interval_manual: SPFX + 'dav.interval.manual',
  dav_error: SPFX + 'dav.error',

  cancel: '@cancel',
  ok: '@ok',
  save: '@save.label',
} satisfies Record<string, string>;

export type VcardI18n = { [K in keyof typeof VCARD_I18N_KEYS]: Signal<string> };

/**
 * `{key}` substitution. `I18nService.translateAll` resolves a key through Transloco,
 * which SUBSTITUTES `{{param}}` with nothing — so every placeholder in these bundles
 * uses SINGLE braces and is filled in here instead.
 */
export function fill(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}

/**
 * The operator-visible strings the PURE util modules need (spec §9).
 *
 * `vcard-parser`, `vcard-import-mapping` and `vcard-import-notes` must stay free of
 * Angular, so they cannot inject `I18nService`. The Angular caller resolves the keys
 * and threads the plain strings in through this bag instead. Placeholders are filled
 * with {@link fill}, i.e. single braces.
 */
export interface VcardImportTexts {
  /** `{date}`, `{file}` — the notes block header, §4.6. */
  notesHeader: string;
  /** the "…" marker appended to a truncated notes block. */
  notesTruncated: string;
  /** `{size}` — a binary property recorded by size instead of its base64 payload. */
  notesNotImported: string;
  /** `{type}`, `{channel}`, `{usage}` */
  unknownUsage: string;
  /** `{name}`, `{fallback}` */
  unknownCountry: string;
  /** `{property}`, `{value}` */
  badDate: string;
  noName: string;
  unterminated: string;
  /** `{property}` */
  sensitiveDropped: string;
  /** `{limit}` */
  notesTruncatedWarning: string;
  /** `{property}` */
  photoFormat: string;
}

/**
 * German fallbacks, used when no caller threaded resolved strings in — unit tests and
 * any non-Angular caller. The APP BUNDLES are the authority at runtime; this bag only
 * keeps the util callable on its own.
 */
export const DEFAULT_VCARD_IMPORT_TEXTS: VcardImportTexts = {
  notesHeader: '--- vCard-Import {date} · {file} ---',
  notesTruncated: '… (gekürzt)',
  notesNotImported: '({size} kB, nicht übernommen)',
  unknownUsage: 'Der Typ «{type}» bei «{channel}» ist unbekannt — der Eintrag wird als «{usage}» übernommen.',
  unknownCountry: 'Das Land «{name}» kennen wir nicht — die Adresse bekommt vorerst «{fallback}».',
  badDate: '«{value}» bei {property} ist kein gültiges Datum — der Wert steht nur in den Notizen.',
  noName: 'Eine Karte ohne Namen wurde übersprungen.',
  unterminated: 'Eine unvollständige Karte am Dateiende wurde übersprungen.',
  sensitiveDropped: '{property} wurde nicht übernommen, weil darin vermutlich besonders schützenswerte Daten stehen.',
  notesTruncatedWarning: 'Die Notiz war zu lang und wurde nach {limit} Zeichen gekürzt.',
  photoFormat: 'Das Bild in {property} konnte nicht gelesen werden und wurde nicht übernommen.',
};

/** Resolve the {@link VcardImportTexts} bag from the component/service i18n signals. */
export function vcardImportTexts(i18n: VcardI18n): VcardImportTexts {
  return {
    notesHeader: i18n.import_notes_header(),
    notesTruncated: i18n.import_notes_truncated(),
    notesNotImported: i18n.import_notes_notImported(),
    unknownUsage: i18n.import_warning_unknownUsage(),
    unknownCountry: i18n.import_warning_unknownCountry(),
    badDate: i18n.import_warning_badDate(),
    noName: i18n.import_warning_noName(),
    unterminated: i18n.import_warning_unterminated(),
    sensitiveDropped: i18n.import_warning_sensitiveDropped(),
    notesTruncatedWarning: i18n.import_warning_notesTruncated(),
    photoFormat: i18n.import_warning_photoFormat(),
  };
}
