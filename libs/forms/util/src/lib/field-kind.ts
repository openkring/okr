import { FieldType } from '@bk2/shared-models';

/** Element types that only display content — they hold no value and are never submitted. */
export const DISPLAY_FIELD_TYPES: readonly FieldType[] = ['label', 'divider'];

/** True for display-only elements (label, divider). */
export function isDisplayField(type: FieldType): boolean {
  return DISPLAY_FIELD_TYPES.includes(type);
}

/** True for elements that collect a value (everything except display-only elements). */
export function isInputField(field: { type: FieldType }): boolean {
  return !isDisplayField(field.type);
}
