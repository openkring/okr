import { enforce, only, staticSuite, test } from 'vest';
import { isFileTransferEmail } from './file-transfer-limits';

export interface FileTransferFormValues {
  fileCount: number;
  recipientCount: number;
  emails: string[];
  lifetimeDays: number;
  maxLifetimeDays: number;
}

export const fileTransferValidations = staticSuite((model: FileTransferFormValues, field?: string) => {
  only(field);
  test('files', 'fileTransfer.files.required', () => {
    enforce(model.fileCount).greaterThanOrEquals(1);
  });
  test('recipients', 'fileTransfer.recipients.required', () => {
    enforce(model.recipientCount + model.emails.length).greaterThanOrEquals(1);
  });
  test('emails', 'fileTransfer.emails.invalid', () => {
    enforce(model.emails.every(e => isFileTransferEmail(e))).isTruthy();
  });
  test('lifetimeDays', 'fileTransfer.lifetime.range', () => {
    enforce(model.lifetimeDays).greaterThanOrEquals(1);
    enforce(model.lifetimeDays).lessThanOrEquals(model.maxLifetimeDays);
  });
});
