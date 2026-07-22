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
import { PrivacyAccessor, privacyUsageToAccessor, stricterAccessor } from './app-config.model';
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
