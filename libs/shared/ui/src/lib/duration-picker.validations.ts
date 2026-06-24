import { enforce, only, staticSuite, test } from 'vest';

/**
 * Form model of the {@link DurationPickerModal}. `from`/`to` are ISO strings in the
 * presentation-dependent format (IsoDate `yyyy-MM-dd` when no time is shown, IsoDateTime
 * `yyyy-MM-ddTHH:mm:ss` otherwise). Both fields always use the same format, so a lexicographic
 * comparison is equivalent to a chronological one.
 */
export interface DurationPickerFormModel {
  from: string;
  to: string;
}

export const durationPickerValidations = staticSuite((model: DurationPickerFormModel, field?: string) => {
  if (field) only(field);

  test('from', '@validation.duration.fromRequired', () => {
    enforce(model.from).isNotBlank();
  });

  test('to', '@validation.duration.toRequired', () => {
    enforce(model.to).isNotBlank();
  });

  // the end of the range must not be before its start
  test('to', '@validation.duration.toBeforeFrom', () => {
    enforce(model.to >= model.from).isTruthy();
  });
});
