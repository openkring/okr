import { describe, expect, it } from 'vitest';

import { PINBOARD_MAX_SOURCES, isEligibleSource, isEligibleForPinboard, mergeMembershipState, validatePinboardInput, sourcePairsToReconcile, isPinboardKey, pinboardKey, pinboardMembershipId, planPinboardMembership, PinboardMembershipState } from './pinboard.util';

const active: PinboardMembershipState = { active: true, isOptedOut: false };
const ended: PinboardMembershipState = { active: false, isOptedOut: false };
const optedOut: PinboardMembershipState = { active: false, isOptedOut: true };

function plan(over: Partial<Parameters<typeof planPinboardMembership>[0]> = {}) {
  return planPinboardMembership({
    joinMode: 'optOut', eligible: new Set(), keep: new Set(), current: new Map(), ...over,
  });
}

describe('pinboard keys', () => {
  it('builds <tenant>_p_<random>', () => {
    expect(pinboardKey('scs', 'a7f3k2b9c1')).toBe('scs_p_a7f3k2b9c1');
  });
  it('recognises pinboard keys and only those', () => {
    expect(isPinboardKey('scs_p_a7f3k2b9c1')).toBe(true);
    expect(isPinboardKey('scs_c_a7f3k2b9c1')).toBe(false);
    expect(isPinboardKey('scs_vorstand')).toBe(false);
  });
  it('derives a deterministic membership id', () => {
    expect(pinboardMembershipId('scs_p_x', 'anna')).toBe('pb_scs_p_x_anna');
  });
});

describe('planPinboardMembership', () => {
  it('adds every eligible person in opt-out mode', () => {
    expect(plan({ eligible: new Set(['anna', 'beat']) })).toEqual({ add: ['anna', 'beat'], end: [] });
  });
  it('adds nobody automatically in opt-in mode', () => {
    expect(plan({ joinMode: 'optIn', eligible: new Set(['anna']) })).toEqual({ add: [], end: [] });
  });
  it('keeps an already active member', () => {
    expect(plan({ eligible: new Set(['anna']), current: new Map([['anna', active]]) })).toEqual({ add: [], end: [] });
  });
  it('never re-adds an opted-out admin', () => {
    expect(plan({ keep: new Set(['chef']), current: new Map([['chef', optedOut]]) })).toEqual({ add: [], end: [] });
  });
  it('never re-adds an opted-out person', () => {
    expect(plan({ eligible: new Set(['anna']), current: new Map([['anna', optedOut]]) })).toEqual({ add: [], end: [] });
  });
  it('re-adds a person whose membership ended without opting out (rejoined a source group)', () => {
    expect(plan({ eligible: new Set(['anna']), current: new Map([['anna', ended]]) })).toEqual({ add: ['anna'], end: [] });
  });
  it('ends an active member who is no longer eligible', () => {
    expect(plan({ eligible: new Set(), current: new Map([['anna', active]]) })).toEqual({ add: [], end: ['anna'] });
  });
  it('keeps a person still active in another source group', () => {
    // eligibility is the union over all sources — leaving one source does not remove them
    expect(plan({ eligible: new Set(['anna']), current: new Map([['anna', active]]) }).end).toEqual([]);
  });
  it('keeps admins even when not eligible', () => {
    expect(plan({ keep: new Set(['chef']), current: new Map([['chef', active]]) })).toEqual({ add: [], end: [] });
  });
  it('adds a kept admin who has no membership yet', () => {
    expect(plan({ keep: new Set(['chef']) })).toEqual({ add: ['chef'], end: [] });
  });
  it('does not end opt-in members who joined themselves while eligible', () => {
    expect(plan({ joinMode: 'optIn', eligible: new Set(['anna']), current: new Map([['anna', active]]) })).toEqual({ add: [], end: [] });
  });
  it('restricts the plan to one person when `only` is set', () => {
    const result = plan({ eligible: new Set(['anna', 'beat']), current: new Map([['carl', active]]), only: 'beat' });
    expect(result).toEqual({ add: ['beat'], end: [] });
  });
});

describe('sourcePairsToReconcile', () => {
  const m = (orgKey: string, memberKey: string) => ({ orgKey, memberKey, orgModelType: 'group', memberModelType: 'person' });
  it('returns one pair for an unchanged membership', () => {
    expect(sourcePairsToReconcile(m('g1', 'anna'), m('g1', 'anna'))).toEqual([['g1', 'anna']]);
  });
  it('returns both pairs when a membership moved between groups', () => {
    expect(sourcePairsToReconcile(m('g1', 'anna'), m('g2', 'anna'))).toEqual([['g2', 'anna'], ['g1', 'anna']]);
  });
  it('ignores pinboard memberships and non-person members', () => {
    expect(sourcePairsToReconcile(undefined, m('scs_p_abc', 'anna'))).toEqual([]);
    expect(sourcePairsToReconcile(undefined, { ...m('g1', 'x'), memberModelType: 'org' })).toEqual([]);
  });
});

