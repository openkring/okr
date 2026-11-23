import { AvailableLanguages } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';

import type { TenantSettings } from './tenant-settings';
import { type SettingsContext, settingsValidations } from './tenant-settings.validations';

// the suites take what a form holds, which can be anything: tests feed them off-type values on purpose
const loose = (o: object): TenantSettings => o as TenantSettings;

const CTX: SettingsContext = { before: {}, emailDomain: 'kring.ch', appDomain: 'app.kring.ch' };
const ctx = (patch: Partial<SettingsContext> = {}): SettingsContext => ({ ...CTX, ...patch });

describe('app', () => {
  const ok = { appName: 'Kring', appTitle: 'Titel', appSubtitle: 'Sub', description: '', brandColor: '' };
  it('accepts a normal set', () => expect(settingsValidations.app(ok, CTX).isValid()).toBe(true));
  it('requires appName', () => {
    expect(settingsValidations.app({ ...ok, appName: '' }, CTX).hasErrors('appName')).toBe(true);
    expect(settingsValidations.app({ ...ok, appName: '  ' }, CTX).hasErrors('appName')).toBe(true);
  });
  it.each(['a"b', 'a<b', 'a>b', 'a\nb'])('refuses %j in appName', (appName) => {
    expect(settingsValidations.app({ ...ok, appName }, CTX).hasErrors('appName')).toBe(true);
  });
  it('takes #rrggbb or nothing as brandColor', () => {
    expect(settingsValidations.app({ ...ok, brandColor: '#12abEF' }, CTX).hasErrors('brandColor')).toBe(false);
    for (const brandColor of ['#123', 'red', '123456', '#12345g']) {
      expect(settingsValidations.app({ ...ok, brandColor }, CTX).hasErrors('brandColor'), brandColor).toBe(true);
    }
  });
});

describe('language', () => {
  const ok = { locale: 'de-ch', enabledLanguages: ['de', 'en'] };
  it('accepts known languages', () => expect(settingsValidations.language(ok, CTX).isValid()).toBe(true));
  it('needs at least one language', () => expect(settingsValidations.language({ ...ok, enabledLanguages: [] }, CTX).hasErrors('enabledLanguages')).toBe(true));
  it('refuses an unknown language', () => expect(settingsValidations.language({ ...ok, enabledLanguages: ['de', 'xx'] }, CTX).hasErrors('enabledLanguages')).toBe(true));
  it('accepts all of them', () => expect(settingsValidations.language({ ...ok, enabledLanguages: [...AvailableLanguages] }, CTX).isValid()).toBe(true));
});

describe('operator', () => {
  const ok = { opName: 'A', opEmail: 'a@b.ch', opStreet: '', opZipCode: '', opCity: '', opCountryCode: 'CH', opWebUrl: 'https://b.ch', issueUrl: '' };
  it('accepts a normal set and empty urls and email', () => {
    expect(settingsValidations.operator(ok, CTX).isValid()).toBe(true);
    expect(settingsValidations.operator({ ...ok, opEmail: '', opWebUrl: '' }, CTX).isValid()).toBe(true);
  });
  it('wants https for issueUrl and opWebUrl', () => {
    const r = settingsValidations.operator({ ...ok, issueUrl: 'http://x.ch', opWebUrl: 'ftp://x.ch' }, CTX);
    expect(r.hasErrors('issueUrl')).toBe(true);
    expect(r.hasErrors('opWebUrl')).toBe(true);
  });
  it('refuses a broken email', () => expect(settingsValidations.operator({ ...ok, opEmail: 'nope' }, CTX).hasErrors('opEmail')).toBe(true));
});

