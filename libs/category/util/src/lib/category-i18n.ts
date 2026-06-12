import { Signal } from '@angular/core';

const PFX = '@category/feature.';

export const CATEGORY_I18N_KEYS = {
  category:                 PFX + 'category',
  categories:               PFX + 'categories',
  description:              PFX + 'description',
  empty:                    PFX + 'empty',

  all_label:                PFX + 'all.label',
  all_description:          PFX + 'all.description',

  undefined_label:          PFX + 'undefined.label',
  undefined_description:    PFX + 'undefined.description',

  archived_label:           PFX + 'archived.label',
  archived_description:     PFX + 'archived.description',

  create:                   PFX + 'create.label',
  create_conf:              PFX + 'create.conf',
  create_error:             PFX + 'create.error',

  delete:                   PFX + 'delete.label',
  delete_confirm:           PFX + 'delete.confirm',
  delete_conf:              PFX + 'delete.conf',
  delete_error:             PFX + 'delete.error',

  update:                   PFX + 'update.label',
  update_conf:              PFX + 'update.conf',
  update_error:             PFX + 'update.error',

  select:                   PFX + 'select.label',
  view:                     PFX + 'view.label',

  as_title:                 '@actionsheet.title',
  ok:                       '@ok',
  cancel:                   '@cancel',
  save:                     '@save.label',

  bkey_label:               PFX + 'bkey.label',
  bkey_placeholder:         PFX + 'bkey.placeholder',
  bkey_helper:              PFX + 'bkey.helper',

  name_label:               PFX + 'name.label',
  name_placeholder:         PFX + 'name.placeholder',
  name_error:               PFX + 'name.error',
  name_helper:              PFX + 'name.helper',

  i18nBase_label:           PFX + 'i18n.label',
  i18nBase_placeholder:     PFX + 'i18n.placeholder',
  i18nBase_helper:          PFX + 'i18n.helper',

  notes_label:              PFX + 'notes.label',
  notes_placeholder:        PFX + 'notes.placeholder',

  items_label:              PFX + 'items.label',
  items_description:        PFX + 'items.description',
  items_empty:              PFX + 'items.empty',

  priority:                 PFX + 'priority.label',
  priority_label:           PFX + 'priority.label',
  priority_helper:          PFX + 'priority.helper',
  priority_all_label:       PFX + 'priority.all.label',
  priority_low_label:       PFX + 'priority.low.label',
  priority_low_description: PFX + 'priority.low.description',
  priority_medium_label:       PFX + 'priority.medium.label',
  priority_medium_description: PFX + 'priority.medium.description',
  priority_high_label:       PFX + 'priority.high.label',
  priority_high_description: PFX + 'priority.high.description',

  model_type:               PFX + 'model_type.name',
  model_type_all:           PFX + 'model_type.all.label',

  model_type_account_label:           PFX + 'model_type.account.label',
  model_type_account_description:     PFX + 'model_type.account.description',
  model_type_account_placeholder:     PFX + 'model_type.account.placeholder',

  model_type_address_label:           PFX + 'model_type.address.label',
  model_type_address_description:     PFX + 'model_type.address.description',
  model_type_address_placeholder:     PFX + 'model_type.address.placeholder',

  model_type_avatar_label:            PFX + 'model_type.avatar.label',
  model_type_avatar_description:      PFX + 'model_type.avatar.description',
  model_type_avatar_placeholder:      PFX + 'model_type.avatar.placeholder',

  model_type_bill_label:              PFX + 'model_type.bill.label',
  model_type_bill_description:        PFX + 'model_type.bill.description',
  model_type_bill_placeholder:        PFX + 'model_type.bill.placeholder',

  model_type_comment_label:           PFX + 'model_type.comment.label',
  model_type_comment_description:     PFX + 'model_type.comment.description',
  model_type_comment_placeholder:     PFX + 'model_type.comment.placeholder',

  model_type_competitionLevel_label:       PFX + 'model_type.competitionLevel.label',
  model_type_competitionLevel_description: PFX + 'model_type.competitionLevel.description',
  model_type_competitionLevel_placeholder: PFX + 'model_type.competitionLevel.placeholder',

  model_type_document_label:           PFX + 'model_type.document.label',
  model_type_document_description:     PFX + 'model_type.document.description',
  model_type_document_placeholder:     PFX + 'model_type.document.placeholder',

  model_type_expense_label:           PFX + 'model_type.expense.label',
  model_type_expense_description:     PFX + 'model_type.expense.description',
  model_type_expense_placeholder:     PFX + 'model_type.expense.placeholder',

  model_type_group_label:           PFX + 'model_type.group.label',
  model_type_group_description:     PFX + 'model_type.group.description',
  model_type_group_placeholder:     PFX + 'model_type.group.placeholder',

  model_type_invoice_label:           PFX + 'model_type.invoice.label',
  model_type_invoice_description:     PFX + 'model_type.invoice.description',
  model_type_invoice_placeholder:     PFX + 'model_type.invoice.placeholder',

  model_type_invoicePosition_label:           PFX + 'model_type.invoicePosition.label',
  model_type_invoicePosition_description:     PFX + 'model_type.invoicePosition.description',
  model_type_invoicePosition_placeholder:     PFX + 'model_type.invoicePosition.placeholder',

  model_type_location_label:           PFX + 'model_type.location.label',
  model_type_location_description:     PFX + 'model_type.location.description',
  model_type_location_placeholder:     PFX + 'model_type.location.placeholder',

  model_type_membership_label:           PFX + 'model_type.membership.label',
  model_type_membership_description:     PFX + 'model_type.membership.description',
  model_type_membership_placeholder:     PFX + 'model_type.membership.placeholder',

  model_type_menuItem_label:           PFX + 'model_type.menuItem.label',
  model_type_menuItem_description:     PFX + 'model_type.menuItem.description',
  model_type_menuItem_placeholder:     PFX + 'model_type.menuItem.placeholder',

  model_type_org_label:           PFX + 'model_type.org.label',
  model_type_org_description:     PFX + 'model_type.org.description',
  model_type_org_placeholder:     PFX + 'model_type.org.placeholder',

  model_type_ownership_label:           PFX + 'model_type.ownership.label',
  model_type_ownership_description:     PFX + 'model_type.ownership.description',
  model_type_ownership_placeholder:     PFX + 'model_type.ownership.placeholder',

  model_type_page_label:           PFX + 'model_type.page.label',
  model_type_page_description:     PFX + 'model_type.page.description',
  model_type_page_placeholder:     PFX + 'model_type.page.placeholder',

  model_type_person_label:           PFX + 'model_type.person.label',
  model_type_person_description:     PFX + 'model_type.person.description',
  model_type_person_placeholder:     PFX + 'model_type.person.placeholder',

  model_type_personalRel_label:           PFX + 'model_type.personalRel.label',
  model_type_personalRel_description:     PFX + 'model_type.personalRel.description',
  model_type_personalRel_placeholder:     PFX + 'model_type.personalRel.placeholder',

  model_type_reservation_label:           PFX + 'model_type.reservation.label',
  model_type_reservation_description:     PFX + 'model_type.reservation.description',
  model_type_reservation_placeholder:     PFX + 'model_type.reservation.placeholder',

  model_type_resource_label:           PFX + 'model_type.resource.label',
  model_type_resource_description:     PFX + 'model_type.resource.description',
  model_type_resource_placeholder:     PFX + 'model_type.resource.placeholder',

  model_type_responsibility_label:           PFX + 'model_type.responsibility.label',
  model_type_responsibility_description:     PFX + 'model_type.responsibility.description',
  model_type_responsibility_placeholder:     PFX + 'model_type.responsibility.placeholder',

  model_type_section_label:           PFX + 'model_type.section.label',
  model_type_section_description:     PFX + 'model_type.section.description',
  model_type_section_placeholder:     PFX + 'model_type.section.placeholder',

  model_type_transfer_label:           PFX + 'model_type.transfer.label',
  model_type_transfer_description:     PFX + 'model_type.transfer.description',
  model_type_transfer_placeholder:     PFX + 'model_type.transfer.placeholder',

  model_type_trip_label:           PFX + 'model_type.trip.label',
  model_type_trip_description:     PFX + 'model_type.trip.description',
  model_type_trip_placeholder:     PFX + 'model_type.trip.placeholder',

  model_type_user_label:           PFX + 'model_type.user.label',
  model_type_user_description:     PFX + 'model_type.user.description',
  model_type_user_placeholder:     PFX + 'model_type.user.placeholder',

  model_type_workrel_label:           PFX + 'model_type.workrel.label',
  model_type_workrel_description:     PFX + 'model_type.workrel.description',
  model_type_workrel_placeholder:     PFX + 'model_type.workrel.placeholder',

  model_type_category_label:           PFX + 'model_type.category.label',
  model_type_category_description:     PFX + 'model_type.category.description',
  model_type_category_placeholder:     PFX + 'model_type.category.placeholder',

  model_type_calevent_label:           PFX + 'model_type.calevent.label',
  model_type_calevent_description:     PFX + 'model_type.calevent.description',
  model_type_calevent_placeholder:     PFX + 'model_type.calevent.placeholder',

  model_type_task_label:           PFX + 'model_type.task.label',
  model_type_task_description:     PFX + 'model_type.task.description',
  model_type_task_placeholder:     PFX + 'model_type.task.placeholder'

} satisfies Record<string, string>;

export type CategoryI18n = { [K in keyof typeof CATEGORY_I18N_KEYS]: Signal<string> };
