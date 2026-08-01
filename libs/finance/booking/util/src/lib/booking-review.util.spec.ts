import { describe, expect, it } from 'vitest';

import { BookingModel, BookingStatus, UserModel } from '@okr/shared-models';

import { canReviewBooking, isForReview } from './booking-review.util';

function booking(status: BookingStatus): BookingModel {
  const b = new BookingModel('t1', 'org1');
  b.status = status;
  return b;
}

function user(roles: Record<string, boolean>): UserModel {
  const u = new UserModel('t1');
  u.roles = roles;
  return u;
}

describe('canReviewBooking', () => {
  it('allows a treasurer on a forReview booking', () => {
    expect(canReviewBooking(booking('forReview'), user({ treasurer: true }))).toBe(true);
  });

  it('allows an admin (hasRole resolves admin as treasurer)', () => {
    expect(canReviewBooking(booking('forReview'), user({ admin: true }))).toBe(true);
  });

  it('refuses a member without the role', () => {
    expect(canReviewBooking(booking('forReview'), user({ member: true }))).toBe(false);
  });

  it('refuses an unknown user', () => {
    expect(canReviewBooking(booking('forReview'), undefined)).toBe(false);
  });

  it.each<BookingStatus>(['draft', 'posted', 'cancelled'])('refuses a %s booking', (status) => {
    expect(canReviewBooking(booking(status), user({ treasurer: true }))).toBe(false);
  });

  it('refuses when the ledger is externally managed', () => {
    expect(canReviewBooking(booking('forReview'), user({ treasurer: true }), true)).toBe(false);
  });
});

describe('isForReview', () => {
  it('is true only for forReview', () => {
    expect(isForReview(booking('forReview'))).toBe(true);
    expect(isForReview(booking('posted'))).toBe(false);
  });
});
