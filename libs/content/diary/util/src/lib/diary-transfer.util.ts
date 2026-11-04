import { DIARY_SOURCES, DiarySource } from '@okr/shared-models';

/**
 * Which feature blocks offer a source: any one of them effective in the source app is enough (spec 1.77 §5.1, §12.9).
 * Only implemented sources are listed: `tripDone` (Phase 2) and `albumImage` (Phase 3) join when their transfer is built.
 */
export const DIARY_SOURCE_BLOCKS: Partial<Record<DiarySource, string[]>> = {
  taskDone: ['task'],
  jasstafel: ['jasstafel'],
  tracker: ['trip', 'journal'],
};

/** Union of `sources` and `extra`, deduplicated, in `DIARY_SOURCES` order. */
export function mergeDiarySources(sources: readonly DiarySource[], extra: readonly DiarySource[] = []): DiarySource[] {
  const all = new Set<DiarySource>([...sources, ...extra]);
  return DIARY_SOURCES.filter(s => all.has(s));
}

/**
 * The rows of the profile's «Tagebuch-Transfer» table for an app with these effective blocks.
 * `extra` are sources the app offers independent of any block (`DIARY_EXTRA_SOURCES`, e.g. `tracker`
 * in bkg-app, which only the app can tell).
 */
export function offeredDiarySources(effective: ReadonlySet<string>, extra: readonly DiarySource[] = []): DiarySource[] {
  const fromBlocks = (Object.entries(DIARY_SOURCE_BLOCKS) as [DiarySource, string[]][])
    .filter(([, blocks]) => blocks.some((block) => effective.has(block)))
    .map(([source]) => source);
  return mergeDiarySources(fromBlocks, extra);
}

export { resolveDiaryTargets } from '@okr/shared-models';
