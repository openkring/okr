import type { Firestore } from 'firebase-admin/firestore';
import type { BaseType } from '@okr/shared-models';

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
