import { Field, FieldOption, FieldType } from '@bk2/shared-models';

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
    { key: 'ssnId',         type: 'text',  label: 'AHV Nr.' },
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
