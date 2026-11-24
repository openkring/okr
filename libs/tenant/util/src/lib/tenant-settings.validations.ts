import { CITY_LENGTH, COUNTRY_LENGTH, DESCRIPTION_LENGTH, LONG_NAME_LENGTH, NAME_LENGTH, SHORT_NAME_LENGTH, STREET_LENGTH, URL_LENGTH } from '@okr/shared-constants';
import { AvailableLanguages } from '@okr/shared-models';
import { bareHostname, booleanValidations, deliveryChannelsValidations, numberValidations, stringsValidations, stringValidations } from '@okr/shared-util-core';
import { enforce, skip, staticSuite, test } from 'vest';

import { sameValue, SETTINGS_AUDIENCES, SETTINGS_EMAIL_PROVIDERS, SETTINGS_GROUPS, type SettingsGroupId, type TenantSettings } from './tenant-settings';

// Vest messages are i18n keys, written out literally so that check-i18n can resolve them: okr-error-note
// resolves any message starting with '@'.

export interface SettingsContext {
  /** The group as it was loaded: an unchanged stored value always passes. */
  before: TenantSettings;
  emailDomain: string;
  appDomain: string;
  /** App domains of the other tenants (`takenAppDomains`): the host decides whose app a link opens. Only the operator page knows them. */
  takenAppDomains?: readonly string[];
}

