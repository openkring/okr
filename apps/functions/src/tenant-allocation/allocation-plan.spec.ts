import { describe, expect, it } from 'vitest';

import { AllocationDoc, buildAllocationPlan } from './allocation-plan';

const ACTOR = 'scs';
const TARGET = 'gss';

function doc(okey: string, tenants: string[], parentKey = 'person.p1'): AllocationDoc {
  return { okey, tenants, parentKey };
}

const base = {
  personKey: 'p1',
  actorTenantId: ACTOR,
  targetTenantId: TARGET,
  includeSubject: true,
  includeAvatar: false,
};

describe('buildAllocationPlan — grant', () => {
  it('adds the target tenant to person and the selected addresses', () => {
    const plan = buildAllocationPlan({
      ...base, direction: 'grant',
      person: doc('p1', [ACTOR], ''),
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
      person: doc('p1', [ACTOR], ''),
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
      person: doc('p1', [ACTOR], ''),
      addresses: [doc('a1', ['p13'])],
      avatars: [],
      selectedAddressKeys: ['a1'],
    });
    expect(plan.rejections).toEqual([{ okey: 'a1', reason: 'notVisibleToActor' }]);
  });

  it('rejects the whole request when the person does not carry the actor tenant', () => {
    const plan = buildAllocationPlan({
      ...base, direction: 'grant',
      person: doc('p1', ['p13'], ''),
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
      person: doc('p1', [ACTOR, TARGET], ''),
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
      person: doc('p1', [ACTOR], ''),
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
      person: doc('p1', [ACTOR, TARGET], ''),
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
      person: doc('p1', [ACTOR, TARGET], ''),
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
      person: doc('p1', [TARGET], ''),
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
      person: doc('p1', [ACTOR, TARGET], ''),
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
      person: doc('p1', [ACTOR, TARGET], ''),
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
      person: doc('p1', [ACTOR], ''),
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
      person: doc('p1', [ACTOR], ''),
      addresses: [],
      avatars: [],
      selectedAddressKeys: ['ghost'],
    });
    expect(plan.rejections).toEqual([{ okey: 'ghost', reason: 'notFound' }]);
  });

  it('collapses a duplicated address key so the audit counts stay honest', () => {
    const plan = buildAllocationPlan({
      ...base, direction: 'grant',
      person: doc('p1', [ACTOR], ''),
      addresses: [doc('a1', [ACTOR])],
      avatars: [],
      selectedAddressKeys: ['a1', 'a1'],
    });
    expect(plan.writes.filter(w => w.collection === 'addresses')).toHaveLength(1);
    expect(plan.counts.addresses).toBe(1);
    expect(plan.rejections).toEqual([]);
  });
});
