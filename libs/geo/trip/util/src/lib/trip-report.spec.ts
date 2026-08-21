import { describe, it, expect } from 'vitest';
import { AvatarInfo } from '@okr/shared-models';

import { newTripReport, tripReportValidations } from './trip-report';

const PERSON: AvatarInfo = { key: 'p1', name1: 'Anna', name2: 'Muster', label: '', modelType: 'person', type: '', subType: '' };
const BOAT: AvatarInfo = { key: 'b1', name1: '', name2: 'Möwe', label: '', modelType: 'resource', type: 'rboat', subType: 'b1x' };

describe('newTripReport', () => {
  it('returns an empty report by default', () => {
    expect(newTripReport()).toEqual({ boat: undefined, person: undefined, message: '' });
  });

  it('prefills boat and person', () => {
    expect(newTripReport(BOAT, PERSON)).toEqual({ boat: BOAT, person: PERSON, message: '' });
  });
});

describe('tripReportValidations', () => {
  it('is valid with person and message', () => {
    const report = { boat: BOAT, person: PERSON, message: 'Steuer defekt' };
    expect(tripReportValidations(report).isValid()).toBe(true);
  });

  it('requires the person', () => {
    const report = { boat: BOAT, message: 'Steuer defekt' };
    const result = tripReportValidations(report);
    expect(result.isValid()).toBe(false);
    expect(result.hasErrors('person')).toBe(true);
  });

  it('requires the message', () => {
    const report = { boat: BOAT, person: PERSON, message: '' };
    const result = tripReportValidations(report);
    expect(result.isValid()).toBe(false);
    expect(result.hasErrors('message')).toBe(true);
  });

  it('does not require the boat', () => {
    const report = { person: PERSON, message: 'App stürzt ab' };
    expect(tripReportValidations(report).isValid()).toBe(true);
  });
});
