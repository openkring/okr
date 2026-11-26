import { ButtonAction } from '@okr/shared-models';

/**
 * A width or height the author typed for a button, as a CSS length. The stored values are digits ("60"), and a
 * unit-less custom property makes `width: var(--button-width)` invalid — the browser then ignores the rule and
 * the button keeps Ionic's size. Plain numbers get `px`; a value with a unit ("4rem", "50%") is kept; anything
 * empty falls back.
 */
export function toCssLength(value: string | number | undefined | null, fallback: string | number): string {
  const v = String(value ?? '').trim() || String(fallback ?? '').trim();
  return /^\d+(\.\d+)?$/.test(v) ? `${v}px` : v;
}

/**
 * Actions an «Aktions-Button» no longer offers: a button that only leads to a page or a link is the «Link-Button» block of an article.
 * Stored ones keep working for readers (the action type is stored as a number and is never renumbered).
 */
export const RETIRED_BUTTON_ACTIONS: readonly number[] = [ButtonAction.Navigate, ButtonAction.Browse];

/** The actions to choose from: without the retired ones, except the one a button has now, so that it still shows. */
export function buttonActionChoices<T extends { id: number }>(actions: readonly T[], current: number | undefined): T[] {
  return actions.filter((action) => !RETIRED_BUTTON_ACTIONS.includes(action.id) || action.id === current);
}
