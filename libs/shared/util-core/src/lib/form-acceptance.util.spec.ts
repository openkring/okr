import { describe, expect, it } from 'vitest';
import type { ConfirmationVariant, Field, VisibilityRule } from '@okr/shared-models';
import {
  buildConfirmationMessage,
  computeFormAvailability,
  effectiveAcceptance,
  formatAnswer,
  type AcceptanceSettings,
} from './form-acceptance.util';
import { getVisibleFieldIds } from './form-visibility.util';

const f = (id: string, order: number, type: Field['type'], extra: Record<string, unknown> = {}): Field =>
  ({ id, key: id, label: id, required: false, width: 'full', order, type, ...extra }) as Field;

const settings = (extra: Partial<AcceptanceSettings> = {}): AcceptanceSettings => ({
  isOpen: true, closesAt: '', maxResponses: 0, showRemaining: false, closedMessage: '', statsId: 'f1', ...extra,
});

describe('effectiveAcceptance', () => {
  it('a legacy definition without any phase B field is open and unlimited', () => {
    expect(effectiveAcceptance({ okey: 'f1' }, undefined, undefined)).toEqual({
      isOpen: true, closesAt: '', maxResponses: 0, showRemaining: false, closedMessage: '', statsId: 'f1',
    });
  });

  it('a section limit gets its own counter', () => {
    const s = effectiveAcceptance({ okey: 'f1', maxResponses: 20 }, { maxResponses: 8 }, 's1');
    expect(s.maxResponses).toBe(8);
    expect(s.statsId).toBe('f1__s1');
  });

  it('a section limit of 0 inherits the form limit and its counter', () => {
    const s = effectiveAcceptance({ okey: 'f1', maxResponses: 20 }, { maxResponses: 0 }, 's1');
    expect(s.maxResponses).toBe(20);
    expect(s.statsId).toBe('f1');
  });

  it('ignores the section when no section id is known', () => {
    const s = effectiveAcceptance({ okey: 'f1' }, { maxResponses: 8 }, undefined);
    expect(s.maxResponses).toBe(0);
    expect(s.statsId).toBe('f1');
  });

  it('a form switched off stays closed even if the section says open', () => {
    expect(effectiveAcceptance({ okey: 'f1', isOpen: false }, { isOpen: true }, 's1').isOpen).toBe(false);
  });

  it('a section can close an open form', () => {
    expect(effectiveAcceptance({ okey: 'f1', isOpen: true }, { isOpen: false }, 's1').isOpen).toBe(false);
  });

  it('the section closing date wins over the form date', () => {
    expect(effectiveAcceptance({ okey: 'f1', closesAt: '20261231' }, { closesAt: '20261130' }, 's1').closesAt).toBe('20261130');
    expect(effectiveAcceptance({ okey: 'f1', closesAt: '20261231' }, { closesAt: '' }, 's1').closesAt).toBe('20261231');
  });

  it('the section texts win when set', () => {
    const s = effectiveAcceptance({ okey: 'f1', closedMessage: 'A', showRemaining: false }, { closedMessage: 'B', showRemaining: true }, 's1');
    expect(s.closedMessage).toBe('B');
    expect(s.showRemaining).toBe(true);
    expect(effectiveAcceptance({ okey: 'f1', closedMessage: 'A', showRemaining: true }, {}, 's1')).toMatchObject({ closedMessage: 'A', showRemaining: true });
  });
});

describe('effectiveAcceptance (inheritance details)', () => {
  it('inherits closedMessage from the form when the section has none', () => {
    expect(effectiveAcceptance({ okey: 'f1', closedMessage: 'Vorbei' }, { maxResponses: 8 }, 's1').closedMessage).toBe('Vorbei');
  });

  it('a section showRemaining of false overrides the form true', () => {
    expect(effectiveAcceptance({ okey: 'f1', showRemaining: true }, { showRemaining: false }, 's1').showRemaining).toBe(false);
  });
});

