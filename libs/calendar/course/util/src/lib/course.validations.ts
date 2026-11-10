import { enforce, omitWhen, staticSuite, test } from 'vest';

import { NAME_LENGTH, WORD_LENGTH } from '@okr/shared-constants';
import { CourseEligible, CourseFinanceModel, CourseModel, MoneyModel } from '@okr/shared-models';
import { dateValidations, stringValidations } from '@okr/shared-util-core';

import { AttendanceFormModel } from './course-table-view.util';
import { isCompleteJsSettings } from './js-durations';

const PFX = '@calendar/course/feature.validation.';

/** J+S course number («Angebotsnummer»): typed by hand, kept in step with the form's `[maxLength]`. */
export const COURSE_NUMBER_LENGTH = WORD_LENGTH;

/**
 * The course itself (spec 1.132 §5.1). `trainerKeys` / `responsibleKeys` are server-maintained and never judged here.
 * Document fields may be absent on legacy documents: every read coalesces.
 */
export const courseValidations = staticSuite((model: CourseModel) => {
  stringValidations('name', model.name, NAME_LENGTH, 1, true);
  // the group is preset by the caller and shown read-only; a foreign key, so no length cap
  stringValidations('groupKey', model.groupKey, undefined, 0, true);

  stringValidations('startDate', model.startDate, undefined, 0, true);
  dateValidations('startDate', model.startDate);
  stringValidations('endDate', model.endDate, undefined, 0, true);
  dateValidations('endDate', model.endDate);
  // StoreDate (yyyyMMdd) sorts as text; the end day is inclusive, so the same day is a one-day course
  omitWhen(!model.startDate || !model.endDate, () => {
    test('endDate', PFX + 'endBeforeStart', () => {
      enforce(model.endDate >= model.startDate).isTruthy();
    });
  });

  test('responsiblePersons', PFX + 'responsibleRequired', () => {
    enforce((model.responsiblePersons ?? []).length).greaterThan(0);
  });

  // Ausschreibung (spec 1.152 §4.1): documents without these fields are valid (`?? 0`, `?? []`, `?? false`)
  test('maxParticipants', PFX + 'placesInvalid', () => {
    const places = model.maxParticipants ?? 0;
    enforce(Number.isInteger(places) && places >= 0).isTruthy();
  });
  omitWhen(model.isAnnounced !== true, () => {
    test('isAnnounced', PFX + 'announceNeedsAudience', () => {
      enforce((model.audience ?? []).length).greaterThan(0);
    });
  });

  omitWhen(model.reportProfile !== 'js', () => {
    const settings = model.reportSettings ?? {};
    stringValidations('reportSettings.courseNumber', settings.courseNumber ?? '', COURSE_NUMBER_LENGTH);
    stringValidations('reportSettings.userGroup', settings.userGroup ?? '', undefined, 0, true);
    stringValidations('reportSettings.mainSportCategory', settings.mainSportCategory ?? '', undefined, 0, true);
    // both set, but not a pair the J+S rules define (NG 1 with Abs. 2, NG 2 with Abs. 1, an unknown group)
    omitWhen(!settings.userGroup || !settings.mainSportCategory, () => {
      test('reportSettings.mainSportCategory', PFX + 'jsPairInvalid', () => {
        enforce(isCompleteJsSettings(settings)).isTruthy();
      });
    });
  });
});

/** A rate is whole minor units (Rappen), not negative — the same test the callable applies. */
function isValidAmount(money: Partial<MoneyModel> | null | undefined): boolean {
  const amount = money?.amount;
  return typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0;
}

/**
 * An eligible entry whose person was erased (privacy erasure blanks `person.key`) names nobody: it is never paid and
 * never judged. Dropping it keeps a course-only save possible after an erasure (spec 1.132 §13).
 */
export function isErasedEligible(entry: Pick<CourseEligible, 'person'>): boolean {
  return !(entry.person?.key ?? '').trim();
}

/** The finance document without erased eligible entries (see `isErasedEligible`); the input is not changed. */
export function withoutErasedEligible<T extends Pick<CourseFinanceModel, 'eligible'>>(finance: T): T {
  if (!finance.eligible?.some(isErasedEligible)) return finance;
  return { ...finance, eligible: finance.eligible.filter(e => !isErasedEligible(e)) };
}

/**
 * The protected finance document of a course (spec 1.132 §5.2).
 *
 * @param bookKeys the books (`accountingTenantId`) the tenant may use; when given, the chosen books must be one of them
 */
export const courseFinanceValidations = staticSuite((model: CourseFinanceModel, bookKeys?: string[]) => {
  const all = model.eligible ?? [];
  // erased entries (blank person key) are dropped, never a personRequired error
  const eligible = all.filter(e => e.person != null && !isErasedEligible(e));
  const rateSet = (model.defaultRate?.amount ?? 0) > 0;

  // as soon as there is something to pay, the books must be named — never derived from the app tenant
  omitWhen(!rateSet && eligible.length === 0, () => {
    test('accountingTenantId', PFX + 'booksRequired', () => {
      enforce(model.accountingTenantId ?? '').isNotBlank();
    });
  });
  omitWhen(!model.accountingTenantId || !bookKeys, () => {
    test('accountingTenantId', PFX + 'booksUnknown', () => {
      enforce((bookKeys ?? []).includes(model.accountingTenantId)).isTruthy();
    });
  });

  // a missing default rate counts as 0 (the server coalesces it); one that is there must be sound
  omitWhen(model.defaultRate == null, () => {
    test('defaultRate', PFX + 'rateInvalid', () => {
      enforce(isValidAmount(model.defaultRate)).isTruthy();
    });
  });

  // a malformed entry without any person object (the picker always sets one)
  test('eligible', PFX + 'personRequired', () => {
    enforce(all.every(e => e.person != null)).isTruthy();
  });
  test('eligible', PFX + 'duplicatePerson', () => {
    const keys = eligible.map(e => e.person?.key).filter(k => !!k);
    enforce(new Set(keys).size === keys.length).isTruthy();
  });
  // an absent or null rate means «use the default rate»; 0 is a rate
  // indices of the full list: the form's rows (the modal drops erased entries before it shows them)
  all.forEach((e, index) => {
    omitWhen(e.rate == null || e.person == null || isErasedEligible(e), () => {
      test(`eligible[${index}].rate`, PFX + 'rateInvalid', () => {
        enforce(isValidAmount(e.rate)).isTruthy();
      });
    });
  });
});

const PRESENCES = ['present', 'absent', 'excused'];
const FUNCTIONS = ['leader', 'participant'];

/**
 * The attendance of one event (spec 1.132 §7.3): every row has a person, a presence and a function. The values are
 * chosen in the dialog, so a failure means a broken row (a legacy entry with an unknown value), shown under the list.
 */
export const courseAttendanceValidations = staticSuite((model: AttendanceFormModel) => {
  test('rows', PFX + 'attendanceInvalid', () => {
    enforce((model.rows ?? []).every(r => !!r.person?.key && PRESENCES.includes(r.presence) && FUNCTIONS.includes(r.function))).isTruthy();
  });
});
