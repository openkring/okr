import { describe, expect, it } from 'vitest';
import { JournalBookModel } from '@okr/shared-models';
import {
  BookSettingsFormModel, bookSettingsOf, bookSettingsPatch, bookSettingsValidations, footprintValidations, htmlToPlainText, newFootprintFormModel, plainTextToHtml, textBlockValidations,
} from './journal-forms.util';

describe('footprint validations', () => {
  const valid = { ...newFootprintFormModel(), title: 'Neko Harbour', date: '20270114', time: '09:00' };

  it('a complete footprint is valid', () => {
    expect(footprintValidations(valid).isValid()).toBe(true);
  });

  it('the title is required', () => {
    expect(footprintValidations({ ...valid, title: '' }).hasErrors('title')).toBe(true);
  });

  it('the title is at most LONG_NAME_LENGTH characters', () => {
    expect(footprintValidations({ ...valid, title: 'x'.repeat(101) }).hasErrors('title')).toBe(true);
    expect(footprintValidations({ ...valid, title: 'x'.repeat(100) }).hasErrors('title')).toBe(false);
  });

  it('date and time may be empty but not malformed', () => {
    expect(footprintValidations({ ...valid, date: '', time: '' }).isValid()).toBe(true);
    expect(footprintValidations({ ...valid, date: '20271345' }).hasErrors('date')).toBe(true);
    expect(footprintValidations({ ...valid, time: '25:99' }).hasErrors('time')).toBe(true);
  });
});

describe('text block validations', () => {
  it('the text must not be blank', () => {
    expect(textBlockValidations({ text: '   ' }).hasErrors('text')).toBe(true);
    expect(textBlockValidations({ text: 'Pinguine' }).isValid()).toBe(true);
  });
});

describe('text and html', () => {
  it('plainTextToHtml makes paragraphs and line breaks and escapes markup', () => {
    expect(plainTextToHtml('Erster Absatz\nzweite Zeile\n\nZweiter <Absatz> & mehr'))
      .toBe('<p>Erster Absatz<br>zweite Zeile</p><p>Zweiter &lt;Absatz&gt; &amp; mehr</p>');
  });

  it('htmlToPlainText reverses plainTextToHtml', () => {
    const text = 'Erster Absatz\nzweite Zeile\n\nZweiter <Absatz> & mehr';
    expect(htmlToPlainText(plainTextToHtml(text))).toBe(text);
  });

  it('htmlToPlainText drops other tags', () => {
    expect(htmlToPlainText('<p><strong>fett</strong> und <em>kursiv</em></p>')).toBe('fett und kursiv');
  });
});

describe('book settings', () => {
  const journal = { title: 'Antarktis', subTitle: 'Mit dem Schiff' };
  const model = (over: Partial<BookSettingsFormModel> = {}): BookSettingsFormModel => ({ ...bookSettingsOf(new JournalBookModel(), journal), ...over });

  it('takes title and subtitle from the journal until the book has its own', () => {
    expect(bookSettingsOf(new JournalBookModel(), journal)).toMatchObject({ title: 'Antarktis', subTitle: 'Mit dem Schiff', coverImageKey: '', bleedMm: 3, pageMultiple: 4, cover: 'none' });
    expect(bookSettingsOf({ ...new JournalBookModel(), title: 'Buch', subTitle: '' }, journal)).toMatchObject({ title: 'Buch', subTitle: '' });
  });

  it('the defaults are valid', () => {
    expect(bookSettingsValidations(model()).isValid()).toBe(true);
  });

  it('bleed, page multiple and cover type are checked', () => {
    expect(bookSettingsValidations(model({ bleedMm: 11 })).hasErrors('bleedMm')).toBe(true);
    expect(bookSettingsValidations(model({ bleedMm: 2.5 })).hasErrors('bleedMm')).toBe(false);
    expect(bookSettingsValidations(model({ pageMultiple: 0 })).hasErrors('pageMultiple')).toBe(true);
    expect(bookSettingsValidations(model({ pageMultiple: 2.5 })).hasErrors('pageMultiple')).toBe(true);
    expect(bookSettingsValidations(model({ cover: 'spiral' as BookSettingsFormModel['cover'] })).hasErrors('cover')).toBe(true);
  });

  it('spine and wrap are checked only with a cover', () => {
    expect(bookSettingsValidations(model({ spineMm: 500 })).isValid()).toBe(true);
    expect(bookSettingsValidations(model({ cover: 'hardcover', spineMm: 500 })).hasErrors('spineMm')).toBe(true);
    expect(bookSettingsValidations(model({ cover: 'hardcover', spineMm: 12.5, wrapMm: 15 })).isValid()).toBe(true);
  });

  it('the patch writes title, subtitle, cover photo and print settings only', () => {
    const patch = bookSettingsPatch(model({ title: ' Buch ', cover: 'softcover', spineMm: 8, pageMultiple: 4 }));
    expect(Object.keys(patch).sort()).toEqual(['coverImageKey', 'print', 'subTitle', 'title']);
    expect(patch.title).toBe('Buch');
    expect(patch.print).toEqual({ bleedMm: 3, pageMultiple: 4, iccProfile: 'fogra39', cover: 'softcover', spineMm: 8, wrapMm: 0 });
  });
});