describe('computeFormAvailability', () => {
  it('closed beats date and full', () => {
    const s = settings({ isOpen: false, closesAt: '20261101', maxResponses: 1 });
    expect(computeFormAvailability(s, 5, '20261201').reason).toBe('closed');
  });

  it('date beats full', () => {
    expect(computeFormAvailability(settings({ closesAt: '20261101', maxResponses: 1 }), 5, '20261201').reason).toBe('date');
  });

  it('ignores a closing date that is not a StoreDate', () => {
    for (const bad of ['2026-11-30', '30.11.2026', 'garbage', '2026113']) {
      const a = computeFormAvailability(settings({ closesAt: bad }), 0, '20261231');
      expect(a).toMatchObject({ isOpen: true, reason: '', hasLimit: false });
    }
  });

  it('is open on the closing day and closed from the next day', () => {
    const s = settings({ closesAt: '20261130' });
    expect(computeFormAvailability(s, 0, '20261130').isOpen).toBe(true);
    const next = computeFormAvailability(s, 0, '20261201');
    expect(next.isOpen).toBe(false);
    expect(next.reason).toBe('date');
  });

  it('reports a manual close', () => {
    const a = computeFormAvailability(settings({ isOpen: false, closedMessage: 'Vorbei' }), 0, '20261101');
    expect(a).toMatchObject({ isOpen: false, reason: 'closed', closedMessage: 'Vorbei' });
  });

  it('counts the places down and closes the form when full', () => {
    const s = settings({ maxResponses: 8, showRemaining: true });
    expect(computeFormAvailability(s, 7, '20261101')).toMatchObject({ isOpen: true, reason: '', remaining: 1, hasLimit: true, showRemaining: true });
    expect(computeFormAvailability(s, 8, '20261101')).toMatchObject({ isOpen: false, reason: 'full', remaining: 0 });
    expect(computeFormAvailability(s, 12, '20261101')).toMatchObject({ isOpen: false, reason: 'full', remaining: 0 });
  });

  it('unlimited has no remaining', () => {
    expect(computeFormAvailability(settings(), 99, '20261101')).toMatchObject({ isOpen: true, remaining: null, hasLimit: false });
  });

  it('a closing date alone is a limit', () => {
    expect(computeFormAvailability(settings({ closesAt: '20261130' }), 0, '20261101').hasLimit).toBe(true);
  });
});

describe('formatAnswer', () => {
  it('formats nothing as a dash', () => {
    expect(formatAnswer(undefined, undefined)).toBe('–');
    expect(formatAnswer(undefined, null)).toBe('–');
    expect(formatAnswer(undefined, '')).toBe('–');
  });

  it('formats booleans, lists and plain values', () => {
    expect(formatAnswer(undefined, true)).toBe('ja');
    expect(formatAnswer(undefined, false)).toBe('nein');
    expect(formatAnswer(undefined, ['a', 'b'])).toBe('a, b');
    expect(formatAnswer(f('n', 1, 'number'), 42)).toBe('42');
  });

  it('reads a boolean property answer as ja/nein', () => {
    const field = f('c', 1, 'checkbox', { asProperty: true, propertyType: 'boolean' });
    expect(formatAnswer(field, 'true')).toBe('ja');
  });

  it('never prints an AHV number', () => {
    const ahv = '7561234567897';
    expect(formatAnswer(f('a', 1, 'ssn'), ahv)).toBe('angegeben');
    expect(formatAnswer(f('ssnId', 1, 'text'), ahv)).toBe('angegeben');
    expect(formatAnswer(f('a', 1, 'ssn'), '')).toBe('–');
  });
});

