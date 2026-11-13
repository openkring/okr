import { describe, expect, it } from 'vitest';
import type { JournalFormModel } from './journal-edit.util';
import { JOURNAL_TITLE_MAX, journalValidations } from './journal.validations';

const model = (over: Partial<JournalFormModel> = {}): JournalFormModel => ({
  title: 'Island', subTitle: '', coverImageKey: '', coverLabel: '', lastPageLabel: '', ...over,
});

describe('journalValidations', () => {
  it('passes a valid model', () => expect(journalValidations(model()).isValid()).toBe(true));
  it('fails an empty title', () => expect(journalValidations(model({ title: '' })).hasErrors('title')).toBe(true));
  it('fails 81 characters, passes 80', () => {
    expect(JOURNAL_TITLE_MAX).toBe(80);
    expect(journalValidations(model({ title: 'a'.repeat(81) })).hasErrors('title')).toBe(true);
    expect(journalValidations(model({ title: 'a'.repeat(80) })).hasErrors('title')).toBe(false);
  });
  it('caps subtitle and labels at 120', () => {
    expect(journalValidations(model({ subTitle: 'a'.repeat(121) })).hasErrors('subTitle')).toBe(true);
    expect(journalValidations(model({ coverLabel: 'a'.repeat(121) })).hasErrors('coverLabel')).toBe(true);
    expect(journalValidations(model({ lastPageLabel: 'a'.repeat(120) })).isValid()).toBe(true);
  });
});
