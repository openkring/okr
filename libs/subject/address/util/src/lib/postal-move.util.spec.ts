import '@angular/compiler';
import { describe, it, expect } from 'vitest';

import { AddressModel, UserModel } from '@okr/shared-models';
import {
  canWritePostal, checkEditMove, checkMove, hiddenInAccordion, moveActionKind, postalMoveErrorKind, postalTarget, predecessorOf, residenceDateLabel, usageOf,
} from './postal-move.util';
import { newPostalMoveFormModel } from './postal-move.validations';

const TODAY = '20261119';

function user(personKey: string, roles: Record<string, boolean> = {}): UserModel {
  const u = new UserModel('scs');
  u.personKey = personKey;
  u.roles = roles;
  return u;
}

function postal(okey: string, validFrom = '', validTo = '', addressUsage = 'home'): AddressModel {
  const a = new AddressModel('scs');
  a.okey = okey;
  a.parentKey = 'person.p1';
  a.addressChannel = 'postal';
  a.addressUsage = addressUsage;
  a.validFrom = validFrom;
  a.validTo = validTo;
  return a;
}

describe('canWritePostal', () => {
  it('lets the owner write their own postal address', () => {
    expect(canWritePostal(user('p1'), 'person.p1')).toBe(true);
  });

  it('lets privileged, admin and memberAdmin write any postal address', () => {
    expect(canWritePostal(user('x', { privileged: true }), 'person.p1')).toBe(true);
    expect(canWritePostal(user('x', { admin: true }), 'org.o1')).toBe(true);
    expect(canWritePostal(user('x', { memberAdmin: true }), 'person.p1')).toBe(true);
  });

  it('denies a group admin, a contentAdmin and a plain member on someone else', () => {
    expect(canWritePostal(user('x', { groupAdmin: true }), 'person.p1')).toBe(false);
    expect(canWritePostal(user('x', { contentAdmin: true }), 'person.p1')).toBe(false);
    expect(canWritePostal(user('x', { registered: true }), 'person.p1')).toBe(false);
  });

  it('decides on the roles alone for a parent that does not exist yet', () => {
    expect(canWritePostal(user('x'), '')).toBe(false);
    expect(canWritePostal(user('x', { memberAdmin: true }), '')).toBe(true);
  });

  it('denies a missing user', () => {
    expect(canWritePostal(undefined, 'person.p1')).toBe(false);
  });
});

describe('moveActionKind', () => {
  it('is own for the owner, org for an org, other for someone else', () => {
    expect(moveActionKind(user('p1'), 'person.p1')).toBe('own');
    expect(moveActionKind(user('p1', { memberAdmin: true }), 'org.o1')).toBe('org');
    expect(moveActionKind(user('p1', { memberAdmin: true }), 'person.p2')).toBe('other');
  });
});

describe('hiddenInAccordion', () => {
  it('hides past and archived postal rows', () => {
    expect(hiddenInAccordion(postal('a', '', '20261118'), TODAY)).toBe(true);
    expect(hiddenInAccordion({ ...postal('a'), isArchived: true } as AddressModel, TODAY)).toBe(true);
  });

  it('shows current and future postal rows and every other channel', () => {
    expect(hiddenInAccordion(postal('a', '', '20261119'), TODAY)).toBe(false);
    expect(hiddenInAccordion(postal('a', '20270301'), TODAY)).toBe(false);
    const email = new AddressModel('scs');
    email.addressChannel = 'email';
    email.validTo = '20200101';
    expect(hiddenInAccordion(email, TODAY)).toBe(false);
  });
});

describe('residenceDateLabel', () => {
  it('marks a future row with its start', () => {
    expect(residenceDateLabel(postal('b', '20270301'), TODAY)).toEqual({ kind: 'from', date: '20270301' });
  });

  it('marks a current row that is being replaced with its end', () => {
    expect(residenceDateLabel(postal('a', '', '20270228'), TODAY)).toEqual({ kind: 'until', date: '20270228' });
  });

  it('has no label for an open current row or another channel', () => {
    expect(residenceDateLabel(postal('a', '20200101'), TODAY)).toBeUndefined();
    const email = new AddressModel('scs');
    email.addressChannel = 'email';
    email.validFrom = '20270301';
    expect(residenceDateLabel(email, TODAY)).toBeUndefined();
  });
});

describe('predecessorOf', () => {
  it('finds the row of the same usage that ends the day before', () => {
    const old = postal('a', '', '20270228');
    const work = postal('w', '', '20270228', 'work');
    const next = postal('b', '20270301');
    expect(predecessorOf(next, [work, old, next])?.okey).toBe('a');
  });

  it('is undefined without such a row', () => {
    const next = postal('b', '20270301');
    expect(predecessorOf(next, [postal('a', '', '20270227'), next])).toBeUndefined();
    expect(predecessorOf(postal('c'), [postal('a')])).toBeUndefined();
  });

  it('treats a missing or empty usage as home, like the server', () => {
    const legacy = postal('a', '', '20270228', undefined as unknown as string);
    const empty = postal('e', '', '20270228', '');
    expect(predecessorOf(postal('b', '20270301', '', 'home'), [legacy])?.okey).toBe('a');
    expect(predecessorOf(postal('b', '20270301', '', 'home'), [empty])?.okey).toBe('e');
    expect(predecessorOf(postal('b', '20270301', '', ''), [postal('h', '', '20270228', 'home')])?.okey).toBe('h');
    expect(usageOf({ addressUsage: '' })).toBe('home');
  });

  it('ignores archived rows', () => {
    const old = { ...postal('a', '', '20270228'), isArchived: true } as AddressModel;
    expect(predecessorOf(postal('b', '20270301'), [old])).toBeUndefined();
  });
});

