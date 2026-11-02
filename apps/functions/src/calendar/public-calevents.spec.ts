import { describe, expect, it } from 'vitest';

import { toPublicCalEvent } from './public-calevents';

describe('toPublicCalEvent', () => {
  const stored = {
    tenants: ['scs'], isArchived: false, name: 'Training U14', description: 'Halle', type: 'training',
    startDate: '20261105', startTime: '18:00', fullDay: false, durationMinutes: 90, endDate: '',
    periodicity: 'weekly', repeatUntilDate: '20261231', seriesId: 's1', locationKey: 'Halle@l1',
    url: '', urlLabel: '', state: 'definitive', cancelMessage: '', calendars: ['public'],
    courseKey: 'c1',
    attendees: [{ person: { key: 'pA', name1: 'Anna' }, state: 'accepted' }],
    attendance: { pA: { status: 'present' } },
    attendanceConfirmedBy: { key: 'pT', name1: 'Trainer' },
    attendanceConfirmedAt: '20261105190000',
    responsiblePersons: [{ key: 'pT', name1: 'Trainer' }],
    commentCount: 3,
  };

  it('never returns personal data stored on the event (attendees, course attendance, organisers)', () => {
    const result = toPublicCalEvent('e1', stored) as unknown as Record<string, unknown>;
    for (const field of ['attendees', 'attendance', 'attendanceConfirmedBy', 'attendanceConfirmedAt', 'responsiblePersons', 'courseKey', 'commentCount']) {
      expect(result).not.toHaveProperty(field);
    }
  });

  it('keeps the scheduling and display fields', () => {
    expect(toPublicCalEvent('e1', stored)).toEqual({
      okey: 'e1', name: 'Training U14', description: 'Halle', type: 'training',
      startDate: '20261105', startTime: '18:00', fullDay: false, durationMinutes: 90, endDate: '',
      periodicity: 'weekly', repeatUntilDate: '20261231', seriesId: 's1', locationKey: 'Halle@l1',
      url: '', urlLabel: '', state: 'definitive', cancelMessage: '', isArchived: false,
      calendars: ['public'], tenants: ['scs'],
    });
  });

  it('fills defaults for a legacy doc with missing fields', () => {
    const result = toPublicCalEvent('e2', { name: 'Alt', calendars: ['public'] });
    expect(result.durationMinutes).toBe(60);
    expect(result.periodicity).toBe('once');
    expect(result.state).toBe('definitive');
    expect(result.tenants).toEqual([]);
  });
});
