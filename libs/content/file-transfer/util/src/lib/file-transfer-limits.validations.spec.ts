import { DEFAULT_FILE_TRANSFER_LIMITS } from './file-transfer-limits';
import {
  fileTransferLimitsValidations, FileTransferLimitsFormData, fromFileTransferLimitsFormData, toFileTransferLimitsFormData,
} from './file-transfer-limits.validations';

const GB = 1024 ** 3;
const base = (): FileTransferLimitsFormData => toFileTransferLimitsFormData(DEFAULT_FILE_TRANSFER_LIMITS);

describe('toFileTransferLimitsFormData / fromFileTransferLimitsFormData', () => {
  it('shows the defaults in GB', () => {
    expect(base()).toEqual({
      maxFileTransferGb: 1, maxOpenGb: 5, overrideCeilingGb: 500,
      defaultLifetimeDays: 7, maxLifetimeDays: 30, maxExternalRecipients: 20, overrides: [],
    });
  });
  it('round-trips the defaults and overrides', () => {
    const limits = { ...DEFAULT_FILE_TRANSFER_LIMITS, overrides: [{ personKey: 'p1', name: 'Anna', maxFileTransferBytes: 10 * GB, maxOpenBytes: 50 * GB }] };
    expect(fromFileTransferLimitsFormData(toFileTransferLimitsFormData(limits))).toEqual(limits);
  });
  it('keeps four decimals of GB and converts back to whole bytes', () => {
    const form = toFileTransferLimitsFormData({ ...DEFAULT_FILE_TRANSFER_LIMITS, maxFileTransferBytes: 1.26 * GB });
    expect(form.maxFileTransferGb).toBe(1.26);
    expect(fromFileTransferLimitsFormData({ ...form, maxFileTransferGb: 1.5 }).maxFileTransferBytes).toBe(1.5 * GB);
  });
  it('a 50 MB limit survives the round-trip: never 0, still valid, within 0.1 MB', () => {
    const MB50 = 50 * 1024 ** 2;
    const limits = {
      ...DEFAULT_FILE_TRANSFER_LIMITS, maxFileTransferBytes: MB50,
      overrides: [{ personKey: 'p1', name: 'A', maxFileTransferBytes: MB50, maxOpenBytes: MB50 }],
    };
    const form = toFileTransferLimitsFormData(limits);
    expect(form.maxFileTransferGb).toBeGreaterThan(0);
    expect(fileTransferLimitsValidations(form).isValid()).toBe(true);
    const back = fromFileTransferLimitsFormData(form);
    expect(Math.abs(back.maxFileTransferBytes - MB50)).toBeLessThan(0.1 * 1024 ** 2);
    expect(Math.abs(back.overrides[0].maxOpenBytes - MB50)).toBeLessThan(0.1 * 1024 ** 2);
  });
  it('fills missing fields from the defaults', () => {
    expect(toFileTransferLimitsFormData(undefined)).toEqual(base());
  });
});

describe('fileTransferLimitsValidations', () => {
  it('accepts the defaults', () => expect(fileTransferLimitsValidations(base()).isValid()).toBe(true));
  it('needs positive sizes', () => {
    expect(fileTransferLimitsValidations({ ...base(), maxFileTransferGb: 0 }).hasErrors('maxFileTransferGb')).toBe(true);
    expect(fileTransferLimitsValidations({ ...base(), overrideCeilingGb: 0 }).hasErrors('overrideCeilingGb')).toBe(true);
  });
  it('open total must hold one transfer', () => {
    expect(fileTransferLimitsValidations({ ...base(), maxOpenGb: 0.5 }).hasErrors('maxOpenGb')).toBe(true);
  });
  it('default lifetime within 1..max, whole days', () => {
    expect(fileTransferLimitsValidations({ ...base(), defaultLifetimeDays: 31 }).hasErrors('defaultLifetimeDays')).toBe(true);
    expect(fileTransferLimitsValidations({ ...base(), defaultLifetimeDays: 2.5 }).hasErrors('defaultLifetimeDays')).toBe(true);
    expect(fileTransferLimitsValidations({ ...base(), maxLifetimeDays: 0 }).hasErrors('maxLifetimeDays')).toBe(true);
  });
  it('outside addresses may be 0 but not negative or fractional', () => {
    expect(fileTransferLimitsValidations({ ...base(), maxExternalRecipients: 0 }).isValid()).toBe(true);
    expect(fileTransferLimitsValidations({ ...base(), maxExternalRecipients: -1 }).hasErrors('maxExternalRecipients')).toBe(true);
  });
  it('an override above the ceiling is an error', () => {
    const r = fileTransferLimitsValidations({ ...base(), overrides: [{ personKey: 'p1', name: 'A', maxFileTransferGb: 501, maxOpenGb: 10 }] });
    expect(r.getErrors('overrides[0]')).toEqual(['@content/file-transfer/util.validation.aboveCeiling']);
  });
  it('an override at the ceiling is fine', () => {
    const r = fileTransferLimitsValidations({ ...base(), overrides: [{ personKey: 'p1', name: 'A', maxFileTransferGb: 500, maxOpenGb: 500 }] });
    expect(r.isValid()).toBe(true);
  });
  it('one override per person', () => {
    const o = { personKey: 'p1', name: 'A', maxFileTransferGb: 2, maxOpenGb: 10 };
    const r = fileTransferLimitsValidations({ ...base(), overrides: [o, { ...o }] });
    expect(r.hasErrors('overrides[0]')).toBe(false);
    expect(r.getErrors('overrides[1]')).toEqual(['@content/file-transfer/util.validation.overrideDuplicate']);
  });
});
