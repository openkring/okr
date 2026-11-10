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
  def_target_mail_short:      PFX + 'definition.target_mail_short',
  def_target_mail_hint:       PFX + 'definition.target_mail_hint',
  def_collection:             PFX + 'definition.collection',
  def_select_placeholder:     PFX + 'definition.select_placeholder',
  def_pdf_template:           PFX + 'definition.pdf_template',
  def_pdf_template_ph:        PFX + 'definition.pdf_template_placeholder',
  def_fields:                 PFX + 'definition.fields',
  def_filler_help:            PFX + 'definition.filler_help',
  def_filler_help_ph:         PFX + 'definition.filler_help_placeholder',
  def_captcha:                PFX + 'definition.captcha',
  def_captcha_helper:         PFX + 'definition.captcha_helper',

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

  // «Andere …», unsichtbares Feld, pre-fill lock (1.125 B, spec §8, §8.1, §9)
  field_allow_other:          PFX + 'field.allow_other',
  field_allow_other_blocked:  PFX + 'field.allow_other_blocked',
  field_lock_prefilled:       PFX + 'field.lock_prefilled',
  field_value_type:           PFX + 'field.value_type',
  field_default_value:        PFX + 'field.default_value',
  field_default_invalid:      PFX + 'field.default_invalid',
  field_from_link:            PFX + 'field.from_link',
  field_from_link_helper:     PFX + 'field.from_link_helper',
  field_other_option:         PFX + 'field.other_option',
  field_other_placeholder:    PFX + 'field.other_placeholder',
  field_invisible:            PFX + 'field.invisible',
  fieldtype_implicit:         PFX + 'fieldtype.implicit',
  fieldtype_implicit_desc:    PFX + 'fieldtype.implicit_desc',
  fields_other_key_clash:     PFX + 'fields.other_key_clash',
  fields_other_not_allowed:   PFX + 'fields.other_not_allowed',
  fields_implicit_ssn:        PFX + 'fields.implicit_ssn',

  // the course choice (1.152, spec §4.3)
  fieldtype_course:           PFX + 'fieldtype.course',
  fieldtype_course_desc:      PFX + 'fieldtype.course_desc',
  field_audience_from:        PFX + 'field.audience_from',
  field_audience_from_helper: PFX + 'field.audience_from_helper',
  field_audience_from_none:   PFX + 'field.audience_from_none',
  field_course_hint:          PFX + 'field.course_hint',
  field_course_places:        PFX + 'field.course_places',
  field_course_places_one:    PFX + 'field.course_places_one',
  field_course_full:          PFX + 'field.course_full',
  field_course_unavailable:   PFX + 'field.course_unavailable',
  fields_course_field_once:   PFX + 'fields.course_field_once',
  fields_course_field_mapping: PFX + 'fields.course_field_mapping',
  fields_course_audience_from_missing: PFX + 'fields.course_audience_from_missing',

  // person / org / resource pickers (free text allowed, as in the Logbuch)
  fieldtype_person:           PFX + 'fieldtype.person',
  fieldtype_person_desc:      PFX + 'fieldtype.person_desc',
  fieldtype_org:              PFX + 'fieldtype.org',
  fieldtype_org_desc:         PFX + 'fieldtype.org_desc',
  fieldtype_resource:         PFX + 'fieldtype.resource',
  fieldtype_resource_desc:    PFX + 'fieldtype.resource_desc',
  field_filter:               PFX + 'field.filter',
  field_filter_helper:        PFX + 'field.filter_helper',
  field_allow_custom:         PFX + 'field.allow_custom',
  field_allow_custom_helper:  PFX + 'field.allow_custom_helper',
  field_pick:                 PFX + 'field.pick',
  field_pick_search:          PFX + 'field.pick_search',
  field_pick_custom:          PFX + 'field.pick_custom',
  field_pick_clear:           PFX + 'field.pick_clear',
  field_pick_none:            PFX + 'field.pick_none',

  // «Nach dem Absenden» card (spec §10)
  after_title:                PFX + 'after.title',
  after_message:              PFX + 'after.message',
  after_message_helper:       PFX + 'after.message_helper',
  after_variants:             PFX + 'after.variants',
  after_variant_add:          PFX + 'after.variant_add',
  after_variant_remove:       PFX + 'after.variant_remove',
  after_variant_when:         PFX + 'after.variant_when',
  after_variant_message:      PFX + 'after.variant_message',
  after_send_mail:            PFX + 'after.send_mail',
  after_send_mail_hint:       PFX + 'after.send_mail_hint',
  after_mail_needs_email:     PFX + 'after.mail_needs_email',
  after_application_hint:     PFX + 'after.application_hint',

  // «Annahme» card and the closed / remaining texts of the public form (spec §11)
  accept_title:               PFX + 'accept.title',
  accept_open:                PFX + 'accept.open',
  accept_closes_at:           PFX + 'accept.closes_at',
  accept_max:                 PFX + 'accept.max',
  accept_max_helper:          PFX + 'accept.max_helper',
  accept_max_invalid:         PFX + 'accept.max_invalid',
  accept_closes_invalid:      PFX + 'accept.closes_invalid',
  accept_show_remaining:      PFX + 'accept.show_remaining',
  accept_closed_text:         PFX + 'accept.closed_text',
  accept_count:               PFX + 'accept.count',
  accept_inherit:             PFX + 'accept.inherit',
  closed_default:             PFX + 'accept.closed_default',
  remaining:                  PFX + 'accept.remaining',
  remaining_one:              PFX + 'accept.remaining_one',

  // pre-filled link in the builder preview (spec §8)
  preview_link:               PFX + 'builder.preview_link',
  preview_no_page:            PFX + 'builder.preview_no_page',
  preview_link_copied:        PFX + 'builder.preview_link_copied',
  preview_link_personal:      PFX + 'builder.preview_link_personal',

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
  fields_duplicate_keys:      PFX + 'fields.duplicate_keys',
  fields_ssn_placement:       PFX + 'fields.ssn_placement',

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

  // field types of the builder library that carry a translated name
  fieldtype_ssn:              PFX + 'fieldtype.ssn',
  fieldtype_ssn_desc:         PFX + 'fieldtype.ssn_desc',

  // typed properties (spec §4.4)
  property_boolean:           PFX + 'property.boolean',
  property_number:            PFX + 'property.number',
  property_text:              PFX + 'property.text',
  property_group:             PFX + 'property.group',
  property_template_text:     PFX + 'property.template_text',
  property_template_boolean:  PFX + 'property.template_boolean',
  property_template_number:   PFX + 'property.template_number',
  property_template_desc:     PFX + 'property.template_desc',

  // (i) help for form authors and form fillers (1.125, spec §17)
  help_open:                  PFX + 'info.open',
  help_editor_title:          PFX + 'info.editor_title',
  help_editor_fields:         PFX + 'info.editor_fields',
  help_editor_conditions:     PFX + 'info.editor_conditions',
  help_editor_several:        PFX + 'info.editor_several',
  help_editor_blocks:         PFX + 'info.editor_blocks',
  help_editor_hidden:         PFX + 'info.editor_hidden',
  help_editor_order:          PFX + 'info.editor_order',
  help_editor_derived:        PFX + 'info.editor_derived',
  help_editor_properties:     PFX + 'info.editor_properties',
  help_editor_implicit:       PFX + 'info.editor_implicit',
  help_editor_prefill:        PFX + 'info.editor_prefill',
  help_editor_other:          PFX + 'info.editor_other',
  help_editor_after:          PFX + 'info.editor_after',
  help_editor_limit:          PFX + 'info.editor_limit',
  help_editor_preview:        PFX + 'info.editor_preview',
  help_filler_title:          PFX + 'info.filler_title',
  help_filler_required:       PFX + 'info.filler_required',
  help_filler_conditions:     PFX + 'info.filler_conditions',
  help_filler_prefilled:      PFX + 'info.filler_prefilled',
  help_filler_limit:          PFX + 'info.filler_limit',
  help_filler_mail:           PFX + 'info.filler_mail',
  help_filler_privacy:        PFX + 'info.filler_privacy',

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
