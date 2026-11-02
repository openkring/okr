import { Signal } from '@angular/core';

const PFX = '@calendar/course/feature.';

export const COURSE_I18N_KEYS = {
  course:  PFX + 'course',
  courses: PFX + 'courses',
  empty:   PFX + 'empty',

  // list
  list_open:           PFX + 'list.open',
  list_edit:           PFX + 'list.edit',
  list_view:           PFX + 'list.view',
  list_archive:        PFX + 'list.archive',
  list_cancel:         PFX + 'list.cancel',
  list_archiveConfirm: PFX + 'list.archiveConfirm',
  list_noGroup:        PFX + 'list.noGroup',
  list_csvFile:        PFX + 'list.csvFile',
  list_financeUnavailable: PFX + 'list.financeUnavailable',
  list_col_name:        PFX + 'list.col.name',
  list_col_period:      PFX + 'list.col.period',
  list_col_responsible: PFX + 'list.col.responsible',
  list_col_trainers:    PFX + 'list.col.trainers',
  list_col_status:      PFX + 'list.col.status',
  list_status_locked:   PFX + 'list.status.locked',
  list_status_reported: PFX + 'list.status.reported',

  // yearly overview (spec 1.132 §7.7)
  yearly_title: PFX + 'yearly.title',
  yearly_intro: PFX + 'yearly.intro',
  yearly_empty: PFX + 'yearly.empty',
  yearly_error: PFX + 'yearly.error',
  yearly_sum:   PFX + 'yearly.sum',

  // edit modal
  edit_create: PFX + 'edit.create',
  edit_update: PFX + 'edit.update',
  edit_view:   PFX + 'edit.view',
  changeConfirmation_cancel: PFX + 'changeConfirmation.cancel',
  changeConfirmation_ok:     PFX + 'changeConfirmation.ok',

  // course form
  form_attributes:         PFX + 'form.attributes',
  form_name_label:         PFX + 'form.name.label',
  form_name_placeholder:   PFX + 'form.name.placeholder',
  form_name_helper:        PFX + 'form.name.helper',
  form_group_label:        PFX + 'form.group.label',
  form_group_helper:       PFX + 'form.group.helper',
  form_startDate_label:       PFX + 'form.startDate.label',
  form_startDate_placeholder: PFX + 'form.startDate.placeholder',
  form_endDate_label:         PFX + 'form.endDate.label',
  form_endDate_placeholder:   PFX + 'form.endDate.placeholder',
  form_responsible_title:       PFX + 'form.responsible.title',
  form_responsible_description: PFX + 'form.responsible.description',
  form_trainers_title:          PFX + 'form.trainers.title',
  form_trainers_description:    PFX + 'form.trainers.description',
  form_person_add:              PFX + 'form.person.add',

  // report profile
  form_report_title:      PFX + 'form.report.title',
  form_profile_label:     PFX + 'form.profile.label',
  form_profile_helper:    PFX + 'form.profile.helper',
  profile_none:           PFX + 'profile.none',
  profile_generic:        PFX + 'profile.generic',
  profile_js:             PFX + 'profile.js',
  form_courseNumber_label:       PFX + 'form.courseNumber.label',
  form_courseNumber_placeholder: PFX + 'form.courseNumber.placeholder',
  form_courseNumber_helper:      PFX + 'form.courseNumber.helper',
  form_userGroup_label:   PFX + 'form.userGroup.label',
  form_userGroup_helper:  PFX + 'form.userGroup.helper',
  form_category_label:    PFX + 'form.category.label',
  form_category_helper:   PFX + 'form.category.helper',
  category_abs1:          PFX + 'category.abs1',
  category_abs2:          PFX + 'category.abs2',
  form_typeMapping_title:       PFX + 'form.typeMapping.title',
  form_typeMapping_description: PFX + 'form.typeMapping.description',
  form_typeMapping_none:        PFX + 'form.typeMapping.none',

  // finance form
  finance_title:          PFX + 'finance.title',
  finance_intro:          PFX + 'finance.intro',
  finance_books_label:    PFX + 'finance.books.label',
  finance_books_helper:   PFX + 'finance.books.helper',
  finance_books_none:     PFX + 'finance.books.none',
  finance_account_label:  PFX + 'finance.account.label',
  finance_account_helper: PFX + 'finance.account.helper',
  finance_costCenter_label:  PFX + 'finance.costCenter.label',
  finance_costCenter_helper: PFX + 'finance.costCenter.helper',
  finance_defaultRate_label:  PFX + 'finance.defaultRate.label',
  finance_defaultRate_helper: PFX + 'finance.defaultRate.helper',
  finance_eligible_title:       PFX + 'finance.eligible.title',
  finance_eligible_description: PFX + 'finance.eligible.description',
  finance_ownRate_label:  PFX + 'finance.ownRate.label',
  finance_ownRate_helper: PFX + 'finance.ownRate.helper',
  finance_ownRate_amount: PFX + 'finance.ownRate.amount',

  // validation messages (the Vest suites emit these keys literally, see course.validations.ts)
  validation_endBeforeStart:      PFX + 'validation.endBeforeStart',
  validation_responsibleRequired: PFX + 'validation.responsibleRequired',
  validation_jsPairInvalid:       PFX + 'validation.jsPairInvalid',
  validation_booksRequired:       PFX + 'validation.booksRequired',
  validation_booksUnknown:        PFX + 'validation.booksUnknown',
  validation_rateInvalid:         PFX + 'validation.rateInvalid',
  validation_duplicatePerson:     PFX + 'validation.duplicatePerson',
  validation_personRequired:      PFX + 'validation.personRequired',
} satisfies Record<string, string>;

export type CourseI18n = { [K in keyof typeof COURSE_I18N_KEYS]: Signal<string> };
