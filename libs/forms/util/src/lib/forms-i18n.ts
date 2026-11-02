import { Signal } from '@angular/core';

import { ConditionOp, PropertyType } from '@okr/shared-models';

import type { RuleConnectors } from './form-rules.util';

const PFX = '@forms/feature.';

// ---------------------------------------------------------------------------
// form-definition.store
// ---------------------------------------------------------------------------

export const FORM_I18N_KEYS = {
  title:                      PFX + 'title',
  list_title:                 PFX + 'list.title',
  list_empty:                 PFX + 'list.empty',

  as_title:                   PFX + 'as.title',
  action_builder:             PFX + 'action.builder',
  action_settings:            PFX + 'action.settings',
  action_export_csv:          PFX + 'action.export_csv',
  action_export_pdf:          PFX + 'action.export_pdf',
  action_duplicate:           PFX + 'action.duplicate',
  action_archive:             PFX + 'action.archive',

  form_key:                   PFX + 'form.key.label',
  form_loading:               PFX + 'form.loading',
  form_not_found:             PFX + 'form.notfound',
  form_archived:              PFX + 'form.archived',

  field_title:                PFX + 'field.title',
  field_add:                  PFX + 'field.add',

  canvas_empty:               PFX + 'canvas_empty',
  library:                    PFX + 'library',
  key:                        PFX + 'key',
  label:                      PFX + 'label',
  required:                   PFX + 'required',
  width:                      PFX + 'width',
  help:                       PFX + 'help',
  preview:                    PFX + 'preview',

  mapping_choose:             PFX + 'mapping.choose',

  target_label:               PFX + 'target.label',
  target_collection:          PFX + 'target.collection',
  target_url:                 PFX + 'target.url',

  url_label:                  PFX + 'url.label',

  create:                     PFX + 'create.label',
  create_conf:                PFX + 'create.conf',
  create_error:               PFX + 'create.error',

  delete:                     PFX + 'delete.label',
  delete_confirm:             PFX + 'delete.confirm',
  delete_conf:                PFX + 'delete.conf',
  delete_error:               PFX + 'delete.error',

  submit:                     PFX + 'submit.label',
  submit_conf:                PFX + 'submit.conf',
  submit_error:               PFX + 'submit.error',

  update:                     PFX + 'update.label',
  update_conf:                PFX + 'update.conf',
  update_error:               PFX + 'update.error',

  // builder
  preview_empty:              PFX + 'builder.preview_empty',
  source_copy:                PFX + 'builder.source.copy',
  source_paste:               PFX + 'builder.source.paste',
  source_copied:              PFX + 'builder.source.copied',
  source_copy_failed:         PFX + 'builder.source.copy_failed',
  source_invalid_json:        PFX + 'builder.source.invalid_json',
  source_invalid_format:      PFX + 'builder.source.invalid_format',
  source_applied:             PFX + 'builder.source.applied',
  discard:                    PFX + 'builder.discard',
  preview_derived:            PFX + 'builder.preview_derived',

  // definition-edit modal
  def_create_title:           PFX + 'definition.create_title',
  def_edit_title:             PFX + 'definition.edit_title',
  def_name:                   PFX + 'definition.name',
  def_name_placeholder:       PFX + 'definition.name_placeholder',
  def_target_kind:            PFX + 'definition.target_kind',
  def_target_url_short:       PFX + 'definition.target_url_short',
  def_collection:             PFX + 'definition.collection',
  def_select_placeholder:     PFX + 'definition.select_placeholder',
  def_pdf_template:           PFX + 'definition.pdf_template',
  def_pdf_template_ph:        PFX + 'definition.pdf_template_placeholder',
  def_fields:                 PFX + 'definition.fields',
  def_filler_help:            PFX + 'definition.filler_help',
  def_filler_help_ph:         PFX + 'definition.filler_help_placeholder',

  // «Berechnete Werte» card (1.125, spec §6)
  derived_title:              PFX + 'derived.title',
  derived_intro:              PFX + 'derived.intro',
  derived_key:                PFX + 'derived.key',
  derived_key_helper:         PFX + 'derived.key_helper',
  derived_type:               PFX + 'derived.type',
  derived_when:               PFX + 'derived.when',
  derived_then:               PFX + 'derived.then',
  derived_otherwise:          PFX + 'derived.otherwise',
  derived_add:                PFX + 'derived.add',
  derived_remove:             PFX + 'derived.remove',
  derived_add_case:           PFX + 'derived.add_case',
  derived_remove_case:        PFX + 'derived.remove_case',
  derived_set_by_mapping:     PFX + 'derived.set_by_mapping',
  derived_no_fields:          PFX + 'derived.no_fields',

  // field-config modal
  field_text:                 PFX + 'field.text',
  field_label:                PFX + 'field.label',
  field_key:                  PFX + 'field.key',
  field_key_helper:           PFX + 'field.key_helper',
  field_category:             PFX + 'field.category',
  field_category_helper:      PFX + 'field.category_helper',
  field_is_indented:          PFX + 'field.is_indented',
  field_is_small:             PFX + 'field.is_small',
  field_width_full:           PFX + 'field.width_full',
  field_width_half:           PFX + 'field.width_half',
  field_width_third:          PFX + 'field.width_third',
  field_placeholder:          PFX + 'field.placeholder',
  field_apply:                PFX + 'field.apply',
  field_remove:               PFX + 'field.remove',
  field_remove_confirm:       PFX + 'field.remove_confirm',
  field_as_property:          PFX + 'field.as_property',
  field_as_property_helper:   PFX + 'field.as_property_helper',

  // «Nur anzeigen, wenn …» rule editor and canvas (1.125)
  rule_toggle:                PFX + 'rule.toggle',
  rule_toggle_block:          PFX + 'rule.toggle_block',
  rule_block_hint:            PFX + 'rule.block_hint',
  rule_no_candidates:         PFX + 'rule.no_candidates',
  rule_match_all:             PFX + 'rule.match_all',
  rule_match_any:             PFX + 'rule.match_any',
  rule_field:                 PFX + 'rule.field',
  rule_op:                    PFX + 'rule.op',
  rule_value:                 PFX + 'rule.value',
  rule_values:                PFX + 'rule.values',
  rule_from:                  PFX + 'rule.from',
  rule_to:                    PFX + 'rule.to',
  rule_years:                 PFX + 'rule.years',
  rule_add:                   PFX + 'rule.add',
  rule_remove:                PFX + 'rule.remove',
  rule_unknown_field:         PFX + 'rule.unknown_field',
  rule_if:                    PFX + 'rule.if',
  rule_and:                   PFX + 'rule.and',
  rule_or:                    PFX + 'rule.or',
  rule_conditional:           PFX + 'rule.conditional',
  rule_issue_later:           PFX + 'rule.issue_later',
  rule_issue_missing:         PFX + 'rule.issue_missing',
  rule_issue_stale:           PFX + 'rule.issue_stale',
  rule_issue_stale_op:        PFX + 'rule.issue_stale_op',

  // condition operators (spec §5)
  op_equals:                  PFX + 'op.equals',
  op_notEquals:               PFX + 'op.notEquals',
  op_in:                      PFX + 'op.in',
  op_notIn:                   PFX + 'op.notIn',
  op_isChecked:               PFX + 'op.isChecked',
  op_isNotChecked:            PFX + 'op.isNotChecked',
  op_contains:                PFX + 'op.contains',
  op_notContains:             PFX + 'op.notContains',
  op_lt:                      PFX + 'op.lt',
  op_lte:                     PFX + 'op.lte',
  op_gt:                      PFX + 'op.gt',
  op_gte:                     PFX + 'op.gte',
  op_between:                 PFX + 'op.between',
  op_ageGte:                  PFX + 'op.ageGte',
  op_ageLt:                   PFX + 'op.ageLt',
  op_isFilled:                PFX + 'op.isFilled',
  op_isEmpty:                 PFX + 'op.isEmpty',

  // typed properties (spec §4.4)
  property_boolean:           PFX + 'property.boolean',
  property_number:            PFX + 'property.number',
  property_text:              PFX + 'property.text',
  property_group:             PFX + 'property.group',
  property_template_text:     PFX + 'property.template_text',
  property_template_boolean:  PFX + 'property.template_boolean',
  property_template_number:   PFX + 'property.template_number',
  property_template_desc:     PFX + 'property.template_desc',

  // decrypt-files modal
  decrypt_title:              PFX + 'decrypt.title',
  decrypt_hint:               PFX + 'decrypt.hint',
  decrypt_password:           PFX + 'decrypt.password',
  decrypt_password_ph:        PFX + 'decrypt.password_placeholder',
  decrypt_running:            PFX + 'decrypt.running',
  decrypt_action:             PFX + 'decrypt.action',
  decrypt_failed:             PFX + 'decrypt.failed',

  // encryption-setup modal
  enc_title:                  PFX + 'encryption.title',
  enc_warning:                PFX + 'encryption.warning',
  enc_password:               PFX + 'encryption.password',
  enc_copied:                 PFX + 'encryption.copied',
  enc_confirm:                PFX + 'encryption.confirm',
  enc_saving:                 PFX + 'encryption.saving',
  enc_activate:               PFX + 'encryption.activate',

  close:                    '@shared/ui.close',
  description:              '@description',
  name:                     '@name.label',
  loading:                  '@loading',
  save:                     '@save.label',
  ok:                       '@ok',
  cancel:                   '@cancel'
} satisfies Record<string, string>;

