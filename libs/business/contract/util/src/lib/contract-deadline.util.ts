import { endOfMonth, endOfQuarter, endOfYear, format, type Duration } from 'date-fns';
import { ContractModel, DeadlineKind, NoticeAnchor, NoticePeriod } from '@okr/shared-models';
import { addDuration, DateFormat, parseDate, subDuration } from '@okr/shared-util-core';

export interface ContractDeadline { kind: DeadlineKind; date: string; }

/** Safety cap for renewal loops (100 years of monthly renewals). */
export const MAX_CYCLES = 1200;

export function periodToDuration(p: NoticePeriod): Duration {
  return { [p.unit]: p.duration };
}

/** End of the period containing `date` (month/quarter/year end); 'anytime' / 'contractEnd' leave it unchanged. */
export function anchorTo(date: string, to: NoticeAnchor): string {
  const d = parseDate(date, DateFormat.StoreDate, false);
  if (!d) return date;
  switch (to) {
    case 'monthEnd': return format(endOfMonth(d), DateFormat.StoreDate);
    case 'quarterEnd': return format(endOfQuarter(d), DateFormat.StoreDate);
    case 'yearEnd': return format(endOfYear(d), DateFormat.StoreDate);
    default: return date;
  }
}

function noticeDay(c: ContractModel, cycleEnd: string): string {
  const ours = c.notice?.ours;
  return ours ? subDuration(cycleEnd, periodToDuration(ours)) : cycleEnd;
}

/** For a tacitly renewing contract: the first cycle end whose notice day is today or later. */
export function currentCycleEnd(c: ContractModel, today: string): string {
  let end = c.endDate;
  if (!end || c.autoRenewMonths <= 0) return end;
  for (let i = 0; i < MAX_CYCLES && noticeDay(c, end) < today; i++) {
    end = addDuration(end, { months: c.autoRenewMonths });
  }
  return end;
}

export function contractDeadlines(c: ContractModel, today: string): ContractDeadline[] {
  if (c.isArchived || (c.state !== 'active' && c.state !== 'noticeGiven')) return [];
  const out: ContractDeadline[] = [];
  if (c.state === 'noticeGiven') {
    if (c.effectiveEndDate && c.effectiveEndDate >= today) out.push({ kind: 'end', date: c.effectiveEndDate });
  } else if (c.endDate) {
    if (c.autoRenewMonths > 0) {
      out.push({ kind: 'notice', date: noticeDay(c, currentCycleEnd(c, today)) });
    } else if (c.endDate >= today) {
      out.push({ kind: 'end', date: c.endDate });
    }
  }
  const fix = c.loan?.rateFixedUntil ?? '';
  if (fix && fix >= today) out.push({ kind: 'rateFix', date: fix });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function computeNextDeadline(c: ContractModel, today: string): { date: string; kind: DeadlineKind | '' } {
  const [first] = contractDeadlines(c, today);
  return first ? { date: first.date, kind: first.kind } : { date: '', kind: '' };
}

/** Information for open-ended contracts: today + ours, anchored. Never a reminder. */
export function earliestTerminationDate(c: ContractModel, today: string): string {
  const ours = c.notice?.ours;
  const base = ours ? addDuration(today, periodToDuration(ours)) : today;
  return anchorTo(base, c.notice?.to ?? 'anytime');
}

export function computeEffectiveEndDate(c: ContractModel, noticeDate: string, by: 'us' | 'them'): string {
  const period = by === 'us' ? c.notice?.ours : c.notice?.theirs;
  const earliest = period ? addDuration(noticeDate, periodToDuration(period)) : noticeDate;
  if (c.endDate && c.autoRenewMonths > 0) {
    let end = c.endDate;
    for (let i = 0; i < MAX_CYCLES && end < earliest; i++) end = addDuration(end, { months: c.autoRenewMonths });
    return end;
  }
  const anchored = anchorTo(earliest, c.notice?.to ?? 'anytime');
  return c.endDate && anchored > c.endDate ? c.endDate : anchored;
}
