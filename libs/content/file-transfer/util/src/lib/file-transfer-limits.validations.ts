import { enforce, omitWhen, staticSuite, test } from 'vest';
import type { FileTransferLimits } from '@okr/shared-models';

import { bytesToGb, gbToBytes } from './file-transfer-format';
import { DEFAULT_FILE_TRANSFER_LIMITS } from './file-transfer-limits';

const PFX = '@content/file-transfer/util.';

/** One per-person exception, sizes in GB as the admin sees them. */
export interface FileTransferLimitOverrideFormData {
  personKey: string;
  name: string;
  maxFileTransferGb: number;
  maxOpenGb: number;
}

/** {@link FileTransferLimits} as the limits form edits it: every size in GB, not in bytes. */
export interface FileTransferLimitsFormData {
  maxFileTransferGb: number;
  maxOpenGb: number;
  overrideCeilingGb: number;
  defaultLifetimeDays: number;
  maxLifetimeDays: number;
  maxExternalRecipients: number;
  overrides: FileTransferLimitOverrideFormData[];
}

export function toFileTransferLimitsFormData(limits: Partial<FileTransferLimits> | undefined): FileTransferLimitsFormData {
  const l = { ...DEFAULT_FILE_TRANSFER_LIMITS, ...(limits ?? {}) };
  return {
    maxFileTransferGb: bytesToGb(l.maxFileTransferBytes),
    maxOpenGb: bytesToGb(l.maxOpenBytes),
    overrideCeilingGb: bytesToGb(l.overrideCeilingBytes),
    defaultLifetimeDays: l.defaultLifetimeDays,
    maxLifetimeDays: l.maxLifetimeDays,
    maxExternalRecipients: l.maxExternalRecipients,
    overrides: (l.overrides ?? []).map(o => ({
      personKey: o.personKey,
      name: o.name,
      maxFileTransferGb: bytesToGb(o.maxFileTransferBytes),
      maxOpenGb: bytesToGb(o.maxOpenBytes),
    })),
  };
}

export function fromFileTransferLimitsFormData(data: FileTransferLimitsFormData): FileTransferLimits {
  return {
    maxFileTransferBytes: gbToBytes(data.maxFileTransferGb),
    maxOpenBytes: gbToBytes(data.maxOpenGb),
    overrideCeilingBytes: gbToBytes(data.overrideCeilingGb),
    defaultLifetimeDays: data.defaultLifetimeDays,
    maxLifetimeDays: data.maxLifetimeDays,
    maxExternalRecipients: data.maxExternalRecipients,
    overrides: (data.overrides ?? []).map(o => ({
      personKey: o.personKey,
      name: o.name,
      maxFileTransferBytes: gbToBytes(o.maxFileTransferGb),
      maxOpenBytes: gbToBytes(o.maxOpenGb),
    })),
  };
}

const isPositive = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0;
const isWholeNumber = (n: unknown, min: number) => typeof n === 'number' && Number.isInteger(n) && n >= min;

export const fileTransferLimitsValidations = staticSuite((model: FileTransferLimitsFormData) => {
  test('maxFileTransferGb', PFX + 'validation.positive', () => {
    enforce(isPositive(model.maxFileTransferGb)).isTruthy();
  });
  test('maxFileTransferGb', PFX + 'validation.aboveCeiling', () => {
    enforce(model.maxFileTransferGb).lessThanOrEquals(model.overrideCeilingGb);
  });
  test('maxOpenGb', PFX + 'validation.positive', () => {
    enforce(isPositive(model.maxOpenGb)).isTruthy();
  });
  test('maxOpenGb', PFX + 'validation.openBelowTransfer', () => {
    enforce(model.maxOpenGb).greaterThanOrEquals(model.maxFileTransferGb);
  });
  test('maxOpenGb', PFX + 'validation.aboveCeiling', () => {
    enforce(model.maxOpenGb).lessThanOrEquals(model.overrideCeilingGb);
  });
  test('overrideCeilingGb', PFX + 'validation.positive', () => {
    enforce(isPositive(model.overrideCeilingGb)).isTruthy();
  });
  test('maxLifetimeDays', PFX + 'validation.wholeNumber', () => {
    enforce(isWholeNumber(model.maxLifetimeDays, 1)).isTruthy();
  });
  test('defaultLifetimeDays', PFX + 'validation.wholeNumber', () => {
    enforce(isWholeNumber(model.defaultLifetimeDays, 1)).isTruthy();
  });
  test('defaultLifetimeDays', PFX + 'validation.defaultLifetime', () => {
    enforce(model.defaultLifetimeDays).lessThanOrEquals(model.maxLifetimeDays);
  });
  test('maxExternalRecipients', PFX + 'validation.wholeNumber', () => {
    enforce(isWholeNumber(model.maxExternalRecipients, 0)).isTruthy();
  });

  const seen = new Set<string>();
  (model.overrides ?? []).forEach((o, i) => {
    const key = `overrides[${i}]`;
    test(key, PFX + 'validation.overrideDuplicate', () => {
      enforce(seen.has(o.personKey)).isFalsy();
    });
    seen.add(o.personKey);
    test(key, PFX + 'validation.positive', () => {
      enforce(isPositive(o.maxFileTransferGb) && isPositive(o.maxOpenGb)).isTruthy();
    });
    omitWhen(!isPositive(model.overrideCeilingGb), () => {
      test(key, PFX + 'validation.aboveCeiling', () => {
        enforce(o.maxFileTransferGb <= model.overrideCeilingGb && o.maxOpenGb <= model.overrideCeilingGb).isTruthy();
      });
    });
  });
});
