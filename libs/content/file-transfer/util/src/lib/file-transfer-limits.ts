import type { FileTransferLimits, FileTransferModel } from '@okr/shared-models';

const GB = 1024 ** 3;

export const DEFAULT_FILE_TRANSFER_LIMITS: FileTransferLimits = {
  maxFileTransferBytes: 1 * GB,
  maxOpenBytes: 5 * GB,
  overrideCeilingBytes: 500 * GB,
  defaultLifetimeDays: 7,
  maxLifetimeDays: 30,
  maxExternalRecipients: 20,
  overrides: [],
};

export function resolveFileTransferLimits(config: FileTransferLimits | undefined, personKey: string) {
  const c = { ...DEFAULT_FILE_TRANSFER_LIMITS, ...(config ?? {}) };
  const override = (c.overrides ?? []).find((o) => o.personKey === personKey);
  const clamp = (n: number) => Math.min(n, c.overrideCeilingBytes);
  return {
    maxFileTransferBytes: override ? clamp(override.maxFileTransferBytes) : c.maxFileTransferBytes,
    maxOpenBytes: override ? clamp(override.maxOpenBytes) : c.maxOpenBytes,
    defaultLifetimeDays: c.defaultLifetimeDays,
    maxLifetimeDays: c.maxLifetimeDays,
    maxExternalRecipients: c.maxExternalRecipients,
  };
}

export type ResolvedLimits = ReturnType<typeof resolveFileTransferLimits>;

export type FileTransferRejection = 'tooLarge' | 'openTotalExceeded' | 'tooManyExternals' | 'lifetimeTooLong' | 'noFiles' | 'noRecipients' | 'invalidEmail';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isFileTransferEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

export function checkFileTransferRequest(
  req: { totalBytes: number; fileCount: number; externalCount: number; recipientCount: number; lifetimeDays: number; emails: string[] },
  limits: ResolvedLimits,
  openBytesOfSender: number,
): FileTransferRejection | undefined {
  if (req.fileCount < 1) return 'noFiles';
  if (req.recipientCount + req.externalCount < 1) return 'noRecipients';
  if (req.emails.some((e) => !isFileTransferEmail(e))) return 'invalidEmail';
  if (req.totalBytes > limits.maxFileTransferBytes) return 'tooLarge';
  if (openBytesOfSender + req.totalBytes > limits.maxOpenBytes) return 'openTotalExceeded';
  if (req.externalCount > limits.maxExternalRecipients) return 'tooManyExternals';
  if (req.lifetimeDays > limits.maxLifetimeDays || req.lifetimeDays < 1) return 'lifetimeTooLong';
  return undefined;
}

/** Bytes a sender currently has reserved: transfers that are still uploading or open. */
export function openBytes(transfers: Pick<FileTransferModel, 'state' | 'totalBytes'>[]): number {
  return transfers.filter((t) => t.state === 'uploading' || t.state === 'open').reduce((sum, t) => sum + t.totalBytes, 0);
}
