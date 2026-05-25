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

export function getTemplateIndex(template: TemplateModel): string {
  let index = '';
  index = addIndexElement(index, 'n', template.name);
  index = addIndexElement(index, 'c', template.category);
  index = addIndexElement(index, 'l', template.language);
  return index;
}
