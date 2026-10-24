import { describe, expect, it } from 'vitest';
import {
  byCreatedAtDesc, checkLoginTarget, defaultPasskeyLabel, expectedOrigin, isChallengeUsable, isCredentialId, isRecentSignIn, mayManagePasskey, registrationBlock,
  normalizePasskeyLabel, toPasskeyItem,
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

describe('isCredentialId', () => {
  it('accepts base64url only', () => {
    expect(isCredentialId('AbC-_09')).toBe(true);
    expect(isCredentialId('')).toBe(false);
    expect(isCredentialId('a/b')).toBe(false);
    expect(isCredentialId('a+b=')).toBe(false);
    expect(isCredentialId(undefined)).toBe(false);
    expect(isCredentialId(42)).toBe(false);
    expect(isCredentialId('a'.repeat(1025))).toBe(false);
  });
});

describe('normalizePasskeyLabel', () => {
  it('trims and enforces 1–40 characters', () => {
    expect(normalizePasskeyLabel('  iPhone  ')).toBe('iPhone');
    expect(normalizePasskeyLabel('   ')).toBeUndefined();
    expect(normalizePasskeyLabel('x'.repeat(40))).toBe('x'.repeat(40));
    expect(normalizePasskeyLabel('x'.repeat(41))).toBeUndefined();
    expect(normalizePasskeyLabel(undefined)).toBeUndefined();
  });
});

describe('toPasskeyItem', () => {
  it('exposes only the five client fields', () => {
    const item = toPasskeyItem('id1', {
      uid: 'u', publicKey: 'pk', counter: 3, label: 'Mac', createdAt: '20261024120000', lastUsedAt: '', backedUp: true,
    });
    expect(item).toEqual({ okey: 'id1', label: 'Mac', createdAt: '20261024120000', lastUsedAt: '', backedUp: true });
  });
  it('fills defaults for a sparse doc', () => {
    expect(toPasskeyItem('id2', undefined)).toEqual({ okey: 'id2', label: '', createdAt: '', lastUsedAt: '', backedUp: false });
  });
});

describe('byCreatedAtDesc', () => {
  it('sorts newest first', () => {
    const items = [{ createdAt: '20250101000000' }, { createdAt: '20261024120000' }, { createdAt: '20260101000000' }];
    expect(items.sort(byCreatedAtDesc).map((i) => i.createdAt)).toEqual(['20261024120000', '20260101000000', '20250101000000']);
  });
});

describe('registrationBlock', () => {
  it('refuses an impersonation session even when it is fresh', () => {
    expect(registrationBlock({ auth_time: 1_000, impersonatedBy: 'admin-uid' }, 1_000_000)).toBe('impersonated');
  });
  it('asks for a fresh sign-in when auth_time is old or missing', () => {
    expect(registrationBlock({ auth_time: 1_000 }, 1_000_000 + 301_000)).toBe('recent-login-required');
    expect(registrationBlock(undefined, 0)).toBe('recent-login-required');
  });
  it('lets a fresh own session register', () => {
    expect(registrationBlock({ auth_time: 1_000 }, 1_000_000 + 299_000)).toBeUndefined();
  });
});
