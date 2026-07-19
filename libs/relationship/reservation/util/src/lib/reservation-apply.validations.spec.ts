import { describe, expect, it } from 'vitest';

import { NAME_LENGTH } from '@okr/shared-constants';
import { ReservationApplyModel } from '@okr/shared-models';
import { newAvatarInfo } from '@okr/shared-util-core';

import { reservationApplyValidations } from './reservation-apply.validations';

/**
 * Builds the model exactly as the apply modal + form produce it: seeded by
 * getNewReservationApply (reserver/resource avatars) and then filled in by the user
 * through the fields the form actually renders.
 */
function filledApply(): ReservationApplyModel {
  const model = new ReservationApplyModel();
  model.reserver = newAvatarInfo('p4Xk9QmZ7bTr2WsLd8Nc', 'Bruno', 'Kaiser', 'person', '', '', '');
  model.resource = newAvatarInfo('scs_default', '', 'Bootshaus', 'resource', 'realestate', '', '');
  model.name = 'Geburtstagsfest';
  model.startDate = '20260815';
  model.startTime = '18:00';
  model.durationMinutes = 240;
  model.reason = 'social';
  model.participants = '40';
  model.area = 'Wiese';
  model.description = 'Grillfest';
  model.isConfirmed = true;
  return model;
}

describe('reservationApplyValidations', () => {
  it('accepts a fully filled, confirmed application', () => {
    const result = reservationApplyValidations(filledApply());
    // print every failing field so the cause is visible when this fails
    expect(result.getErrors()).toEqual({});
    expect(result.isValid()).toBe(true);
  });

  it('rejects a missing name', () => {
    const model = filledApply();
    model.name = '';
    expect(reservationApplyValidations(model).getErrors()).toEqual({ name: ['required'] });
  });

  it('rejects a name shorter than 5 characters', () => {
    const model = filledApply();
    model.name = 'Fest';
    expect(reservationApplyValidations(model).getErrors()).toEqual({ name: ['tooShort'] });
  });

  it('accepts a name up to NAME_LENGTH, matching the maxLength of the input field', () => {
    const model = filledApply();
    model.name = 'Geburtstagsfest von Bruno Kaiser';  // 32 chars — rejected while the suite used SHORT_NAME_LENGTH
    expect(reservationApplyValidations(model).isValid()).toBe(true);

    model.name = 'x'.repeat(NAME_LENGTH);
    expect(reservationApplyValidations(model).isValid()).toBe(true);
  });

  it('rejects a name longer than NAME_LENGTH', () => {
    const model = filledApply();
    model.name = 'x'.repeat(NAME_LENGTH + 1);
    expect(reservationApplyValidations(model).getErrors()).toEqual({ name: ['tooLong'] });
  });

  it('does not block on the reserver/resource avatars, which the form cannot edit', () => {
    const model = filledApply();
    model.reserver = undefined;
    model.resource = undefined;
    expect(reservationApplyValidations(model).isValid()).toBe(true);
  });

  it('requires the contract confirmation checkbox', () => {
    const model = filledApply();
    model.isConfirmed = false;
    expect(reservationApplyValidations(model).getErrors()).toEqual({ isConfirmed: ['invalidValue'] });
  });
});
