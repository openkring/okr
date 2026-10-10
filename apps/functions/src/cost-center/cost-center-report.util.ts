// apps/functions/src/cost-center/cost-center-report.util.ts
//
// Pure helpers of `getMyCostCenterReport` (spec 1.65 §7, D21/D22): who is responsible for a
// Kostenstelle, which Kostenstellen a caller may see, which bookings are person-related, and the
// projection of a booking that leaves the server. No Firestore here — tested in isolation.

import { isValidAt } from '@okr/shared-util-core';
import type { ReportBooking } from '@okr/finance-cost-center-util';

interface AvatarRef { key?: string; modelType?: string }

/** The fields of a ResponsibilityModel the visibility check reads. */
export interface RespLike {
  okey: string;
  isArchived?: boolean;
  validFrom?: string;
  validTo?: string;
  responsibleAvatar?: AvatarRef;
  delegateAvatar?: AvatarRef;
  delegateValidFrom?: string;
  delegateValidTo?: string;
}

/** A person avatar names that person; a group avatar names every current member of that group. */
function names(avatar: AvatarRef | undefined, personKey: string, groupKeys: Set<string>): boolean {
  const key = avatar?.key ?? '';
  if (!key) return false;
  return avatar?.modelType === 'group' ? groupKeys.has(key) : key === personKey;
}

/**
 * Spec 1.65 §7.2: the responsibility is live and valid today, and the caller is the responsible
 * avatar, or the delegate inside the delegation window (`isDelegateActive`). `groupKeys` = the
 * groups the caller is a current member of.
 */
export function isResponsible(r: RespLike, personKey: string, groupKeys: Set<string>, today: string): boolean {
  if (r.isArchived) return false;
  if (!isValidAt(r.validFrom ?? '', r.validTo ?? '', today)) return false;
  if (names(r.responsibleAvatar, personKey, groupKeys)) return true;
  return !!r.delegateAvatar && isValidAt(r.delegateValidFrom ?? '', r.delegateValidTo ?? '', today)
    && names(r.delegateAvatar, personKey, groupKeys);
}

/**
 * The live Kostenstellen the caller may see: every centre whose own or any ancestor's
 * responsibility names the caller, with all its live descendants (the subtree is inherited).
 */
export function visibleCostCenterKeys(
  centers: { okey: string; parentKey?: string; responsibilityKey?: string; isArchived?: boolean }[],
  responsibilities: Map<string, RespLike>, personKey: string, groupKeys: Set<string>, today: string,
): Set<string> {
  const live = centers.filter(c => !c.isArchived);
  const children = new Map<string, string[]>();
  for (const c of live) {
    const list = children.get(c.parentKey ?? '') ?? [];
    list.push(c.okey);
    children.set(c.parentKey ?? '', list);
  }
  const visible = new Set<string>();
  const addSubtree = (key: string): void => {
    if (visible.has(key)) return;
    visible.add(key);
    (children.get(key) ?? []).forEach(addSubtree);
  };
  for (const c of live) {
    const r = c.responsibilityKey ? responsibilities.get(c.responsibilityKey) : undefined;
    if (r && isResponsible(r, personKey, groupKeys, today)) addSubtree(c.okey);
  }
  return visible;
}

/**
 * Spec 1.65 §7.3 / D22: a booking is person-related when it originates from an expense (Spesen),
 * is anonymized, has a person counterparty, or a counterparty that is not a resolved org record
 * (empty key — the bank import stores the raw payee text that way). No counterparty = not person-related.
 */
export function isPersonRelated(
  b: { okey: string; anonymizedAt?: string; counterparty?: AvatarRef }, expenseBookingKeys: Set<string>,
): boolean {
  if (expenseBookingKeys.has(b.okey)) return true;
  if (b.anonymizedAt) return true;
  const cp = b.counterparty;
  if (!cp) return false;
  return cp.modelType === 'person' || !(cp.key ?? '');
}

/**
 * The booking as it leaves the server: date, number, and — unless masked — the title and the
 * counterparty's display name. Never notes, vouchers or the counterparty's record key.
 */
export function projectBooking(
  b: { okey: string; date?: string; bookingNo?: number; title?: string;
    counterparty?: AvatarRef & { name1?: string; name2?: string; label?: string } },
  masked: boolean,
): ReportBooking {
  const cp = b.counterparty;
  const cpName = cp ? (cp.label || `${cp.name1 ?? ''} ${cp.name2 ?? ''}`.trim()) : '';
  return {
    okey: b.okey, date: b.date ?? '', bookingNo: b.bookingNo ?? 0,
    title: masked ? '' : b.title ?? '', counterpartyName: masked ? '' : cpName, masked,
  };
}
