import { DEFAULT_DATE } from '@bk2/shared-constants';
import { IconModel } from '@bk2/shared-models';

/**
 * Build a searchable index string for an icon from its name, type, and tags.
 */
export function getIconIndex(icon: IconModel): string {
  const parts: string[] = [];
  if (icon.name) parts.push(icon.name.toLowerCase());
  if (icon.type) parts.push(icon.type.toLowerCase());
  if (icon.index) parts.push(icon.index.toLowerCase());
  return parts.join(' ');
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
