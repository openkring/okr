import type { LocalSection } from './track-sections.util';

/** iOS keeps the pedometer history this long (spec 1.122 §3); older sections are never re-queried. */
export const STEPS_HISTORY_MS = 7 * 24 * 3_600_000;

/**
 * Fills `steps` of every foot section from the pedometer (`query(fromMs, toMs)` over the section's first and last
 * point) while the section is within the step history. A rejected or empty answer, a section that is too old or
 * has no points keeps its stored value; non-foot sections lose `steps`.
 */
export async function withQueriedSteps(
  sections: LocalSection[],
  query: (fromMs: number, toMs: number) => Promise<number | undefined>,
  nowMs: number,
): Promise<LocalSection[]> {
  return Promise.all(sections.map(async (s) => {
    if (s.points.length === 0) return s;
    if (s.mode !== 'foot') {
      if (s.steps === undefined) return s;
      const rest = { ...s };
      delete rest.steps;
      return rest;
    }
    const from = s.points[0].t;
    const to = s.points[s.points.length - 1].t;
    if (nowMs - to > STEPS_HISTORY_MS) return s;
    const steps = await query(from, to).catch(() => undefined);
    return steps === undefined ? s : { ...s, steps };
  }));
}
