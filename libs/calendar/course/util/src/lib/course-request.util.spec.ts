import { describe, expect, it } from 'vitest';

import { COURSE_I18N_KEYS } from './course-i18n';
import { compensationErrorKey, compensationSummary, CourseCompensationResult, escapeHtml, formatCourseAmount, htmlLines } from './course-request.util';

const REASONS = [
  'course-not-locked', 'course-archived', 'invalid-rate', 'invalid-person-key', 'duplicate-eligible', 'invalid-account', 'missing-account',
  'cost-center-invalid', 'foreign-booking', 'other-books-final', 'no-finance', 'books-mismatch', 'missing-books', 'no-accounting-config',
  'books-other-tenant', 'not-course-manager', 'course-other-tenant', 'no-tenant', 'course-not-found', 'invalid-course-key',
];

describe('compensationErrorKey', () => {
  it('maps every reason of the callable to its own message, never the generic one', () => {
    for (const reason of REASONS) {
      const key = compensationErrorKey({ code: 'functions/failed-precondition', details: { reason } });
      expect(key, reason).not.toBe('request_error_generic');
      expect(COURSE_I18N_KEYS[key]).toMatch(/^@calendar\/course\/feature\.request\.error\./);
    }
  });

  it('maps the named reasons as specified', () => {
    expect(compensationErrorKey({ details: { reason: 'course-not-locked' } })).toBe('request_error_notLocked');
    expect(compensationErrorKey({ details: { reason: 'invalid-rate' } })).toBe('request_error_rate');
    expect(compensationErrorKey({ details: { reason: 'missing-account' } })).toBe('request_error_missingAccount');
    expect(compensationErrorKey({ details: { reason: 'other-books-final' } })).toBe('request_error_otherBooks');
    expect(compensationErrorKey({ details: { reason: 'cost-center-invalid' } })).toBe('request_error_costCenter');
  });

  it('falls back to the error code for errors without a reason', () => {
    expect(compensationErrorKey({ code: 'functions/permission-denied' })).toBe('request_error_permission');
    expect(compensationErrorKey({ code: 'unauthenticated' })).toBe('request_error_permission');
    expect(compensationErrorKey({ code: 'functions/unavailable' })).toBe('request_error_network');
  });

  it('is generic for anything else, including an unknown or retired reason', () => {
    expect(compensationErrorKey({ details: { reason: 'not-native-books' } })).toBe('request_error_generic');
    expect(compensationErrorKey(new Error('boom'))).toBe('request_error_generic');
    expect(compensationErrorKey(undefined)).toBe('request_error_generic');
    expect(compensationErrorKey({ details: { reason: 42 } })).toBe('request_error_generic');
  });
});

describe('escapeHtml / htmlLines', () => {
  it('escapes markup in names', () => {
    expect(escapeHtml('<b>"A&B"</b>')).toBe('&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;');
    expect(htmlLines(['a', '<i>'])).toBe('• a<br>• &lt;i&gt;');
    expect(htmlLines([])).toBe('');
  });
});

describe('compensationSummary', () => {
  const labels = { written: '{count} prepared.', external: 'Outside.', kept: 'Kept:', cancelled: 'Rejected:', unlisted: 'Unlisted:' };
  const names: Record<string, string> = { pA: 'Anna <A>', pB: 'Beat', pC: 'Cla' };
  const nameOf = (key: string) => names[key] ?? key;
  const money = (minor: number) => (minor / 100).toFixed(2);

  it('names what was prepared, the differences, the rejected bookings and the unlisted leaders', () => {
    const result: CourseCompensationResult = {
      nativeBooks: true, written: 3, taskKey: 't',
      kept: [{ personKey: 'pA', posted: 10000, computed: 12000 }],
      cancelled: [{ personKey: 'pB', amount: 5000, computed: 6000 }],
      unlistedKeys: ['pC'],
    };
    expect(compensationSummary(result, nameOf, money, labels)).toBe(
      '3 prepared.<br><br>Kept:<br>• Anna &lt;A&gt;: 100.00 → 120.00<br><br>Rejected:<br>• Beat: 50.00 → 60.00<br><br>Unlisted:<br>• Cla');
  });

  it('says the books are kept outside when they are not native, and leaves out empty sections', () => {
    const result: CourseCompensationResult = { nativeBooks: false, written: 0, taskKey: 't', kept: [], cancelled: [], unlistedKeys: [] };
    expect(compensationSummary(result, nameOf, money, labels)).toBe('Outside.');
  });
});

describe('formatCourseAmount', () => {
  it('shows the currency and Swiss grouping, CHF without one', () => {
    expect(formatCourseAmount(120000, 'EUR')).toMatch(/^EUR 1.200\.00$/);
    expect(formatCourseAmount(5)).toBe('CHF 0.05');
    expect(formatCourseAmount(0, '')).toBe('CHF 0.00');
  });
});
