import { EMAIL_LENGTH } from '@okr/shared-constants';
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
  it.each(['a"b', 'a<b', 'a>b', 'a\nb', 'a\\b', 'a\\'])('refuses %j in appName', (appName) => {
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
  it.each(['a,b@x.ch', 'a<b@x.ch', 'a>b@x.ch', '"a"@x.ch', 'a\\b@x.ch', 'a;b@x.ch', 'a:b@x.ch', 'a(b)@x.ch', 'a[b]@x.ch', 'a\u0001b@x.ch', 'a@x>.ch', 'a@x.ch>'])(
    'refuses %j, which a mail server reads as something else than one address',
    (opEmail) => expect(settingsValidations.operator({ ...ok, opEmail }, CTX).hasErrors('opEmail')).toBe(true),
  );
  it.each(['a.b+c@x.ch', "o'brien@x-y.ch", 'a_b@müller.ch'])('takes %j', (opEmail) => {
    expect(settingsValidations.operator({ ...ok, opEmail }, CTX).hasErrors('opEmail')).toBe(false);
  });
  it('takes an email up to the shared length', () => {
    const of = (length: number) => `${'a'.repeat(length - '@x.ch'.length)}@x.ch`;
    expect(settingsValidations.operator({ ...ok, opEmail: of(EMAIL_LENGTH) }, CTX).hasErrors('opEmail')).toBe(false);
    expect(settingsValidations.operator({ ...ok, opEmail: of(EMAIL_LENGTH + 1) }, CTX).hasErrors('opEmail')).toBe(true);
  });
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
  const ok = {
    appDomain: 'app.kring.ch', emailDomain: 'kring.ch', emailProvider: 'mailtrap_api', mailtrapPasswordResetTemplate: '',
    loginUrl: '/auth/login', passwordResetUrl: '', logoUrl: 'tenant/kring/logo/logo.svg', ownerOrgId: 'kring', ownerUserId: '',
    defaultAccountingTenantId: '', gitRepo: 'okr', gitOrg: 'openkring',
    weatherIntervalHours: 4, personLookupEnabled: false, listedInPortal: false, isArchived: false, showDebugInfo: false,
  };
  it('accepts a normal set and an empty mail domain', () => {
    expect(settingsValidations.platform(ok, CTX).isValid()).toBe(true);
    expect(settingsValidations.platform({ ...ok, emailDomain: '' }, CTX).isValid()).toBe(true);
  });
  it('refuses an emptied app domain, and lets a stored empty one pass while it is not changed', () => {
    expect(settingsValidations.platform({ ...ok, appDomain: '' }, { ...CTX, before: ok }).hasErrors('appDomain')).toBe(true);
    expect(settingsValidations.platform({ ...ok, appDomain: '' }, CTX).hasErrors('appDomain')).toBe(true);
    expect(settingsValidations.platform({ ...ok, appDomain: '', gitOrg: 'x' }, { ...CTX, before: { ...ok, appDomain: '' } }).hasErrors('appDomain')).toBe(false);
  });
  it('refuses an app domain another app uses, the own one excepted', () => {
    const context = { ...CTX, takenAppDomains: ['app.kring.ch'] };
    expect(settingsValidations.platform(ok, context).hasErrors('appDomain')).toBe(true);
    expect(settingsValidations.platform({ ...ok, appDomain: 'app.frei.ch' }, context).hasErrors('appDomain')).toBe(false);
    // unchanged: a stored double must not block the rest of the card
    expect(settingsValidations.platform({ ...ok, gitOrg: 'x' }, { ...context, before: ok }).hasErrors()).toBe(false);
  });
  it.each(['https://kring.ch', 'kring.ch/x', 'kring', 'a b.ch', 'user@kring.ch', 'App.kring.ch', 'KRING.CH', 'kring.ch.', ' kring.ch'])('refuses %j as a domain', (appDomain) => {
    expect(settingsValidations.platform({ ...ok, appDomain }, CTX).hasErrors('appDomain')).toBe(true);
    expect(settingsValidations.platform({ ...ok, emailDomain: appDomain }, CTX).hasErrors('emailDomain')).toBe(true);
  });
  it.each(['', 'mailtrap', 'mailtrap_api ', 3])('refuses %j as a mail service', (emailProvider) => {
    expect(settingsValidations.platform(loose({ ...ok, emailProvider }), CTX).hasErrors('emailProvider')).toBe(true);
  });
  it('lets a stored empty mail service pass while it is not changed', () => {
    expect(settingsValidations.platform(loose({ ...ok, emailProvider: '', gitOrg: 'x' }), { ...CTX, before: loose({ ...ok, emailProvider: '' }) }).hasErrors()).toBe(false);
  });
  it.each(['https://evil.ch', '//evil.ch', '/\\evil.ch', 'auth/login', '/auth login', '/a@b'])('refuses %j as a path', (url) => {
    expect(settingsValidations.platform({ ...ok, loginUrl: url }, CTX).hasErrors('loginUrl')).toBe(true);
    expect(settingsValidations.platform({ ...ok, passwordResetUrl: url }, CTX).hasErrors('passwordResetUrl')).toBe(true);
  });
  it('needs a login path, not a path for the password reset', () => {
    expect(settingsValidations.platform({ ...ok, loginUrl: '' }, CTX).hasErrors('loginUrl')).toBe(true);
    expect(settingsValidations.platform({ ...ok, passwordResetUrl: '' }, CTX).hasErrors('passwordResetUrl')).toBe(false);
  });
  it('caps the texts', () => {
    for (const field of ['mailtrapPasswordResetTemplate', 'ownerOrgId', 'ownerUserId', 'defaultAccountingTenantId', 'gitRepo', 'gitOrg']) {
      expect(settingsValidations.platform(loose({ ...ok, [field]: 'x'.repeat(101) }), CTX).hasErrors(field), field).toBe(true);
      expect(settingsValidations.platform(loose({ ...ok, [field]: 'x'.repeat(100) }), CTX).hasErrors(field), field).toBe(false);
    }
  });
  it('wants a weather interval of whole hours, up to a week', () => {
    for (const weatherIntervalHours of [1, 24, 168]) {
      expect(settingsValidations.platform({ ...ok, weatherIntervalHours }, CTX).hasErrors('weatherIntervalHours')).toBe(false);
    }
    for (const weatherIntervalHours of [0, -1, 0.5, 4.5, 169, Number.NaN, Number.POSITIVE_INFINITY, '' as unknown as number]) {
      expect(settingsValidations.platform({ ...ok, weatherIntervalHours }, CTX).hasErrors('weatherIntervalHours')).toBe(true);
    }
  });
});

