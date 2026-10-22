/** Storage layout of a quick file transfer in the private bucket (spec 1.115). */

export function fileTransferPrefix(tenantId: string, transferKey: string): string {
  return `tenant/${tenantId}/file-transfer/${transferKey}/`;
}

/** Keeps only [A-Za-z0-9._-]; whitespace becomes `_`, path separators and leading dots are dropped. */
function safeName(name: string): string {
  const cleaned = name
    .replace(/[\\/]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/^[._]+/, '');
  return cleaned.slice(-120) || 'file';
}

export function fileTransferFilePath(tenantId: string, transferKey: string, index: number, name: string): string {
  // Take the last path segment first so '../Video 1.MOV' becomes 'Video_1.MOV'.
  const base = name.split(/[\\/]/).filter(Boolean).pop() ?? '';
  return `${fileTransferPrefix(tenantId, transferKey)}${index}-${safeName(base)}`;
}
