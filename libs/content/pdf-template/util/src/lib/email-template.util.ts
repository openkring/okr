import { forkKeyFor } from '@okr/shared-util-core';
import {
  EmailLayoutKey, EmailTextPasswordResetKey, TemplateKind, TemplateModel, TemplateVersionModel,
} from '@okr/shared-models';

/** The kind of a template. Legacy docs have no `kind` and are PDF templates. */
export function templateKindOf(t: Pick<TemplateModel, 'kind'>): TemplateKind {
  return t.kind ?? 'pdf';
}

/** True for the email kinds (layout and text), false for PDF templates. */
export function isEmailTemplate(t: Pick<TemplateModel, 'kind'>): boolean {
  return templateKindOf(t) !== 'pdf';
}

/** What stops an email template from being published. */
export type EmailPublishProblem = 'no_content' | 'no_link' | 'no_subject';

const CONTENT_SLOT = /\{\{\{\s*content\s*\}\}\}/;
const URL_SLOT = /\{\{\{?\s*url\s*\}\}\}?/;

function isKeyOrTenantCopy(okey: string, baseKey: string): boolean {
  return okey === baseKey || okey.startsWith(baseKey + '_');
}

/**
 * Why an email template version cannot be published, or undefined if it can.
 * A layout needs the content slot in both halves. The password-reset text needs the
 * link in both halves and a subject. PDF templates and other texts are not checked.
 */
export function emailPublishProblem(
  template: Pick<TemplateModel, 'okey' | 'kind'>,
  version: Pick<TemplateVersionModel, 'html' | 'text' | 'subject'>
): EmailPublishProblem | undefined {
  const html = version.html ?? '';
  const text = version.text ?? '';
  if (templateKindOf(template) === 'emailLayout') {
    return CONTENT_SLOT.test(html) && CONTENT_SLOT.test(text) ? undefined : 'no_content';
  }
  if (templateKindOf(template) === 'emailText' && isKeyOrTenantCopy(template.okey, EmailTextPasswordResetKey)) {
    if (!URL_SLOT.test(html) || !URL_SLOT.test(text)) return 'no_link';
    if (!(version.subject ?? '').trim()) return 'no_subject';
  }
  return undefined;
}

/** The standard layout is never deleted: without it a composer mail has no frame. */
export function canDeleteEmailTemplate(okey: string): boolean {
  return !isKeyOrTenantCopy(okey, EmailLayoutKey);
}

/**
 * What copying a shared email template does, given the tenant's document under the fixed id:
 * none yet creates it, a live one is opened, an archived one (a tenant's delete only archives)
 * is reset to the shared content. A live doc with neither a published nor a draft version is
 * what a copy interrupted midway leaves behind, so it is reset too instead of staying empty.
 */
export function emailCopyPlan(
  existing: Pick<TemplateModel, 'isArchived' | 'currentVersion' | 'draftVersion'> | undefined
): 'create' | 'open' | 'reset' {
  if (!existing) return 'create';
  if (existing.isArchived) return 'reset';
  return !existing.currentVersion && !existing.draftVersion ? 'reset' : 'open';
}

/**
 * The document id of a tenant's copy of an email template. A key that already names this
 * tenant's copy is returned unchanged, so copying a copy never gives `<okey>_scs_scs`.
 */
export function emailCopyKey(okey: string, tenantId: string): string {
  const suffix = '_' + tenantId;
  return okey.endsWith(suffix) ? okey : forkKeyFor(okey, tenantId);
}
