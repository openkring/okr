import { stripHtml } from '@okr/shared-util-core';
import type { BlockAlign, CalloutTone, SpaceSize } from '@okr/shared-models';

/** What the validations and the views of article blocks share (spec 1.173). Internal: not exported from the lib. */

export const BLOCK_ALIGNS: readonly BlockAlign[] = ['left', 'center', 'right'];
export const CALLOUT_TONES: readonly CalloutTone[] = ['primary', 'secondary', 'tertiary', 'neutral'];
export const SPACE_SIZES: readonly SpaceSize[] = ['small', 'medium', 'large'];
/** What a column may hold. */
export const COLUMN_BLOCK_TYPES: readonly string[] = ['text', 'image', 'button'];

/** A stored value that may hold anything. */
export type Loose = Record<string, unknown>;

export function isObject(value: unknown): value is Loose {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when a stored html string shows text to a reader (tags and blanks do not count). */
export function hasVisibleText(html: unknown): boolean {
  return typeof html === 'string' && stripHtml(html).trim() !== '';
}
