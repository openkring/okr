import { enforce, only, staticSuite, test } from 'vest';

import { stringValidations } from '@okr/shared-util-core';

import { BookingFormData } from './booking.util';

const PFX = '@finance/booking/feature.validation.';

/** The booking form: a title, a StoreDate, and at least one complete debit/credit pair. */
export const bookingValidations = staticSuite(
  (model: BookingFormData, tenants: string, tags: string, field?: string) => {
    if (field) only(field);

    stringValidations('title', model.title, 100, 1, true);
    test('date', PFX + 'date', () => {
      enforce(/^\d{8}$/.test(model.date ?? '')).isTruthy();
    });
    test('pairs', PFX + 'pairsEmpty', () => {
      enforce((model.pairs ?? []).length > 0).isTruthy();
    });
    test('pairs', PFX + 'pairsIncomplete', () => {
      enforce((model.pairs ?? []).every(p => p.debitAccountKey && p.creditAccountKey && p.debitAccountKey !== p.creditAccountKey && p.amount > 0)).isTruthy();
    });
  });
