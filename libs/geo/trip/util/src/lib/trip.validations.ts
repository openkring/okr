import { enforce, only, staticSuite, test } from 'vest';

import { TripModel } from '@bk2/shared-models';

export const tripValidationSuite = staticSuite((trip: TripModel, field?: string) => {
  if (field) only(field);

  test('resource', '@trip/field.boat', () => {
    enforce(trip.resource?.key).isNotBlank();
  });

  test('participants', '@trip/field.participants', () => {
    enforce(trip.participants.length).greaterThan(0);
  });
});
