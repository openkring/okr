import { JsReportSettings } from '@okr/shared-models';

/** The activity types of the J+S attendance import (AWK). */
export type JsActivityType = 'Training' | 'Wettkampf' | 'Trainingstag' | 'Lagertag';

/**
 * What the AWK allows in `DAUER`: a list of minutes, `'optional'` (no entry needed), `'forbidden'` (no entry allowed)
 * or `'none'` (the activity type does not exist for this user group).
 */
export type JsDurationRule = number[] | 'none' | 'optional' | 'forbidden';

/** `from`, `from + step`, ... up to and including `to`. */
function steps(from: number, to: number, step: number): number[] {
  const result: number[] = [];
  for (let m = from; m <= to; m += step) result.push(m);
  return result;
}

const TRAINING_DAY = [240, 300];

/**
 * Allowed `DAUER` in minutes by user group (NG) and main sport category (Art. 1 Abs. 1 / 2 J+S-V-BASPO).
 *
 * Source: BASPO «Import der Anwesenheitskontrolle (AWK)», 11.09.2023, as read in spec 1.132 §9.3 (the author's reading
 * of the PDF; to be checked against the original). Lagertag: no entry allowed in any group.
 *
 * The spec lists only the pairs NG 1 / Abs. 1, NG 2 / Abs. 2, NG 4 and NG 5 with both categories. NG 1 / Abs. 2 and
 * NG 2 / Abs. 1 are not defined and count as incomplete settings (`isCompleteJsSettings`), never as a guessed row.
 */
export const JS_DURATIONS: Record<string, Record<JsActivityType, JsDurationRule>> = {
  '1-abs1': { Training: [60, 75, 90], Trainingstag: TRAINING_DAY, Wettkampf: 'optional', Lagertag: 'forbidden' },
  '2-abs2': { Training: steps(60, 300, 30), Trainingstag: TRAINING_DAY, Wettkampf: steps(60, 300, 30), Lagertag: 'forbidden' },
  '4-abs1': { Training: [60, 75, 90], Trainingstag: TRAINING_DAY, Wettkampf: 'none', Lagertag: 'forbidden' },
  '4-abs2': { Training: steps(60, 300, 30), Trainingstag: TRAINING_DAY, Wettkampf: 'none', Lagertag: 'forbidden' },
  '5-abs1': { Training: [45, 60, 75, 90], Trainingstag: TRAINING_DAY, Wettkampf: 'none', Lagertag: 'forbidden' },
  '5-abs2': { Training: [45, 60, ...steps(90, 300, 30)], Trainingstag: TRAINING_DAY, Wettkampf: 'none', Lagertag: 'forbidden' },
};

/** Whether the settings name a defined pair of user group and main sport category (§9.3); only then durations can be checked. */
export function isCompleteJsSettings(s: Partial<JsReportSettings>): s is JsReportSettings {
  return JS_DURATIONS[`${s.userGroup}-${s.mainSportCategory}`] !== undefined;
}

/**
 * The `DAUER` rule for an activity type under the report settings of the course (spec 1.132 §9.3).
 * Throws for a pair that is not defined: guard with `isCompleteJsSettings`.
 */
export function allowedJsDurations(settings: JsReportSettings, type: JsActivityType): JsDurationRule {
  const row = JS_DURATIONS[`${settings.userGroup}-${settings.mainSportCategory}`];
  if (!row) throw new Error(`js-durations: no rule for user group ${settings.userGroup} / ${settings.mainSportCategory}`);
  return row[type];
}
