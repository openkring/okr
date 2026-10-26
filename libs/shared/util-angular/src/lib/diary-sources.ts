import { InjectionToken } from '@angular/core';
import type { DiarySource } from '@okr/shared-models';

/**
 * Diary-transfer sources an app offers independent of any feature block (spec 1.121 §7) — only the app knows
 * whether it ships e.g. the tracker. Default `[]`; a tracker app provides `['tracker']` in its app.config.ts.
 */
export const DIARY_EXTRA_SOURCES = new InjectionToken<DiarySource[]>('DIARY_EXTRA_SOURCES', {
  providedIn: 'root',
  factory: () => [],
});
