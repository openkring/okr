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
