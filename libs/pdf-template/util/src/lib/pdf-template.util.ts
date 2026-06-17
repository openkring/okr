import { TemplateModel, TemplateVersionModel } from '@bk2/shared-models';
import { addIndexElement } from '@bk2/shared-util-core';

export function newTemplate(tenantId: string): TemplateModel {
  return new TemplateModel(tenantId);
}

export function newTemplateVersion(version = 1): TemplateVersionModel {
  const v = new TemplateVersionModel();
  v.version = version;
  v.bkey = String(version);
  return v;
}

/**
 * Pretty-print a JSON string with 2-space indentation so it can be shown
 * structured in an editor. Returns the input unchanged if it is not valid JSON.
 */
export function prettifyJson(json: string): string {
  if (!json) return json;
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

export function getTemplateIndex(template: TemplateModel): string {
  let index = '';
  index = addIndexElement(index, 'n', template.name);
  index = addIndexElement(index, 'c', template.category);
  index = addIndexElement(index, 'l', template.language);
  return index;
}
