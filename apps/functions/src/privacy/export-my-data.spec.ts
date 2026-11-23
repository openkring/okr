import { describe, expect, it, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { buildController, buildSubjectCtx, isRateLimited, loadFavEmailIfSynthetic } from './export-my-data';

const dirGet = vi.hoisted(() => vi.fn());
const dirDoc = vi.hoisted(() => vi.fn());
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: (name: string) => ({ doc: (id: string) => { dirDoc(name, id); return { get: dirGet }; } }) }),
}));

describe('loadFavEmailIfSynthetic', () => {
  it('reads address-directory/{tenant}_person.{personKey} for a synthetic login', async () => {
    dirGet.mockResolvedValueOnce({ data: () => ({ favEmail: 'anna@gmail.com' }) });
    const r = await loadFavEmailIfSynthetic({ personKey: 'p1', tenants: ['scs'], loginEmail: 'max@login.seeclub.org' });
    expect(r).toBe('anna@gmail.com');
    expect(dirDoc).toHaveBeenCalledWith('address-directory', 'scs_person.p1');
  });

  it('does not read anything for a real login email', async () => {
    dirDoc.mockClear();
    expect(await loadFavEmailIfSynthetic({ personKey: 'p1', tenants: ['scs'], loginEmail: 'a@b.ch' })).toBeUndefined();
    expect(dirDoc).not.toHaveBeenCalled();
  });
});

describe('buildSubjectCtx', () => {
  it('derives the ctx from the caller\'s OWN user doc — no subject can be named by a parameter', () => {
    const ctx = buildSubjectCtx('uid1', {
      personKey: 'p1',
      tenants: ['scs'],
      loginEmail: 'Ann.Mueller@Example.com',
    });
    expect(ctx).toEqual({
      uid: 'uid1',
      personKey: 'p1',
      parentKey: 'person.p1',
      tenantId: 'scs',
      email: 'ann.mueller@example.com',
    });
  });

  it('lowercases the email', () => {
    const ctx = buildSubjectCtx('uid1', { personKey: 'p1', tenants: ['scs'], loginEmail: 'ANN@SCS.CH' });
    expect(ctx.email).toBe('ann@scs.ch');
  });

  it('uses the favourite email for a synthetic Benutzername account', () => {
    const user = { personKey: 'p1', tenants: ['scs'], loginEmail: 'max_mueller@login.seeclub.org' };
    expect(buildSubjectCtx('uid1', user, 'Anna@Gmail.com').email).toBe('anna@gmail.com');
    expect(buildSubjectCtx('uid1', user).email).toBe('');
  });

  it('ignores the favourite email for a real login address', () => {
    expect(buildSubjectCtx('uid1', { personKey: 'p1', tenants: ['scs'], loginEmail: 'a@b.ch' }, 'x@y.ch').email).toBe('a@b.ch');
  });

  it('throws failed-precondition when the user has no personKey', () => {
    expect(() => buildSubjectCtx('uid1', { personKey: '', tenants: ['scs'] }))
      .toThrow(HttpsError);
  });

  it('throws failed-precondition when the user has no tenant', () => {
    expect(() => buildSubjectCtx('uid1', { personKey: 'p1', tenants: [] }))
      .toThrow(HttpsError);
  });

  it('throws failed-precondition when userData is entirely undefined', () => {
    expect(() => buildSubjectCtx('uid1', undefined)).toThrow(HttpsError);
  });

  it('takes only the first tenant — a user has always exactly one (UserModel contract)', () => {
    const ctx = buildSubjectCtx('uid1', { personKey: 'p1', tenants: ['scs', 'other'] });
    expect(ctx.tenantId).toBe('scs');
  });
});

