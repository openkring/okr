import { DEFAULT_HOUSEHOLD_BUNDLE, HOUSEHOLD_RECIPIENT_PREFIX, HouseholdBundle, HouseholdModel } from '@okr/shared-models';

export type HouseholdError = 'no-name' | 'payer-not-member' | 'contact-not-member' | 'duplicate-member' | 'already-in-household' | 'bad-tenants';
export type HouseholdRefusal = 'not-allowed' | 'members-changed' | 'tenants-changed' | 'field-not-allowed';

/** The bundle of a raw (possibly legacy) household doc; missing fields fall back to the defaults. */
export function readBundle(h: Partial<HouseholdModel>): HouseholdBundle {
  return { ...DEFAULT_HOUSEHOLD_BUNDLE, ...(h.bundle ?? {}) };
}

/** The recipient key of a household. */
export function householdRecipientKey(okey: string): string {
  return `${HOUSEHOLD_RECIPIENT_PREFIX}${okey}`;
}

/** Whether a recipient key names a household. */
export function isHouseholdRecipient(key: string): boolean {
  return key.startsWith(HOUSEHOLD_RECIPIENT_PREFIX);
}

/** A copy of the household without the member; payer/contact pointing to the member move to the first remaining one. */
export function removeHouseholdMember(h: HouseholdModel, personKey: string): HouseholdModel {
  const memberKeys = h.memberKeys.filter((k) => k !== personKey);
  const fallback = memberKeys[0] ?? '';
  return {
    ...h,
    memberKeys,
    payerKey: h.payerKey === personKey ? fallback : h.payerKey,
    contactKey: h.contactKey === personKey ? fallback : h.contactKey,
  };
}

/** A household of fewer than two members is no household. */
export function shouldArchiveHousehold(h: HouseholdModel): boolean {
  return h.memberKeys.length < 2;
}

/** Structural validity. `others` = the tenant's other active households (the own okey is ignored). */
export function householdShapeError(h: HouseholdModel, others: HouseholdModel[]): HouseholdError | undefined {
  if (h.tenants.length !== 1) return 'bad-tenants';
  if (h.name.trim() === '') return 'no-name';
  if (new Set(h.memberKeys).size !== h.memberKeys.length) return 'duplicate-member';
  if (h.payerKey !== '' && !h.memberKeys.includes(h.payerKey)) return 'payer-not-member';
  if (h.contactKey !== '' && !h.memberKeys.includes(h.contactKey)) return 'contact-not-member';
  const taken = others.some((o) => o.okey !== h.okey && o.memberKeys.some((k) => h.memberKeys.includes(k)));
  if (taken) return 'already-in-household';
  return undefined;
}

/**
 * Who may write what: admins anything but tenants; a member only name, payerKey, contactKey, bundle, or remove
 * themself. Payer/contact membership is NOT checked here: the caller must also run `householdShapeError`.
 */
export function householdWriteRefusal(
  caller: { personKey: string; isAdmin: boolean },
  before: HouseholdModel | undefined,
  after: HouseholdModel,
): HouseholdRefusal | undefined {
  if (!before) return caller.isAdmin ? undefined : 'not-allowed';
  if (!caller.isAdmin && !before.memberKeys.includes(caller.personKey)) return 'not-allowed';
  if (before.tenants.length !== after.tenants.length || before.tenants.some((t, i) => t !== after.tenants[i])) return 'tenants-changed';
  if (!caller.isAdmin) {
    const expected = before.memberKeys.filter((k) => k === caller.personKey ? after.memberKeys.includes(k) : true);
    const same = expected.length === after.memberKeys.length && expected.every((k) => after.memberKeys.includes(k));
    if (!same) return 'members-changed';
    const d = new HouseholdModel('');
    const fields = ['okey', 'isArchived', 'type', 'index', 'tags', 'notes'] as const;
    for (const f of fields) {
      if (JSON.stringify(before[f] ?? d[f]) !== JSON.stringify(after[f] ?? d[f])) return 'field-not-allowed';
    }
  }
  return undefined;
}
