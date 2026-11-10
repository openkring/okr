import { describe, expect, it } from 'vitest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH } from '@okr/shared-constants';
import { ConfirmationVariant, Field, FormDefinitionModel } from '@okr/shared-models';

import { formDefinitionValidations } from './form-definition.validations';
import { FORM_MESSAGE_MAX_LENGTH } from './form-prefill-link.util';

function newDefinition(overrides: Partial<FormDefinitionModel> = {}): FormDefinitionModel {
  const fd = new FormDefinitionModel('test');
  fd.name = 'Kontaktformular';
  fd.target = { kind: 'collection', mappingKey: 'applications', modelType: 'person', collectionName: 'applications' };
  return { ...fd, ...overrides };
}

describe('formDefinitionValidations', () => {
  it('accepts a named form with a collection target', () => {
    expect(formDefinitionValidations(newDefinition()).isValid()).toBe(true);
  });

  it('rejects a blank name', () => {
    expect(formDefinitionValidations(newDefinition({ name: '  ' })).hasErrors('name')).toBe(true);
  });

  it('rejects a name longer than LONG_NAME_LENGTH', () => {
    expect(formDefinitionValidations(newDefinition({ name: 'x'.repeat(LONG_NAME_LENGTH + 1) })).hasErrors('name')).toBe(true);
  });

  it('accepts an empty description but rejects one longer than DESCRIPTION_LENGTH', () => {
    expect(formDefinitionValidations(newDefinition({ description: '' })).isValid()).toBe(true);
    expect(formDefinitionValidations(newDefinition({ description: 'x'.repeat(DESCRIPTION_LENGTH + 1) })).hasErrors('description')).toBe(true);
  });

  it('accepts an empty or missing filler help text but rejects one longer than DESCRIPTION_LENGTH', () => {
    expect(formDefinitionValidations(newDefinition({ fillerHelpText: '' })).isValid()).toBe(true);
    expect(formDefinitionValidations({ ...newDefinition(), fillerHelpText: undefined } as unknown as FormDefinitionModel).isValid()).toBe(true);
    expect(formDefinitionValidations(newDefinition({ fillerHelpText: 'x'.repeat(DESCRIPTION_LENGTH + 1) })).hasErrors('fillerHelpText')).toBe(true);
  });

  it('rejects a collection target without a mapping', () => {
    const fd = newDefinition({ target: { kind: 'collection', mappingKey: '', modelType: '', collectionName: '' } });
    expect(formDefinitionValidations(fd).hasErrors('target.mappingKey')).toBe(true);
  });

  it('rejects a URL target with a blank URL', () => {
    const fd = newDefinition({ target: { kind: 'url', url: ' ' } });
    expect(formDefinitionValidations(fd).hasErrors('target.url')).toBe(true);
  });

  it('accepts a URL target with a URL', () => {
    const fd = newDefinition({ target: { kind: 'url', url: 'https://example.com/hook' } });
    expect(formDefinitionValidations(fd).isValid()).toBe(true);
  });

  it('does not require a mapping for a URL target', () => {
    const fd = newDefinition({ target: { kind: 'url', url: 'https://example.com/hook' } });
    expect(formDefinitionValidations(fd).hasErrors('target.mappingKey')).toBe(false);
  });

  it('accepts a mail-only target (no mapping, no URL)', () => {
    const fd = newDefinition({ target: { kind: 'mail' } });
    expect(formDefinitionValidations(fd).isValid()).toBe(true);
  });

  describe('unique field keys (spec 7.3)', () => {
    const field = (id: string, type: string, key: string, order: number) => ({ id, key, type, label: id, required: false, width: 'full', order }) as Field;

    it('rejects two input fields with the same key', () => {
      const fd = newDefinition({ fields: [field('a', 'radio', 'field_11', 0), field('b', 'checkbox', 'field_11', 1)] });
      const result = formDefinitionValidations(fd);
      expect(result.hasErrors('fields')).toBe(true);
      expect(result.getErrors('fields')).toContain('@forms/feature.fields.duplicate_key');
    });

    it('accepts distinct keys', () => {
      const fd = newDefinition({ fields: [field('a', 'text', 'firstName', 0), field('b', 'text', 'lastName', 1)] });
      expect(formDefinitionValidations(fd).isValid()).toBe(true);
    });

    it('accepts duplicate empty keys on dividers and other display elements', () => {
      const fd = newDefinition({ fields: [field('a', 'divider', '', 0), field('b', 'divider', '', 1), field('c', 'label', '', 2), field('d', 'text', 'x', 3)] });
      expect(formDefinitionValidations(fd).isValid()).toBe(true);
    });

    it('does not report fields with an empty key as duplicates of each other', () => {
      const fd = newDefinition({ fields: [field('a', 'text', '', 0), field('b', 'text', '', 1)] });
      expect(formDefinitionValidations(fd).hasErrors('fields')).toBe(false);
    });

    it('survives a legacy definition without a field list', () => {
      const fd = newDefinition();
      (fd as { fields?: Field[] }).fields = undefined;
      expect(formDefinitionValidations(fd).isValid()).toBe(true);
    });
  });

  describe('AHV field placement (privacy 1.19)', () => {
    const ssn = (key: string) => ({ id: 's', key, type: 'ssn', label: 'AHV-Nummer', required: false, width: 'full', order: 0 }) as Field;
    const app = (mappingKey: string, fields: Field[]) => newDefinition({
      target: { kind: 'collection', mappingKey, modelType: 'ApplicationModel', collectionName: 'applications' }, fields,
    });
    const MSG = '@forms/feature.fields.ssn_placement';

    it('accepts an ssn field keyed ssnId on an application mapping', () => {
      expect(formDefinitionValidations(app('applications.default', [ssn('ssnId')])).isValid()).toBe(true);
      expect(formDefinitionValidations(app('applications.junior', [ssn('ssnId')])).isValid()).toBe(true);
    });

    it('rejects an ssn field under another key', () => {
      expect(formDefinitionValidations(app('applications.default', [ssn('ahv')])).getErrors('fields')).toContain(MSG);
    });

    it('rejects an ssn field on a prospect, reservation or URL target', () => {
      const prospect = newDefinition({ target: { kind: 'collection', mappingKey: 'prospects.default', modelType: 'ProspectModel', collectionName: 'prospects' }, fields: [ssn('ssnId')] });
      expect(formDefinitionValidations(prospect).getErrors('fields')).toContain(MSG);
      const reservation = newDefinition({ target: { kind: 'collection', mappingKey: 'reservations.boathouse', modelType: 'ReservationModel', collectionName: 'reservations' }, fields: [ssn('ssnId')] });
      expect(formDefinitionValidations(reservation).getErrors('fields')).toContain(MSG);
      const url = newDefinition({ target: { kind: 'url', url: 'https://example.com/hook' }, fields: [ssn('ssnId')] });
      expect(formDefinitionValidations(url).getErrors('fields')).toContain(MSG);
      const mail = newDefinition({ target: { kind: 'mail' }, fields: [ssn('ssnId')] });
      expect(formDefinitionValidations(mail).getErrors('fields')).toContain(MSG);
    });
  });

  describe('«Andere …» key clash (security finding, Task 2)', () => {
    const MSG = '@forms/feature.fields.other_key_clash';
    const opts = [{ label: 'A', value: 'a' }];
    const radio = (key: string, extra: Record<string, unknown> = {}) =>
      ({ id: `r_${key}`, key, label: key, required: false, width: 'full', order: 0, type: 'radio', options: opts, ...extra }) as Field;
    const text = (key: string) => ({ id: `t_${key}`, key, label: key, required: false, width: 'full', order: 1, type: 'text' }) as Field;

    it('rejects a field keyed <key>Other next to an allowOther field', () => {
      const result = formDefinitionValidations(newDefinition({ fields: [radio('kurs', { allowOther: true }), text('kursOther')] }));
      expect(result.getErrors('fields')).toContain(MSG);
    });

    it('accepts the same keys while allowOther is off', () => {
      expect(formDefinitionValidations(newDefinition({ fields: [radio('kurs'), text('kursOther')] })).isValid()).toBe(true);
    });

    it('also covers the keys of derived values', () => {
      const derived = [{ key: 'kursOther', cases: [{ when: { match: 'all', conditions: [{ fieldId: 'r_kurs', op: 'isFilled' }] }, value: 'x' }] }];
      const result = formDefinitionValidations(newDefinition({ fields: [radio('kurs', { allowOther: true })], derivedValues: derived as FormDefinitionModel['derivedValues'] }));
      expect(result.getErrors('fields')).toContain(MSG);
      const unrelated = [{ ...derived[0], key: 'kursLevel' }];
      expect(formDefinitionValidations(newDefinition({ fields: [radio('kurs', { allowOther: true })], derivedValues: unrelated as FormDefinitionModel['derivedValues'] })).getErrors('fields')).not.toContain(MSG);
    });

    it('accepts an allowOther field with unrelated keys', () => {
      expect(formDefinitionValidations(newDefinition({ fields: [radio('kurs', { allowOther: true }), text('kursName')] })).isValid()).toBe(true);
    });
  });

  describe('allowOther per mapping (spec §9)', () => {
    const opts = [{ label: 'M', value: 'male' }];
    const gender = { id: 'g', key: 'gender', label: 'G', required: false, width: 'full', order: 0, type: 'radio', options: opts, allowOther: true } as Field;
    const target = (mappingKey: string) => ({ kind: 'collection', mappingKey, modelType: 'ApplicationModel', collectionName: 'applications' }) as FormDefinitionModel['target'];

    it('rejects «Andere» on a typed choice key of an application mapping', () => {
      const result = formDefinitionValidations(newDefinition({ target: target('applications.default'), fields: [gender] }));
      expect(result.getErrors('fields')).toContain('@forms/feature.fields.other_not_allowed');
    });

    it('accepts it where the key is free', () => {
      expect(formDefinitionValidations(newDefinition({ target: target('applications.course'), fields: [{ ...gender, key: 'prio' } as Field] })).isValid()).toBe(true);
    });
  });

  describe('R1: an AHV field is never an implicit field', () => {
    const MSG = '@forms/feature.fields.implicit_ssn';
    const implicit = (key: string) => ({ id: `i_${key}`, key, label: key, required: false, width: 'full', order: 0, type: 'implicit', valueType: 'text', defaultValue: '7561234567897' }) as Field;

    it('rejects an implicit field keyed ssnId (pasted JSON too)', () => {
      expect(formDefinitionValidations(newDefinition({ fields: [implicit('ssnId')] })).getErrors('fields')).toContain(MSG);
    });

    it('accepts any other implicit field', () => {
      expect(formDefinitionValidations(newDefinition({ fields: [implicit('courseId')] })).getErrors('fields')).not.toContain(MSG);
    });
  });

  describe('acceptance (spec §11)', () => {
    it('accepts the defaults and a legacy definition without the fields', () => {
      expect(formDefinitionValidations(newDefinition()).isValid()).toBe(true);
      const legacy = { ...newDefinition() } as Partial<FormDefinitionModel>;
      for (const key of ['isOpen', 'closesAt', 'maxResponses', 'showRemaining', 'closedMessage', 'confirmationMessage', 'confirmationVariants', 'sendFillerConfirmation'] as const) delete legacy[key];
      expect(formDefinitionValidations(legacy as FormDefinitionModel).isValid()).toBe(true);
    });

    it('accepts maxResponses 0 to 10000 as integer', () => {
      for (const n of [0, 1, 8, 10000]) expect(formDefinitionValidations(newDefinition({ maxResponses: n })).hasErrors('maxResponses')).toBe(false);
    });

    it('rejects a maxResponses that is negative, fractional, too large or not a number', () => {
      for (const n of [-1, 1.5, 10001, Number.NaN, '5' as unknown as number]) {
        expect(formDefinitionValidations(newDefinition({ maxResponses: n })).hasErrors('maxResponses')).toBe(true);
      }
    });

    it('treats maxResponses null like a missing value (legacy)', () => {
      expect(formDefinitionValidations(newDefinition({ maxResponses: null as unknown as number })).hasErrors('maxResponses')).toBe(false);
    });

    it('accepts closesAt empty or a valid StoreDate', () => {
      for (const d of ['', '20261130', '20240229']) expect(formDefinitionValidations(newDefinition({ closesAt: d })).hasErrors('closesAt')).toBe(false);
    });

    it('rejects a closesAt that is no real date', () => {
      for (const d of ['2026-11-30', '30.11.2026', '20261331', '20230229', '2026113', 'abc']) {
        expect(formDefinitionValidations(newDefinition({ closesAt: d })).hasErrors('closesAt')).toBe(true);
      }
    });

    it('caps the closed text', () => {
      expect(FORM_MESSAGE_MAX_LENGTH).toBe(2000);
      expect(formDefinitionValidations(newDefinition({ closedMessage: 'x'.repeat(FORM_MESSAGE_MAX_LENGTH) })).hasErrors('closedMessage')).toBe(false);
      expect(formDefinitionValidations(newDefinition({ closedMessage: 'x'.repeat(FORM_MESSAGE_MAX_LENGTH + 1) })).hasErrors('closedMessage')).toBe(true);
    });
  });

  describe('confirmation (spec §10)', () => {
    const email = { id: 'e', key: 'email', label: 'E-Mail', required: false, width: 'full', order: 0, type: 'email' } as Field;
    const color = { id: 'c', key: 'color', label: 'Farbe', required: false, width: 'full', order: 1, type: 'radio', options: [{ label: 'A', value: 'a' }] } as Field;
    const variant = (extra: Partial<ConfirmationVariant> = {}): ConfirmationVariant => ({
      when: { match: 'all', conditions: [{ fieldId: 'c', op: 'equals', value: 'a' }] }, message: 'Danke', ...extra,
    });

    it('caps the confirmation text', () => {
      expect(formDefinitionValidations(newDefinition({ confirmationMessage: 'x'.repeat(FORM_MESSAGE_MAX_LENGTH) })).hasErrors('confirmationMessage')).toBe(false);
      expect(formDefinitionValidations(newDefinition({ confirmationMessage: 'x'.repeat(FORM_MESSAGE_MAX_LENGTH + 1) })).hasErrors('confirmationMessage')).toBe(true);
    });

    it('accepts a complete variant', () => {
      expect(formDefinitionValidations(newDefinition({ fields: [color], confirmationVariants: [variant()] })).isValid()).toBe(true);
    });

    it('requires at least one condition in a variant', () => {
      const none = variant({ when: { match: 'all', conditions: [] } });
      expect(formDefinitionValidations(newDefinition({ fields: [color], confirmationVariants: [none] })).hasErrors('confirmationVariants.0.when.conditions')).toBe(true);
    });

    it('validates the condition rows of a variant', () => {
      const noValue = variant({ when: { match: 'all', conditions: [{ fieldId: 'c', op: 'equals' }] } });
      expect(formDefinitionValidations(newDefinition({ fields: [color], confirmationVariants: [noValue] })).hasErrors('confirmationVariants.0.when.conditions.0.value')).toBe(true);
    });

    it('flags a variant whose controlling field was deleted', () => {
      const gone = variant({ when: { match: 'all', conditions: [{ fieldId: 'deleted', op: 'equals', value: 'a' }] } });
      const result = formDefinitionValidations(newDefinition({ fields: [color], confirmationVariants: [gone] }));
      expect(result.getErrors('confirmationVariants.0.when.conditions.0.fieldId')).toContain('@forms/feature.derived.unknown_field');
    });

    it('flags a variant whose controlling field no longer offers the operator', () => {
      const retyped = { ...color, type: 'text', options: undefined } as unknown as Field;   // a text field offers no `in`
      const v = variant({ when: { match: 'all', conditions: [{ fieldId: 'c', op: 'in', value: ['a'] }] } });
      const result = formDefinitionValidations(newDefinition({ fields: [retyped], confirmationVariants: [v] }));
      expect(result.getErrors('confirmationVariants.0.when.conditions.0.op')).toContain('@forms/feature.derived.op_not_offered');
    });

    it('requires a message and caps it', () => {
      expect(formDefinitionValidations(newDefinition({ fields: [color], confirmationVariants: [variant({ message: ' ' })] })).hasErrors('confirmationVariants.0.message')).toBe(true);
      const long = variant({ message: 'x'.repeat(FORM_MESSAGE_MAX_LENGTH + 1) });
      expect(formDefinitionValidations(newDefinition({ fields: [color], confirmationVariants: [long] })).hasErrors('confirmationVariants.0.message')).toBe(true);
    });

    it('needs an e-mail field for the filler confirmation', () => {
      const MSG = '@forms/feature.after.mail_needs_email';
      expect(formDefinitionValidations(newDefinition({ fields: [color], sendFillerConfirmation: true })).getErrors('sendFillerConfirmation')).toContain(MSG);
      expect(formDefinitionValidations(newDefinition({ fields: [email], sendFillerConfirmation: true })).hasErrors('sendFillerConfirmation')).toBe(false);
      expect(formDefinitionValidations(newDefinition({ fields: [color], sendFillerConfirmation: false })).hasErrors('sendFillerConfirmation')).toBe(false);
    });
  });
  describe('course field (1.152)', () => {
    const ONCE = '@forms/feature.fields.course_field_once';
    const MAPPING = '@forms/feature.fields.course_field_mapping';
    const AUDIENCE = '@forms/feature.fields.course_audience_from_missing';
    const course = (id: string, key: string, audienceFrom = 'applicationAs') =>
      ({ id, key, type: 'course', label: 'Kurs', required: false, width: 'full', order: 0, audienceFrom }) as Field;
    const derived = [{ key: 'applicationAs', cases: [], otherwise: 'adult' }];
    const scs = (overrides: Partial<FormDefinitionModel> = {}) => newDefinition({
      target: { kind: 'collection', mappingKey: 'applications.default', modelType: 'ApplicationModel', collectionName: 'applications' },
      derivedValues: derived, fields: [course('c1', 'courseKey')], ...overrides,
    });

    it('accepts the SCS-shaped definition', () => {
      expect(formDefinitionValidations(scs()).isValid()).toBe(true);
    });

    it('rejects two course fields', () => {
      const result = formDefinitionValidations(scs({ fields: [course('c1', 'courseKey'), course('c2', 'courseTwo')] }));
      expect(result.getErrors('fields')).toContain(ONCE);
    });

    it('rejects a course field on applications.course', () => {
      const fd = scs({ target: { kind: 'collection', mappingKey: 'applications.course', modelType: 'ApplicationModel', collectionName: 'applications' } });
      expect(formDefinitionValidations(fd).getErrors('fields')).toContain(MAPPING);
    });

    it('rejects a course field on a mail or url target', () => {
      expect(formDefinitionValidations(scs({ target: { kind: 'mail' } })).getErrors('fields')).toContain(MAPPING);
      expect(formDefinitionValidations(scs({ target: { kind: 'url', url: 'https://example.com' } })).getErrors('fields')).toContain(MAPPING);
    });

    it('accepts applications.junior', () => {
      const fd = scs({ target: { kind: 'collection', mappingKey: 'applications.junior', modelType: 'ApplicationModel', collectionName: 'applications' } });
      expect(formDefinitionValidations(fd).getErrors('fields')).not.toContain(MAPPING);
    });

    it('rejects an audienceFrom that names no derived value', () => {
      expect(formDefinitionValidations(scs({ fields: [course('c1', 'courseKey', 'nope')] })).getErrors('fields')).toContain(AUDIENCE);
      expect(formDefinitionValidations(scs({ derivedValues: [] })).getErrors('fields')).toContain(AUDIENCE);
      expect(formDefinitionValidations(scs({ derivedValues: undefined })).getErrors('fields')).toContain(AUDIENCE);
    });

    it('does not complain on a form without a course field', () => {
      const errors = formDefinitionValidations(newDefinition()).getErrors('fields');
      expect(errors).not.toContain(ONCE);
      expect(errors).not.toContain(MAPPING);
      expect(errors).not.toContain(AUDIENCE);
    });
  });
});
