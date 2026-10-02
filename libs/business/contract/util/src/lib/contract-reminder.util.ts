import { ContractModel, ContractState, DeadlineKind } from '@okr/shared-models';
import { addDuration, getDayDiff } from '@okr/shared-util-core';
import { contractDeadlines, MAX_CYCLES } from './contract-deadline.util';

export const DEFAULT_REMINDER_LEAD_DAYS = [90, 30, 7];

export interface PlannedReminder { kind: DeadlineKind; deadline: string; leadDays: number; markers: string[]; }
export interface ContractTransition { state?: ContractState; endDate?: string; event: 'contract.ended' | 'contract.renewed'; }

export function reminderMarker(kind: DeadlineKind, date: string, lead: number): string {
  return `${kind}:${date}:${lead}`;
}

/** One reminder per deadline: the SMALLEST window already crossed, unless already sent; all crossed windows get marked. */
export function planReminders(c: ContractModel, today: string): PlannedReminder[] {
  const leads = (c.reminderLeadDays?.length ? c.reminderLeadDays : DEFAULT_REMINDER_LEAD_DAYS)
    .filter((l) => l >= 0).sort((a, b) => b - a);
  const sent = new Set(c.remindersSent ?? []);
  const out: PlannedReminder[] = [];
  for (const d of contractDeadlines(c, today)) {
    const left = getDayDiff(today, d.date);
    const crossed = leads.filter((l) => left <= l);
    if (crossed.length === 0) continue;
    const leadDays = Math.min(...crossed);
    if (sent.has(reminderMarker(d.kind, d.date, leadDays))) continue;
    out.push({ kind: d.kind, deadline: d.date, leadDays, markers: crossed.map((l) => reminderMarker(d.kind, d.date, l)) });
  }
  return out;
}

export function pruneMarkers(markers: string[], today: string): string[] {
  return markers.filter((m) => (m.split(':')[1] ?? '') >= today);
}

export function planTransition(c: ContractModel, today: string): ContractTransition | undefined {
  if (c.isArchived) return undefined;
  if (c.state === 'noticeGiven' && c.effectiveEndDate && c.effectiveEndDate < today) {
    return { state: 'ended', event: 'contract.ended' };
  }
  if (c.state === 'active' && c.endDate && c.endDate < today) {
    if (c.autoRenewMonths > 0) {
      let end = c.endDate;
      for (let i = 0; i < MAX_CYCLES && end < today; i++) end = addDuration(end, { months: c.autoRenewMonths });
      return { endDate: end, event: 'contract.renewed' };
    }
    return { state: 'ended', event: 'contract.ended' };
  }
  return undefined;
}
