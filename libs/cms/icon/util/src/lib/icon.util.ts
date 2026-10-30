import { DEFAULT_DATE } from '@okr/shared-constants';
import { IconModel } from '@okr/shared-models';
import { addIndexElement } from '@okr/shared-util-core';

/**
 * Build the search index of an icon from its name, type (icon set) and additional search fields.
 * The index is always rebuilt from scratch; it never reads the previous index.
 * @param icon the icon to build the index for
 * @returns the index string
 */
export function getIconIndex(icon: IconModel): string {
  let index = '';
  index = addIndexElement(index, 'n', icon.name ?? '');
  index = addIndexElement(index, 't', icon.type ?? '');
  // legacy docs lack searchFields (Firestore reads skip model defaults)
  index = addIndexElement(index, 's', icon.searchFields ?? '');
  return index;
}

export function getIconIndexInfo(): string {
  return 'n:name t:type s:searchFields';
}

/**
 * Returns the Firebase Storage path for an icon file.
 * e.g. 'logo/icons/folder.svg'
 */
export function getIconStoragePath(type: string, name: string): string {
  return `logo/${type}/${name}.svg`;
}

/**
 * Build an IconModel directly from storage metadata (used by the sync operation).
 */
export function buildIconModelFromStorage(
  name: string,
  type: string,
  fullPath: string,
  tenantId: string,
  sizeBytes: number,
  updatedDate: string
): IconModel {
  const icon = new IconModel(tenantId);
  icon.tenants = [tenantId];
  icon.name = name;
  icon.type = type;
  icon.fullPath = fullPath;
  icon.size = sizeBytes;
  icon.updated = updatedDate;
  icon.index = getIconIndex(icon);
  return icon;
}

/**
 * Build an IconModel from an uploaded SVG file and its storage metadata.
 */
export function buildIconModel(
  file: File,
  type: string,
  fullPath: string,
  tenantId: string,
  sizeBytes?: number,
  updatedDate?: string
): IconModel {
  const icon = new IconModel(tenantId);
  icon.tenants = [tenantId];
  icon.name = file.name.replace('.svg', '');
  icon.type = type;
  icon.fullPath = fullPath;
  icon.size = sizeBytes ?? file.size;
  icon.updated = updatedDate ?? DEFAULT_DATE;
  icon.index = getIconIndex(icon);
  return icon;
}
