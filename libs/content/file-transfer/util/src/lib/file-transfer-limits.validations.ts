import { enforce, omitWhen, staticSuite, test } from 'vest';
import type { FileTransferLimits } from '@okr/shared-models';

import { bytesToGb, FILE_TRANSFER_GB_DECIMALS, gbToBytes } from './file-transfer-format';
import { DEFAULT_FILE_TRANSFER_LIMITS } from './file-transfer-limits';

const PFX = '@content/file-transfer/util.';

/** One per-person exception, sizes in GB as the admin sees them. */
export interface FileTransferLimitOverrideFormData {
  personKey: string;
  /** display only — resolved from the persons on the client, never written (see fromFileTransferLimitsFormData) */
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

/**
 * @param nameOf resolves a person's display name from its key (client-side, from the persons the
 *   admin may see); the stored `name` is only a fallback for a person the resolver does not know.
 */
export function toFileTransferLimitsFormData(
  limits: Partial<FileTransferLimits> | undefined, nameOf: (personKey: string) => string = () => '',
): FileTransferLimitsFormData {
  const l = { ...DEFAULT_FILE_TRANSFER_LIMITS, ...(limits ?? {}) };
  return {
    maxFileTransferGb: bytesToGb(l.maxFileTransferBytes, FILE_TRANSFER_GB_DECIMALS),
    maxOpenGb: bytesToGb(l.maxOpenBytes, FILE_TRANSFER_GB_DECIMALS),
    overrideCeilingGb: bytesToGb(l.overrideCeilingBytes, FILE_TRANSFER_GB_DECIMALS),
    defaultLifetimeDays: l.defaultLifetimeDays,
    maxLifetimeDays: l.maxLifetimeDays,
    maxExternalRecipients: l.maxExternalRecipients,
    overrides: (l.overrides ?? []).map(o => ({
      personKey: o.personKey,
      name: nameOf(o.personKey) || o.name || '',
      maxFileTransferGb: bytesToGb(o.maxFileTransferBytes, FILE_TRANSFER_GB_DECIMALS),
      maxOpenGb: bytesToGb(o.maxOpenBytes, FILE_TRANSFER_GB_DECIMALS),
    })),
  };
}

/**
 * Back to bytes for app-config. Every override's `name` is written EMPTY: `app-config` is
 * world-readable (`allow read: if true`), so a person's name must not be stored there (spec 1.115
 * §7.1); the form resolves names from `personKey` instead.
 */
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
      name: '',
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
