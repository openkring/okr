import { CHANNEL_PRIVACY_INPUTS } from '@okr/shared-models';

import { SETTINGS_AUDIENCES, type TenantSettings } from './tenant-settings';

/** Same scope prefix as `customize-i18n.ts`: the lib's full path, `tenant/util.`. */
const PFX = '@tenant/util.settings.confirm.';

/** What a save of the settings has to ask the user about first (spec 1.174 §7.4). */
export type SettingsConfirmation = 'widen' | 'rebuild' | 'policy' | 'domain' | 'login';

/** Text keys of the combined confirmation: one sentence per confirmation, and the closing question. */
export const SETTINGS_CONFIRM_I18N_KEYS: Record<SettingsConfirmation | 'ask', string> = {
  widen: PFX + 'widen',
  rebuild: PFX + 'rebuild',
  policy: PFX + 'policy',
  domain: PFX + 'domain',
  login: PFX + 'login',
  ask: PFX + 'ask',
};

/**
 * The `show*` fields that feed the address directory: the tenant floors of `CHANNEL_PRIVACY_INPUTS`. Changing
 * one makes `onAppConfigChange` rebuild the whole directory. Derived, never copied: a new channel with a floor
 * joins automatically.
 */
export const REBUILD_FIELDS: ReadonlySet<string> = new Set(
  Object.values(CHANNEL_PRIVACY_INPUTS).map((input) => input.tenantFloor).filter((field): field is NonNullable<typeof field> => !!field),
);

const AUDIENCES: readonly string[] = SETTINGS_AUDIENCES;

/**
 * Does the change let MORE people see a value? `SETTINGS_AUDIENCES` is ordered most permissive first, so a
 * smaller index is a wider audience. An old value we cannot place counts as widening (we ask rather than
 * guess); a new value we cannot place is no widening (validation refuses it anyway).
 */
export function isWidening(before: unknown, after: unknown): boolean {
  const to = typeof after === 'string' ? AUDIENCES.indexOf(after) : -1;
  if (to < 0) return false;
  const from = typeof before === 'string' ? AUDIENCES.indexOf(before) : -1;
  return from < 0 || to < from;
}

/**
 * The confirmations a save needs, in the fixed order widen, rebuild, policy, domain, login. `changes` is the diff, `before`
 * the settings at opening time. The rebuild hint applies to ANY change of an address-directory field, the
 * widening confirmation only to a widening of an audience field.
 */
export function settingsConfirmations(changes: TenantSettings, before: TenantSettings): SettingsConfirmation[] {
  const c = changes as Record<string, unknown>;
  const b = before as Record<string, unknown>;
  const fields = Object.keys(c);
  const out: SettingsConfirmation[] = [];
  if (fields.some((f) => f.startsWith('show') && isWidening(b[f], c[f]))) out.push('widen');
  if (fields.some((f) => REBUILD_FIELDS.has(f))) out.push('rebuild');
  // without a version nobody is asked to accept anything (`needsPolicyAcceptance`)
  if (String(c['privacyPolicyVersion'] ?? '').trim() !== '') out.push('policy');
  if (fields.includes('appDomain')) out.push('domain');
  if (fields.includes('loginUrl')) out.push('login');
  return out;
}

/** The one dialog text: the sentences of the needed confirmations, then the question. Empty when none is needed. */
export function confirmationMessage(needed: SettingsConfirmation[], texts: Record<SettingsConfirmation | 'ask', string>): string {
  if (needed.length === 0) return '';
  return [...needed.map((n) => texts[n]), texts.ask].join(' ');
}
