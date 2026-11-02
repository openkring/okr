import type { ConfirmationVariant, Field, FormSectionConfig } from '@okr/shared-models';
import { isSsnField } from './ahv.util';
import { evaluateVisibilityRule } from './form-visibility.util';
import { coerceToPropertyType, propertyTypeOf, ssnPresenceLabel } from './form-values.util';
import { fill } from './text.util';

/**
 * When a form accepts answers, how many places are left, and the thank-you text (1.125 phase B,
 * spec §10 and §11). Pure: no Angular, no clock (the caller passes `today`, the Europe/Zurich day
 * as a StoreDate), no I/O. Shared by `submitForm` / `getFormDefinition` (authoritative) and the
 * public form and the builder (display only).
 *
 * Legacy definitions and sections lack every phase B field (Firestore reads skip model
 * defaults): each one is coalesced here, so no caller has to.
 */

export interface AcceptanceSettings {
  isOpen: boolean;
  /** StoreDate (Europe/Zurich day), '' = no date. */
  closesAt: string;
  /** 0 = unlimited. */
  maxResponses: number;
  showRemaining: boolean;
  /** '' = the default text. */
  closedMessage: string;
  /** The `formStats` document id that counts the places: the form's, or the section's own. */
  statsId: string;
}

export interface FormAvailability {
  isOpen: boolean;
  reason: '' | 'closed' | 'date' | 'full';
  /** Places left; null = unlimited. */
  remaining: number | null;
  showRemaining: boolean;
  closedMessage: string;
  /** A limit exists (places or a closing date) - the builder shows the count next to it. */
  hasLimit: boolean;
}

type AcceptanceSource = Pick<Partial<FormSectionConfig>, 'isOpen' | 'closesAt' | 'maxResponses' | 'showRemaining' | 'closedMessage'>;

/**
 * The rules that apply to one form on one page: the form's, with the section's overrides on top
 * (spec §11, «Per section»). Closed wins: the form OR the section switched off closes it. A section
 * `maxResponses` > 0 gets its own counter `<formId>__<sectionId>`; 0 / absent inherits the form's.
 * The section is ignored when `sectionId` is unknown - the caller must have verified that the
 * section belongs to this form and tenant.
 */
export function effectiveAcceptance(
  def: { okey: string } & AcceptanceSource,
  section: AcceptanceSource | undefined,
  sectionId: string | undefined,
): AcceptanceSettings {
  const sec = section !== undefined && section !== null && typeof sectionId === 'string' && sectionId !== '' ? section : undefined;
  const sectionLimit = typeof sec?.maxResponses === 'number' && sec.maxResponses > 0 ? sec.maxResponses : 0;
  const formLimit = typeof def.maxResponses === 'number' && def.maxResponses > 0 ? def.maxResponses : 0;
  const sectionCloses = typeof sec?.closesAt === 'string' ? sec.closesAt : '';
  const sectionMessage = typeof sec?.closedMessage === 'string' ? sec.closedMessage : '';
  return {
    isOpen: def.isOpen !== false && sec?.isOpen !== false,
    closesAt: sectionCloses !== '' ? sectionCloses : (def.closesAt ?? ''),
    maxResponses: sectionLimit > 0 ? sectionLimit : formLimit,
    showRemaining: typeof sec?.showRemaining === 'boolean' ? sec.showRemaining : def.showRemaining === true,
    closedMessage: sectionMessage !== '' ? sectionMessage : (def.closedMessage ?? ''),
    statsId: sectionLimit > 0 ? `${def.okey}__${sectionId}` : def.okey,
  };
}

/**
 * Open or closed for the given response count and day. `closesAt` closes at the END of that day:
 * open on it, closed from the next. Order of reasons: switched off, date passed, full.
 */
export function computeFormAvailability(settings: AcceptanceSettings, responseCount: number, today: string): FormAvailability {
  const hasPlaces = settings.maxResponses > 0;
  const count = Number.isFinite(responseCount) && responseCount > 0 ? responseCount : 0;
  const remaining = hasPlaces ? Math.max(0, settings.maxResponses - count) : null;
  let reason: FormAvailability['reason'] = '';
  if (!settings.isOpen) reason = 'closed';
  else if (settings.closesAt !== '' && today > settings.closesAt) reason = 'date';
  else if (hasPlaces && remaining === 0) reason = 'full';
  return {
    isOpen: reason === '',
    reason,
    remaining,
    showRemaining: settings.showRemaining,
    closedMessage: settings.closedMessage,
    hasLimit: hasPlaces || settings.closesAt !== '',
  };
}

/**
 * One answer as text: «ja»/«nein» for booleans, a comma list for arrays, «–» for nothing. An AHV
 * answer (`isSsnField`) is only ever «angegeben» / «–», never the number (privacy 1.19).
 */
export function formatAnswer(field: Field | undefined, value: unknown): string {
  if (field !== undefined && isSsnField(field)) return ssnPresenceLabel(value);
  if (value === undefined || value === null || value === '') return '–';
  if (field !== undefined && propertyTypeOf(field) === 'boolean') {
    const b = coerceToPropertyType(value, 'boolean');
    if (b !== undefined) return b ? 'ja' : 'nein';
  }
  if (typeof value === 'boolean') return value ? 'ja' : 'nein';
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  return String(value);
}

const DISPLAY_TYPES: ReadonlySet<string> = new Set(['label', 'paragraph', 'divider']);
const LEFTOVER_PLACEHOLDER = /\{[a-zA-Z][a-zA-Z0-9]*\}/g;

/**
 * The author's thank-you text for one submission (spec §10): the first variant whose rule holds,
 * else `message`; `{key}` takes the filler's own answer. '' means «use the default text».
 * A placeholder of a hidden field, an unknown key, a display element or an AHV field becomes ''
 * (the number is never echoed); an `implicit` field shows its value (the course id).
 * A matching variant with a blank text is skipped.
 */
export function buildConfirmationMessage(
  fields: Field[],
  message: string | undefined,
  variants: ConfirmationVariant[] | undefined,
  values: Record<string, unknown>,
  visible: Set<string>,
  today: string,
): string {
  const all = Array.isArray(fields) ? fields : [];
  const answers = values ?? {};
  let template = typeof message === 'string' ? message : '';
  for (const variant of Array.isArray(variants) ? variants : []) {
    if (typeof variant?.message !== 'string' || variant.message.trim() === '') continue;
    if (evaluateVisibilityRule(variant.when, all, answers, visible, today)) {
      template = variant.message;
      break;
    }
  }
  if (template.trim() === '') return '';

  const params: Record<string, string> = {};
  for (const field of all) {
    if (typeof field.key !== 'string' || field.key === '' || DISPLAY_TYPES.has(field.type)) continue;
    params[field.key] = isSsnField(field) || !visible.has(field.id) ? '' : formatAnswer(field, answers[field.key]);
  }
  return fill(template, params).replace(LEFTOVER_PLACEHOLDER, '');
}
