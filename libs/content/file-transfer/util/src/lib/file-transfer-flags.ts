import type { FileTransferModel } from '@okr/shared-models';
import type { ResolvedLimits } from './file-transfer-limits';

export const FLAG_MANY_EXTERNALS = 10;
export const FLAG_NEAR_LIMIT_RATIO = 0.9;
export const FLAG_MANY_DOWNLOADS = 20;

export type FileTransferFlag = 'manyExternals' | 'nearLimit' | 'manyDownloads';

export function fileTransferFlags(t: FileTransferModel, downloadsPerRecipient: Record<string, number>, limits: ResolvedLimits): FileTransferFlag[] {
  const flags: FileTransferFlag[] = [];
  if (t.recipients.filter(r => r.kind === 'email').length >= FLAG_MANY_EXTERNALS) flags.push('manyExternals');
  if (t.totalBytes >= FLAG_NEAR_LIMIT_RATIO * limits.maxFileTransferBytes) flags.push('nearLimit');
  if (Object.values(downloadsPerRecipient).some(n => n >= FLAG_MANY_DOWNLOADS)) flags.push('manyDownloads');
  return flags;
}
