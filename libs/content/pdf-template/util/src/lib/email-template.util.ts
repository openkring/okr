import { TemplateKind, TemplateModel } from '@okr/shared-models';

/** The kind of a template. Legacy docs have no `kind` and are PDF templates. */
export function templateKindOf(t: Pick<TemplateModel, 'kind'>): TemplateKind {
  return t.kind ?? 'pdf';
}

/** True for the email kinds (layout and text), false for PDF templates. */
export function isEmailTemplate(t: Pick<TemplateModel, 'kind'>): boolean {
  return templateKindOf(t) !== 'pdf';
}
