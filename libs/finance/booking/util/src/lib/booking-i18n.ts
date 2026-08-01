import { Signal } from '@angular/core';

const PFX = '@finance/booking/feature.';

export const BOOKING_I18N_KEYS = {
  list_title:                  PFX + 'list.title',
  empty:                       PFX + 'empty',
  as_title:                    PFX + 'as.title',
  cancel:                      PFX + 'cancel.label',
  col_date:                    PFX + 'col.date',
  col_credit:                  PFX + 'col.credit',
  col_debit:                   PFX + 'col.debit',
  col_name:                    PFX + 'col.name',
  col_amount:                  PFX + 'col.amount',
  view:                        PFX + 'view.label',
  edit:                        PFX + 'edit.label',
  create:                      PFX + 'create.label',
  delete:                      PFX + 'delete.label',
  action_createReceipt:        PFX + 'action.createReceipt',
  action_counterpartyRequired: PFX + 'action.counterpartyRequired',
  action_noAddress:            PFX + 'action.noAddress',
  action_failed:               PFX + 'action.failed',
  read_only_banner:            PFX + 'readonly.banner',
  // treasurer review of forReview bookings (OCR pipeline, spec 1.20)
  review_approve:              PFX + 'review.approve',
  review_correct:              PFX + 'review.correct',
  review_reject:               PFX + 'review.reject',
  review_reason_title:         PFX + 'review.reason.title',
  review_reason_placeholder:   PFX + 'review.reason.placeholder',
  review_badge:                PFX + 'review.badge',
  review_approved:             PFX + 'review.approved',
  review_rejected:             PFX + 'review.rejected',
  review_failed:               PFX + 'review.failed',
  // status labels double as the okr-list-filter category labels — getItemLabel builds
  // `${i18n}.${category.name}.${item.name}.label`, so the '.label' suffix is mandatory here.
  status_draft:                PFX + 'status.draft.label',
  status_forReview:            PFX + 'status.forReview.label',
  status_posted:               PFX + 'status.posted.label',
  status_cancelled:            PFX + 'status.cancelled.label',
} satisfies Record<string, string>;

export type BookingI18n = { [K in keyof typeof BOOKING_I18N_KEYS]: Signal<string> };
