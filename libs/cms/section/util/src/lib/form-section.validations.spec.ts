import { describe, expect, it } from 'vitest';

import { FORM_SECTION_SHAPE, FormSection, ImplicitField } from '@okr/shared-models';

import { formSectionValidations } from './form-section.validations';
import { getSectionValidationSuite, validateSection } from './section-validation-registry';

const section = (properties: Partial<FormSection['properties']> = {}): FormSection => ({
  ...FORM_SECTION_SHAPE,
  okey: 'k', name: 'n', title: 't', tenants: ['t1'],
  properties: { ...FORM_SECTION_SHAPE.properties, formKey: 'course', ...properties },
} as FormSection);

const implicit = (extra: Partial<ImplicitField> = {}): ImplicitField =>
  ({ id: 'i1', key: 'courseId', type: 'implicit', label: 'Kurs', valueType: 'text', required: false, width: 'full', order: 0, ...extra } as ImplicitField);

const messagesFor = (model: FormSection, field: string, fields: ImplicitField[] = []): string[] =>
  formSectionValidations(model, fields).getErrors()[field] ?? [];

describe('formSectionValidations', () => {
  it('accepts a valid configuration', () => {
    const model = section({
      emailAddresses: ['a@b.ch', 'c@d.org'], implicitValues: { courseId: 'c1', size: 42 }, maxResponses: 8,
      closesAt: '20261130', showRemaining: true, closedMessage: 'Vorbei.', isOpen: true,
    });
    const fields = [implicit(), implicit({ key: 'size', valueType: 'number' })];
    expect(formSectionValidations(model, fields).hasErrors()).toBe(false);
  });

  it('accepts a legacy section without any phase B field', () => {
    const model = section({ implicitValues: undefined, emailAddresses: undefined });
    expect(formSectionValidations(model).hasErrors()).toBe(false);
  });

  it('requires a form', () => {
    expect(messagesFor(section({ formKey: '' }), 'formKey').length).toBeGreaterThan(0);
  });

  it('flags an invalid notification e-mail', () => {
    expect(messagesFor(section({ emailAddresses: ['a@b.ch', 'not-an-address'] }), 'emailAddresses'))
      .toContain('@cms/section/feature.validation.formEmailInvalid');
    expect(messagesFor(section({ emailAddresses: [] }), 'emailAddresses')).toEqual([]);
  });

  it('caps the notification list at the length the editor offers', () => {
    const many = Array.from({ length: 80 }, (_, i) => `person${i}@example.org`);
    expect(messagesFor(section({ emailAddresses: many }), 'emailAddresses')).toContain('tooLong');
    expect(messagesFor(section({ emailAddresses: many.slice(0, 10) }), 'emailAddresses')).toEqual([]);
  });

  it('flags a fixed value that does not coerce to the field type', () => {
    const fields = [implicit({ key: 'size', valueType: 'number' })];
    expect(messagesFor(section({ implicitValues: { size: 'abc' } }), 'implicitValues.size', fields))
      .toContain('@cms/section/feature.validation.formImplicitInvalid');
    expect(messagesFor(section({ implicitValues: { size: '12' } }), 'implicitValues.size', fields)).toEqual([]);
    expect(messagesFor(section({ implicitValues: { size: 12 } }), 'implicitValues.size', fields)).toEqual([]);
  });

  it('flags a maxResponses outside the whole numbers 0..10000', () => {
    for (const bad of [-1, 1.5, 10001, Number.NaN]) {
      expect(messagesFor(section({ maxResponses: bad }), 'maxResponses')).toContain('@forms/feature.accept.max_invalid');
    }
    for (const ok of [0, 1, 10000]) expect(messagesFor(section({ maxResponses: ok }), 'maxResponses')).toEqual([]);
  });

  it('flags a closing date that is no real day, accepts none', () => {
    expect(messagesFor(section({ closesAt: '20261331' }), 'closesAt')).toContain('@forms/feature.accept.closes_invalid');
    expect(messagesFor(section({ closesAt: '' }), 'closesAt')).toEqual([]);
    expect(messagesFor(section({ closesAt: undefined }), 'closesAt')).toEqual([]);
    expect(messagesFor(section({ closesAt: '20261130' }), 'closesAt')).toEqual([]);
  });

  describe('a section-only implicit field needs a value (otherwise a verified section leaves it empty)', () => {
    it('is required when the field has no default and no link', () => {
      expect(messagesFor(section({ implicitValues: {} }), 'implicitValues.courseId', [implicit()]))
        .toContain('@cms/section/feature.validation.formImplicitRequired');
      expect(messagesFor(section({ implicitValues: undefined }), 'implicitValues.courseId', [implicit()]))
        .toContain('@cms/section/feature.validation.formImplicitRequired');
      expect(messagesFor(section({ implicitValues: { courseId: '' } }), 'implicitValues.courseId', [implicit()]))
        .toContain('@cms/section/feature.validation.formImplicitRequired');
    });

    it('is satisfied by a value, also false and 0', () => {
      expect(messagesFor(section({ implicitValues: { courseId: 'c1' } }), 'implicitValues.courseId', [implicit()])).toEqual([]);
      const flag = implicit({ key: 'member', valueType: 'boolean' });
      expect(messagesFor(section({ implicitValues: { member: false } }), 'implicitValues.member', [flag])).toEqual([]);
      const num = implicit({ key: 'size', valueType: 'number' });
      expect(messagesFor(section({ implicitValues: { size: 0 } }), 'implicitValues.size', [num])).toEqual([]);
    });

    it('is not required when a default or the link can supply the value', () => {
      expect(messagesFor(section({ implicitValues: {} }), 'implicitValues.courseId', [implicit({ defaultValue: 'c9' })])).toEqual([]);
      expect(messagesFor(section({ implicitValues: {} }), 'implicitValues.courseId', [implicit({ fromLink: true })])).toEqual([]);
    });

    it('does not require a value for a field the chosen form does not have (stale entry, unknown form)', () => {
      expect(formSectionValidations(section({ implicitValues: { gone: 'x' } }), []).hasErrors()).toBe(false);
    });

    it('reports the missing value of each such field under its own key', () => {
      const errors = formSectionValidations(section({ implicitValues: {} }), [implicit(), implicit({ id: 'i2', key: 'level' })]).getErrors();
      expect(Object.keys(errors).filter((k) => k.startsWith('implicitValues.')).sort()).toEqual(['implicitValues.courseId', 'implicitValues.level']);
    });
  });

  describe('AHV (R1)', () => {
    it('rejects a fixed value for an AHV key, also when the form is unknown', () => {
      expect(messagesFor(section({ implicitValues: { ssnId: '7561234567897' } }), 'implicitValues.ssnId'))
        .toContain('@cms/section/feature.validation.formImplicitSsn');
      const ssn = implicit({ key: 'ahv', type: 'ssn' } as unknown as Partial<ImplicitField>);
      expect(messagesFor(section({ implicitValues: { ahv: '1' } }), 'implicitValues.ahv', [ssn]))
        .toContain('@cms/section/feature.validation.formImplicitSsn');
    });

    it('never requires a value for an AHV implicit field (no row can supply it)', () => {
      const ssn = implicit({ key: 'ssnId' });
      expect(formSectionValidations(section({ implicitValues: {} }), [ssn]).hasErrors()).toBe(false);
    });
  });
});

describe('registry', () => {
  it('registers the suite for the form type and hands it the chosen form\'s implicit fields', () => {
    expect(getSectionValidationSuite('form')).not.toBe(getSectionValidationSuite('chat'));
    const model = section({ implicitValues: {} });
    expect(validateSection(model).hasErrors('implicitValues.courseId')).toBe(false);
    expect(validateSection(model, { formImplicitFields: [implicit()] }).hasErrors('implicitValues.courseId')).toBe(true);
  });
});
