/**
 * Reminder presets for chat bookmarks (spec 1.104 §5.2). All times are local wall clock
 * (the user's timezone), so «08:00» stays 08:00 across a DST change.
 */
export type ReminderPreset = 'inOneHour' | 'tonight' | 'tomorrowMorning' | 'nextMonday';

export const REMINDER_PRESETS: ReminderPreset[] = ['inOneHour', 'tonight', 'tomorrowMorning', 'nextMonday'];

const TONIGHT_HOUR = 18;
const MORNING_HOUR = 8;
const MS_PER_HOUR = 3_600_000;

/** Epoch ms at which the reminder for `preset` is due, relative to `now`. */
export function reminderDueAt(preset: ReminderPreset, now: Date): number {
  switch (preset) {
    case 'inOneHour':
      return now.getTime() + MS_PER_HOUR;
    case 'tonight':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), TONIGHT_HOUR, 0, 0, 0).getTime();
    case 'tomorrowMorning':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, MORNING_HOUR, 0, 0, 0).getTime();
    case 'nextMonday': {
      const daysAhead = ((8 - now.getDay()) % 7) || 7; // Monday → +7, Sunday → +1
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead, MORNING_HOUR, 0, 0, 0).getTime();
    }
  }
}

/** The presets that still lie in the future: «tonight» disappears from 17:00 on. */
export function availablePresets(now: Date): ReminderPreset[] {
  const tonightCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), TONIGHT_HOUR - 1, 0, 0, 0).getTime();
  return REMINDER_PRESETS.filter((p) => p !== 'tonight' || now.getTime() < tonightCutoff);
}

const TITLE_MAX = 200;

/**
 * The label a reminder carries (spec 1.104 §5.1): «<sender> in «<room>»», cut to 200 code points
 * (the rules cap `title` at 200). The sweep posts it as «Erinnerung: <title>». No message text.
 */
export function reminderTitle(senderName: string, roomName: string): string {
  return Array.from(`${senderName} in «${roomName}»`.replace(/\s+/g, ' ').trim()).slice(0, TITLE_MAX).join('');
}

/** Local wall-clock ISO string without zone (`2026-10-18T14:05:00`), the form `ion-datetime` takes. */
export function toLocalIso(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}
