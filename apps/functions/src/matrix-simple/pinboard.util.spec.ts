import { describe, expect, it } from 'vitest';

import { sourcePairsToReconcile, isPinboardKey, pinboardKey, pinboardMembershipId, planPinboardMembership, PinboardMembershipState } from './pinboard.util';

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
