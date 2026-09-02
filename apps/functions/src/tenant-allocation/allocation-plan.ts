import { AllocationDirection } from '@okr/shared-models';

/** The slice of a Firestore document the plan builder needs. Kept structural so the builder
 * is testable without Firestore, exactly like `ErasureOps`. */
export interface AllocationDoc {
  readonly okey: string;
  readonly tenants: string[];
  /** `person.<key>` for addresses; '' for persons and avatars. */
  readonly parentKey: string;
  /** `addressChannel`, for the log. Absent on persons and avatars. */
  readonly channel?: string;
}

export type AllocationCollection = 'persons' | 'addresses' | 'avatars';

export interface AllocationWrite {
  readonly collection: AllocationCollection;
  readonly okey: string;
  readonly operation: 'add' | 'remove';
}

export type AllocationRejectionReason =
  | 'targetIsActor'       // D-TA-4 — the acting tenant may not be its own target
  | 'notVisibleToActor'   // the actor tenant does not carry it (grant), or actor+target do not (revoke)
  | 'foreignParent'       // the address belongs to a different person than the one named
  | 'notFound';           // a selected key that was never loaded

export interface AllocationRejection {
  readonly okey: string;
  readonly reason: AllocationRejectionReason;
}

export interface AllocationRequest {
  readonly direction: AllocationDirection;
  readonly personKey: string;
  readonly actorTenantId: string;
  readonly targetTenantId: string;
  readonly includeSubject: boolean;
  readonly includeAvatar: boolean;
  readonly person: AllocationDoc;
  readonly addresses: readonly AllocationDoc[];
  readonly avatars: readonly AllocationDoc[];
  readonly selectedAddressKeys: readonly string[];
}

export interface AllocationPlan {
  readonly writes: AllocationWrite[];
  readonly rejections: AllocationRejection[];
  readonly counts: Record<AllocationCollection, number>;
  readonly channels: string[];
}

/**
 * Whether the actor may act on this document at all.
 *
 * On a GRANT the actor must carry it — you cannot hand on what you were never shown.
 * On a REVOKE the actor AND the target must carry it: tenant A must not be able to delete
 * what tenant B collected itself (D-TA-3). The same condition also makes the "tenants[]
 * would empty" case unreachable, because a document carrying both tenants keeps the actor's
 * after the removal — the explicit check below stays anyway, because it is free and the
 * mistake would be irreversible.
 */
function isActionable(doc: AllocationDoc, req: AllocationRequest): boolean {
  const carriesActor = doc.tenants.includes(req.actorTenantId);
  if (req.direction === 'grant') return carriesActor;
  return carriesActor && doc.tenants.includes(req.targetTenantId);
}

/** Whether the write would change anything. Skipping no-ops keeps the operation idempotent
 * and the audit counts honest. */
function needsWrite(doc: AllocationDoc, req: AllocationRequest): boolean {
  const has = doc.tenants.includes(req.targetTenantId);
  return req.direction === 'grant' ? !has : has;
}

/** Refuse a removal that would leave a document nobody can read and nobody can recover. */
function wouldEmpty(doc: AllocationDoc, req: AllocationRequest): boolean {
  if (req.direction !== 'revoke') return false;
  return doc.tenants.filter((t) => t !== req.targetTenantId).length === 0;
}

/**
 * Turn a validated request into the exact set of `tenants[]` mutations to apply.
 *
 * Pure: no Firestore, no clock, no randomness. Everything the caller must re-read fresh
 * (person, addresses, avatars) is passed in, so the callable's only remaining job is to load
 * documents, apply `writes` in one batch, and log.
 */
export function buildAllocationPlan(req: AllocationRequest): AllocationPlan {
  const writes: AllocationWrite[] = [];
  const rejections: AllocationRejection[] = [];
  const channels = new Set<string>();
  const counts: Record<AllocationCollection, number> = { persons: 0, addresses: 0, avatars: 0 };

  if (req.targetTenantId === req.actorTenantId || !req.targetTenantId) {
    return { writes: [], rejections: [{ okey: req.actorTenantId, reason: 'targetIsActor' }], counts, channels: [] };
  }

  const push = (collection: AllocationCollection, doc: AllocationDoc): void => {
    if (!isActionable(doc, req) || wouldEmpty(doc, req)) {
      rejections.push({ okey: doc.okey, reason: 'notVisibleToActor' });
      return;
    }
    if (!needsWrite(doc, req)) return;
    writes.push({ collection, okey: doc.okey, operation: req.direction === 'grant' ? 'add' : 'remove' });
    counts[collection] += 1;
    if (doc.channel) channels.add(doc.channel);
  };

  if (req.includeSubject) push('persons', req.person);

  const byKey = new Map(req.addresses.map((a) => [a.okey, a]));
  for (const key of req.selectedAddressKeys) {
    const address = byKey.get(key);
    if (!address) {
      rejections.push({ okey: key, reason: 'notFound' });
      continue;
    }
    if (address.parentKey !== `person.${req.personKey}`) {
      rejections.push({ okey: key, reason: 'foreignParent' });
      continue;
    }
    push('addresses', address);
  }

  if (req.includeAvatar) {
    for (const avatar of req.avatars) push('avatars', avatar);
  }

  return { writes, rejections, counts, channels: [...channels] };
}
