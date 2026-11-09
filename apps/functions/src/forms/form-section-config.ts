import type { Firestore } from 'firebase-admin/firestore';
import type { BaseType, Field } from '@okr/shared-models';
import { effectiveAcceptance, isSectionOnlyImplicit, requiresSection, type AcceptanceSettings } from '@okr/shared-util-core';

/**
 * The form section a submission names (`sectionConfigRef`) is a client claim (1.125 B, review focus 1).
 * Its `implicitValues`, its acceptance overrides, its task responsibility and its notification
 * addresses are used only when the document really is a form section of THIS form in THIS tenant —
 * a section of another form or tenant, or an unknown id, counts as no section: the form-wide rules,
 * the field defaults and no side effects apply.
 */

/** The `properties` of a form section, as `submitForm` / `getFormDefinition` read them (inlined
 *  `FormSectionConfig`; every field optional — legacy sections lack the phase B ones). */
export interface FormSectionProperties {
  formKey?: string;
  responsibilityKey?: string;
  emailAddresses?: string[];
  /** §8.1 — values of the form's implicit fields, by field key. */
  implicitValues?: Record<string, BaseType>;
  // §11 — per-section overrides of the form's acceptance rules
  isOpen?: boolean;
  closesAt?: string;
  maxResponses?: number;
  showRemaining?: boolean;
  closedMessage?: string;
  /** §10.5 — the page asks for App Check; `submitForm` trusts this, not the client's `meta.showCaptcha`. */
  showCaptcha?: boolean;
}

/**
 * Whether `submitForm` requires an App Check token (§10.5): the form's own setting, OR the verified
 * section's, OR the client's claim. Only the form's setting holds for a submission that names no page
 * (a bot can always leave the page out); a page and the client can only make the check stricter —
 * a bot sending `showCaptcha: false` skips neither.
 */
export function captchaRequired(
  formSetting: unknown,
  section: { props: FormSectionProperties } | undefined,
  clientClaim: unknown,
): boolean {
  return formSetting === true || section?.props.showCaptcha === true || clientClaim === true;
}

/** A Firestore document id: non-empty, no path separator, not `.`/`..`, not the reserved `__…__` form. */
const DOC_ID = /^(?!__.*__$)(?!\.\.?$)[^/]{1,1500}$/;

/** True when `id` can be passed to `collection().doc(id)` as a single document id (a client value never builds a path). */
export function isDocumentId(id: unknown): id is string {
  return typeof id === 'string' && DOC_ID.test(id);
}

/** Pure: the section's properties when `data` is a form section of `formKey` in `tenantId`, else undefined. */
export function verifySectionForForm(
  id: string,
  data: Record<string, unknown> | undefined,
  formKey: string,
  tenantId: string,
): FormSectionProperties | undefined {
  if (typeof id !== 'string' || id === '' || data === undefined || data === null) return undefined;
  if (data['type'] !== 'form') return undefined;
  const tenants = data['tenants'];
  if (!Array.isArray(tenants) || !tenants.includes(tenantId)) return undefined;
  const props = data['properties'];
  if (props === null || typeof props !== 'object' || Array.isArray(props)) return undefined;
  const p = props as FormSectionProperties;
  if (typeof p.formKey !== 'string' || p.formKey === '' || p.formKey !== formKey) return undefined;
  return p;
}

/** Reads `sections/{sectionId}` and verifies it. No id, or a value that is no document id, is not read. */
export async function readVerifiedSection(
  db: Firestore,
  sectionId: string | undefined,
  formKey: string,
  tenantId: string,
): Promise<{ id: string; props: FormSectionProperties } | undefined> {
  if (!isDocumentId(sectionId)) return undefined;
  const snap = await db.collection('sections').doc(sectionId).get();
  const props = verifySectionForForm(sectionId, snap.exists ? snap.data() : undefined, formKey, tenantId);
  return props === undefined ? undefined : { id: sectionId, props };
}

/** Re-exported: the predicate is shared with the section editor (`formSectionValidations`), so both sides agree. */
export { requiresSection } from '@okr/shared-util-core';

/**
 * The acceptance rules for one submission or render: the form's with the verified section's overrides
 * on top (`effectiveAcceptance`). A form that `requiresSection` but has no verified section is closed —
 * `submitForm` refuses it with `form-closed`, `getFormDefinition` reports it closed.
 */
export function acceptanceForSection(
  def: Parameters<typeof effectiveAcceptance>[0] & { fields?: Field[] },
  section: { id: string; props: FormSectionProperties } | undefined,
): AcceptanceSettings {
  const settings = effectiveAcceptance(def, section?.props, section?.id);
  return section === undefined && requiresSection(def.fields) ? { ...settings, isOpen: false } : settings;
}

/**
 * The keys of the section-only implicit fields (e.g. the course) that resolved to no value. A section saved
 * before the field existed passes the section check but carries no value for it; storing the registration
 * then would leave it without a course. Keys only, so the result can be logged.
 */
export function missingSectionOnlyValues(fields: Field[] | undefined, implicit: Record<string, unknown>): string[] {
  return (Array.isArray(fields) ? fields : [])
    .filter(isSectionOnlyImplicit)
    .map((f) => f.key)
    .filter((key) => implicit[key] === undefined);
}

/**
 * Whether a section names at least one recipient for the board mail. A mail-only form (`target.kind === 'mail'`)
 * stores nothing, so a section without one would swallow every message: `submitForm` refuses it.
 */
export function hasMailRecipients(emailAddresses: unknown): boolean {
  return Array.isArray(emailAddresses) && emailAddresses.some((a) => typeof a === 'string' && a.trim() !== '');
}
