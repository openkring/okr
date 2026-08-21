import { staticSuite, only, test, enforce } from 'vest';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { AvatarInfo } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';

/** What a damage / bug report collects before it becomes a task. */
export interface TripReport {
  /** the boat the report is about; prefilled from the trip, unset for a report without a trip */
  boat?: AvatarInfo;
  /** who reports it; prefilled with the current user, unset on the kiosk (a shared account) */
  person?: AvatarInfo;
  /** the free-text description of the damage or the bug */
  message: string;
}

export function newTripReport(boat?: AvatarInfo, person?: AvatarInfo): TripReport {
  return { boat, person, message: '' };
}

export const tripReportValidations = staticSuite((report: TripReport, field?: string) => {
  if (field) only(field);

  // the boat is optional: a bug report (or a damage found outside a trip) has no boat
  // mandatory: the kiosk is a shared account, so the report must say who is reporting
  test('person', '@geo/trip/feature.report.person.required', () => {
    enforce(report.person?.key).isNotBlank();
  });
  stringValidations('message', report.message, DESCRIPTION_LENGTH, 0, true);
});
