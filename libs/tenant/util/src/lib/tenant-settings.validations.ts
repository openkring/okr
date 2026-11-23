import { CITY_LENGTH, COUNTRY_LENGTH, DESCRIPTION_LENGTH, LONG_NAME_LENGTH, NAME_LENGTH, SHORT_NAME_LENGTH, STREET_LENGTH, URL_LENGTH } from '@okr/shared-constants';
import { AvailableLanguages } from '@okr/shared-models';
import { bareHostname, booleanValidations, deliveryChannelsValidations, numberValidations, stringsValidations, stringValidations } from '@okr/shared-util-core';
import { enforce, staticSuite, test } from 'vest';

import { SETTINGS_AUDIENCES, SETTINGS_GROUPS, type SettingsGroupId, type TenantSettings } from './tenant-settings';

// Vest messages are i18n keys: okr-error-note resolves any message starting with '@'.
const MSG = '@tenant/util.settings.validation.';

export interface SettingsContext {
  /** The group as it was loaded: an unchanged stored value always passes. */
  before: TenantSettings;
  emailDomain: string;
  appDomain: string;
}

const COLOR = /^#[0-9a-fA-F]{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const APP_NAME_FORBIDDEN = /["<>\n\r]/;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function emailOrEmpty(field: string, value: unknown): void {
  stringValidations(field, value, 100);
  test(field, `${MSG}email`, () => {
    enforce(text(value) === '' || EMAIL.test(text(value))).isTruthy();
  });
}

function httpsOrEmpty(field: string, value: unknown): void {
  stringValidations(field, value, URL_LENGTH);
  test(field, `${MSG}https`, () => {
    enforce(text(value) === '' || text(value).startsWith('https://')).isTruthy();
  });
}

/** The host of a sender address, lower-case; '' when there is no `@`. */
function senderHost(address: string): string {
  const at = address.lastIndexOf('@');
  return at < 0 ? '' : address.slice(at + 1).trim().toLowerCase();
}

/** Domains a tenant may send from: the mail domain, the app domain, and the app domain without its `app.`. An empty domain matches nothing. */
export function allowedSenderDomains(context: Pick<SettingsContext, 'emailDomain' | 'appDomain'>): string[] {
  const email = text(context.emailDomain).trim().toLowerCase();
  const app = text(context.appDomain).trim().toLowerCase();
  return [email, app, app.startsWith('app.') ? app.slice(4) : ''].filter((d) => d !== '');
}

const appSuite = staticSuite((m: TenantSettings) => {
  stringValidations('appName', m.appName, NAME_LENGTH, 1, true);
  test('appName', `${MSG}appNameChars`, () => {
    enforce(APP_NAME_FORBIDDEN.test(text(m.appName))).isFalsy();
  });
  stringValidations('appTitle', m.appTitle, LONG_NAME_LENGTH);
  stringValidations('appSubtitle', m.appSubtitle, LONG_NAME_LENGTH);
  stringValidations('description', m.description, DESCRIPTION_LENGTH);
  test('brandColor', `${MSG}brandColor`, () => {
    enforce(typeof m.brandColor === 'string' && (m.brandColor === '' || COLOR.test(m.brandColor))).isTruthy();
  });
});

// banner urls are produced by the upload, never typed: no length cap
const imagesSuite = staticSuite((m: TenantSettings) => {
  stringValidations('welcomeBannerUrl', m.welcomeBannerUrl);
  stringValidations('notfoundBannerUrl', m.notfoundBannerUrl);
});

const languageSuite = staticSuite((m: TenantSettings) => {
  stringValidations('locale', m.locale, undefined, 1, true);
  test('enabledLanguages', `${MSG}languagesNone`, () => {
    enforce(Array.isArray(m.enabledLanguages) && m.enabledLanguages.length > 0).isTruthy();
  });
  test('enabledLanguages', `${MSG}languagesUnknown`, () => {
    enforce(Array.isArray(m.enabledLanguages) && m.enabledLanguages.every((l) => AvailableLanguages.includes(l))).isTruthy();
  });
});

// rootUrl is picked, never typed: no length cap
const startSuite = staticSuite((m: TenantSettings) => {
  stringValidations('rootUrl', m.rootUrl, undefined, 1, true);
});

const operatorSuite = staticSuite((m: TenantSettings) => {
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
  stringValidations('mailFrom', m.mailFrom, 100);
  const from = text(m.mailFrom).trim();
  test('mailFrom', `${MSG}email`, () => {
    enforce(from === '' || from === text(context.before?.mailFrom) || EMAIL.test(from)).isTruthy();
  });
  test('mailFrom', `${MSG}mailFromDomain`, () => {
    enforce(from === '' || from === text(context.before?.mailFrom) || allowedSenderDomains(context).includes(senderHost(from))).isTruthy();
  });
});

const privacySuite = staticSuite((m: TenantSettings) => {
  stringValidations('dpoName', m.dpoName, NAME_LENGTH);
  emailOrEmpty('dpoEmail', m.dpoEmail);
  stringValidations('privacyPolicyPageKey', m.privacyPolicyPageKey); // picked, no cap
  stringValidations('privacyPolicyVersion', m.privacyPolicyVersion, SHORT_NAME_LENGTH);
  for (const field of SETTINGS_GROUPS.privacy.filter((f) => f.startsWith('show'))) {
    stringsValidations(field, (m as Record<string, unknown>)[field], [...SETTINGS_AUDIENCES]);
  }
});

const defaultsSuite = staticSuite((m: TenantSettings) => {
  // ids are picked from lists, never typed: no length cap
  stringValidations('ownerLocationId', m.ownerLocationId);
  stringValidations('defaultResourceId', m.defaultResourceId);
  numberValidations('avatarUsage', m.avatarUsage);
  numberValidations('nameDisplay', m.nameDisplay);
  numberValidations('personSortCriteria', m.personSortCriteria);
  deliveryChannelsValidations('newsDelivery', m.newsDelivery);
  deliveryChannelsValidations('invoiceDelivery', m.invoiceDelivery);
});

function domainOrEmpty(field: string, value: unknown): void {
  test(field, `${MSG}domain`, () => {
    enforce(typeof value === 'string' && (value === '' || bareHostname(value) !== undefined)).isTruthy();
  });
}

const platformSuite = staticSuite((m: TenantSettings) => {
  domainOrEmpty('appDomain', m.appDomain);
  domainOrEmpty('emailDomain', m.emailDomain);
  test('weatherIntervalHours', `${MSG}positive`, () => {
    enforce(typeof m.weatherIntervalHours === 'number' && Number.isFinite(m.weatherIntervalHours) && m.weatherIntervalHours > 0).isTruthy();
  });
  booleanValidations('personLookupEnabled', m.personLookupEnabled);
  booleanValidations('isArchived', m.isArchived);
  booleanValidations('showDebugInfo', m.showDebugInfo);
});

/** One suite per settings card. The context carries the domains the mail rule needs and the values as loaded. */
export const settingsValidations: Record<SettingsGroupId, (model: TenantSettings, context: SettingsContext) => ReturnType<typeof appSuite>> = {
  app: (m) => appSuite(m),
  images: (m) => imagesSuite(m),
  language: (m) => languageSuite(m),
  start: (m) => startSuite(m),
  operator: (m) => operatorSuite(m),
  mail: (m, c) => mailSuite(m, c),
  privacy: (m) => privacySuite(m),
  defaults: (m) => defaultsSuite(m),
  platform: (m) => platformSuite(m),
};
