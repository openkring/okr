import { AvatarInfo, MandateAction, MandateModel, MeetingModel } from '@okr/shared-models';

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

/**
 * Proxies are recorded and revoked only while the meeting is `draft` or `invited` (spec §6); from `held` on they are
 * read-only. A legacy meeting without `state` counts as a draft (the model default). The rules do not check this.
 */
export function isMeetingOpenForProxies(meeting: Pick<MeetingModel, 'state'>): boolean {
  const state = meeting.state ?? 'draft';
  return state === 'draft' || state === 'invited';
}

/**
 * May `callerKey` record a proxy of `grantorKey` for this meeting (spec §6)? The meeting must be stored and open, the
 * tenant must allow proxies (`cap` = maxProxiesPerHolder > 0), and the caller must be the grantor, the chair
 * (`meeting.chair.key` is the raw personKey) or an admin (`isAdmin` = privileged or memberAdmin, decided by the caller).
 */
export function mayRecordProxy(
  meeting: Pick<MeetingModel, 'okey' | 'state' | 'chair'>,
  grantorKey: string,
  callerKey: string,
  cap: number,
  isAdmin: boolean,
): boolean {
  if (!meeting.okey || !grantorKey || !callerKey || cap <= 0 || !isMeetingOpenForProxies(meeting)) return false;
  return isAdmin || callerKey === grantorKey || callerKey === (meeting.chair?.key ?? '');
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

/**
 * The first name of `personKey` as the Vollmachten I gave (`given`: my grantee is the other party) or received
 * (`received`: my grantor is the other party) carry it. A fallback for a person the app has not loaded; '' when no
 * Vollmacht names them, so a caller never shows a raw key.
 */
export function mandatePartyName(personKey: string, given: MandateModel[], received: MandateModel[]): string {
  if (!personKey) return '';
  const fromGiven = given.find((m) => m.granteeKey === personKey)?.grantee?.name1;
  const fromReceived = received.find((m) => m.grantorKey === personKey)?.grantor?.name1;
  return fromGiven || fromReceived || '';
}
