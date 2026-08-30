/**
 * What a CMS button's config string opens
 * (spec 2026-08-29-generic-workflow-triggers §6a).
 *
 * The mapping already existed as DATA: `ButtonActionConfig.url` is the string an admin typed,
 * and `button-widget` emits it on click. Only the dispatch was hard-coded — a single
 * `if (modalType === 'bhres')` in shared CMS code, carrying one tenant's boathouse
 * reservation. This replaces that `if`.
 *
 * Two kinds of entry, and only two:
 *  - `form:<formKey>` — a form-builder definition in a `FormModal`. This is the important
 *    half: any tenant can attach any builder form to any button with NO code at all.
 *  - a whitelisted registry key — a domain modal with typed logic, loaded with `await import()`
 *    at the call site so it stays out of the CMS eager bundle.
 *
 * The whitelist is closed on purpose. A config string an admin types must never be able to
 * resolve to an arbitrary component, so an unknown value returns `undefined` and the button
 * does nothing rather than guessing.
 */
export type ButtonModalTarget =
  | { kind: 'form'; formKey: string }
  | { kind: 'component'; registryKey: string };

const FORM_PREFIX = 'form:';

/** Domain modals a button may open. Kept short; `form:` covers everything data-shaped. */
export const DOMAIN_MODAL_KEYS = ['reservation-apply'] as const;

/**
 * Config values that predate the registry and are still stored on live section documents.
 * `bhres` is the string an scs admin typed for the boathouse reservation. It retires with the
 * builder-form conversion of that modal (§6b, decision O1) — until then the button must keep
 * working, and changing live data is not this function's job.
 */
const LEGACY_ALIASES: Record<string, string> = { bhres: 'reservation-apply' };

export function resolveButtonModal(config: string): ButtonModalTarget | undefined {
  const value = (config ?? '').trim();
  if (!value) return undefined;

  if (value.startsWith(FORM_PREFIX)) {
    const formKey = value.slice(FORM_PREFIX.length).trim();
    return formKey ? { kind: 'form', formKey } : undefined;
  }

  const registryKey = LEGACY_ALIASES[value] ?? value;
  return (DOMAIN_MODAL_KEYS as readonly string[]).includes(registryKey)
    ? { kind: 'component', registryKey }
    : undefined;
}
