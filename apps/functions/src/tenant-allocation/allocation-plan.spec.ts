import { describe, expect, it } from 'vitest';

import { AllocationDoc, buildAllocationPlan } from './allocation-plan';

const ACTOR = 'scs';
const TARGET = 'gss';

function doc(okey: string, tenants: string[], parentKey = 'person.p1'): AllocationDoc {
  return { okey, tenants, parentKey };
}

const base = {
  modelType: 'person' as const,
  subjectKey: 'p1',
  actorTenantId: ACTOR,
  targetTenantId: TARGET,
  includeSubject: true,
  includeAvatar: false,
};

describe('buildAllocationPlan — grant', () => {
  it('adds the target tenant to person and the selected addresses', () => {
    const plan = buildAllocationPlan({
      ...base, direction: 'grant',
      subject: doc('p1', [ACTOR], ''),
      addresses: [doc('a1', [ACTOR]), doc('a2', [ACTOR])],
      avatars: [],
      selectedAddressKeys: ['a1'],
    });
    expect(plan.rejections).toEqual([]);
    expect(plan.writes.map(w => w.okey)).toEqual(['p1', 'a1']);
    expect(plan.writes.every(w => w.operation === 'add')).toBe(true);
    expect(plan.counts).toEqual({ persons: 1, addresses: 1, avatars: 0 });
  });

  it('rejects an address that does not belong to the person', () => {
    const plan = buildAllocationPlan({
      ...base, direction: 'grant',
      subject: doc('p1', [ACTOR], ''),
      addresses: [doc('a1', [ACTOR], 'person.OTHER')],
      avatars: [],
      selectedAddressKeys: ['a1'],
    });
    expect(plan.rejections).toEqual([{ okey: 'a1', reason: 'foreignParent' }]);
    expect(plan.writes.map(w => w.okey)).toEqual(['p1']);
  });

  it('rejects an address the actor tenant cannot see', () => {
    const plan = buildAllocationPlan({
      ...base, direction: 'grant',
      subject: doc('p1', [ACTOR], ''),
      addresses: [doc('a1', ['p13'])],
      avatars: [],
      selectedAddressKeys: ['a1'],
    });
    expect(plan.rejections).toEqual([{ okey: 'a1', reason: 'notVisibleToActor' }]);
  });

  it('rejects the whole request when the person does not carry the actor tenant', () => {
    const plan = buildAllocationPlan({
      ...base, direction: 'grant',
      subject: doc('p1', ['p13'], ''),
      addresses: [],
      avatars: [],
      selectedAddressKeys: [],
    });
    expect(plan.writes).toEqual([]);
    expect(plan.rejections).toEqual([{ okey: 'p1', reason: 'notVisibleToActor' }]);
  });

  it('is idempotent — a document that already carries the target is not written again', () => {
    const plan = buildAllocationPlan({
      ...base, direction: 'grant',
      subject: doc('p1', [ACTOR, TARGET], ''),
      addresses: [doc('a1', [ACTOR, TARGET])],
      avatars: [],
      selectedAddressKeys: ['a1'],
    });
    expect(plan.writes).toEqual([]);
    expect(plan.counts).toEqual({ persons: 0, addresses: 0, avatars: 0 });
  });

  it('includes the avatars only when asked', () => {
    const withAvatar = buildAllocationPlan({
      ...base, direction: 'grant', includeAvatar: true,
      subject: doc('p1', [ACTOR], ''),
      addresses: [],
      avatars: [doc('person.p1', [ACTOR], ''), doc('scs.person.p1', [ACTOR], '')],
      selectedAddressKeys: [],
    });
    expect(withAvatar.counts.avatars).toBe(2);
  });
});

describe('buildAllocationPlan — revoke', () => {
  it('removes the target tenant from documents carrying BOTH tenants (D-TA-3)', () => {
    const plan = buildAllocationPlan({
      ...base, direction: 'revoke',
      subject: doc('p1', [ACTOR, TARGET], ''),
      addresses: [doc('a1', [ACTOR, TARGET])],
      avatars: [],
      selectedAddressKeys: ['a1'],
    });
    expect(plan.rejections).toEqual([]);
    expect(plan.writes.map(w => w.okey)).toEqual(['p1', 'a1']);
    expect(plan.writes.every(w => w.operation === 'remove')).toBe(true);
  });

  it("refuses an address the target collected itself (D-TA-3)", () => {
    const plan = buildAllocationPlan({
      ...base, direction: 'revoke',
      subject: doc('p1', [ACTOR, TARGET], ''),
      addresses: [doc('a1', [TARGET])],
      avatars: [],
      selectedAddressKeys: ['a1'],
    });
    expect(plan.rejections).toEqual([{ okey: 'a1', reason: 'notVisibleToActor' }]);
    expect(plan.writes.map(w => w.okey)).toEqual(['p1']);
  });

  it('never empties tenants[] — the last tenant standing is refused', () => {
    const plan = buildAllocationPlan({
      ...base, direction: 'revoke',
      subject: doc('p1', [TARGET], ''),
      addresses: [],
      avatars: [],
      selectedAddressKeys: [],
    });
    expect(plan.writes).toEqual([]);
    expect(plan.rejections).toEqual([{ okey: 'p1', reason: 'notVisibleToActor' }]);
  });

  it('keeps the person when includeSubject is false (partial revoke)', () => {
    const plan = buildAllocationPlan({
      ...base, direction: 'revoke', includeSubject: false,
      subject: doc('p1', [ACTOR, TARGET], ''),
      addresses: [doc('a1', [ACTOR, TARGET])],
      avatars: [],
      selectedAddressKeys: ['a1'],
    });
    expect(plan.writes.map(w => w.okey)).toEqual(['a1']);
    expect(plan.counts.persons).toBe(0);
  });

  it('collects the channels that travelled', () => {
    const plan = buildAllocationPlan({
      ...base, direction: 'revoke',
      subject: doc('p1', [ACTOR, TARGET], ''),
      addresses: [
        { ...doc('a1', [ACTOR, TARGET]), channel: 'email' },
        { ...doc('a2', [ACTOR, TARGET]), channel: 'dob' },
      ],
      avatars: [],
      selectedAddressKeys: ['a1', 'a2'],
    });
    expect(plan.channels.sort()).toEqual(['dob', 'email']);
  });
});