describe('postalTarget', () => {
  it('sends the chosen hit', () => {
    const model = newPostalMoveFormModel('20270301');
    model.hit = { egaid: '1', streetName: 'A', streetNumber: '1', zipCode: '8000', city: 'Z', latitude: 0, longitude: 0, label: 'A 1 8000 Z' };
    expect(postalTarget(model)).toEqual({ hit: model.hit });
  });

  it('sends the manual fields, trimmed, with the form country', () => {
    const model = newPostalMoveFormModel('20270301', 'de');
    model.manual = { streetName: ' Hauptstr ', streetNumber: '1 ', zipCode: '80331', city: 'München', countryCode: '' };
    expect(postalTarget(model)).toEqual({ manual: { streetName: 'Hauptstr', streetNumber: '1', zipCode: '80331', city: 'München', countryCode: 'DE' } });
  });
});

describe('postalMoveErrorKind', () => {
  it('maps callable error codes', () => {
    expect(postalMoveErrorKind({ code: 'functions/invalid-argument' })).toBe('invalid');
    expect(postalMoveErrorKind({ code: 'functions/permission-denied' })).toBe('permission');
    expect(postalMoveErrorKind({ code: 'functions/failed-precondition' })).toBe('notFound');
    expect(postalMoveErrorKind({ code: 'functions/not-found' })).toBe('notFound');
    expect(postalMoveErrorKind({ code: 'functions/aborted' })).toBe('conflict');
    expect(postalMoveErrorKind({ code: 'functions/already-exists' })).toBe('exists');
  });

  it('falls back to unknown', () => {
    expect(postalMoveErrorKind(new Error('boom'))).toBe('unknown');
    expect(postalMoveErrorKind(undefined)).toBe('unknown');
  });
});

describe('checkMove (mirrors the server planMove refusals)', () => {
  it('moves away from the open row when the date is after its start', () => {
    const current = postal('a', '20200101');
    expect(checkMove([current], current, '20270301')).toEqual({ ok: true, fromResidenceKey: 'a', addressUsage: 'home' });
  });

  it('refuses a date on or before the start of the open row', () => {
    const current = postal('a', '20270301');
    expect(checkMove([current], current, '20270301')).toEqual({ ok: false, reason: 'date' });
    expect(checkMove([current], current, '20260101')).toEqual({ ok: false, reason: 'date' });
  });

  it('takes the usage of the row moved away from, a legacy row being home', () => {
    const legacy = postal('a', '', '', undefined as unknown as string);
    expect(checkMove([legacy], legacy, '20270301')).toEqual({ ok: true, fromResidenceKey: 'a', addressUsage: 'home' });
  });

  it('refuses a move without a row to move away from while any postal row is open', () => {
    expect(checkMove([postal('w', '', '', 'work')], undefined, '20270301')).toEqual({ ok: false, reason: 'from' });
  });

  it('records a first residence when nothing is open', () => {
    expect(checkMove([postal('a', '', '20200101')], undefined, '20270301', 'work')).toEqual({ ok: true, fromResidenceKey: '', addressUsage: 'work' });
  });
});

describe('checkEditMove (cancel, then record)', () => {
  it('records from the predecessor, which the cancel reopens', () => {
    const old = postal('a', '20200101', '20270228');
    const announced = postal('b', '20270301');
    expect(checkEditMove(announced, [old, announced], '20270401')).toEqual({ ok: true, fromResidenceKey: 'a', addressUsage: 'home' });
  });

  it('finds the predecessor of a legacy row without usage (would otherwise lose the move)', () => {
    const legacy = postal('a', '', '20270228', undefined as unknown as string);
    const announced = postal('b', '20270301', '', 'home');
    expect(checkEditMove(announced, [legacy, announced], '20270315')).toEqual({ ok: true, fromResidenceKey: 'a', addressUsage: 'home' });
  });

  it('refuses a new date that is not after the predecessor start, before anything is cancelled', () => {
    const old = postal('a', '20270101', '20270228');
    const announced = postal('b', '20270301');
    expect(checkEditMove(announced, [old, announced], '20270101')).toEqual({ ok: false, reason: 'date' });
  });

  it('records without predecessor in the row usage when nothing else is open', () => {
    const announced = postal('b', '20270301', '', 'work');
    expect(checkEditMove(announced, [announced], '20270401')).toEqual({ ok: true, fromResidenceKey: '', addressUsage: 'work' });
  });

  it('refuses without predecessor when another postal row is open', () => {
    const work = postal('w', '20200101', '', 'work');
    const announced = postal('b', '20270301');
    expect(checkEditMove(announced, [work, announced], '20270401')).toEqual({ ok: false, reason: 'from' });
  });
});
