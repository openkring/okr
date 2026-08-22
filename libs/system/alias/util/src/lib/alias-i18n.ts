// TYPE-ONLY, und das ist hier eine Bedingung, keine Stilfrage: diese Lib wird von den Cloud
// Functions importiert und muss Angular-frei bleiben (siehe `testing`-Skill,
// „@angular/compiler / PlatformLocation JIT"). `import type` wird beim Kompilieren restlos
// entfernt, ein Wert-Import würde `@angular/core` in den Functions-Bundle ziehen.
import type { Signal } from '@angular/core';

/**
 * MUSS dem Pfad der Lib unter `libs/` entsprechen (`system/alias/util`) — der Präfix ist der
 * Transloco-Scope, und ein falscher Scope lässt jeden String zur Laufzeit 404en, ohne dass ein
 * Build oder Test es bemerkt.
 */
const PFX = '@system/alias/util.';

export const ALIAS_I18N_KEYS = {
  // ── Liste ──────────────────────────────────────────────────────────────────────
  list_title: PFX + 'list.title',
  list_empty: PFX + 'list.empty',
  list_search: PFX + 'list.search',
  list_filter_space: PFX + 'list.filter.space',
  list_filter_all: PFX + 'list.filter.all',
  list_count: PFX + 'list.count',

  // ── Kontextmenü ────────────────────────────────────────────────────────────────
  context_add: PFX + 'context.add',
  context_spaces: PFX + 'context.spaces',
  context_exportraw: PFX + 'context.exportraw',
  context_qrdownload: PFX + 'context.qrdownload',

  // ── Alias-Formular ─────────────────────────────────────────────────────────────
  alias_singular: PFX + 'alias.singular',
  alias_plural: PFX + 'alias.plural',
  field_space_label: PFX + 'field.space.label',
  field_space_helper: PFX + 'field.space.helper',
  field_alias_label: PFX + 'field.alias.label',
  field_alias_placeholder: PFX + 'field.alias.placeholder',
  field_alias_helper: PFX + 'field.alias.helper',
  field_targettype_label: PFX + 'field.targetType.label',
  field_targeturl_label: PFX + 'field.targetUrl.label',
  field_targeturl_placeholder: PFX + 'field.targetUrl.placeholder',
  field_targeturl_helper: PFX + 'field.targetUrl.helper',
  field_targetkey_label: PFX + 'field.targetKey.label',
  field_targetkey_helper: PFX + 'field.targetKey.helper',
  field_notes_label: PFX + 'field.notes.label',
  field_notes_helper: PFX + 'field.notes.helper',
  field_isenabled_label: PFX + 'field.isEnabled.label',
  field_isenabled_helper: PFX + 'field.isEnabled.helper',
  field_validuntil_label: PFX + 'field.validUntil.label',
  field_validuntil_helper: PFX + 'field.validUntil.helper',
  field_maxuses_label: PFX + 'field.maxUses.label',
  field_maxuses_helper: PFX + 'field.maxUses.helper',
  field_trackinglevel_label: PFX + 'field.trackingLevel.label',
  field_trackinglevel_helper: PFX + 'field.trackingLevel.helper',

  // ── Space-Formular ─────────────────────────────────────────────────────────────
  space_singular: PFX + 'space.singular',
  space_plural: PFX + 'space.plural',
  space_list_title: PFX + 'space.list.title',
  space_list_empty: PFX + 'space.list.empty',
  space_field_name_label: PFX + 'space.field.name.label',
  space_field_name_helper: PFX + 'space.field.name.helper',
  space_field_name_locked: PFX + 'space.field.name.locked',
  space_field_label_label: PFX + 'space.field.label.label',
  space_field_kind_label: PFX + 'space.field.kind.label',
  space_field_kind_helper: PFX + 'space.field.kind.helper',
  space_field_length_label: PFX + 'space.field.length.label',
  space_field_charset_label: PFX + 'space.field.charset.label',
  space_field_allowcustom_label: PFX + 'space.field.allowCustom.label',
  space_field_casesensitive_label: PFX + 'space.field.caseSensitive.label',
  space_field_roleneeded_label: PFX + 'space.field.roleNeeded.label',
  space_field_tracking_label: PFX + 'space.field.tracking.label',
  space_field_retention_label: PFX + 'space.field.retention.label',
  space_field_retention_helper: PFX + 'space.field.retention.helper',
  space_aliascount: PFX + 'space.aliasCount',
  space_usecount: PFX + 'space.useCount',

  // ── Detailseite ────────────────────────────────────────────────────────────────
  detail_title: PFX + 'detail.title',
  detail_shorturl: PFX + 'detail.shortUrl',
  detail_copy: PFX + 'detail.copy',
  detail_copied: PFX + 'detail.copied',
  detail_qr_title: PFX + 'detail.qr.title',
  detail_qr_download: PFX + 'detail.qr.download',
  detail_target: PFX + 'detail.target',
  detail_stats_title: PFX + 'detail.stats.title',
  detail_stats_empty: PFX + 'detail.stats.empty',
  detail_stats_usecount: PFX + 'detail.stats.useCount',
  detail_stats_lastused: PFX + 'detail.stats.lastUsed',
  detail_stats_never: PFX + 'detail.stats.never',

  // ── Zustände / Meldungen ───────────────────────────────────────────────────────
  state_disabled: PFX + 'state.disabled',
  state_archived: PFX + 'state.archived',
  state_notyetvalid: PFX + 'state.notYetValid',
  state_expired: PFX + 'state.expired',
  state_exhausted: PFX + 'state.exhausted',
  mint_failed: PFX + 'mint.failed',
  mint_created: PFX + 'mint.created',

  // ── generische Aktionen (Modal-Titel, Change-Confirmation) ─────────────────────
  action_view: PFX + 'action.view',
  action_create: PFX + 'action.create',
  action_update: PFX + 'action.update',
  action_save: PFX + 'action.save',
  action_cancel: PFX + 'action.cancel',
  action_delete: PFX + 'action.delete',
} satisfies Record<string, string>;

export type AliasI18n = { [K in keyof typeof ALIAS_I18N_KEYS]: Signal<string> };
