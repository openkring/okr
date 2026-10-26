import { DiarySource, DiaryTarget } from '@okr/shared-models';

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

export { resolveDiaryTargets } from '@okr/shared-models';
