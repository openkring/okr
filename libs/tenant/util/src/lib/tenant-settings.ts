import { AppConfig, AvatarUsage, DEFAULT_DELIVERY_CHANNELS, DeliveryChannel, NameDisplay, PersonSortCriteria } from '@okr/shared-models';

export type SettingsGroupId = 'app' | 'images' | 'language' | 'start' | 'operator' | 'mail' | 'privacy' | 'defaults' | 'platform';

/** The audiences a privacy setting can take, most permissive first. */
export const SETTINGS_AUDIENCES = ['public', 'registered', 'privileged', 'admin'] as const;

/**
 * Which `app-config` fields each settings card edits (spec 1.174 §7.2). A field is in exactly one group.
 * Not in any group on purpose: `enabledFeatures` (server-only), `hiddenMenuKeys`, `modelFields`, `hiddenWidgets`
 * (own editors) and the fields nothing reads (`osiLogoUrl`, `minYear`, `maxYear`, `showImages`, `showArchivedData`,
 * `showName`, `showMemberships`, `showOwnerships`, `showComments`, `showDocuments`, `showNotes`).
 * `app-config` is world-readable: nothing secret belongs in any of these lists.
 */
export const SETTINGS_GROUPS: Record<SettingsGroupId, readonly (keyof AppConfig)[]> = {
  app: ['appName', 'appTitle', 'appSubtitle', 'description', 'brandColor'],
  images: ['welcomeBannerUrl', 'notfoundBannerUrl'],
  language: ['locale', 'enabledLanguages'],
  start: ['rootUrl', 'useMenuSearch'],
  operator: ['opName', 'opEmail', 'opStreet', 'opZipCode', 'opCity', 'opCountryCode', 'opWebUrl', 'issueUrl'],
  mail: ['mailFrom'],
  privacy: [
    'dpoName', 'dpoEmail', 'privacyPolicyPageKey', 'privacyPolicyVersion',
    'showDateOfBirth', 'showDateOfDeath', 'showEmail', 'showPhone', 'showPostalAddress',
    'showIban', 'showTaxId', 'showGender', 'showBexioId', 'showTags',
  ],
  defaults: ['ownerLocationId', 'defaultResourceId', 'avatarUsage', 'nameDisplay', 'personSortCriteria', 'newsDelivery', 'invoiceDelivery'],
  platform: [
    'appDomain', 'emailDomain', 'emailProvider', 'mailtrapPasswordResetTemplate',
    'loginUrl', 'passwordResetUrl', 'logoUrl',
    'ownerOrgId', 'ownerUserId', 'defaultAccountingTenantId',
    'integrations', 'additionalProcessors',
    'personLookupEnabled', 'listedInPortal', 'weatherIntervalHours',
    'gitRepo', 'gitOrg', 'isArchived', 'showDebugInfo',
  ],
};

/**
 * The numbers the «Vorgaben» selects offer, per field: the values of the enum a user's own settings offer. «Keine Namen»
 * (`NameDisplay.None`) is for the people section only and never a default. `userDefaultsFrom` (functions) keeps the same set.
 */
export const SETTINGS_DEFAULT_NUMBERS: Readonly<Record<'avatarUsage' | 'nameDisplay' | 'personSortCriteria', readonly number[]>> = {
  avatarUsage: [AvatarUsage.None, AvatarUsage.GravatarFirst, AvatarUsage.NoGravatar, AvatarUsage.PhotoFirst],
  nameDisplay: [NameDisplay.FirstLast, NameDisplay.LastFirst, NameDisplay.FirstOnly, NameDisplay.LastOnly],
  personSortCriteria: [PersonSortCriteria.Firstname, PersonSortCriteria.Lastname, PersonSortCriteria.Fullname, PersonSortCriteria.DateOfBirth, PersonSortCriteria.Key],
};

/**
 * The mail services `app-config.emailProvider` can name: `VALID_PROVIDERS` in `apps/functions/src/auth/email-transport.ts`,
 * whose spec compares the two. Empty means the default of the functions; the form does not offer it as a choice.
 */
export const SETTINGS_EMAIL_PROVIDERS: readonly string[] = ['mailgun_smtp', 'mailtrap_api', 'netzone_smtp', 'mailtrap_test'];