describe('buildConfirmationMessage', () => {
  const TODAY = '20261101';
  const fields: Field[] = [
    f('firstName', 1, 'text'),
    f('terms', 2, 'checkbox'),
    f('ssnId', 3, 'ssn'),
    f('course', 4, 'implicit', { valueType: 'text' }),
    f('age', 5, 'number'),
    f('secret', 6, 'text', { visibleIf: { match: 'all', conditions: [{ fieldId: 'age', op: 'gte', value: 18 }] } }),
  ];
  const run = (message: string | undefined, variants: ConfirmationVariant[] | undefined, values: Record<string, unknown>) => {
    const visible = getVisibleFieldIds(fields, values, TODAY);
    return buildConfirmationMessage(fields, message, variants, values, visible, TODAY);
  };

  it('is empty when the author wrote nothing (use the default text)', () => {
    expect(run(undefined, undefined, { firstName: 'Anna' })).toBe('');
    expect(run('', [], { firstName: 'Anna' })).toBe('');
    expect(run('   ', undefined, { firstName: 'Anna' })).toBe('');
  });

  it('fills placeholders with the own answers', () => {
    expect(run('Danke {firstName}', undefined, { firstName: 'Anna' })).toBe('Danke Anna');
  });

  it('passes each filled-in answer, not the author text, through formatParam', () => {
    const visible = getVisibleFieldIds(fields, { firstName: 'Anna', age: 20 }, TODAY);
    const upper = (a: string) => a.toUpperCase();
    expect(buildConfirmationMessage(fields, 'Danke {firstName}, {age}', undefined, { firstName: 'Anna', age: 20 }, visible, TODAY, upper))
      .toBe('Danke ANNA, 20');
  });

  it('chooses the variant on the raw answers even with formatParam', () => {
    const anna: VisibilityRule = { match: 'all', conditions: [{ fieldId: 'firstName', op: 'equals', value: 'Anna' }] };
    const visible = getVisibleFieldIds(fields, { firstName: 'Anna' }, TODAY);
    expect(buildConfirmationMessage(fields, 'Standard', [{ when: anna, message: 'Hallo {firstName}' }], { firstName: 'Anna' }, visible, TODAY, () => 'x'))
      .toBe('Hallo x');
  });

  it('keeps line breaks', () => {
    expect(run('Hallo {firstName}\n\nBis bald', undefined, { firstName: 'Anna' })).toBe('Hallo Anna\n\nBis bald');
  });

  it('shows a single checkbox as ja', () => {
    expect(run('AGB: {terms}', undefined, { terms: true })).toBe('AGB: ja');
  });

  it('skips a matching variant with a blank message', () => {
    const any: VisibilityRule = { match: 'all', conditions: [{ fieldId: 'age', op: 'gte', value: 0 }] };
    const variants: ConfirmationVariant[] = [
      { when: any, message: '  ' },
      { when: any, message: 'Zweite' },
    ];
    expect(run('Standard', variants, { age: 5 })).toBe('Zweite');
    expect(run('Standard', [{ when: any, message: '' }], { age: 5 })).toBe('Standard');
  });

  it('never rescans a substituted answer (no pulling in other answers, implicit values or AHV)', () => {
    expect(run('Hallo {firstName}', undefined, { firstName: '{age}', age: 30 })).toBe('Hallo {age}');
    expect(run('Hallo {firstName}', undefined, { firstName: '{course}', course: 'c42' })).toBe('Hallo {course}');
    expect(run('Hallo {firstName}', undefined, { firstName: '{ssnId}', ssnId: '7561234567897' })).toBe('Hallo {ssnId}');
    expect(run('{age} {firstName}', undefined, { firstName: '{age}', age: 30 })).toBe('30 {age}');
  });

  it('does not look up prototype members', () => {
    expect(run('[{constructor}] [{toString}]', undefined, { firstName: 'Anna' })).toBe('[] []');
  });

  it('the first matching variant wins over the message', () => {
    const adult: VisibilityRule = { match: 'all', conditions: [{ fieldId: 'age', op: 'gte', value: 18 }] };
    const any: VisibilityRule = { match: 'all', conditions: [{ fieldId: 'age', op: 'gte', value: 0 }] };
    const variants: ConfirmationVariant[] = [
      { when: adult, message: 'Erwachsen {firstName}' },
      { when: any, message: 'Zweite' },
    ];
    expect(run('Standard', variants, { firstName: 'Anna', age: 30 })).toBe('Erwachsen Anna');
    expect(run('Standard', variants, { firstName: 'Ben', age: 10 })).toBe('Zweite');
    expect(run('Standard', variants, { firstName: 'Ben' })).toBe('Standard');
  });

  it('replaces a hidden field and an unknown key with nothing', () => {
    expect(run('[{secret}] [{nope}]', undefined, { age: 10, secret: 'geheim' })).toBe('[] []');
  });

  it('never prints an AHV number', () => {
    expect(run('AHV: {ssnId}.', undefined, { ssnId: '7561234567897' })).toBe('AHV: .');
  });

  it('prints the value of an implicit field', () => {
    expect(run('Kurs {course}', undefined, { course: 'c42' })).toBe('Kurs c42');
  });
});
