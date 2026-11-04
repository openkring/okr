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

/** The rows an app with these effective blocks offers, in `DIARY_SOURCES` order (spec 1.77 §12.4). */
export function offeredDiarySources(effective: ReadonlySet<string>): DiarySource[] {
  return DIARY_SOURCES.filter((source) => (DIARY_SOURCE_BLOCKS[source] ?? []).some((block) => effective.has(block)));
}

export { resolveDiaryTargets } from '@okr/shared-models';
