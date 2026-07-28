import { AppConfig, UserModel } from '@okr/shared-models';

type AcceptanceUser = Pick<UserModel, 'policyAcceptedVersion'>;
type AcceptanceConfig = Pick<AppConfig, 'privacyPolicyVersion'>;

/** A tenant with no declared policy version never prompts. Legacy docs coalesce to ''. */
export function needsPolicyAcceptance(user: AcceptanceUser, config: AcceptanceConfig): boolean {
  const current = config?.privacyPolicyVersion ?? '';
  if (current === '') return false;
  return (user?.policyAcceptedVersion ?? '') !== current;
}

export function acceptPolicyPatch(version: string, now: string): Partial<UserModel> {
  return { policyAcceptedVersion: version, policyAcceptedAt: now };
}
