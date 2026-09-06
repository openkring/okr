import { describe, it, expect } from 'vitest';
import { Attendee, AvatarInfo, CalEventModel } from '@okr/shared-models';

import { findTrainingCrews, isTrainingCrewBoat, TRAINING_CREW_MIN_SEATS } from './training-crew.util';

const TENANT = 'test-tenant';
const DAY = '20240601';

function person(name: string): AvatarInfo {
  return { key: name, name1: name, name2: name, label: '', modelType: 'person', type: '', subType: '' } as AvatarInfo;
}

function attendee(name: string, state: Attendee['state'] = 'accepted'): Attendee {
  return { person: person(name), state };
}

function makeEvent(overrides: Partial<CalEventModel> = {}): CalEventModel {
  const calEvent = new CalEventModel(TENANT);
  calEvent.okey = overrides.name ?? 'e1';
  calEvent.type = 'training';
  calEvent.startDate = DAY;
  calEvent.startTime = '18:00';
  calEvent.attendees = [attendee('a'), attendee('b'), attendee('c'), attendee('d')];
  return Object.assign(calEvent, overrides);
}

describe('isTrainingCrewBoat', () => {
  it('is false for small boats', () => {
    expect(isTrainingCrewBoat('b1x')).toBe(false);
    expect(isTrainingCrewBoat('b2m')).toBe(false);
  });

  it('is true from four seats on, coxed boats included', () => {
    expect(isTrainingCrewBoat('b4x')).toBe(true);
    expect(isTrainingCrewBoat('b4p')).toBe(true); // 4 + cox
    expect(isTrainingCrewBoat('b8p')).toBe(true);
  });

  it('falls back to the resource seats for an unknown subType', () => {
    expect(isTrainingCrewBoat('gig', 5)).toBe(true);
    expect(isTrainingCrewBoat('gig', 2)).toBe(false);
    expect(isTrainingCrewBoat(undefined, 0)).toBe(false);
  });

  it('starts at TRAINING_CREW_MIN_SEATS', () => {
    expect(isTrainingCrewBoat('', TRAINING_CREW_MIN_SEATS)).toBe(true);
    expect(isTrainingCrewBoat('', TRAINING_CREW_MIN_SEATS - 1)).toBe(false);
  });
});

describe('findTrainingCrews', () => {
  it('returns nothing for a boat below the minimum crew size', () => {
    expect(findTrainingCrews([makeEvent()], DAY, 2)).toEqual([]);
  });

  it('returns nothing without a date', () => {
    expect(findTrainingCrews([makeEvent()], '', 4)).toEqual([]);
  });

  it('finds a training of the same day and takes over its attendees', () => {
    const result = findTrainingCrews([makeEvent({ name: 'Herrentraining' })], DAY, 4);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Herrentraining');
    expect(result[0].attendeeCount).toBe(4);
    expect(result[0].crew.map(p => p.name1)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('skips other days, other types, archived and cancelled events', () => {
    const events = [
      makeEvent({ name: 'other-day', startDate: '20240602' }),
      makeEvent({ name: 'other-type', type: 'regatta' }),
      makeEvent({ name: 'archived', isArchived: true }),
      makeEvent({ name: 'cancelled', state: 'cancelled' }),
    ];
    expect(findTrainingCrews(events, DAY, 4)).toEqual([]);
  });

  it('skips a training whose limit does not match the boat, keeps an unlimited one', () => {
    const events = [
      makeEvent({ name: 'quad', maxAttendees: 4 }),
      makeEvent({ name: 'eight', maxAttendees: 8 }),
      makeEvent({ name: 'unlimited' }),
    ];
    expect(findTrainingCrews(events, DAY, 4).map(t => t.name)).toEqual(['quad', 'unlimited']);
  });

  it('skips a training nobody attends', () => {
    expect(findTrainingCrews([makeEvent({ attendees: [] })], DAY, 4)).toEqual([]);
    expect(findTrainingCrews([makeEvent({ attendees: [attendee('a', 'declined')] })], DAY, 4)).toEqual([]);
  });

  it('puts the confirmed attendees into the boat first and caps at its seats', () => {
    const calEvent = makeEvent({
      attendees: [attendee('inv1', 'invited'), attendee('acc1'), attendee('no', 'declined'), attendee('acc2'), attendee('inv2', 'invited')],
    });
    const [result] = findTrainingCrews([calEvent], DAY, 4);
    expect(result.attendeeCount).toBe(4);
    expect(result.crew.map(p => p.name1)).toEqual(['acc1', 'acc2', 'inv1', 'inv2']);
  });

  it('sorts the proposals by start time', () => {
    const events = [
      makeEvent({ name: 'evening', startTime: '18:00' }),
      makeEvent({ name: 'morning', startTime: '06:30' }),
    ];
    expect(findTrainingCrews(events, DAY, 4).map(t => t.name)).toEqual(['morning', 'evening']);
  });
});