describe('validatePinboardInput', () => {
  const ok = { name: 'Marktplatz', description: '', sourceGroupKeys: ['scs'], joinMode: 'optOut', allowReplyAll: false };
  it('accepts a complete input', () => expect(validatePinboardInput(ok, false)).toBeUndefined());
  it('requires a name on create', () => expect(validatePinboardInput({ ...ok, name: '  ' }, false)).toMatch(/name/));
  it('rejects a name over 50 characters', () => expect(validatePinboardInput({ ...ok, name: 'x'.repeat(51) }, false)).toMatch(/name/));
  it('requires at least one source group on create', () => expect(validatePinboardInput({ ...ok, sourceGroupKeys: [] }, false)).toMatch(/source/));
  it('rejects a pinboard as source', () => expect(validatePinboardInput({ ...ok, sourceGroupKeys: ['scs_p_abc'] }, false)).toMatch(/source/));
  it('rejects an unknown join mode', () => expect(validatePinboardInput({ ...ok, joinMode: 'auto' }, false)).toMatch(/joinMode/));
  it('rejects a description over 5000 characters', () => expect(validatePinboardInput({ ...ok, description: 'x'.repeat(5001) }, false)).toMatch(/description/));
  it('accepts a partial update with only allowReplyAll', () => expect(validatePinboardInput({ allowReplyAll: true }, true)).toBeUndefined());
  it('rejects more than the maximum number of source groups', () => expect(validatePinboardInput({ ...ok, sourceGroupKeys: Array.from({ length: PINBOARD_MAX_SOURCES + 1 }, (_, i) => `g${i}`) }, false)).toMatch(/source/));
  it('rejects a source key over 100 characters', () => expect(validatePinboardInput({ ...ok, sourceGroupKeys: ['x'.repeat(101)] }, false)).toMatch(/source/));
  it('rejects a source key containing a slash', () => expect(validatePinboardInput({ ...ok, sourceGroupKeys: ['a/b'] }, false)).toMatch(/source/));
  it('rejects an empty source list on update when given', () => expect(validatePinboardInput({ sourceGroupKeys: [] }, true)).toMatch(/source/));
});

describe('mergeMembershipState', () => {
  it('takes the first doc when there is no previous one', () => expect(mergeMembershipState(undefined, ended)).toBe(ended));
  it('an active doc beats an ended one', () => expect(mergeMembershipState(optedOut, active)).toBe(active));
  it('an active doc is not replaced by an ended one', () => expect(mergeMembershipState(active, optedOut)).toBe(active));
  it('among ended docs an opted-out one wins, whatever the order', () => {
    expect(mergeMembershipState(ended, optedOut)).toBe(optedOut);
    expect(mergeMembershipState(optedOut, ended)).toBe(optedOut);
  });
});

describe('isEligibleSource', () => {
  const group = { kind: 'group', isArchived: false, tenants: ['scs'] };
  it('accepts a live group of the tenant', () => expect(isEligibleSource(group, 'scs')).toBe(true));
  it('treats a missing kind as a group', () => expect(isEligibleSource({ tenants: ['scs'] }, 'scs')).toBe(true));
  it('rejects a missing doc', () => expect(isEligibleSource(undefined, 'scs')).toBe(false));
  it('rejects an archived group', () => expect(isEligibleSource({ ...group, isArchived: true }, 'scs')).toBe(false));
  it('rejects a pinboard or chat doc', () => {
    expect(isEligibleSource({ ...group, kind: 'pinboard' }, 'scs')).toBe(false);
    expect(isEligibleSource({ ...group, kind: 'chat' }, 'scs')).toBe(false);
  });
  it('rejects a group of another tenant', () => expect(isEligibleSource(group, 'kring')).toBe(false));
  it('rejects a doc without tenants', () => expect(isEligibleSource({ kind: 'group' }, 'scs')).toBe(false));
});

describe('isEligibleForPinboard', () => {
  const base = { personKey: 'anna', sourceGroupKeys: ['g1', 'g2'], eligibleSources: new Set(['g1', 'g2']), activeOrgKeys: new Set<string>() };
  it('lets an admin in without any source membership', () => expect(isEligibleForPinboard({ ...base, admins: [{ key: 'anna' }] })).toBe(true));
  it('lets a member of a source group in', () => expect(isEligibleForPinboard({ ...base, activeOrgKeys: new Set(['g2']) })).toBe(true));
  it('ignores a membership in a source that is not eligible', () => {
    expect(isEligibleForPinboard({ ...base, eligibleSources: new Set(['g1']), activeOrgKeys: new Set(['g2']) })).toBe(false);
  });
  it('ignores memberships in groups that are not sources', () => expect(isEligibleForPinboard({ ...base, activeOrgKeys: new Set(['g3']) })).toBe(false));
});
