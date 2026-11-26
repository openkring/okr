import { AvatarInfo, MandateAction, MandateModel } from '@okr/shared-models';

/**
 * Pure rules of the Vollmacht (spec 1.180). `today` is a StoreDate string (yyyymmdd) passed in by the caller —
 * these functions never read the clock. `''` in `validFrom` / `validTo` means open; `validTo` is inclusive.
 */

/** Active = not archived, not revoked and today lies within [validFrom, validTo]. */
export function isMandateActive(m: MandateModel, today: string): boolean {
  if (m.isArchived) return false;
  if ((m.revokedAt ?? '') !== '') return false;
  const from = m.validFrom ?? '';
  const to = m.validTo ?? '';
  return (from === '' || from <= today) && (to === '' || today <= to);
}

/** The persons on whose behalf `granteeKey` may do `action`: grantors of active family mandates, deduplicated. */
export function grantorKeysFor(mandates: MandateModel[], granteeKey: string, action: MandateAction, today: string): string[] {
  const keys = mandates
    .filter((m) => m.kind === 'family' && m.granteeKey === granteeKey && m.actions.includes(action) && isMandateActive(m, today))
    .map((m) => m.grantorKey);
  return [...new Set(keys)];
}

/** The active proxy a grantor has given for a meeting. */
export function proxyFor(mandates: MandateModel[], meetingKey: string, grantorKey: string, today: string): MandateModel | undefined {
  return mandates.find((m) => m.kind === 'proxy' && m.meetingKey === meetingKey && m.grantorKey === grantorKey && isMandateActive(m, today));
}

/** The active proxies a grantee holds for a meeting. */
export function proxiesHeldBy(mandates: MandateModel[], meetingKey: string, granteeKey: string, today: string): MandateModel[] {
  return mandates.filter((m) => m.kind === 'proxy' && m.meetingKey === meetingKey && m.granteeKey === granteeKey && isMandateActive(m, today));
}

/** May the grantee take one more proxy for the meeting? `cap` is the tenant's maxProxiesPerHolder; 0 = no proxies. */
export function mayReceiveProxy(mandates: MandateModel[], meetingKey: string, granteeKey: string, cap: number, today: string): boolean {
  return cap > 0 && proxiesHeldBy(mandates, meetingKey, granteeKey, today).length < cap;
}

/** The active proxy a new one for this grantor and meeting has to revoke (one proxy per grantor and meeting). */
export function proxyReplaces(mandates: MandateModel[], meetingKey: string, grantorKey: string, today: string): MandateModel | undefined {
  return proxyFor(mandates, meetingKey, grantorKey, today);
}

export function revokePatch(byKey: string, now: string): Pick<MandateModel, 'revokedAt' | 'revokedByKey'> {
  return { revokedAt: now, revokedByKey: byKey };
}

export function newFamilyMandate(
  tenantId: string,
  grantor: AvatarInfo,
  grantee: AvatarInfo,
  actions: MandateAction[],
  validTo: string,
  createdByKey: string,
): MandateModel {
  const m = new MandateModel(tenantId);
  m.kind = 'family';
  m.grantorKey = grantor.key;
  m.grantor = grantor;
  m.granteeKey = grantee.key;
  m.grantee = grantee;
  m.actions = [...actions];
  m.validTo = validTo;
  m.createdByKey = createdByKey;
  return m;
}

export function newProxyMandate(tenantId: string, grantor: AvatarInfo, grantee: AvatarInfo, meetingKey: string, createdByKey: string): MandateModel {
  const m = new MandateModel(tenantId);
  m.kind = 'proxy';
  m.grantorKey = grantor.key;
  m.grantor = grantor;
  m.granteeKey = grantee.key;
  m.grantee = grantee;
  m.actions = ['meeting.represent'];
  m.meetingKey = meetingKey;
  m.createdByKey = createdByKey;
  return m;
}
