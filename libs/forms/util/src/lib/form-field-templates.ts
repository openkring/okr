import { Field, FieldOption, FieldType, PropertyType } from '@okr/shared-models';

import type { FormI18n } from './forms-i18n';

/**
 * Compact description of a prefill field. The `key` MUST match the target
 * model's property name so submissions map back onto the collection document.
 */
interface FieldTemplate {
  key: string;
  type: FieldType;
  label: string;
  required?: boolean;
  options?: FieldOption[];
  /** `implicit` only: the type of the stored value */
  valueType?: PropertyType;
  asProperty?: boolean;
}

/**
 * Curated form-field templates per collection mapping (keyed by `mappingKey`).
 * These are the fields prefilled into the form builder when a new form targets
 * the given collection. Only fields meaningful as public form inputs are listed;
 * internal/workflow/bookkeeping properties are intentionally omitted.
 */
const FORM_FIELD_TEMPLATES: Record<string, FieldTemplate[]> = {
  'applications.default': [
    { key: 'firstName',     type: 'text',  label: 'Vorname',       required: true },
    { key: 'lastName',      type: 'text',  label: 'Nachname',      required: true },
    { key: 'gender',        type: 'radio', label: 'Geschlecht',    required: true,
      options: [{ label: 'Männlich', value: 'male' }, { label: 'Weiblich', value: 'female' }] },
    { key: 'dateOfBirth',   type: 'date',  label: 'Geburtsdatum',  required: true },
    // an AHV number is a `ssn` field: checked, stored as 13 digits, never copied out of the application
    { key: 'ssnId',         type: 'ssn',   label: 'AHV-Nummer' },
    { key: 'email',         type: 'email', label: 'E-Mail',        required: true },
    { key: 'phone',         type: 'phone', label: 'Telefon' },
    { key: 'streetName',    type: 'text',  label: 'Strasse' },
    { key: 'streetNumber',  type: 'text',  label: 'Nr.' },
    { key: 'zipCode',       type: 'text',  label: 'PLZ' },
    { key: 'city',          type: 'text',  label: 'Ort' },
    { key: 'countryCode',   type: 'text',  label: 'Land' },
    { key: 'applicationAs', type: 'radio', label: 'Bewerbung als', required: true,
      options: [{ label: 'Jugend', value: 'youth' }, { label: 'Erwachsen', value: 'adult' }, { label: 'Übertritt', value: 'transfer' }] },
  ],
  'applications.junior': [
    { key: 'firstName',     type: 'text',  label: 'Vorname',       required: true },
    { key: 'lastName',      type: 'text',  label: 'Nachname',      required: true },
    { key: 'gender',        type: 'radio', label: 'Geschlecht',    required: true,
      options: [{ label: 'Männlich', value: 'male' }, { label: 'Weiblich', value: 'female' }] },
    { key: 'dateOfBirth',   type: 'date',  label: 'Geburtsdatum',  required: true },
    { key: 'email',         type: 'email', label: 'E-Mail',        required: true },
    { key: 'phone',         type: 'phone', label: 'Telefon' },
    { key: 'streetName',    type: 'text',  label: 'Strasse' },
    { key: 'streetNumber',  type: 'text',  label: 'Nr.' },
    { key: 'zipCode',       type: 'text',  label: 'PLZ' },
    { key: 'city',          type: 'text',  label: 'Ort' },
    { key: 'countryCode',   type: 'text',  label: 'Land' },
    { key: 'ssnId',         type: 'ssn',   label: 'AHV-Nummer' },
  ],
  'applications.course': [
    // the course (CourseModel.okey): never shown, set by the embedding section's `implicitValues` (D-W4).
    // First (order 0), so a rule of any later field can depend on the course.
    { key: 'courseId',      type: 'implicit', label: 'Kurs', valueType: 'text', asProperty: true },
    { key: 'firstName',     type: 'text',  label: 'Vorname',       required: true },
    { key: 'lastName',      type: 'text',  label: 'Nachname',      required: true },
    { key: 'gender',        type: 'radio', label: 'Geschlecht',    required: true,
      options: [{ label: 'Männlich', value: 'male' }, { label: 'Weiblich', value: 'female' }] },
    { key: 'dateOfBirth',   type: 'date',  label: 'Geburtsdatum',  required: true },
    { key: 'email',         type: 'email', label: 'E-Mail',        required: true },
    { key: 'phone',         type: 'phone', label: 'Telefon' },
    { key: 'streetName',    type: 'text',  label: 'Strasse' },
    { key: 'streetNumber',  type: 'text',  label: 'Nr.' },
    { key: 'zipCode',       type: 'text',  label: 'PLZ' },
    { key: 'city',          type: 'text',  label: 'Ort' },
  ],
};

function buildField(template: FieldTemplate, order: number): Field {
  const base = {
    id: crypto.randomUUID(),
    key: template.key,
    label: template.label,
    required: template.required ?? false,
    width: 'full' as const,
    order,
  };
  switch (template.type) {
    case 'dropdown':
    case 'radio':
      return { ...base, type: template.type, options: template.options ?? [] };
    case 'checkbox':
      return { ...base, type: template.type, options: template.options };
    case 'avatar':
      return { ...base, type: template.type, avatarType: 'person' };
    case 'category':
      return { ...base, type: template.type, categoryName: '' };
    case 'implicit':
      return { ...base, type: 'implicit', valueType: template.valueType ?? 'text', asProperty: template.asProperty };
    default:
      return { ...base, type: template.type } as Field;
  }
}

/**
 * Returns fully-formed `Field[]` to prefill the form builder for the given
 * collection mapping. Returns `[]` for an unknown mapping key.
 */
export function getPrefillFields(mappingKey: string): Field[] {
  const templates = FORM_FIELD_TEMPLATES[mappingKey] ?? [];
  return templates.map((template, order) => buildField(template, order));
}

/** A field of the builder library's «Eigene Angaben» group: it starts with `asProperty` on (spec §4.4). */
export interface PropertyFieldTemplate {
  /** a field type that can be a property: text → text, checkbox (single) → boolean, number → number */
  type: Extract<FieldType, 'text' | 'checkbox' | 'number'>;
  icon: string;
  /** the FormI18n key of the template's name, which also becomes the new field's label */
  labelKey: Extract<keyof FormI18n, `property_template_${string}`>;
}

/**
 * The «Eigene Angaben» group of the builder's field library: a text, a yes/no and a number
 * question that store their answer in the target's typed `properties` list. Offered only when
 * the form's mapping has a `propertiesField`.
 */
export const PROPERTY_FIELD_TEMPLATES: PropertyFieldTemplate[] = [
  { type: 'text',     icon: 'text',            labelKey: 'property_template_text' },
  { type: 'checkbox', icon: 'checkbox',        labelKey: 'property_template_boolean' },
  { type: 'number',   icon: 'calendar-number', labelKey: 'property_template_number' },
];
