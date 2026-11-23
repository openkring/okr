import { AvailableLanguages, FOOTPRINT_PAGE_TYPE, type PageModel } from '@okr/shared-models';
import { forkKeyFor } from '@okr/shared-util-core';

import { SETTINGS_GROUPS, type SettingsGroupId, type TenantSettings } from './tenant-settings';
import { settingsAudienceKey, settingsFieldKey, settingsLocaleKey } from './tenant-settings-i18n';
import { settingsImageName } from './tenant-settings-image';

/** What the settings page needs to show a stored value as a person would say it. A lookup answers '' for an unknown key. */
export interface SettingsDisplayContext {
  /** the text of a `SETTINGS_I18N_KEYS` name, '' when there is none */
  text: (name: string) => string;
  countryName: (code: string) => string;
  pageName: (key: string) => string;
  locationName: (key: string) => string;
  resourceName: (key: string) => string;
  /** the label of a start page, by its url */
  startName: (url: string) => string;
  orgName: (key: string) => string;
}

/** One line of a settings card. `value` is '' when nothing is set; the card shows the text named `emptyText` then. */
export interface SettingsRow {
  field: string;
  label: string;
  value: string;
  /** «Standard» where another value applies instead, «Nicht gesetzt» where nothing does */
  emptyText: 'fallback' | 'empty';
  /** '#rrggbb' for the brand colour: the card shows a swatch next to it */
  color: string;
}

export interface SettingsPageOption { key: string; label: string; }

/** A location or resource the user picked: its id as `app-config` stores it (the okey, no prefix) and its name. */
export interface SettingsChoice { id: string; name: string; }

/** Fields that hold the number of an enum; their labels are named `<field>_<number>`. */
const ENUM_FIELDS: ReadonlySet<string> = new Set(['avatarUsage', 'nameDisplay', 'personSortCriteria']);
/** Fields that another value stands in for while they are empty, as their helper says. Every other empty field means: nothing. */
const FALLBACK_FIELDS: ReadonlySet<string> = new Set([
  'brandColor', 'notfoundBannerUrl', 'rootUrl', 'mailFrom', 'dpoEmail',
  'emailDomain', 'emailProvider', 'mailtrapPasswordResetTemplate', 'loginUrl', 'passwordResetUrl',
]);
const COLOR = /^#[0-9a-fA-F]{6}$/;

/** The name behind a key, and the key itself when nothing is found: a stored value is never hidden. */
function nameOr(key: string, name: (key: string) => string): string {
  return key === '' ? '' : name(key) || key;
}

/** A stored settings value as text; '' when nothing is set. Never 'undefined', 'null' or '[object Object]'. */
export function settingsDisplayValue(field: string, value: unknown, ctx: SettingsDisplayContext): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return ctx.text(value ? 'yes' : 'no');
  if (typeof value === 'number') return ENUM_FIELDS.has(field) ? ctx.text(`${field}_${value}`) || String(value) : String(value);
  if (Array.isArray(value)) {
    return value.map((item: unknown) => {
      if (field === 'enabledLanguages') return ctx.text(`language_${item}`) || String(item);
      if (field === 'newsDelivery' || field === 'invoiceDelivery') return ctx.text(`channel_${item}`) || String(item);
      if (typeof item === 'object' && item !== null) return String((item as Record<string, unknown>)['name'] ?? '');
      return String(item);
    }).filter((s) => s !== '').join(', ');
  }
  if (typeof value === 'object') {
    // integrations: the names of those that are on
    return Object.entries(value).filter(([, on]) => on === true).map(([name]) => name).join(', ');
  }
  const text = String(value);
  if (field.startsWith('show')) return ctx.text(settingsAudienceKey(text)) || text;
  switch (field) {
    case 'locale': return ctx.text(settingsLocaleKey(text)) || text;
    case 'welcomeBannerUrl':
    case 'notfoundBannerUrl': return settingsImageName(text);
    case 'rootUrl': return nameOr(text, ctx.startName);
    case 'opCountryCode': return nameOr(text, ctx.countryName);
    case 'privacyPolicyPageKey': return nameOr(text, ctx.pageName);
    case 'ownerLocationId': return nameOr(text, ctx.locationName);
    case 'defaultResourceId': return nameOr(text, ctx.resourceName);
    case 'ownerOrgId': return nameOr(text, ctx.orgName);
    default: return text.trim();
  }
}

/** The lines of one card, in the order of the group. */
export function settingsRows(group: SettingsGroupId, settings: TenantSettings, ctx: SettingsDisplayContext): SettingsRow[] {
  const values = settings as Record<string, unknown>;
  return SETTINGS_GROUPS[group].map((field) => {
    const value = settingsDisplayValue(field, values[field], ctx);
    return {
      field, label: ctx.text(settingsFieldKey(field)), value,
      emptyText: FALLBACK_FIELDS.has(field) ? 'fallback' : 'empty',
      color: field === 'brandColor' && COLOR.test(value) ? value : '',
    };
  });
}

/** The name of the page a stored key opens: the tenant's own copy `<key>_<tenant>` first, as `PageService.read` does; '' when unknown. */
export function settingsPageName(key: string, pages: readonly PageModel[], tenantId: string): string {
  if (!key) return '';
  const page = pages.find((p) => p.okey === forkKeyFor(key, tenantId)) ?? pages.find((p) => p.okey === key);
  return page ? page.name || page.title || page.okey : '';
}

/**
 * The pages a tenant can pick for a link everyone follows, by name: only pages that are visible without signing in, no
 * travel footprints, and no shared page the tenant has its own copy of.
 * The stored key is always among them (its own copy is then not listed a second time), under the name of the page it opens, or as it is when no page is known.
 */
export function settingsPageOptions(pages: readonly PageModel[], tenantId: string, stored: string): SettingsPageOption[] {
  const keys = new Set(pages.map((p) => p.okey));
  const own = stored ? forkKeyFor(stored, tenantId) : '';
  const options = pages
    .filter((p) => !p.isPrivate && p.type !== FOOTPRINT_PAGE_TYPE && p.okey !== stored && p.okey !== own && !keys.has(forkKeyFor(p.okey, tenantId)))
    .map((p) => ({ key: p.okey, label: settingsPageName(p.okey, pages, tenantId) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return stored ? [{ key: stored, label: settingsPageName(stored, pages, tenantId) || stored }, ...options] : options;
}

/** The offered values with the stored one first when it is not among them: a value the list does not know is kept. */
export function withStored(offered: readonly string[], stored: unknown): string[] {
  return typeof stored === 'string' && stored !== '' && !offered.includes(stored) ? [stored, ...offered] : [...offered];
}

/**
 * The enabled languages after one was switched: the stored order stays (without `de` the first entry is the language of
 * the sign-in page), a language switched on is added at the end. Codes the app does not know are dropped.
 */
export function withLanguage(current: readonly string[], code: string, enabled: boolean): string[] {
  const known = current.filter((c) => AvailableLanguages.includes(c) && (enabled || c !== code));
  return enabled && !known.includes(code) && AvailableLanguages.includes(code) ? [...known, code] : known;
}
