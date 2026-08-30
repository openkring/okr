import { describe, expect, it } from 'vitest';

import { AvatarInfo } from '@okr/shared-models';

import { buildReservationRecord } from './reservation-target';

const RESERVER: AvatarInfo = {
  key: 'p1', name1: 'Anna', name2: 'Muster', modelType: 'person', type: '', subType: '', label: '',
};
const RESOURCE: AvatarInfo = {
  key: 'r1', name1: 'Bootshaus', name2: '', modelType: 'resource', type: 'boathouse', subType: '', label: '',
};
const CTX = { tenantId: 'scs', reserver: RESERVER, resource: RESOURCE, stamp: '15.08.2026 12:00' };

const VALUES: Record<string, unknown> = {
  name: 'Sommerfest',
  startDate: '20260901', startTime: '1400', endDate: '20260901',
  fullDay: false, durationMinutes: 240,
  participants: '40', area: 'Terrasse', reason: 'privateEvent',
  description: 'Grillfest', usesTent: true, company: 'Muster AG', isConfirmed: true,
};

describe('buildReservationRecord', () => {
  it('maps the submitted values onto a reservation document', () => {
    const rec = buildReservationRecord(VALUES, CTX);
    expect(rec.tenants).toEqual(['scs']);
    expect(rec.isArchived).toBe(false);
    expect(rec.name).toBe('Sommerfest');
    expect(rec.reserver).toEqual(RESERVER);
    expect(rec.resource).toEqual(RESOURCE);
    expect(rec.startDate).toBe('20260901');
    expect(rec.endDate).toBe('20260901');
    expect(rec.startTime).toBe('1400');
    expect(rec.durationMinutes).toBe(240);
    expect(rec.participants).toBe('40');
    expect(rec.area).toBe('Terrasse');
    expect(rec.reason).toBe('privateEvent');
  });

  it('starts in the initial state — an applicant does not confirm their own booking', () => {
    expect(buildReservationRecord(VALUES, CTX).state).toBe('initial');
  });

  it('builds the search index the list view queries on', () => {
    const rec = buildReservationRecord(VALUES, CTX);
    expect(rec.index).toContain('rk:p1');
    expect(rec.index).toContain('resk:r1');
    expect(rec.index).toContain('Anna Muster');
  });

  it('folds tent / company / confirmation into the description, as the modal did', () => {
    const rec = buildReservationRecord(VALUES, CTX);
    expect(rec.description).toContain('Grillfest');
    expect(rec.description).toContain('Zelt:');
    expect(rec.description).toContain('Muster AG');
    expect(rec.description).toContain('Anna Muster');
    expect(rec.description).toContain('15.08.2026 12:00');
  });

  it('never writes an undefined — a Firestore write rejects one outright', () => {
    const rec = buildReservationRecord({ name: 'X', isConfirmed: true }, CTX) as Record<string, unknown>;
    expect(Object.values(rec).some((v) => v === undefined)).toBe(false);
  });

  it('coerces a numeric duration that arrived as a string from the form', () => {
    const rec = buildReservationRecord({ ...VALUES, durationMinutes: '240' }, CTX);
    expect(rec.durationMinutes).toBe(240);
  });

  it('falls back to the start date when no end date was given', () => {
    const rec = buildReservationRecord({ ...VALUES, endDate: '' }, CTX);
    expect(rec.endDate).toBe('20260901');
  });

  describe('the cross-field checks the builder cannot express (spec §6b)', () => {
    it('rejects an end date before the start date', () => {
      expect(() => buildReservationRecord({ ...VALUES, endDate: '20260801' }, CTX)).toThrow(/endDate/);
    });

    it('accepts an end date equal to the start date', () => {
      expect(() => buildReservationRecord({ ...VALUES, endDate: '20260901' }, CTX)).not.toThrow();
    });

    it('rejects a submission whose confirmation checkbox is not ticked', () => {
      // a false checkbox passes the server's required-field check, so the refusal has to
      // live with the write — the same reason createProspect refuses a lead without consent
      expect(() => buildReservationRecord({ ...VALUES, isConfirmed: false }, CTX)).toThrow(/isConfirmed/);
      expect(() => buildReservationRecord({ ...VALUES, isConfirmed: undefined }, CTX)).toThrow(/isConfirmed/);
    });

    it('rejects a submission with no name', () => {
      expect(() => buildReservationRecord({ ...VALUES, name: '' }, CTX)).toThrow(/name/);
    });
  });
});
