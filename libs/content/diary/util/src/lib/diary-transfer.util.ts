import { DiaryPeriod, DiarySource, DiaryTarget } from '@okr/shared-models';

/**
 * Which feature block must be effective in the source app for a source to be offered (spec 1.77
 * §5.1). Only implemented sources are listed: `tripDone` (Phase 2), `albumImage` (Phase 3) and
 * `tracker` join when their transfer is built — until then no row is shown for them.
 */
export const DIARY_SOURCE_BLOCKS: Partial<Record<DiarySource, string>> = {
  taskDone: 'task',
  jasstafel: 'jasstafel',
};

/** The rows of the profile's «Tagebuch-Transfer» table for an app with these effective blocks. */
export function offeredDiarySources(effective: ReadonlySet<string>): DiarySource[] {
  return (Object.entries(DIARY_SOURCE_BLOCKS) as [DiarySource, string][])
    .filter(([, block]) => effective.has(block))
    .map(([source]) => source);
}

/**
 * The diary tenants that receive `source` for an item dated `date` (StoreDate) — spec 1.77 §6.1.
 * A target matches when it ticks `source` and `from <= date <= to`; an empty bound falls back to
 * that diary's published travel period, a still-empty bound is open. Bounds are inclusive.
 * Order follows the stored targets; a tenant appears once.
 */
export function resolveDiaryTargets(
  targets: DiaryTarget[] | undefined,
  source: DiarySource,
  date: string,
  periods: Record<string, DiaryPeriod>,
): string[] {
  const out: string[] = [];
  for (const target of targets ?? []) {
    if (!target.tenantId || !(target.sources ?? []).includes(source)) continue;
    const period = periods[target.tenantId];
    const from = target.from || period?.travelFrom || '';
    const to = target.to || period?.travelTo || '';
    if (from && date < from) continue;
    if (to && date > to) continue;
    if (!out.includes(target.tenantId)) out.push(target.tenantId);
  }
  return out;
}
