import { describe, expect, it } from 'vitest';

import { AgendaItem, AvatarInfo, MeetingModel, TaskModel } from '@okr/shared-models';

import {
  carryOverAgendaItems, countPresent, getMeetingIndex, getMeetingRelatedKey,
  isMeeting, isOpenTask, newAgendaItem, newAttendees, newMeetingModel, nextAgendaItemKey,
} from './meeting.util';

const avatar = (key: string, name1 = 'Anna', name2 = 'Muster'): AvatarInfo => ({
  key, name1, name2, modelType: 'person', type: '', subType: '', label: '',
});

const task = (name: string, completionDate = '', isArchived = false): TaskModel => {
  const t = new TaskModel('scs');
  t.name = name;
  t.completionDate = completionDate;
  t.isArchived = isArchived;
  return t;
};

describe('isMeeting', () => {
  it('accepts a meeting model', () => {
    expect(isMeeting(new MeetingModel('scs'), 'scs')).toBe(true);
  });

  it('rejects undefined', () => {
    expect(isMeeting(undefined, 'scs')).toBe(false);
  });
});

describe('newMeetingModel', () => {
  it('sets tenant, group, name and date', () => {
    const meeting = newMeetingModel('scs', 'vorstand', 'Vorstandssitzung 3/2026', '20260901');
    expect(meeting.tenants).toEqual(['scs']);
    expect(meeting.groupKey).toBe('vorstand');
    expect(meeting.name).toBe('Vorstandssitzung 3/2026');
    expect(meeting.meetingDate).toBe('20260901');
    expect(meeting.state).toBe('draft');
    expect(meeting.agenda).toEqual([]);
  });
});

describe('nextAgendaItemKey', () => {
  it('starts at 1 for an empty agenda', () => {
    expect(nextAgendaItemKey([])).toBe('1');
  });

  it('continues past the highest key, not the length', () => {
    const agenda = [
      { key: '1' }, { key: '7' }, { key: '3' },
    ] as AgendaItem[];
    expect(nextAgendaItemKey(agenda)).toBe('8');
  });

  it('ignores non-numeric keys instead of producing NaN', () => {
    const agenda = [{ key: 'legacy' }, { key: '2' }] as AgendaItem[];
    expect(nextAgendaItemKey(agenda)).toBe('3');
  });
});

describe('newAgendaItem', () => {
  it('keeps keys unique as items are appended', () => {
    const agenda: AgendaItem[] = [];
    agenda.push(newAgendaItem(agenda, 'Begrüssung', 'info'));
    agenda.push(newAgendaItem(agenda, 'Jahresrechnung', 'decision'));
    expect(agenda.map(i => i.key)).toEqual(['1', '2']);
    expect(agenda[1].kind).toBe('decision');
  });

  it('does not reuse the key of a removed item', () => {
    const agenda = [newAgendaItem([], 'a'), newAgendaItem([{ key: '1' } as AgendaItem], 'b')];
    agenda.splice(0, 1); // remove the first item
    expect(nextAgendaItemKey(agenda)).toBe('3');
  });
});

describe('getMeetingRelatedKey', () => {
  it('prefixes the okey with the model type', () => {
    expect(getMeetingRelatedKey('abc123')).toBe('meeting.abc123');
  });
});

describe('isOpenTask', () => {
  it('is open without a completion date', () => {
    expect(isOpenTask(task('Offerte einholen'))).toBe(true);
  });

  it('is closed once completed', () => {
    expect(isOpenTask(task('Offerte einholen', '20260810'))).toBe(false);
  });

  it('is closed when archived', () => {
    expect(isOpenTask(task('Offerte einholen', '', true))).toBe(false);
  });

  it('treats a legacy document without completionDate as open', () => {
    const legacy = { ...task('alt'), completionDate: undefined } as unknown as TaskModel;
    expect(isOpenTask(legacy)).toBe(true);
  });
});

describe('carryOverAgendaItems', () => {
  it('creates one item per open task, keyed uniquely and marked as carried', () => {
    const t1 = task('Offerte einholen');
    const t2 = task('Statuten prüfen');
    t2.assignee = avatar('p2', 'Beat', 'Beispiel');

    const items = carryOverAgendaItems([t1, t2], 'prev');

    expect(items).toHaveLength(2);
    expect(items.map(i => i.key)).toEqual(['1', '2']);
    expect(items.map(i => i.title)).toEqual(['Offerte einholen', 'Statuten prüfen']);
    expect(items.every(i => i.carriedFromMeetingKey === 'prev')).toBe(true);
    expect(items[1].owner?.key).toBe('p2');
  });

  it('returns an empty agenda when nothing is open', () => {
    expect(carryOverAgendaItems([], 'prev')).toEqual([]);
  });
});

describe('newAttendees', () => {
  it('invites every person', () => {
    const attendees = newAttendees([avatar('p1'), avatar('p2')]);
    expect(attendees.map(a => a.state)).toEqual(['invited', 'invited']);
    expect(attendees[0].person.key).toBe('p1');
  });
});

describe('countPresent', () => {
  it('counts only the present ones', () => {
    const attendees = newAttendees([avatar('p1'), avatar('p2'), avatar('p3')]);
    attendees[0].state = 'present';
    attendees[1].state = 'excused';
    attendees[2].state = 'present';
    expect(countPresent(attendees)).toBe(2);
  });
});

describe('getMeetingIndex', () => {
  it('indexes name, date, group, chair and secretary', () => {
    const meeting = newMeetingModel('scs', 'vorstand', 'Vorstandssitzung 3/2026', '20260901');
    meeting.chair = avatar('p1', 'Anna', 'Muster');
    meeting.secretary = avatar('p2', 'Beat', 'Beispiel');

    const index = getMeetingIndex(meeting);

    expect(index).toContain('n:Vorstandssitzung 3/2026');
    expect(index).toContain('d:20260901');
    expect(index).toContain('g:vorstand');
    expect(index).toContain('c:Anna Muster');
    expect(index).toContain('s:Beat Beispiel');
  });

  it('omits chair and secretary when unset', () => {
    const index = getMeetingIndex(newMeetingModel('scs', 'vorstand', 'Sitzung'));
    expect(index).not.toContain('c:');
    expect(index).not.toContain('s:');
  });
});