describe('buildAllocationPlan — guards that must never be bypassed', () => {
  it('refuses the actor tenant as target (D-TA-4)', () => {
    const plan = buildAllocationPlan({
      ...base, direction: 'grant', targetTenantId: ACTOR,
      subject: doc('p1', [ACTOR], ''),
      addresses: [],
      avatars: [],
      selectedAddressKeys: [],
    });
    expect(plan.writes).toEqual([]);
    expect(plan.rejections).toEqual([{ okey: ACTOR, reason: 'targetIsActor' }]);
  });

  it('ignores a selected key that was not loaded', () => {
    const plan = buildAllocationPlan({
      ...base, direction: 'grant',
      subject: doc('p1', [ACTOR], ''),
      addresses: [],
      avatars: [],
      selectedAddressKeys: ['ghost'],
    });
    expect(plan.rejections).toEqual([{ okey: 'ghost', reason: 'notFound' }]);
  });

  it('collapses a duplicated address key so the audit counts stay honest', () => {
    const plan = buildAllocationPlan({
      ...base, direction: 'grant',
      subject: doc('p1', [ACTOR], ''),
      addresses: [doc('a1', [ACTOR])],
      avatars: [],
      selectedAddressKeys: ['a1', 'a1'],
    });
    expect(plan.writes.filter(w => w.collection === 'addresses')).toHaveLength(1);
    expect(plan.counts.addresses).toBe(1);
    expect(plan.rejections).toEqual([]);
  });
});

describe('buildAllocationPlan — orgs and resources (D-TA-7)', () => {
  const orgBase = { ...base, modelType: 'org' as const, subjectKey: 'o1' };

  it('adds the target tenant to the org and its selected addresses', () => {
    const plan = buildAllocationPlan({
      ...orgBase, direction: 'grant',
      subject: doc('o1', [ACTOR], ''),
      addresses: [doc('a1', [ACTOR], 'org.o1'), doc('a2', [ACTOR], 'org.o1')],
      avatars: [],
      selectedAddressKeys: ['a1', 'a2'],
    });
    expect(plan.rejections).toEqual([]);
    expect(plan.writes.map(w => w.collection)).toEqual(['orgs', 'addresses', 'addresses']);
    expect(plan.counts).toEqual({ orgs: 1, addresses: 2, avatars: 0 });
  });

  it('rejects an address whose parent is the person of the same okey, not the org', () => {
    const plan = buildAllocationPlan({
      ...orgBase, direction: 'grant',
      subject: doc('o1', [ACTOR], ''),
      addresses: [doc('a1', [ACTOR], 'person.o1')],
      avatars: [],
      selectedAddressKeys: ['a1'],
    });
    expect(plan.rejections).toEqual([{ okey: 'a1', reason: 'foreignParent' }]);
  });

  it('allocates a resource and its avatar, with no addresses in play', () => {
    const plan = buildAllocationPlan({
      ...base, modelType: 'resource', subjectKey: 'r1', direction: 'grant', includeAvatar: true,
      subject: doc('r1', [ACTOR], ''),
      addresses: [],
      avatars: [doc('resource.r1', [ACTOR], '')],
      selectedAddressKeys: [],
    });
    expect(plan.rejections).toEqual([]);
    expect(plan.writes.map(w => w.collection)).toEqual(['resources', 'avatars']);
    expect(plan.counts).toEqual({ resources: 1, addresses: 0, avatars: 1 });
  });
});

/**
 * The bkaiser GmbH case: the org is already in the target tenant, but addresses collected
 * since are not. The grant must top up the gap WITHOUT touching the org — a second write of
 * the same `tenants[]` entry is what a duplicate would look like in the audit counts.
 */
describe('buildAllocationPlan — top-up of a record the target already has (D-TA-8)', () => {
  it('writes only the missing addresses, never the org itself', () => {
    const plan = buildAllocationPlan({
      ...base, modelType: 'org', subjectKey: 'o1', direction: 'grant',
      subject: doc('o1', [ACTOR, TARGET], ''),
      addresses: [doc('a1', [ACTOR, TARGET], 'org.o1'), doc('a2', [ACTOR], 'org.o1')],
      avatars: [],
      selectedAddressKeys: ['a1', 'a2'],
    });
    expect(plan.rejections).toEqual([]);
    expect(plan.writes).toEqual([{ collection: 'addresses', okey: 'a2', operation: 'add' }]);
    expect(plan.counts).toEqual({ orgs: 0, addresses: 1, avatars: 0 });
  });

  it('is a no-op when the target already carries everything', () => {
    const plan = buildAllocationPlan({
      ...base, modelType: 'org', subjectKey: 'o1', direction: 'grant',
      subject: doc('o1', [ACTOR, TARGET], ''),
      addresses: [doc('a1', [ACTOR, TARGET], 'org.o1')],
      avatars: [],
      selectedAddressKeys: ['a1'],
    });
    expect(plan.writes).toEqual([]);
    expect(plan.rejections).toEqual([]);
  });
});
