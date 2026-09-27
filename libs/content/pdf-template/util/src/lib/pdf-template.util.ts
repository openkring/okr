import { DEFAULT_KEY } from '@okr/shared-constants';
import { TemplateModel, TemplateVersionModel } from '@okr/shared-models';
import { addIndexElement } from '@okr/shared-util-core';

export function newTemplate(tenantId: string): TemplateModel {
  return new TemplateModel(tenantId);
}

export function newTemplateVersion(version = 1): TemplateVersionModel {
  const v = new TemplateVersionModel();
  v.version = version;
  v.okey = String(version);
  return v;
}

/**
 * Build the copy of a template: same settings, but a fresh document (no okey, no
 * audit fields), a distinguishable name and no version history yet — the content
 * of the source version is copied separately as the new template's first draft.
 */
export function copyTemplate(source: TemplateModel, nameSuffix: string): TemplateModel {
  const copy: TemplateModel = {
    ...source,
    okey: DEFAULT_KEY,
    name: `${source.name} ${nameSuffix}`.trim(),
    isArchived: false,
    currentVersion: 0,
    draftVersion: undefined,
    status: 'draft',
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
  };
  copy.index = getTemplateIndex(copy);
  return copy;
}

/**
 * Copy the content of a template version into a new (draft) version. Asset refs are
 * carried over as-is: the copy references the same uploaded files as the original.
 */
export function copyTemplateVersion(source: TemplateVersionModel, version = 1): TemplateVersionModel {
  const copy = newTemplateVersion(version);
  copy.html     = source.html ?? '';
  copy.css      = source.css ?? '';
  copy.partials = { ...(source.partials ?? {}) };
  copy.assets   = [...(source.assets ?? [])];
  return copy;
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
