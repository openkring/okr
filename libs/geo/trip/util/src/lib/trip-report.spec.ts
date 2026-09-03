import { describe, it, expect } from 'vitest';
import { AvatarInfo } from '@okr/shared-models';

import { newTripReport, tripReportValidations } from './trip-report';

const PERSON: AvatarInfo = { key: 'p1', name1: 'Anna', name2: 'Muster', label: '', modelType: 'person', type: '', subType: '' };
const BOAT: AvatarInfo = { key: 'b1', name1: '', name2: 'Möwe', label: '', modelType: 'resource', type: 'rboat', subType: 'b1x' };

describe('newTripReport', () => {
  it('returns an empty report by default', () => {
    expect(newTripReport()).toEqual({ boat: undefined, person: undefined, message: '', lockBoat: false });
  });

  it('prefills boat and person', () => {
    expect(newTripReport(BOAT, PERSON)).toEqual({ boat: BOAT, person: PERSON, message: '', lockBoat: false });
  });
});

describe('newTripReport — lockBoat', () => {
  it('defaults lockBoat to false', () => {
    expect(newTripReport().lockBoat).toBe(false);
  });

  it('keeps lockBoat false when a boat is prefilled', () => {
    const boat = { key: 'boat1', name1: '', name2: 'Gig 4x', modelType: 'resource' as const, type: 'rboat', subType: 'b4x', label: '' };
    expect(newTripReport(boat).lockBoat).toBe(false);
  });
});

describe('tripReportValidations', () => {
  it('is valid with person and message', () => {
    const report = { boat: BOAT, person: PERSON, message: 'Steuer defekt', lockBoat: false };
    expect(tripReportValidations(report).isValid()).toBe(true);
  });

  it('requires the person', () => {
    const report = { boat: BOAT, message: 'Steuer defekt', lockBoat: false };
    const result = tripReportValidations(report);
    expect(result.isValid()).toBe(false);
    expect(result.hasErrors('person')).toBe(true);
  });

  it('requires the message', () => {
    const report = { boat: BOAT, person: PERSON, message: '', lockBoat: false };
    const result = tripReportValidations(report);
    expect(result.isValid()).toBe(false);
    expect(result.hasErrors('message')).toBe(true);
  });

  it('does not require the boat', () => {
    const report = { person: PERSON, message: 'App stürzt ab', lockBoat: false };
    expect(tripReportValidations(report).isValid()).toBe(true);
  });
});
