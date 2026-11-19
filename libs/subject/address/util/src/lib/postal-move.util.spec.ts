import '@angular/compiler';
import { describe, it, expect } from 'vitest';

import { AddressModel, UserModel } from '@okr/shared-models';
import {
  canWritePostal, hiddenInAccordion, moveActionKind, postalMoveErrorKind, postalTarget, predecessorOf, residenceDateLabel,
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
