import { FileTransferModel } from '@okr/shared-models';
import { FileTransferI18n, fileTransferDisplayState } from '@okr/content-file-transfer-util';

/** «offen», «abgelaufen», … for a chip; see `fileTransferDisplayState` for the not-yet-reaped case. */
export function fileTransferStateLabel(t: FileTransferModel, i18n: FileTransferI18n): string {
  switch (fileTransferDisplayState(t, new Date().toISOString())) {
    case 'uploading': return i18n.state_uploading();
    case 'open': return i18n.state_open();
    case 'ended': return i18n.state_ended();
    case 'expired': return i18n.state_expired();
    default: return t.state;
  }
}

export function fileTransferStateColor(t: FileTransferModel): string {
  switch (fileTransferDisplayState(t, new Date().toISOString())) {
    case 'open': return 'success';
    case 'uploading': return 'warning';
    default: return 'medium';
  }
}

/** true while the transfer can still be opened (and therefore ended). */
export function isFileTransferOpen(t: FileTransferModel): boolean {
  return fileTransferDisplayState(t, new Date().toISOString()) === 'open';
}
