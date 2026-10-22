/**
 * Kinds of information an app can send into a diary (spec 1.77 §4). Declared up front so that
 * stored targets stay valid when a later phase starts offering a source; which ones an app
 * actually offers is decided by `offeredDiarySources` in `@okr/content-diary-util`.
 */
export const DIARY_SOURCES = ['taskDone', 'jasstafel', 'tripDone', 'albumImage', 'tracker'] as const;
export type DiarySource = typeof DIARY_SOURCES[number];

/**
 * One diary app as configured by one user in one source app: which sources it receives and in
 * which period. `from`/`to` are StoreDates, inclusive; '' is an open bound.
 */
export interface DiaryTarget {
  tenantId: string;
  sources: DiarySource[];
  from: string;
  to: string;
}
