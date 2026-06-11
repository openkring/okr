import { enforce, only, staticSuite, test } from 'vest';

import { TripModel } from '@bk2/shared-models';
import { dateValidations, timeValidations } from '@bk2/shared-util-core';

export const tripValidationSuite = staticSuite((trip: TripModel, field?: string) => {
  if (field) only(field);

  dateValidations('startDate', trip.startDate);
  timeValidations('startTime', trip.startTime);

  test('resource', '@trip/field.boat', () => {
    enforce(trip.resource?.key).isNotBlank();
  });

  test('locations', '@geo/trip/feature.location.none_selected', () => {
    const hasLocation = (trip.locations ?? []).length > 0;
    const hasCustom = (trip.customLocationLabel ?? '').length > 0;
    enforce(hasLocation || hasCustom).equals(true);
  });

  test('distance', '@geo/trip/feature.warning.distance_zero', () => {
    enforce(trip.distance).greaterThan(0);
  });

  test('participants', '@trip/field.participants', () => {
    enforce((trip.participants ?? []).length).greaterThan(0);
  });

  test('participants', '@geo/trip/feature.warning.seats_mismatch', () => {
    const seats: number = (trip.resource as any)?.seats ?? 0;
    if (seats === 0) return;
    const count = (trip.participants ?? []).length;
    if (seats < 4) {
      enforce(count).equals(seats);
    } else {
      enforce(count === seats || count === seats - 1).equals(true);
    }
  });
});
