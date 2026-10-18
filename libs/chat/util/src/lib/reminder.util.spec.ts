process.env.TZ = 'Europe/Zurich';

import { describe, expect, it } from 'vitest';
import { availablePresets, reminderDueAt } from './reminder.util';

describe('reminderDueAt', () => {
  it('inOneHour adds one hour', () => {
    const now = new Date(2026, 9, 19, 10, 15);
    expect(reminderDueAt('inOneHour', now)).toBe(new Date(2026, 9, 19, 11, 15).getTime());
  });

  it('tonight is 18:00 the same day', () => {
    const now = new Date(2026, 9, 19, 10, 15);
    expect(reminderDueAt('tonight', now)).toBe(new Date(2026, 9, 19, 18, 0).getTime());
  });

  it('tomorrowMorning is 08:00 the next day', () => {
    const now = new Date(2026, 9, 19, 22, 0);
    expect(reminderDueAt('tomorrowMorning', now)).toBe(new Date(2026, 9, 20, 8, 0).getTime());
  });

  it('tomorrowMorning keeps wall clock 08:00 across the DST change (2026-10-25)', () => {
    const now = new Date(2026, 9, 24, 21, 0);
    const due = new Date(reminderDueAt('tomorrowMorning', now));
    expect(due.getDate()).toBe(25);
    expect(due.getHours()).toBe(8);
    expect(due.getMinutes()).toBe(0);
  });

  it('nextMonday from a Monday is the following Monday 08:00', () => {
    const now = new Date(2026, 9, 19, 9, 0); // Monday
    expect(now.getDay()).toBe(1);
    expect(reminderDueAt('nextMonday', now)).toBe(new Date(2026, 9, 26, 8, 0).getTime());
  });

  it('nextMonday from a Wednesday is the coming Monday 08:00', () => {
    const now = new Date(2026, 9, 21, 9, 0);
    expect(reminderDueAt('nextMonday', now)).toBe(new Date(2026, 9, 26, 8, 0).getTime());
  });
});

describe('availablePresets', () => {
  it('omits tonight at 17:01', () => {
    expect(availablePresets(new Date(2026, 9, 19, 17, 1))).not.toContain('tonight');
  });

  it('offers tonight at 16:59', () => {
    expect(availablePresets(new Date(2026, 9, 19, 16, 59))).toContain('tonight');
  });

  it('always offers the other presets', () => {
    expect(availablePresets(new Date(2026, 9, 19, 23, 0))).toEqual(['inOneHour', 'tomorrowMorning', 'nextMonday']);
  });
});
