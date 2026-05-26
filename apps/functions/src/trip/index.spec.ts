import { describe, it, expect } from 'vitest';
import { computeDeltas } from './index';

const BOAT_KEY = 'B1';
const MEMBER_1 = 'M1';
const MEMBER_2 = 'M2';

function makeTrip(overrides: Partial<Parameters<typeof computeDeltas>[0]> = {}) {
  return {
    state: 'closed',
    distance: 10,
    startDate: '20260515',
    resource: { key: BOAT_KEY },
    participants: [{ key: MEMBER_1 }, { key: MEMBER_2 }],
    ...overrides,
  };
}

describe('computeDeltas', () => {
  it('create counted trip: adds km and count to boat and each member', () => {
    const deltas = computeDeltas(undefined, makeTrip());
    expect(deltas).toContainEqual({ path: `stats_boats/${BOAT_KEY}/years/2026`, km: 10, count: 1 });
    expect(deltas).toContainEqual({ path: `stats_members/${MEMBER_1}/years/2026`, km: 10, count: 1 });
    expect(deltas).toContainEqual({ path: `stats_members/${MEMBER_2}/years/2026`, km: 10, count: 1 });
    expect(deltas).toHaveLength(3);
  });

  it('create draft trip: no deltas', () => {
    expect(computeDeltas(undefined, makeTrip({ state: 'draft' }))).toHaveLength(0);
  });

  it('create deleted trip (no .corr): no deltas', () => {
    expect(computeDeltas(undefined, makeTrip({ state: 'deleted' }))).toHaveLength(0);
  });

  it('delete counted trip: subtracts km', () => {
    const deltas = computeDeltas(makeTrip(), undefined);
    expect(deltas).toContainEqual({ path: `stats_boats/${BOAT_KEY}/years/2026`, km: -10, count: -1 });
    expect(deltas).toContainEqual({ path: `stats_members/${MEMBER_1}/years/2026`, km: -10, count: -1 });
    expect(deltas).toHaveLength(3);
  });

  it('state change: open -> closed adds deltas', () => {
    const deltas = computeDeltas(makeTrip({ state: 'open' }), makeTrip({ state: 'closed' }));
    // before was not in COUNTING_STATES, after is
    expect(deltas).toContainEqual({ path: `stats_boats/${BOAT_KEY}/years/2026`, km: 10, count: 1 });
  });

  it('state change: closed -> deleted subtracts', () => {
    const deltas = computeDeltas(makeTrip({ state: 'closed' }), makeTrip({ state: 'deleted' }));
    expect(deltas).toContainEqual({ path: `stats_boats/${BOAT_KEY}/years/2026`, km: -10, count: -1 });
  });

  it('distance edit within counted state: net delta applied', () => {
    const deltas = computeDeltas(makeTrip({ distance: 10 }), makeTrip({ distance: 14 }));
    // subtract old (-10), add new (+14) → net +4
    expect(deltas).toContainEqual({ path: `stats_boats/${BOAT_KEY}/years/2026`, km: 4, count: 0 });
  });

  it('deleted.corr state counts', () => {
    const deltas = computeDeltas(undefined, makeTrip({ state: 'deleted.corr' }));
    expect(deltas).toContainEqual({ path: `stats_boats/${BOAT_KEY}/years/2026`, km: 10, count: 1 });
  });

  it('missing resource.key: skips boat delta', () => {
    const deltas = computeDeltas(undefined, makeTrip({ resource: undefined }));
    const boatDelta = deltas.find(d => d.path.startsWith('stats_boats'));
    expect(boatDelta).toBeUndefined();
    expect(deltas).toHaveLength(2); // only members
  });

  it('aggregates duplicate paths', () => {
    // same before and after same boat but different distance: net delta
    const deltas = computeDeltas(makeTrip({ distance: 10 }), makeTrip({ distance: 12 }));
    const boatDelta = deltas.find(d => d.path === `stats_boats/${BOAT_KEY}/years/2026`);
    expect(boatDelta?.km).toBe(2); // -10 + 12
    expect(boatDelta?.count).toBe(0); // -1 + 1
  });
});
