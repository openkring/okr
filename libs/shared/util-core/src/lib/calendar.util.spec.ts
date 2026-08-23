import { CalendarModel, Roles, UserModel } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';

import { canWriteCalendar, isOrgCalendar } from './calendar.util';

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
