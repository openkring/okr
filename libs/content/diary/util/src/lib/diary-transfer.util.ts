import { DIARY_SOURCES, DiarySource } from '@okr/shared-models';

/**
 * Which feature block must be effective in the source app for a source to be offered (spec 1.77
 * §5.1). Only implemented sources are listed: `tripDone` (Phase 2), `albumImage` (Phase 3) and
 * `tracker` join when their transfer is built — until then no row is shown for them.
 */
export const DIARY_SOURCE_BLOCKS: Partial<Record<DiarySource, string>> = {
  taskDone: 'task',
  jasstafel: 'jasstafel',
};

/** Union of `sources` and `extra`, deduplicated, in `DIARY_SOURCES` order. */
export function mergeDiarySources(sources: readonly DiarySource[], extra: readonly DiarySource[] = []): DiarySource[] {
  const all = new Set<DiarySource>([...sources, ...extra]);
  return DIARY_SOURCES.filter(s => all.has(s));
}

/**
 * The rows of the profile's «Tagebuch-Transfer» table for an app with these effective blocks.
 * `extra` are sources the caller knows to be available independent of any block (e.g. `tracker`
 * on a native build, which only the client can tell).
 */
export function offeredDiarySources(effective: ReadonlySet<string>, extra: DiarySource[] = []): DiarySource[] {
  const fromBlocks = (Object.entries(DIARY_SOURCE_BLOCKS) as [DiarySource, string][])
    .filter(([, block]) => effective.has(block))
    .map(([source]) => source);
  return mergeDiarySources(fromBlocks, extra);
}

export { resolveDiaryTargets } from '@okr/shared-models';
