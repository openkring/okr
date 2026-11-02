import { Field, FieldType } from '@okr/shared-models';

/** A field key becomes a property name of the submitted document: camelCase — a lower-case letter, then letters and digits (e.g. firstName). */
export const FIELD_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

/** Element types that only display content — they hold no value and are never submitted. */
export const DISPLAY_FIELD_TYPES: readonly FieldType[] = ['label', 'paragraph', 'divider'];

/** True for display-only elements (label, paragraph, divider). */
export function isDisplayField(type: FieldType): boolean {
  return DISPLAY_FIELD_TYPES.includes(type);
}

/** True for elements that collect a value (everything except display-only elements). */
export function isInputField(field: { type: FieldType }): boolean {
  return !isDisplayField(field.type);
}

/** The distinct category-list names the 'category' fields of a form refer to. */
export function categoryNamesOf(fields: readonly Field[]): string[] {
  const names = fields.flatMap(f => (f.type === 'category' && f.categoryName ? [f.categoryName] : []));
  return [...new Set(names)];
}
