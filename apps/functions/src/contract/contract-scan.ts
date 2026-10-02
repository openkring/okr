import { ContractModel } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';
import { computeNextDeadline, planReminders, planTransition, pruneMarkers } from '@okr/business-contract-util';

export interface ScanEvent { event: 'contract.deadline' | 'contract.ended' | 'contract.renewed'; params: Record<string, string>; }
export interface ScanOutcome { patch: Partial<ContractModel>; events: ScanEvent[]; }

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Pure: what the daily scan changes on one contract and which workflow events it emits (spec §6.2). */
export function planContractScan(c: ContractModel, today: string): ScanOutcome {
  const patch: Partial<ContractModel> = {};
  const events: ScanEvent[] = [];
  const base = { contractType: c.contractType, contractName: c.name };
  let work: ContractModel = { ...c, remindersSent: c.remindersSent ?? [] };

  const t = planTransition(work, today);
  if (t) {
    if (t.state) { patch.state = t.state; work = { ...work, state: t.state }; }
    if (t.endDate) { patch.endDate = t.endDate; work = { ...work, endDate: t.endDate }; }
    events.push({ event: t.event, params: { ...base } });
  }

  const markers = pruneMarkers(work.remindersSent, today);
  work = { ...work, remindersSent: markers };
  for (const r of planReminders(work, today)) {
    for (const m of r.markers) if (!markers.includes(m)) markers.push(m);
    events.push({ event: 'contract.deadline', params: {
      kind: r.kind, leadDays: String(r.leadDays),
      deadline: convertDateFormatToString(r.deadline, DateFormat.StoreDate, DateFormat.ViewDate),
      deadlineDate: r.deadline, ...base,
    } });
  }
  if (!sameList(markers, c.remindersSent ?? [])) patch.remindersSent = markers;

  const next = computeNextDeadline(work, today);
  if (next.date !== c.nextDeadline || next.kind !== c.nextDeadlineKind) {
    patch.nextDeadline = next.date;
    patch.nextDeadlineKind = next.kind;
  }
  return { patch, events };
}

/**
 * Where a scan event points. The workflow engine dedups openTask on (relatedKey, assignee), so a
 * deadline reminder gets a per-deadline key '<contract>.<kind>.<date>': an open notice task no
 * longer swallows the rateFix or next-cycle reminder. Follow-up lead windows (30/7 days) of the SAME
 * deadline still collapse into its open task, by design. linkKey keeps the task linked to the contract.
 */
export function scanEventTarget(contractKey: string, e: ScanEvent): { relatedKey: string; params: Record<string, string> } {
  const linkKey = `contract.${contractKey}`;
  const relatedKey = e.event === 'contract.deadline'
    ? `${linkKey}.${e.params['kind'] ?? ''}.${e.params['deadlineDate'] ?? ''}`
    : linkKey;
  return { relatedKey, params: { ...e.params, linkKey } };
}