const COLOR = /^#[0-9a-fA-F]{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// quotes and angle brackets, and every control character (C0, DEL, C1, line and paragraph separator)
// eslint-disable-next-line no-control-regex
const APP_NAME_FORBIDDEN = /["<>\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
/** Longest e-mail address a settings field takes; the forms bind it as [maxLength]. */
export const SETTINGS_EMAIL_LENGTH = 100;
const HAS_SPACE = /\s/;
/** A path inside the app, never another host; the same rule as `isPlainPath` in apps/functions/src/auth/email-templates.ts. */
const PLAIN_PATH = /^\/(?![/\\])[^\s\\@]*$/;
/** Longest pause between two weather fetches: a week. */
export const SETTINGS_MAX_WEATHER_HOURS = 168;
/** Longest host name; `bareHostname` refuses a longer one. */
export const SETTINGS_DOMAIN_LENGTH = 253;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function emailOrEmpty(field: string, value: unknown): void {
  stringValidations(field, value, SETTINGS_EMAIL_LENGTH);
  test(field, '@tenant/util.settings.validation.email', () => {
    enforce(text(value) === '' || EMAIL.test(text(value))).isTruthy();
  });
}

function httpsOrEmpty(field: string, value: unknown): void {
  stringValidations(field, value, URL_LENGTH);
  test(field, '@tenant/util.settings.validation.https', () => {
    enforce(text(value) === '' || (text(value).startsWith('https://') && !HAS_SPACE.test(text(value)))).isTruthy();
  });
}

/** The host of a sender address, lower-case; '' when there is no `@`. */
function senderHost(address: string): string {
  const at = address.lastIndexOf('@');
  return at < 0 ? '' : address.slice(at + 1).toLowerCase();
}

/** Domains a tenant may send from: the mail domain, the app domain, and the app domain without its `app.`. An empty domain matches nothing. */
export function allowedSenderDomains(context: Pick<SettingsContext, 'emailDomain' | 'appDomain'>): string[] {
  const email = text(context.emailDomain).trim().toLowerCase();
  const app = text(context.appDomain).trim().toLowerCase();
  return [email, app, app.startsWith('app.') ? app.slice(4) : ''].filter((d) => d !== '');
}

/**
 * Stored legacy data may break any rule below. A field whose value equals the loaded one passes every rule of its
 * group, so a bad stored value never makes the card unsaveable; changing it to another bad value still fails.
 */
function skipUnchanged(group: SettingsGroupId, m: TenantSettings, context: SettingsContext): void {
  const before = (context?.before ?? {}) as Record<string, unknown>;
  const now = m as Record<string, unknown>;
  const same = SETTINGS_GROUPS[group].filter((f) => before[f] !== undefined && sameValue(before[f], now[f])) as string[];
  if (same.length > 0) skip(same);
}

const appSuite = staticSuite((m: TenantSettings, context: SettingsContext) => {
  skipUnchanged('app', m, context);
  stringValidations('appName', m.appName, NAME_LENGTH, 1, true);
  test('appName', '@tenant/util.settings.validation.appNameChars', () => {
    enforce(APP_NAME_FORBIDDEN.test(text(m.appName))).isFalsy();
  });
  stringValidations('appTitle', m.appTitle, LONG_NAME_LENGTH);
  stringValidations('appSubtitle', m.appSubtitle, LONG_NAME_LENGTH);
  stringValidations('description', m.description, DESCRIPTION_LENGTH);
  test('brandColor', '@tenant/util.settings.validation.brandColor', () => {
    enforce(typeof m.brandColor === 'string' && (m.brandColor === '' || COLOR.test(m.brandColor))).isTruthy();
  });
});

// banner urls are produced by the upload, never typed: no length cap
const imagesSuite = staticSuite((m: TenantSettings, context: SettingsContext) => {
  skipUnchanged('images', m, context);
  stringValidations('welcomeBannerUrl', m.welcomeBannerUrl);
  stringValidations('notfoundBannerUrl', m.notfoundBannerUrl);
});

const languageSuite = staticSuite((m: TenantSettings, context: SettingsContext) => {
  skipUnchanged('language', m, context);
  stringValidations('locale', m.locale, undefined, 1, true);
  test('enabledLanguages', '@tenant/util.settings.validation.languagesNone', () => {
    enforce(Array.isArray(m.enabledLanguages) && m.enabledLanguages.length > 0).isTruthy();
  });
  test('enabledLanguages', '@tenant/util.settings.validation.languagesUnknown', () => {
    enforce(Array.isArray(m.enabledLanguages) && m.enabledLanguages.every((l) => AvailableLanguages.includes(l))).isTruthy();
  });
});

// rootUrl is picked, never typed: no length cap
const startSuite = staticSuite((m: TenantSettings, context: SettingsContext) => {
  skipUnchanged('start', m, context);
  stringValidations('rootUrl', m.rootUrl, undefined, 1, true);
});

const operatorSuite = staticSuite((m: TenantSettings, context: SettingsContext) => {
  skipUnchanged('operator', m, context);
  stringValidations('opName', m.opName, LONG_NAME_LENGTH);
  emailOrEmpty('opEmail', m.opEmail);
  stringValidations('opStreet', m.opStreet, STREET_LENGTH);
  stringValidations('opZipCode', m.opZipCode, SHORT_NAME_LENGTH);
  stringValidations('opCity', m.opCity, CITY_LENGTH);
  stringValidations('opCountryCode', m.opCountryCode, COUNTRY_LENGTH);
  httpsOrEmpty('opWebUrl', m.opWebUrl);
  httpsOrEmpty('issueUrl', m.issueUrl);
});

const mailSuite = staticSuite((m: TenantSettings, context: SettingsContext) => {
  skipUnchanged('mail', m, context);
  stringValidations('mailFrom', m.mailFrom, SETTINGS_EMAIL_LENGTH);
  // the raw value: what is validated is what settingsDiff writes
  const from = text(m.mailFrom);
  test('mailFrom', '@tenant/util.settings.validation.email', () => {
    enforce(from === '' || EMAIL.test(from)).isTruthy();
  });
  test('mailFrom', '@tenant/util.settings.validation.mailFromDomain', () => {
    enforce(from === '' || allowedSenderDomains(context).includes(senderHost(from))).isTruthy();
  });
});

const privacySuite = staticSuite((m: TenantSettings, context: SettingsContext) => {
  skipUnchanged('privacy', m, context);
  stringValidations('dpoName', m.dpoName, NAME_LENGTH);
  emailOrEmpty('dpoEmail', m.dpoEmail);
  stringValidations('privacyPolicyPageKey', m.privacyPolicyPageKey); // picked, no cap
  stringValidations('privacyPolicyVersion', m.privacyPolicyVersion, SHORT_NAME_LENGTH);
  for (const field of SETTINGS_GROUPS.privacy.filter((f) => f.startsWith('show'))) {
    stringsValidations(field, (m as Record<string, unknown>)[field], [...SETTINGS_AUDIENCES]);
  }
});

const defaultsSuite = staticSuite((m: TenantSettings, context: SettingsContext) => {
  skipUnchanged('defaults', m, context);
  // ids are picked from lists, never typed: no length cap
  stringValidations('ownerLocationId', m.ownerLocationId);
  stringValidations('defaultResourceId', m.defaultResourceId);
  numberValidations('avatarUsage', m.avatarUsage);
  numberValidations('nameDisplay', m.nameDisplay);
  numberValidations('personSortCriteria', m.personSortCriteria);
  deliveryChannelsValidations('newsDelivery', m.newsDelivery);
  deliveryChannelsValidations('invoiceDelivery', m.invoiceDelivery);
});

/** A bare host name exactly as the readers compare it: lower case, no port, no path, no dot at the end. */
function domain(field: string, value: unknown, isMandatory: boolean): void {
  test(field, '@tenant/util.settings.validation.domain', () => {
    enforce((!isMandatory && value === '') || (typeof value === 'string' && value === bareHostname(value))).isTruthy();
  });
}

function path(field: string, value: unknown, isMandatory: boolean): void {
  stringValidations(field, value, URL_LENGTH);
  test(field, '@tenant/util.settings.validation.path', () => {
    enforce((!isMandatory && text(value) === '') || PLAIN_PATH.test(text(value))).isTruthy();
  });
}

const platformSuite = staticSuite((m: TenantSettings, context: SettingsContext) => {
  skipUnchanged('platform', m, context);
  // never emptied: the reset links would open another host, and passkeys would stop
  domain('appDomain', m.appDomain, true);
  test('appDomain', '@tenant/util.settings.validation.domainTaken', () => {
    enforce((context?.takenAppDomains ?? []).includes(text(m.appDomain))).isFalsy();
  });
  domain('emailDomain', m.emailDomain, false);
  test('emailProvider', '@tenant/util.settings.validation.emailProvider', () => {
    enforce(SETTINGS_EMAIL_PROVIDERS.includes(text(m.emailProvider))).isTruthy();
  });
  stringValidations('mailtrapPasswordResetTemplate', m.mailtrapPasswordResetTemplate, LONG_NAME_LENGTH);
  // a wrong login path locks everybody out
  path('loginUrl', m.loginUrl, true);
  path('passwordResetUrl', m.passwordResetUrl, false);
  stringValidations('logoUrl', m.logoUrl, URL_LENGTH);
  // ids, but typed here: the pickers of another tenant cannot be reached
  stringValidations('ownerOrgId', m.ownerOrgId, LONG_NAME_LENGTH);
  stringValidations('ownerUserId', m.ownerUserId, LONG_NAME_LENGTH);
  stringValidations('defaultAccountingTenantId', m.defaultAccountingTenantId, LONG_NAME_LENGTH);
  stringValidations('gitRepo', m.gitRepo, LONG_NAME_LENGTH);
  stringValidations('gitOrg', m.gitOrg, LONG_NAME_LENGTH);
  test('weatherIntervalHours', '@tenant/util.settings.validation.weatherHours', () => {
    const hours = m.weatherIntervalHours;
    enforce(typeof hours === 'number' && Number.isInteger(hours) && hours >= 1 && hours <= SETTINGS_MAX_WEATHER_HOURS).isTruthy();
  });
  booleanValidations('personLookupEnabled', m.personLookupEnabled);
  booleanValidations('isArchived', m.isArchived);
  booleanValidations('showDebugInfo', m.showDebugInfo);
});

/** One suite per settings card. The context carries the domains the mail rule needs and the values as loaded. */
export const settingsValidations: Record<SettingsGroupId, (model: TenantSettings, context: SettingsContext) => ReturnType<typeof appSuite>> = {
  app: (m, c) => appSuite(m, c),
  images: (m, c) => imagesSuite(m, c),
  language: (m, c) => languageSuite(m, c),
  start: (m, c) => startSuite(m, c),
  operator: (m, c) => operatorSuite(m, c),
  mail: (m, c) => mailSuite(m, c),
  privacy: (m, c) => privacySuite(m, c),
  defaults: (m, c) => defaultsSuite(m, c),
  platform: (m, c) => platformSuite(m, c),
};
