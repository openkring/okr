/**
 * Privacy semantics for address channels (spec 1.19 §A2/§A3, decided 2026-07-22).
 *
 * Effective visibility of an address channel value =
 *   stricterAccessor(channelFloor, preference, tenantFloor)   — strictest wins.
 *
 * Owner and admin ALWAYS see their own/full data — that bypass lives in the
 * enforcement layer (rules / projection CFs, Phase 4), not in this formula.
 * NOT ENFORCED YET: until Phase 4 ships, these helpers describe intent only
 * (see the privacy-model skill).
 */
import { PrivacyAccessor, PrivacySettings, privacyUsageToAccessor, stricterAccessor } from './app-config.model';
import { PrivacyUsage } from './enums/privacy-usage.enum';

/**
 * Intrinsic sensitivity floor per addressChannel ("sensitivityStrength").
 * A code constant — never stored per document, so it cannot drift.
 * Channels absent from this map have no floor ('public'): the preference input decides.
 */
export const CHANNEL_SENSITIVITY_FLOOR: Record<string, PrivacyAccessor> = {
  ssn: 'privileged',         // AHV number — besonders schützenswert (revDSG)
  dob: 'privileged',         // date of birth
  bankaccount: 'privileged', // iban
};

export function getChannelFloor(channel: string): PrivacyAccessor {
  return CHANNEL_SENSITIVITY_FLOOR[channel] ?? 'public';
}

/**
 * Address channels that are NOT contact channels: they carry sensitive scalar
 * identity data (spec 1.19 vault) and must be excluded from the contact
 * accordion/list/count. They live under the same parentKey as the real contact
 * channels, so "all addresses of a person" stays a single query — the contact UI
 * just doesn't render these two.
 */
export const SENSITIVE_SCALAR_CHANNELS: readonly string[] = ['ssn', 'dob'];

export function isSensitiveScalarChannel(channel: string): boolean {
  return SENSITIVE_SCALAR_CHANNELS.includes(channel);
}

/**
 * Compute who may see an address channel value (spec 1.19 §A3).
 * @param channel      the addressChannel ('email' | 'phone' | 'postal' | 'web' | 'bankaccount' | 'ssn' | 'dob' | …)
 * @param parentType   'person' (preference = usage* flag, Restricted when absent — Firestore
 *                     reads skip model defaults on legacy docs) or 'org' (intentionally public)
 * @param personUsage  the person's PrivacyUsage flag for this field class (ignored for orgs)
 * @param tenantFloor  the tenant's AppConfig.PrivacySettings accessor for this field class
 */
export function getEffectiveAccessor(
  channel: string,
  parentType: 'person' | 'org',
  personUsage?: PrivacyUsage,
  tenantFloor?: PrivacyAccessor,
): PrivacyAccessor {
  const preference: PrivacyAccessor = parentType === 'org'
    ? 'public'
    : privacyUsageToAccessor(personUsage ?? PrivacyUsage.Restricted);
  return stricterAccessor(getChannelFloor(channel), stricterAccessor(preference, tenantFloor ?? 'public'));
}

/**
 * Whether a viewer tier satisfies a required accessor (rank comparison):
 * accessorAllows('privileged', 'registered') → true; ('registered', 'privileged') → false.
 */
export function accessorAllows(viewer: PrivacyAccessor, required: PrivacyAccessor): boolean {
  return stricterAccessor(viewer, required) === viewer;
}

/** The person's privacy preferences relevant for address channels (subset of PersonModel). */
export interface PersonPrivacyPreferences {
  usageEmail: PrivacyUsage;
  usagePhone: PrivacyUsage;
  usagePostalAddress: PrivacyUsage;
  usageDateOfBirth: PrivacyUsage;
}

/**
 * Which person `usage*` flag and which tenant `AppConfig.PrivacySettings` floor
 * govern each addressChannel (spec 1.19 Phase 4). Channels absent from this map
 * (e.g. 'web', 'twint') have neither: the Restricted default / no floor applies.
 * AppConfig itself structurally satisfies Partial<PrivacySettings>, so it can be
 * passed directly as the settings argument.
 */
export const CHANNEL_PRIVACY_INPUTS: Record<string, { usageFlag?: keyof PersonPrivacyPreferences; tenantFloor?: keyof PrivacySettings }> = {
  email:       { usageFlag: 'usageEmail',         tenantFloor: 'showEmail' },
  phone:       { usageFlag: 'usagePhone',         tenantFloor: 'showPhone' },
  postal:      { usageFlag: 'usagePostalAddress', tenantFloor: 'showPostalAddress' },
  dob:         { usageFlag: 'usageDateOfBirth',   tenantFloor: 'showDateOfBirth' },
  ssn:         { tenantFloor: 'showTaxId' },
  bankaccount: { tenantFloor: 'showIban' },
};

/**
 * Effective accessor of one address doc: resolves the channel's governing
 * usage* flag and tenant floor per CHANNEL_PRIVACY_INPUTS, then applies the
 * §A3 formula via getEffectiveAccessor. This is the ONLY way enforcement code
 * (projection trigger, getAddressView, CF consumers) may compute visibility.
 */
export function getEffectiveAccessorForAddress(
  address: { addressChannel: string },
  parentType: 'person' | 'org',
  person?: Partial<PersonPrivacyPreferences>,
  settings?: Partial<PrivacySettings>,
): PrivacyAccessor {
  const inputs = CHANNEL_PRIVACY_INPUTS[address.addressChannel] ?? {};
  const usage = inputs.usageFlag ? person?.[inputs.usageFlag] : undefined;
  const floor = inputs.tenantFloor ? settings?.[inputs.tenantFloor] : undefined;
  return getEffectiveAccessor(address.addressChannel, parentType, usage, floor);
}
