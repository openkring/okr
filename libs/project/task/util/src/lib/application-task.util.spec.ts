import { describe, expect, it } from 'vitest';
import { applicationMailtoHref, applicationTelHref, parseApplicationTask } from './application-task.util';

const NOTES = JSON.stringify({
  submissionId: 'hD5exyKClW0poFCQgtIm',
  formKey: 'mitgliedschaft-beantragen',
  values: {
    firstName: 'Bruno', lastName: 'Kaiser', gender: 'male', dateOfBirth: '19630412',
    email: 'bruno@example.ch', phone: '+41 79 123 1234', applicationAs: 'adult',
  },
});

describe('parseApplicationTask', () => {
  it('reads the applicant of a form-submission task', () => {
    const info = parseApplicationTask({ tags: 'form.submission', notes: NOTES });
    expect(info).toMatchObject({
      submissionId: 'hD5exyKClW0poFCQgtIm', formKey: 'mitgliedschaft-beantragen',
      firstName: 'Bruno', lastName: 'Kaiser', dateOfBirth: '19630412', applicationAs: 'adult',
      email: 'bruno@example.ch', phone: '+41 79 123 1234', parentEmail: '', parentPhone: '',
    });
  });

  it('ignores tasks without the tag, non-JSON notes and submissions without a name', () => {
    expect(parseApplicationTask({ tags: '', notes: NOTES })).toBeUndefined();
    expect(parseApplicationTask({ tags: 'form.submission', notes: 'Boot: Meldung' })).toBeUndefined();
    expect(parseApplicationTask({ tags: 'form.submission', notes: '{broken' })).toBeUndefined();
    expect(parseApplicationTask({ tags: 'form.submission', notes: JSON.stringify({ submissionId: 'x', values: { topic: 'a' } }) })).toBeUndefined();
    expect(parseApplicationTask(undefined)).toBeUndefined();
  });

  it('drops an unknown applicationAs', () => {
    const notes = JSON.stringify({ submissionId: 'x', formKey: 'f', values: { firstName: 'A', applicationAs: 'alien' } });
    expect(parseApplicationTask({ tags: 'x, form.submission', notes })?.applicationAs).toBe('');
  });
});

describe('applicationMailtoHref', () => {
  const base = parseApplicationTask({ tags: 'form.submission', notes: NOTES })!;

  it('builds subject and body', () => {
    expect(applicationMailtoHref(base, 'Deine Anmeldung', 'Hallo Bruno\n\nDanke'))
      .toBe('mailto:bruno@example.ch?subject=Deine%20Anmeldung&body=Hallo%20Bruno%0A%0ADanke');
  });

  it('copies the parent of a youth applicant', () => {
    expect(applicationMailtoHref({ ...base, parentEmail: 'p@example.ch' }, '', ''))
      .toBe('mailto:bruno@example.ch?cc=p%40example.ch');
  });

  it('falls back to the parent, else empty', () => {
    expect(applicationMailtoHref({ ...base, email: '', parentEmail: 'p@example.ch' }, '', '')).toBe('mailto:p@example.ch');
    expect(applicationMailtoHref({ ...base, email: '' }, 's', 'b')).toBe('');
  });
});

describe('applicationTelHref', () => {
  const base = parseApplicationTask({ tags: 'form.submission', notes: NOTES })!;

  it('strips separators and keeps the leading +', () => {
    expect(applicationTelHref(base)).toBe('tel:+41791231234');
    expect(applicationTelHref({ ...base, phone: '079 / 123-12 34' })).toBe('tel:0791231234');
  });

  it('falls back to the parent, else empty', () => {
    expect(applicationTelHref({ ...base, phone: '', parentPhone: '044 111 22 33' })).toBe('tel:0441112233');
    expect(applicationTelHref({ ...base, phone: '' })).toBe('');
  });
});