describe('mail', () => {
  const run = (mailFrom: string, c = ctx()) => settingsValidations.mail({ mailFrom }, c).hasErrors('mailFrom');
  it('accepts empty', () => expect(run('')).toBe(false));
  it('accepts the email domain, the app domain and the app domain without app.', () => {
    expect(run('a@kring.ch')).toBe(false);
    expect(run('a@app.kring.ch')).toBe(false);
    expect(run('a@kring.ch', ctx({ emailDomain: '' }))).toBe(false);
  });
  it('compares the host case-insensitively', () => expect(run('a@KRING.CH')).toBe(false));
  it('refuses a foreign domain', () => expect(run('a@evil.ch')).toBe(true));
  it('refuses a look-alike host', () => {
    expect(run('a@kring.ch.evil.ch')).toBe(true);
    expect(run('a@xkring.ch')).toBe(true);
  });
  it('lets an unchanged stored value pass', () => {
    expect(run('a@old.ch', ctx({ before: { mailFrom: 'a@old.ch' } }))).toBe(false);
    expect(run('b@old.ch', ctx({ before: { mailFrom: 'a@old.ch' } }))).toBe(true);
  });
  it('lets an empty domain match nothing', () => {
    expect(run('a@', ctx({ emailDomain: '', appDomain: '' }))).toBe(true);
    expect(run('a@kring.ch', ctx({ emailDomain: '', appDomain: '' }))).toBe(true);
  });
  it('does not strip app. when the app domain lacks it', () => expect(run('a@x.kring.ch', ctx({ appDomain: 'x.kring.ch', emailDomain: '' }))).toBe(false));
});

describe('privacy', () => {
  const audiences = Object.fromEntries(
    ['showDateOfBirth', 'showDateOfDeath', 'showEmail', 'showPhone', 'showPostalAddress', 'showIban', 'showTaxId', 'showGender', 'showBexioId', 'showTags'].map((f) => [f, 'registered']),
  );
  const ok = { dpoName: '', dpoEmail: 'd@k.ch', privacyPolicyPageKey: '', privacyPolicyVersion: '', ...audiences };
  it('accepts the four audiences', () => {
    for (const a of ['public', 'registered', 'privileged', 'admin']) {
      expect(settingsValidations.privacy(loose({ ...ok, showEmail: a }), CTX).hasErrors('showEmail'), a).toBe(false);
    }
  });
  it('refuses anything else', () => expect(settingsValidations.privacy(loose({ ...ok, showEmail: 'everybody' }), CTX).hasErrors('showEmail')).toBe(true));
  it('refuses a broken dpoEmail', () => expect(settingsValidations.privacy(loose({ ...ok, dpoEmail: 'x' }), CTX).hasErrors('dpoEmail')).toBe(true));
});

describe('defaults', () => {
  const ok = { ownerLocationId: 'l', defaultResourceId: 'r', avatarUsage: 3, nameDisplay: 0, personSortCriteria: 1, newsDelivery: ['email'], invoiceDelivery: ['post'] };
  it('accepts a normal set', () => expect(settingsValidations.defaults(loose(ok), CTX).isValid()).toBe(true));
  it('refuses an empty delivery list', () => expect(settingsValidations.defaults(loose({ ...ok, newsDelivery: [] }), CTX).hasErrors('newsDelivery')).toBe(true));
});

describe('platform', () => {
  const ok = { appDomain: 'app.kring.ch', emailDomain: 'kring.ch', weatherIntervalHours: 4, personLookupEnabled: false, isArchived: false, showDebugInfo: false };
  it('accepts a normal set and empty domains', () => {
    expect(settingsValidations.platform(ok, CTX).isValid()).toBe(true);
    expect(settingsValidations.platform({ ...ok, appDomain: '', emailDomain: '' }, CTX).isValid()).toBe(true);
  });
  it.each(['https://kring.ch', 'kring.ch/x', 'kring', 'a b.ch', 'user@kring.ch'])('refuses %j as a domain', (appDomain) => {
    expect(settingsValidations.platform({ ...ok, appDomain }, CTX).hasErrors('appDomain')).toBe(true);
    expect(settingsValidations.platform({ ...ok, emailDomain: appDomain }, CTX).hasErrors('emailDomain')).toBe(true);
  });
  it('wants a positive weather interval', () => {
    for (const weatherIntervalHours of [0, -1, Number.NaN]) {
      expect(settingsValidations.platform({ ...ok, weatherIntervalHours }, CTX).hasErrors('weatherIntervalHours')).toBe(true);
    }
  });
});
