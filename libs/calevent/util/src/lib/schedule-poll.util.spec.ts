import { Attendee, AvatarInfo, CalEventModel } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';

import { buildSchedulePollTable, countPollAcceptances, countPollResponses } from './schedule-poll.util';

const avatar = (key: string, name1 = 'A', name2 = 'B'): AvatarInfo =>
  ({ key, name1, name2, modelType: 'person', type: '', subType: '', label: '' });

const attendee = (key: string, state: Attendee['state'], comment?: string): Attendee =>
  comment ? { person: avatar(key), state, comment } : { person: avatar(key), state };

const column = (okey: string, over: Partial<CalEventModel> = {}): CalEventModel => ({
  ...new CalEventModel('t1'),
  okey,
  name: 'Herbsttraining',
  description: 'wann passt es?',
  startDate: '20991001',
  startTime: '19:00',
  state: 'proposed',
  ...over,
});

const members = [
  { key: 'me', firstName: 'Bruno', lastName: 'Kaiser' },
  { key: 'you', firstName: 'Hans', lastName: 'Tester' },
];

describe('buildSchedulePollTable', () => {
  it('gives every group member a row before anybody answered', () => {
    const table = buildSchedulePollTable([column('c1'), column('c2')], members, 'me');
    expect(table.rows.map(row => row.key)).toEqual(['me', 'you']);
    expect(table.rows[1].responses).toEqual({});
  });

  it('sorts the current user first and the rest by last name', () => {
    const table = buildSchedulePollTable([column('c1')], [
      { key: 'z', firstName: 'Z', lastName: 'Zwahlen' },
      { key: 'me', firstName: 'Bruno', lastName: 'Kaiser' },
      { key: 'a', firstName: 'A', lastName: 'Ammann' },
    ], 'me');
    expect(table.rows.map(row => row.key)).toEqual(['me', 'a', 'z']);
  });

  it('overlays the answers stored on each column', () => {
    const table = buildSchedulePollTable([
      column('c1', { attendees: [attendee('me', 'accepted'), attendee('you', 'declined')] }),
      column('c2', { attendees: [attendee('me', 'declined')] }),
    ], members, 'me');
    expect(table.rows[0].responses).toEqual({ c1: 'accepted', c2: 'declined' });
    expect(table.rows[1].responses).toEqual({ c1: 'declined' });
  });

  it("reads an 'invited' attendee back as pending", () => {
    const table = buildSchedulePollTable([column('c1', { attendees: [attendee('me', 'invited')] })], members, 'me');
    expect(table.rows[0].responses['c1']).toBe('pending');
  });

  it('keeps an answer from somebody who has left the group', () => {
    const table = buildSchedulePollTable(
      [column('c1', { attendees: [attendee('gone', 'accepted')] })], members, 'me');
    expect(table.rows.map(row => row.key).sort()).toEqual(['gone', 'me', 'you']);
    expect(table.rows.find(row => row.key === 'gone')?.responses['c1']).toBe('accepted');
  });

  it('takes the comment from whichever column carries it', () => {
    const table = buildSchedulePollTable([
      column('c1', { attendees: [attendee('me', 'accepted')] }),
      column('c2', { attendees: [attendee('me', 'declined', 'erst ab 19:00')] }),
    ], members, 'me');
    expect(table.rows[0].comment).toBe('erst ab 19:00');
  });

  it('describes the columns, including a text column', () => {
    const table = buildSchedulePollTable([
      column('c1', { fullDay: true }),
      column('c2', { columnLabel: 'Salat' }),
    ], members, 'me');
    expect(table.columns).toEqual([
      { id: 'c1', startDate: '20991001', startTime: '', columnLabel: '' },
      { id: 'c2', startDate: '20991001', startTime: '19:00', columnLabel: 'Salat' },
    ]);
  });

  it('takes name, description and mode from the first column', () => {
    const table = buildSchedulePollTable([column('c1', { pollMultiSelect: true })], members, 'me');
    expect(table.name).toBe('Herbsttraining');
    expect(table.description).toBe('wann passt es?');
    expect(table.multiSelect).toBe(true);
    expect(table.isDraft).toBe(false);
  });

  it('reads a legacy poll without the multiSelect field as single-winner', () => {
    const legacy = { ...column('c1') } as Partial<CalEventModel>;
    delete legacy.pollMultiSelect;
    expect(buildSchedulePollTable([legacy as CalEventModel], members, 'me').multiSelect).toBe(false);
  });

  it('survives an empty poll', () => {
    const table = buildSchedulePollTable([], members, 'me');
    expect(table.columns).toEqual([]);
    expect(table.name).toBe('');
  });
});

describe('poll counts', () => {
  const event = column('c1', {
    attendees: [attendee('a', 'accepted'), attendee('b', 'declined'), attendee('c', 'accepted')],
  });

  it('counts acceptances and answers separately', () => {
    expect(countPollAcceptances(event)).toBe(2);
    expect(countPollResponses(event)).toBe(3);
  });

  it('counts nothing on a column nobody answered', () => {
    expect(countPollAcceptances(column('c2'))).toBe(0);
    expect(countPollResponses(column('c2'))).toBe(0);
  });
});