/** The groups `/operator/settings` offers to edit; everything else belongs to the tenant. */
export const OPERATOR_FORM_GROUPS: readonly SettingsGroupId[] = ['platform'];
/** The groups `/tenant/settings` offers to edit: never the platform group, not even to the operator, who has a page for it. */
export const TENANT_FORM_GROUPS: readonly SettingsGroupId[] = (Object.keys(SETTINGS_GROUPS) as SettingsGroupId[]).filter((group) => !OPERATOR_FORM_GROUPS.includes(group));

/** The fields only the operator (`isOperator()`, admin of exactly `bka`) may change; mirrors `firestore.rules`. */
export const OPERATOR_SETTINGS: readonly (keyof AppConfig)[] = SETTINGS_GROUPS.platform;

export type TenantSettings = Partial<AppConfig>;

/** Defaults that embed the tenant id: never carried over from another tenant, so a missing value becomes ''. */
const TENANT_DERIVED: ReadonlySet<string> = new Set([
  'welcomeBannerUrl', 'notfoundBannerUrl', 'ownerLocationId', 'defaultResourceId', 'ownerUserId', 'ownerOrgId', 'logoUrl', 'issueUrl',
]);

const AUDIENCE_FIELDS: ReadonlySet<string> = new Set(SETTINGS_GROUPS.privacy.filter((f) => f.startsWith('show')));
const DELIVERY_FIELDS: ReadonlySet<string> = new Set(['newsDelivery', 'invoiceDelivery']);

const KNOWN_CHANNELS = Object.values(DeliveryChannel) as string[];

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One field of one document, read as the class would: the stored value when it has the right shape, else the default. */
function coalesce(field: string, stored: unknown, fallback: unknown): unknown {
  if (AUDIENCE_FIELDS.has(field)) {
    return typeof stored === 'string' && (SETTINGS_AUDIENCES as readonly string[]).includes(stored) ? stored : fallback;
  }
  if (DELIVERY_FIELDS.has(field)) {
    // the old enum stored numbers: only a list of known channels is usable
    const ok = Array.isArray(stored) && stored.length > 0 && stored.every((c) => typeof c === 'string' && KNOWN_CHANNELS.includes(c));
    return ok ? clone(stored) : clone(fallback ?? DEFAULT_DELIVERY_CHANNELS);
  }
  if (field === 'enabledLanguages') {
    // empty means «all languages» in the store; the form shows that as all ticked
    return Array.isArray(stored) && stored.length > 0 && stored.every((l) => typeof l === 'string') ? clone(stored) : clone(fallback);
  }
  if (typeof fallback === 'string') {
    if (typeof stored === 'string') return stored;
    return stored === null ? '' : fallback;
  }
  if (typeof fallback === 'boolean') return typeof stored === 'boolean' ? stored : fallback;
  if (typeof fallback === 'number') return typeof stored === 'number' && Number.isFinite(stored) ? stored : fallback;
  if (Array.isArray(fallback)) return Array.isArray(stored) ? clone(stored) : clone(fallback);
  if (isPlainObject(fallback)) return isPlainObject(stored) ? clone(stored) : clone(fallback);
  return stored === undefined ? clone(fallback) : clone(stored);
}

/**
 * The values of one group, as a form wants them: a deep copy in which every field of the group is defined, whatever
 * the stored document holds (missing, null, a wrong type, an unknown audience, the old numeric delivery enum).
 */
export function settingsOf(config: AppConfig, group: SettingsGroupId): TenantSettings {
  const defaults = new AppConfig('x') as unknown as Record<string, unknown>;
  const stored = (config ?? {}) as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of SETTINGS_GROUPS[group]) {
    const fallback = TENANT_DERIVED.has(field) ? '' : defaults[field];
    out[field] = coalesce(field, stored[field], fallback);
  }
  return out as TenantSettings;
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => sameValue(a[k], b[k]));
  }
  return false;
}

const ALL_FIELDS: ReadonlySet<string> = new Set(Object.values(SETTINGS_GROUPS).flat() as string[]);

/** The fields that changed, by value; only fields of a settings group are ever returned. An emptied text is `''`. */
export function settingsDiff(before: TenantSettings, after: TenantSettings): TenantSettings {
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(a)) {
    if (!ALL_FIELDS.has(key) || a[key] === undefined) continue;
    if (!sameValue(b[key], a[key])) out[key] = clone(a[key]);
  }
  return out as TenantSettings;
}
