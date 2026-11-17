import { CalendarModel, Roles, UserModel } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';

import { canPostTripToCalendar, canWriteCalendar, isCalendarPublic, isOrgCalendar } from './calendar.util';

const calendar = (owner: string): CalendarModel => ({ ...new CalendarModel('scs'), okey: 'x', owner });
const user = (roles: Partial<Roles>): UserModel => ({ ...new UserModel('scs'), roles: roles as Roles });

describe('calendar.util', () => {
  describe('isOrgCalendar', () => {
    it('is true for an org-owned calendar', () => {
      expect(isOrgCalendar(calendar('org.scs'))).toBe(true);
      expect(isOrgCalendar(calendar('org.srv'))).toBe(true);
    });

    it('is false for group-, person- and un-owned calendars', () => {
      expect(isOrgCalendar(calendar('group.vorstand'))).toBe(false);
      expect(isOrgCalendar(calendar('person.kaiser'))).toBe(false);
      expect(isOrgCalendar(calendar(''))).toBe(false);
      expect(isOrgCalendar(undefined)).toBe(false);
    });
  });

  describe('canWriteCalendar', () => {
    it('reserves org-owned calendars for contentAdmin (and admin)', () => {
      expect(canWriteCalendar(calendar('org.scs'), user({ contentAdmin: true }))).toBe(true);
      expect(canWriteCalendar(calendar('org.scs'), user({ admin: true }))).toBe(true);
    });

    it('denies org-owned calendars to everybody else', () => {
      expect(canWriteCalendar(calendar('org.scs'), user({ eventAdmin: true }))).toBe(false);
      expect(canWriteCalendar(calendar('org.scs'), user({ privileged: true }))).toBe(false);
      expect(canWriteCalendar(calendar('org.scs'), user({ registered: true }))).toBe(false);
      expect(canWriteCalendar(calendar('org.scs'), undefined)).toBe(false);
    });

    it('leaves every other calendar open', () => {
      expect(canWriteCalendar(calendar('group.vorstand'), user({ registered: true }))).toBe(true);
      expect(canWriteCalendar(calendar('person.kaiser'), undefined)).toBe(true);
      expect(canWriteCalendar(undefined, undefined)).toBe(true);
    });
  });
});

describe('canPostTripToCalendar', () => {
  it('allows a group calendar only for a member of that group', () => {
    expect(canPostTripToCalendar(calendar('group.vorstand'), user({ registered: true }), ['vorstand'])).toBe(true);
    expect(canPostTripToCalendar(calendar('group.vorstand'), user({ registered: true }), ['segeln'])).toBe(false);
    expect(canPostTripToCalendar(calendar('group.vorstand'), user({ registered: true }), [])).toBe(false);
  });

  it('reserves org calendars for contentAdmin', () => {
    expect(canPostTripToCalendar(calendar('org.scs'), user({ registered: true }), ['scs'])).toBe(false);
    expect(canPostTripToCalendar(calendar('org.scs'), user({ contentAdmin: true }), [])).toBe(true);
  });

  it('denies any other owner and an undefined calendar', () => {
    expect(canPostTripToCalendar(calendar('person.x'), user({ contentAdmin: true }), ['x'])).toBe(false);
    expect(canPostTripToCalendar(calendar(''), user({ contentAdmin: true }), [])).toBe(false);
    expect(canPostTripToCalendar(undefined, user({ contentAdmin: true }), ['x'])).toBe(false);
  });
});

describe('isCalendarPublic', () => {
  it('reads the new field when it is set', () => {
    expect(isCalendarPublic({ isPublic: true })).toBe(true);
    expect(isCalendarPublic({ isPublic: false })).toBe(false);
  });

  it('falls back to the legacy field while a document is not migrated', () => {
    expect(isCalendarPublic({ defaultIsOpen: false })).toBe(false);
    expect(isCalendarPublic({ defaultIsOpen: true })).toBe(true);
  });

  it('lets the new field win over a stale legacy value', () => {
    expect(isCalendarPublic({ isPublic: false, defaultIsOpen: true })).toBe(false);
  });

  it('treats a document carrying neither field as public', () => {
    expect(isCalendarPublic({})).toBe(true);
  });

  it('treats a missing calendar as not public', () => {
    expect(isCalendarPublic(undefined)).toBe(false);
  });
});