describe('unchanged stored values', () => {
  // one bad stored value per group; the user edits another field of the same card
  const cases: { group: keyof typeof settingsValidations; bad: Record<string, unknown>; other: Record<string, unknown>; badField: string; worse: unknown }[] = [
    { group: 'app', bad: { appName: 'a"b', brandColor: 'red' }, other: { appTitle: 'neu' }, badField: 'appName', worse: 'a<b' },
    { group: 'language', bad: { enabledLanguages: ['de', 'xx'] }, other: { locale: 'de-ch' }, badField: 'enabledLanguages', worse: ['yy'] },
    { group: 'operator', bad: { opWebUrl: 'http://x.ch', opCountryCode: 'Schweiz', opEmail: 'x' }, other: { opName: 'neu' }, badField: 'opWebUrl', worse: 'ftp://y.ch' },
    { group: 'privacy', bad: { showEmail: 'everybody', dpoEmail: 'x' }, other: { dpoName: 'neu' }, badField: 'showEmail', worse: 'nobody' },
    { group: 'defaults', bad: { newsDelivery: ['email', 'email'], avatarUsage: -1 }, other: { nameDisplay: 1 }, badField: 'avatarUsage', worse: -2 },
    { group: 'platform', bad: { appDomain: 'https://x.ch', weatherIntervalHours: 0 }, other: { emailDomain: 'k.ch' }, badField: 'appDomain', worse: 'http://y.ch' },
    { group: 'mail', bad: { mailFrom: 'x@old.ch' }, other: {}, badField: 'mailFrom', worse: 'y@old.ch' },
  ];
  for (const c of cases) {
    it(`${c.group}: a bad value the user did not touch passes, another bad value fails`, () => {
      const before = loose(c.bad);
      const run = (model: object) => settingsValidations[c.group](loose(model), { ...CTX, before }).hasErrors(c.badField);
      expect(settingsValidations[c.group](loose(c.bad), { ...CTX, before: {} }).hasErrors(c.badField)).toBe(true);
      expect(run({ ...c.bad, ...c.other })).toBe(false);
      expect(run({ ...c.bad, [c.badField]: c.worse })).toBe(true);
    });
  }

  it('compares lists by value', () => {
    const before = loose({ newsDelivery: ['email', 'email'] });
    expect(settingsValidations.defaults(loose({ newsDelivery: ['email', 'email'] }), { ...CTX, before }).hasErrors('newsDelivery')).toBe(false);
  });
});

describe('raw values', () => {
  it('refuses surrounding whitespace in a sender, an e-mail, a url and a domain', () => {
    expect(settingsValidations.mail({ mailFrom: 'a@kring.ch\r\n' }, CTX).hasErrors('mailFrom')).toBe(true);
    expect(settingsValidations.mail({ mailFrom: ' a@kring.ch' }, CTX).hasErrors('mailFrom')).toBe(true);
    const op = { opName: 'A', opEmail: 'a@b.ch ', opStreet: '', opZipCode: '', opCity: '', opCountryCode: 'CH', opWebUrl: 'https://b.ch ', issueUrl: '' };
    const r = settingsValidations.operator(op, CTX);
    expect(r.hasErrors('opEmail')).toBe(true);
    expect(r.hasErrors('opWebUrl')).toBe(true);
    const platform = { appDomain: 'app.kring.ch ', emailDomain: '', weatherIntervalHours: 4, personLookupEnabled: false, listedInPortal: false, isArchived: false, showDebugInfo: false };
    expect(settingsValidations.platform(platform, CTX).hasErrors('appDomain')).toBe(true);
  });

  it('refuses control characters in appName', () => {
    for (const appName of ['a\u0000b', 'a\tb', 'a\u0085b', 'a b', 'a\u007fb']) {
      expect(settingsValidations.app({ appName, appTitle: '', appSubtitle: '', description: '', brandColor: '' }, CTX).hasErrors('appName'), JSON.stringify(appName)).toBe(true);
    }
  });
});
