// apps/functions/src/newsletter/tenant-link.logic.ts
//
// The pure half of the only-link rule (spec 1.169 §5.4): what happens to a person whose last link to a
// tenant was a newsletter subscription. Archive-vs-detach follows the `deleting-models` rule
// (getDeletePatch): a document of this tenant only is archived, a shared one loses this tenant.

import { getDeletePatch, SYSTEM_TENANT } from '@okr/shared-util-core';

export type ReleaseAction = 'kept' | 'archived' | 'detached';

/**
 * What the only-link rule does with the person. `kept` when the person still has a link to the tenant,
 * does not carry the tenant (already detached, or never of it — never touch another tenant's person),
 * or is a system person.
 */
export function releaseAction(personTenants: string[], tenantId: string, linked: boolean): ReleaseAction {
  if (linked || !tenantId || !personTenants.includes(tenantId) || personTenants.includes(SYSTEM_TENANT)) return 'kept';
  return personTenants.every((t) => t === tenantId) ? 'archived' : 'detached';
}

/**
 * The write that releases one address of the person from the tenant, or undefined when there is nothing
 * to write: the address does not carry the tenant (another tenant's row), is a system row, or is already
 * archived. Detaching never empties `tenants`: the last tenant archives instead.
 */
export function addressReleasePatch(
  address: { tenants?: string[]; isArchived?: boolean },
  tenantId: string,
): { tenants: string[] } | { isArchived: true } | undefined {
  const tenants = address.tenants ?? [];
  if (!tenantId || !tenants.includes(tenantId) || tenants.includes(SYSTEM_TENANT)) return undefined;
  const patch = getDeletePatch(tenants, tenantId);
  if ('tenants' in patch) return { tenants: patch.tenants };
  if ('isArchived' in patch) return address.isArchived === true ? undefined : { isArchived: true };
  return undefined;
}

/**
 * A membership still links the person while it is not archived and has not ended: no exit date, or one
 * today or later (legacy rows carry '99991231'). Today counts as still a member — archiving too early is
 * the worse error.
 */
export function isActiveMembership(doc: { dateOfExit?: unknown; isArchived?: unknown }, today: string): boolean {
  if (doc.isArchived === true) return false;
  const exit = typeof doc.dateOfExit === 'string' ? doc.dateOfExit : '';
  return exit === '' || exit >= today;
}

/** A newsletter subscription is active while it is not archived and has no exit date. */
export function isActiveSubscription(doc: { dateOfExit?: unknown; isArchived?: unknown }): boolean {
  if (doc.isArchived === true) return false;
  const exit = typeof doc.dateOfExit === 'string' ? doc.dateOfExit : '';
  return exit === '';
}

/**
 * Whether the (possibly dotted) AvatarInfo array at `path` names the person. A missing modelType is read as
 * 'person', like the subject-data map's avatarArrayHolds: dropping such a link would archive too early.
 */
export function avatarListHolds(doc: Record<string, unknown>, path: string, personKey: string): boolean {
  if (!personKey) return false;
  const list = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], doc);
  return Array.isArray(list) && list.some((a) => {
    const avatar = a as { key?: unknown; modelType?: unknown } | null;
    return avatar?.key === personKey && (avatar.modelType ?? 'person') === 'person';
  });
}
