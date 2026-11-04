import { convertDateFormatToString, DateFormat, fill } from '@okr/shared-util-core';

/**
 * The placeholder names a sender may write into the transfer message, without braces
 * (e.g. `laufzeit` for `{laufzeit}`). They come from i18n, so the default message of every
 * language uses its own words.
 */
export interface FileTransferMessageTokens {
  lifetime: string;
  expiry: string;
  password: string;
}

/** What the placeholders are replaced with. */
export interface FileTransferMessageValues {
  /** e.g. «7 Tage» */
  lifetime: string;
  /** the day the files are deleted, dd.MM.yyyy */
  expiry: string;
  /** a hint that the files are password protected — NEVER the password itself; '' without one */
  password: string;
}

/**
 * Replaces `{lifetime}`, `{expiry}` and `{password}` (in the i18n words of `tokens`) in the
 * sender's message. Runs in the sender's app right before sending, so every recipient reads the
 * same text. An unknown `{…}` stays as typed. Blank lines left behind by an empty placeholder
 * (no password) are collapsed, and the result is trimmed.
 */
export function expandFileTransferMessage(message: string, tokens: FileTransferMessageTokens, values: FileTransferMessageValues): string {
  const params: Record<string, string> = {};
  if (tokens.lifetime) params[tokens.lifetime] = values.lifetime;
  if (tokens.expiry) params[tokens.expiry] = values.expiry;
  if (tokens.password) params[tokens.password] = values.password;
  return fill(message, params)
    .split('\n').map(line => line.trimEnd()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The day a transfer sent now with `lifetimeDays` is deleted, as dd.MM.yyyy. The server computes
 * the exact `expiresAt` when it sends; for a message the calendar day is enough.
 */
export function fileTransferExpiryDate(lifetimeDays: number, now = new Date()): string {
  const d = new Date(now.getTime());
  d.setDate(d.getDate() + lifetimeDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  const storeDate = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false);
}