export type FormI18n = { [K in keyof typeof FORM_I18N_KEYS]: Signal<string> };

const CONDITION_OPS: ConditionOp[] = [
  'equals', 'notEquals', 'in', 'notIn', 'isChecked', 'isNotChecked', 'contains', 'notContains',
  'lt', 'lte', 'gt', 'gte', 'between', 'ageGte', 'ageLt', 'isFilled', 'isEmpty',
];

/** The translated operator names («ist», «ist eine von», «Alter mindestens» …), for the rule editor and `describeRule`. */
export function conditionOpLabels(i18n: FormI18n): Record<ConditionOp, string> {
  return Object.fromEntries(CONDITION_OPS.map(op => [op, i18n[`op_${op}`]()])) as Record<ConditionOp, string>;
}

/** The translated «wenn / und / oder» of `describeRule`. */
export function ruleConnectors(i18n: FormI18n): RuleConnectors {
  return { if: i18n.rule_if(), and: i18n.rule_and(), or: i18n.rule_or() };
}

/** The translated name of a property type («ja/nein», «Zahl», «Text»). */
export function propertyTypeLabel(i18n: FormI18n, type: PropertyType): string {
  return type === 'boolean' ? i18n.property_boolean() : type === 'number' ? i18n.property_number() : i18n.property_text();
}
