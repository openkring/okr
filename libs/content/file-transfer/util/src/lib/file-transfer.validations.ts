import { enforce, staticSuite, test } from 'vest';
import { COMMENT_LENGTH, PASSWORD_MAX_LENGTH } from '@okr/shared-constants';
import { stringValidations } from '@okr/shared-util-core';

import { isFileTransferEmail, ResolvedLimits } from './file-transfer-limits';

// Vest messages are i18n keys: okr-error-note resolves any message starting with '@'. The limit
// breaches reuse the FileTransferRejection texts, so the form and a server rejection read the same.
const PFX = '@content/file-transfer/util.';

/**
 * What the send form validates — derived from the form data by {@link toFileTransferFormValues}.
 * Recipients are counted the way the server counts them: groups and persons on one side (the
 * server expands the groups and dedupes the persons, so the client can only check "at least one"),
 * outside email addresses on the other.
 */
export interface FileTransferFormValues {
  fileCount: number;
  totalBytes: number;
  groupCount: number;
  personCount: number;
  emails: string[];
  lifetimeDays: number;
  message: string;
  password: string;
  limits: Pick<ResolvedLimits, 'maxFileTransferBytes' | 'maxLifetimeDays' | 'maxExternalRecipients'>;
}

/** The fields of the send form the suite reads (structural, so this lib needs no DOM `File`). */
export interface FileTransferFormInput {
  files: { size: number }[];
  groupKeys: string[];
  personKeys: string[];
  emails: string[];
  message: string;
  lifetimeDays: number;
  password: string;
}

export function toFileTransferFormValues(data: FileTransferFormInput, limits: FileTransferFormValues['limits']): FileTransferFormValues {
  const files = data.files ?? [];
  return {
    fileCount: files.length,
    totalBytes: files.reduce((sum, f) => sum + (f.size ?? 0), 0),
    groupCount: (data.groupKeys ?? []).length,
    personCount: (data.personKeys ?? []).length,
    emails: data.emails ?? [],
    lifetimeDays: data.lifetimeDays,
    message: data.message ?? '',
    password: data.password ?? '',
    limits,
  };
}

export const fileTransferValidations = staticSuite((model: FileTransferFormValues) => {
  test('files', PFX + 'rejection.noFiles', () => {
    enforce(model.fileCount).greaterThanOrEquals(1);
  });
  test('files', PFX + 'rejection.tooLarge', () => {
    enforce(model.totalBytes).lessThanOrEquals(model.limits.maxFileTransferBytes);
  });
  test('recipients', PFX + 'rejection.noRecipients', () => {
    enforce(model.groupCount + model.personCount + model.emails.length).greaterThanOrEquals(1);
  });
  test('emails', PFX + 'rejection.invalidEmail', () => {
    enforce(model.emails.every(e => isFileTransferEmail(e))).isTruthy();
  });
  test('emails', PFX + 'rejection.tooManyExternals', () => {
    enforce(model.emails.length).lessThanOrEquals(model.limits.maxExternalRecipients);
  });
  test('lifetimeDays', PFX + 'validation.lifetimeMin', () => {
    enforce(Number.isInteger(model.lifetimeDays) && model.lifetimeDays >= 1).isTruthy();
  });
  test('lifetimeDays', PFX + 'rejection.lifetimeTooLong', () => {
    enforce(model.lifetimeDays).lessThanOrEquals(model.limits.maxLifetimeDays);
  });
  stringValidations('message', model.message, COMMENT_LENGTH);
  stringValidations('password', model.password, PASSWORD_MAX_LENGTH);
});