// True = the newest artifact is still inside the cooldown, so the callable re-signs THAT
// artifact instead of building a new one (the member never sees an error for retrying).
describe('isRateLimited', () => {
  const ONE_HOUR = 60 * 60 * 1000;
  const now = Date.parse('2026-07-28T12:00:00.000Z');

  it('builds a fresh export when there is no prior artifact (newest = 0)', () => {
    expect(isRateLimited(0, now)).toBe(false);
  });

  it('reuses the artifact when a second export is requested inside the same hour', () => {
    const newest = now - 5 * 60 * 1000; // 5 min ago
    expect(isRateLimited(newest, now, ONE_HOUR)).toBe(true);
  });

  it('allows an export exactly at the cooldown boundary', () => {
    const newest = now - ONE_HOUR;
    expect(isRateLimited(newest, now, ONE_HOUR)).toBe(false);
  });

  it('allows an export once the cooldown has fully elapsed', () => {
    const newest = now - ONE_HOUR - 1;
    expect(isRateLimited(newest, now, ONE_HOUR)).toBe(false);
  });

  it('treats a non-finite/negative newest timestamp as "no prior export"', () => {
    expect(isRateLimited(Number.NaN, now)).toBe(false);
    expect(isRateLimited(-1, now)).toBe(false);
  });
});

describe('buildController', () => {
  const full = {
    opName: 'Seeclub', opStreet: 'Seestrasse 1', opZipCode: '8712', opCity: 'Stäfa', opCountryCode: 'CH',
    opEmail: 'info@seeclub.org', opWebUrl: 'https://www.seeclub.org', dpoName: 'Anna Muster', dpoEmail: 'privacy@seeclub.org',
  };

  it('lists name, street, city, country, e-mail, web and data protection contact, in this order', () => {
    expect(buildController(full, 'App')).toBe([
      'Seeclub', 'Seestrasse 1', '8712 Stäfa', 'Schweiz', 'E-Mail: info@seeclub.org',
      'Web: https://www.seeclub.org', 'Datenschutz: Anna Muster, privacy@seeclub.org',
    ].join('\n'));
  });

  it('leaves empty values out, blank, null and non-text ones included', () => {
    expect(buildController({ opName: ' Seeclub ', opStreet: null, opZipCode: '', opCity: 'Stäfa', opWebUrl: ' ' }, 'App'))
      .toBe('Seeclub\nStäfa');
    expect(buildController({ opName: 'Seeclub', dpoName: 'Anna Muster' }, 'App')).toBe('Seeclub\nDatenschutz: Anna Muster');
    expect(buildController({ opName: 'Seeclub', dpoEmail: 'p@s.ch' }, 'App')).toBe('Seeclub\nDatenschutz: p@s.ch');
    expect(buildController({ opName: 'Seeclub', opCity: ['x'], opEmail: {} }, 'App')).toBe('Seeclub');
  });

  it('accepts a zip code stored as a number', () => {
    expect(buildController({ opName: 'A', opZipCode: 8712, opCity: 'Stäfa' }, 'App')).toBe('A\n8712 Stäfa');
  });

  it('keeps a country it does not know as it is stored', () => {
    expect(buildController({ opName: 'A', opCountryCode: 'Schweiz' }, 'App')).toBe('A\nSchweiz');
    expect(buildController({ opName: 'A', opCountryCode: 'ch' }, 'App')).toBe('A\nSchweiz');
  });

  it('shows only http(s) web addresses', () => {
    expect(buildController({ opName: 'A', opWebUrl: 'http://a.ch' }, 'App')).toBe('A\nWeb: http://a.ch');
    for (const opWebUrl of ['javascript:alert(1)', 'ftp://a.ch', 'www.a.ch', 'https://']) {
      expect(buildController({ opName: 'A', opWebUrl }, 'App')).toBe('A');
    }
  });

  it('keeps one value on one line', () => {
    expect(buildController({ opName: 'A\nB', dpoName: 'C\r\nD' }, 'App')).toBe('A B\nDatenschutz: C D');
  });

  it('falls back to the tenant name when the operator is not named', () => {
    expect(buildController(undefined, 'App')).toBe('App');
    expect(buildController({}, 'App')).toBe('App');
    // country, web and contact alone do not say who is responsible
    expect(buildController({ opCountryCode: 'CH', dpoEmail: 'p@s.ch' }, 'App')).toBe('App\nSchweiz\nDatenschutz: p@s.ch');
    // an operator block without a name stays as it was
    expect(buildController({ opEmail: 'a@b.ch' }, 'App')).toBe('E-Mail: a@b.ch');
  });
});
