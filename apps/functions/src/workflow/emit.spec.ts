import { describe, expect, it } from 'vitest';

import { CREATED_EMITTERS, buildEmitArgs, isStateChange } from './emit';

describe('CREATED_EMITTERS', () => {
  it('covers the collections whose create-emitter is pure field-lifting', () => {
    // `tasks` and `memberships` are deliberately NOT here: both do more than lift fields
    // (a transition guard, the account sync), so they keep their bespoke bodies.
    expect(Object.keys(CREATED_EMITTERS).sort()).toEqual(['applications', 'reservations']);
  });
});

describe('buildEmitArgs', () => {
  it('lifts the listed flat fields into params and prefixes the relatedKey', () => {
    const args = buildEmitArgs(CREATED_EMITTERS['reservations'], 'r1', {
      reserver: { key: 'p1', name1: 'Anna', name2: 'Muster' },
      resource: { key: 'res1', type: 'boathouse', name1: 'Bootshaus' },
      startDate: '20260901',
      endDate: '20260902',
      state: 'initial',
    });
    expect(args.relatedKey).toBe('reservation.r1');
    expect(args.personKey).toBe('p1');
    expect(args.subjectName).toBe('Anna Muster');
    expect(args.params).toEqual({
      resourceKey: 'res1',
      resourceType: 'boathouse',
      resourceName: 'Bootshaus',
      startDate: '20260901',
      endDate: '20260902',
      state: 'initial',
    });
  });

  it('renders a missing field as the empty string, never undefined', () => {
    // params reach `translate()` and land in task text — an undefined would render as
    // "undefined" to a member, and `paramIs:x=` would stop matching "absent".
    const args = buildEmitArgs(CREATED_EMITTERS['reservations'], 'r2', {});
    expect(args.personKey).toBe('');
    expect(args.subjectName).toBe('');
    expect(Object.values(args.params).every((v) => typeof v === 'string')).toBe(true);
  });

  it('gives an application no personKey — an applicant is not a person yet', () => {
    const args = buildEmitArgs(CREATED_EMITTERS['applications'], 'a1', {
      firstName: 'Anna', lastName: 'Muster', state: 'applied', applicationAs: 'youth',
    });
    expect(args.relatedKey).toBe('application.a1');
    expect(args.personKey).toBe('');
    expect(args.subjectName).toBe('Anna Muster');
    expect(args.params).toEqual({ state: 'applied', kind: 'youth' });
  });

  it('keeps every emitted param matchable by paramIs', () => {
    // the params list IS the discriminator surface of a generic event — a param that is not
    // a plain string cannot be compared by the probe
    for (const spec of Object.values(CREATED_EMITTERS)) {
      const args = buildEmitArgs(spec, 'x', {});
      for (const key of spec.params) expect(args.params[key]).toBe('');
    }
  });
});

describe('isStateChange', () => {
  it('is true only when the state actually changes', () => {
    expect(isStateChange({ state: 'applied' }, { state: 'accepted' })).toBe(true);
  });

  it('is false when an unrelated field changes', () => {
    // without this guard every edit — a corrected phone number, a note, an admin re-save —
    // would re-fire the event and re-notify the responsible person
    expect(isStateChange({ state: 'applied', notes: 'a' }, { state: 'applied', notes: 'b' })).toBe(false);
  });

  it('is false when both states are absent', () => {
    expect(isStateChange({}, {})).toBe(false);
  });

  it('is true when a state appears for the first time', () => {
    expect(isStateChange({}, { state: 'accepted' })).toBe(true);
  });
});
