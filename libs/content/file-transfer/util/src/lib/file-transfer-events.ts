import type { FileTransferEventModel } from '@okr/shared-models';

import type { FileTransferRejection } from './file-transfer-limits';

/** Opens and downloads of one transfer, as shown in the lists and fed to `fileTransferFlags`. */
export interface FileTransferEventSummary {
  opens: number;
  downloads: number;
  /** downloads per personal link (`FileTransferRecipient.id`); events without a recipient are not counted here */
  downloadsPerRecipient: Record<string, number>;
}

type SummaryEvent = Pick<FileTransferEventModel, 'transferKey' | 'type' | 'recipientId'>;

export function emptyFileTransferEventSummary(): FileTransferEventSummary {
  return { opens: 0, downloads: 0, downloadsPerRecipient: {} };
}

/** Counts 'opened' and 'downloaded' events; every other type (created, sent, ended, …) is ignored. */
export function summarizeFileTransferEvents(events: SummaryEvent[]): FileTransferEventSummary {
  const summary = emptyFileTransferEventSummary();
  for (const e of events) {
    if (e.type === 'opened') summary.opens++;
    if (e.type === 'downloaded') {
      summary.downloads++;
      if (e.recipientId) summary.downloadsPerRecipient[e.recipientId] = (summary.downloadsPerRecipient[e.recipientId] ?? 0) + 1;
    }
  }
  return summary;
}

/** The same summary, per transfer (one query over a sender's events feeds a whole list). */
export function summarizeFileTransferEventsByTransfer(events: SummaryEvent[]): Map<string, FileTransferEventSummary> {
  const byTransfer = new Map<string, SummaryEvent[]>();
  for (const e of events) {
    const list = byTransfer.get(e.transferKey) ?? [];
    list.push(e);
    byTransfer.set(e.transferKey, list);
  }
  const out = new Map<string, FileTransferEventSummary>();
  for (const [key, list] of byTransfer) out.set(key, summarizeFileTransferEvents(list));
  return out;
}

const REJECTIONS: readonly FileTransferRejection[] = [
  'tooLarge', 'openTotalExceeded', 'tooManyExternals', 'lifetimeTooLong', 'noFiles', 'noRecipients', 'invalidEmail', 'invalidRequest',
];

/** The callables report a limit breach as `failed-precondition` / `invalid-argument` with the rejection as message. */
export function isFileTransferRejection(value: string): value is FileTransferRejection {
  return (REJECTIONS as readonly string[]).includes(value);
}
