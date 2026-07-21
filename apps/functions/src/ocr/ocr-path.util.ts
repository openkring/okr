export type OcrUsage = 'invoice' | 'expense' | 'paper';

const OCR_USAGES: readonly OcrUsage[] = ['invoice', 'expense', 'paper'];

export interface OcrPathParts {
  tenantId: string;
  ocrUsage: OcrUsage;
  correlationKey: string; // '' when the path has no correlation segment
  fileName: string;
}

/**
 * Parse `tenant/{tenantId}/ocr/{ocrUsage}/[{correlationKey}/]{fileName}`.
 * Returns null if the path is not an OCR path or the usage is unknown.
 */
export function parseOcrPath(objectName: string): OcrPathParts | null {
  const parts = objectName.split('/');
  // minimum: tenant / {tenantId} / ocr / {usage} / {fileName}  → 5 segments
  if (parts.length < 5 || parts[0] !== 'tenant' || parts[2] !== 'ocr') return null;

  const tenantId = parts[1];
  const usage = parts[3] as OcrUsage;
  if (!OCR_USAGES.includes(usage)) return null;

  const fileName = parts[parts.length - 1];
  const correlationKey = parts.length >= 6 ? parts[4] : '';
  return { tenantId, ocrUsage: usage, correlationKey, fileName };
}
