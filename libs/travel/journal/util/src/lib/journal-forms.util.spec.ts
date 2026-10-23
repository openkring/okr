import { describe, expect, it } from 'vitest';
import {
  footprintValidations, htmlToPlainText, newFootprintFormModel, plainTextToHtml, textBlockValidations,
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
