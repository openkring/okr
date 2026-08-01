import { Signal } from '@angular/core';

/**
 * The scope prefix MUST mirror the lib's path under `libs/`, because that is what
 * `scripts/sync-i18n-assets.mjs` derives the asset output path from
 * (`libs/security/processing/util/src/i18n` → `assets/i18n/security/processing/util`) and
 * what `I18nService` builds its fetch URL from. This domain is three segments deep, so the
 * `util` segment is part of the scope — dropping it 404s every key at runtime.
 */
const PFX = '@security/processing/util.';

/**
 * Chrome only. The catalogue's own content — `purposes`, `securityMeasures`,
 * `retentionText`, `memberNoticeDe` — is **German legal text rendered verbatim**, not
 * translated: it is authored once next to the provider it describes, and a translation
 * file is exactly the place where it would drift from the contract it paraphrases.
 */
export const PROCESSING_I18N_KEYS = {
  register_title: PFX + 'register.title',
  register_subtitle: PFX + 'register.subtitle',
  register_empty: PFX + 'register.empty',
  register_export: PFX + 'register.export',
  register_exporting: PFX + 'register.exporting',

  filter_all: PFX + 'filter.all',
  filter_category: PFX + 'filter.category',
  filter_country: PFX + 'filter.country',
  // Flat, not nested under `filter.origin`: a key cannot be both a leaf and a parent.
  filter_origin: PFX + 'filter.originLabel',
  filter_origin_catalogue: PFX + 'filter.originCatalogue',
  filter_origin_tenant: PFX + 'filter.originTenant',

  field_name: PFX + 'field.name',
  field_legalEntity: PFX + 'field.legalEntity',
  field_role: PFX + 'field.role',
  field_category: PFX + 'field.category',
  field_country: PFX + 'field.country',
  field_transferMechanism: PFX + 'field.transferMechanism',
  field_purposes: PFX + 'field.purposes',
  field_dataClasses: PFX + 'field.dataClasses',
  field_retention: PFX + 'field.retention',
  field_securityMeasures: PFX + 'field.securityMeasures',
  field_dpa: PFX + 'field.dpa',
  field_privacy: PFX + 'field.privacy',
  field_contact: PFX + 'field.contact',
  field_cloudFunctions: PFX + 'field.cloudFunctions',

  role_processor: PFX + 'role.processor',
  role_subProcessor: PFX + 'role.subProcessor',
  role_jointController: PFX + 'role.jointController',

  category_infrastructure: PFX + 'category.infrastructure',
  category_saasService: PFX + 'category.saasService',
  category_externalParty: PFX + 'category.externalParty',

  transfer_domestic: PFX + 'transfer.domestic',
  transfer_adequacyDecision: PFX + 'transfer.adequacyDecision',
  transfer_scc: PFX + 'transfer.scc',
  transfer_consent: PFX + 'transfer.consent',
  transfer_none: PFX + 'transfer.none',

  controller_note: PFX + 'controller.note',
  missing_dpa: PFX + 'missing.dpa',
  detail_notFound: PFX + 'detail.notFound',
  map_title: PFX + 'map.title',
  map_legend_ch: PFX + 'map.legend.ch',
  map_legend_eu: PFX + 'map.legend.eu',
  map_legend_third: PFX + 'map.legend.third',
} satisfies Record<string, string>;

export type ProcessingI18n = { [K in keyof typeof PROCESSING_I18N_KEYS]: Signal<string> };
