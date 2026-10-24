import { describe, expect, it } from 'vitest';
import {
  checkLoginTarget, defaultPasskeyLabel, expectedOrigin, isChallengeUsable, isRecentSignIn, mayManagePasskey,
  passkeyAddedMail, resolveRpId, StoredChallenge,
} from './passkey.decide';

describe('resolveRpId', () => {
  it('accepts the app domain and localhost, rejects others', () => {
    expect(resolveRpId('app.seeclub.org', 'app.seeclub.org')).toBe('app.seeclub.org');
    expect(resolveRpId('localhost', 'app.seeclub.org')).toBe('localhost');
    expect(resolveRpId('evil.example', 'app.seeclub.org')).toBeUndefined();
    expect(resolveRpId('', '')).toBeUndefined();
  });
});

describe('expectedOrigin', () => {
  it('derives the origin from the rpId, never trusting the client except on localhost', () => {
    expect(expectedOrigin('app.seeclub.org', 'https://evil.example')).toBe('https://app.seeclub.org');
    expect(expectedOrigin('localhost', 'http://localhost:4200')).toBe('http://localhost:4200');
    expect(expectedOrigin('localhost', 'https://app.seeclub.org')).toBeUndefined();
  });
});

describe('isChallengeUsable', () => {
  const c = { purpose: 'login', challenge: 'x', rpId: 'r', origin: 'o', expiresAt: 1_000 } as StoredChallenge;
  it('checks expiry, purpose and existence', () => {
    expect(isChallengeUsable(c, 'login', 999)).toBe(true);
    expect(isChallengeUsable(c, 'login', 1_001)).toBe(false);
    expect(isChallengeUsable(c, 'register', 999)).toBe(false);
    expect(isChallengeUsable(undefined, 'login', 0)).toBe(false);
  });
});

describe('isRecentSignIn', () => {
  it('allows 300 s since auth_time', () => {
    expect(isRecentSignIn(1_000, 1_000_000 + 299_000)).toBe(true);
    expect(isRecentSignIn(1_000, 1_000_000 + 301_000)).toBe(false);
    expect(isRecentSignIn(undefined, 0)).toBe(false);
  });
});

describe('checkLoginTarget', () => {
  const base = { passkey: { uid: 'u', rpId: 'app.x', tenants: ['scs'] }, userTenants: ['scs'], authDisabled: false, tenantId: 'scs', rpId: 'app.x' };
  it('ok only when everything lines up', () => {
    expect(checkLoginTarget(base)).toBe('ok');
    expect(checkLoginTarget({ ...base, passkey: undefined })).toBe('reject');
    expect(checkLoginTarget({ ...base, userTenants: undefined })).toBe('reject');
    expect(checkLoginTarget({ ...base, authDisabled: true })).toBe('reject');
    expect(checkLoginTarget({ ...base, tenantId: 'kwa' })).toBe('reject');
    expect(checkLoginTarget({ ...base, userTenants: ['kwa'] })).toBe('reject');
    expect(checkLoginTarget({ ...base, rpId: 'localhost' })).toBe('reject');
  });
});

describe('mayManagePasskey', () => {
  const pk = { uid: 'u', tenants: ['scs'] };
  it('owner, or admin sharing a tenant', () => {
    expect(mayManagePasskey({ uid: 'u', isAdmin: false, tenants: ['scs'] }, pk)).toBe(true);
    expect(mayManagePasskey({ uid: 'a', isAdmin: true, tenants: ['scs'] }, pk)).toBe(true);
    expect(mayManagePasskey({ uid: 'a', isAdmin: true, tenants: ['kwa'] }, pk)).toBe(false);
    expect(mayManagePasskey({ uid: 'b', isAdmin: false, tenants: ['scs'] }, pk)).toBe(false);
  });
});

describe('defaultPasskeyLabel', () => {
  it('maps the user agent to a device name', () => {
    expect(defaultPasskeyLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('iPhone');
    expect(defaultPasskeyLabel('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)')).toBe('iPad');
    expect(defaultPasskeyLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('Mac');
    expect(defaultPasskeyLabel('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('Android');
    expect(defaultPasskeyLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows');
    expect(defaultPasskeyLabel('curl/8')).toBe('Gerät');
  });
});

describe('passkeyAddedMail', () => {
  it('names label, time and app; has the right subject', () => {
    const m = passkeyAddedMail('Seeclub', 'iPhone', '24.10.2026 14:30');
    expect(m.subject).toBe('Neuer Passkey für dein Konto bei Seeclub');
    expect(m.html).toContain('iPhone');
    expect(m.html).toContain('24.10.2026 14:30');
    expect(m.html).toContain('Warst du das nicht?');
    expect(m.html).not.toContain('!');
  });
  it('escapes HTML in the label and app name', () => {
    const m = passkeyAddedMail('<b>App</b>', '<script>alert(1)</script>', 'jetzt');
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).not.toContain('<b>App</b>');
  });
});
