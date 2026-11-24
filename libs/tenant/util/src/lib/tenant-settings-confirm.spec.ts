import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CHANNEL_PRIVACY_INPUTS } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';

import {
  REBUILD_FIELDS, SETTINGS_CONFIRM_I18N_KEYS, confirmationMessage, isWidening, settingsConfirmations,
} from './tenant-settings-confirm';
import type { TenantSettings } from './tenant-settings';

describe('isWidening', () => {
  it('is true when more people may see the value', () => {
    expect(isWidening('admin', 'registered')).toBe(true);
    expect(isWidening('privileged', 'public')).toBe(true);
    expect(isWidening('admin', 'public')).toBe(true);
  });
  it('is false for the same or a narrower audience', () => {
    expect(isWidening('registered', 'registered')).toBe(false);
    expect(isWidening('public', 'admin')).toBe(false);
  });
  it('asks when the old value is unknown, never for an unknown new value', () => {
    expect(isWidening(undefined, 'registered')).toBe(true);
    expect(isWidening('weird', 'public')).toBe(true);
    expect(isWidening('admin', 'weird')).toBe(false);
    expect(isWidening('admin', undefined)).toBe(false);
  });
});

describe('REBUILD_FIELDS', () => {
  it('is derived from the channel floors', () => {
    const floors = Object.values(CHANNEL_PRIVACY_INPUTS).map((i) => i.tenantFloor).filter(Boolean);
    expect([...REBUILD_FIELDS].sort()).toEqual([...new Set(floors)].sort());
    expect(REBUILD_FIELDS.has('showEmail')).toBe(true);
    expect(REBUILD_FIELDS.has('showGender')).toBe(false);
  });
});

describe('settingsConfirmations', () => {
  const before = { showEmail: 'admin', showGender: 'admin', showPhone: 'public', privacyPolicyVersion: '1', appName: 'A' } as TenantSettings;

  it('needs nothing for an ordinary field', () => {
    expect(settingsConfirmations({ appName: 'B' } as TenantSettings, before)).toEqual([]);
  });
  it('widening an address field asks for both widen and rebuild', () => {
    expect(settingsConfirmations({ showEmail: 'registered' } as TenantSettings, before)).toEqual(['widen', 'rebuild']);
  });
  it('narrowing an address field only hints at the rebuild', () => {
    expect(settingsConfirmations({ showPhone: 'admin' } as TenantSettings, before)).toEqual(['rebuild']);
  });
  it('widening a field outside the address directory only asks for widen', () => {
    expect(settingsConfirmations({ showGender: 'public' } as TenantSettings, before)).toEqual(['widen']);
  });
  it('a changed policy version asks for policy', () => {
    expect(settingsConfirmations({ privacyPolicyVersion: '2' } as TenantSettings, before)).toEqual(['policy']);
  });
  it('an emptied policy version asks nobody to accept anything, so it does not ask', () => {
    expect(settingsConfirmations({ privacyPolicyVersion: '' } as TenantSettings, before)).toEqual([]);
    expect(settingsConfirmations({ privacyPolicyVersion: ' ' } as TenantSettings, before)).toEqual([]);
    expect(settingsConfirmations({ privacyPolicyVersion: undefined } as unknown as TenantSettings, before)).toEqual([]);
  });
  it('a changed app domain and a changed login path ask, the mail domain does not', () => {
    expect(settingsConfirmations({ appDomain: 'app.x.ch' } as TenantSettings, before)).toEqual(['domain']);
    expect(settingsConfirmations({ loginUrl: '/auth/in' } as TenantSettings, before)).toEqual(['login']);
    expect(settingsConfirmations({ loginUrl: '/auth/in', appDomain: 'app.x.ch' } as TenantSettings, before)).toEqual(['domain', 'login']);
    expect(settingsConfirmations({ emailDomain: 'x.ch', gitOrg: 'x', isArchived: true } as TenantSettings, before)).toEqual([]);
  });
  it('combines in a fixed order', () => {
    expect(settingsConfirmations({ privacyPolicyVersion: '2', showEmail: 'public' } as TenantSettings, before)).toEqual(['widen', 'rebuild', 'policy']);
  });
  it('does not treat a non-audience string field as widening', () => {
    expect(settingsConfirmations({ dpoName: 'x' } as TenantSettings, before)).toEqual([]);
  });
});

describe('confirmationMessage', () => {
  it('joins the sentences and adds the question; empty for nothing', () => {
    const t = { widen: 'W.', rebuild: 'R.', policy: 'P.', domain: 'D.', login: 'L.', ask: 'Q?' };
    expect(confirmationMessage([], t)).toBe('');
    expect(confirmationMessage(['rebuild', 'policy'], t)).toBe('R. P. Q?');
    expect(confirmationMessage(['domain', 'login'], t)).toBe('D. L. Q?');
  });
});

describe('settings confirm texts', () => {
  const LANGS = ['de', 'en', 'fr', 'es', 'it'];
  it.each(LANGS)('has every key, plain and without exclamation mark, in %s', (lang) => {
    const bundle = JSON.parse(readFileSync(join(__dirname, '..', 'i18n', `${lang}.json`), 'utf8')) as Record<string, unknown>;
    for (const [name, key] of Object.entries(SETTINGS_CONFIRM_I18N_KEYS)) {
      const text = key.replace('@tenant/util.', '').split('.').reduce<unknown>(
        (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), bundle);
      expect(typeof text, `${lang}: ${name}`).toBe('string');
      expect((text as string).trim().length, `${lang}: ${name}`).toBeGreaterThan(0);
      expect(text as string, `${lang}: ${name}`).not.toContain('!');
      expect(text as string, `${lang}: ${name}`).not.toMatch(/Verein/);
    }
  });
});
