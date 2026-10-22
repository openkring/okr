import { FileTransferFormInput, fileTransferValidations, FileTransferFormValues, toFileTransferFormValues } from './file-transfer.validations';

const GB = 1024 ** 3;
const limits = { maxFileTransferBytes: 1 * GB, maxLifetimeDays: 30, maxExternalRecipients: 2 };
const base: FileTransferFormValues = {
  fileCount: 1, totalBytes: 100, groupCount: 0, personCount: 1, emails: ['a@b.ch'],
  lifetimeDays: 7, message: '', password: '', limits,
};

describe('fileTransferValidations', () => {
  it('passes a valid form', () => expect(fileTransferValidations(base).isValid()).toBe(true));
  it('needs a file', () => expect(fileTransferValidations({ ...base, fileCount: 0 }).hasErrors('files')).toBe(true));
  it('rejects files above the transfer limit', () => {
    const r = fileTransferValidations({ ...base, totalBytes: GB + 1 });
    expect(r.getErrors('files')).toEqual(['@content/file-transfer/util.rejection.tooLarge']);
  });
  it('needs a recipient', () => expect(fileTransferValidations({ ...base, personCount: 0, emails: [] }).hasErrors('recipients')).toBe(true));
  it('a group alone is a recipient', () => expect(fileTransferValidations({ ...base, groupCount: 1, personCount: 0, emails: [] }).isValid()).toBe(true));
  it('an email alone is a recipient', () => expect(fileTransferValidations({ ...base, personCount: 0 }).isValid()).toBe(true));
  it('rejects an invalid email', () => expect(fileTransferValidations({ ...base, emails: ['x'] }).hasErrors('emails')).toBe(true));
  it('rejects too many outside emails', () => {
    const r = fileTransferValidations({ ...base, emails: ['a@b.ch', 'c@d.ch', 'e@f.ch'] });
    expect(r.getErrors('emails')).toEqual(['@content/file-transfer/util.rejection.tooManyExternals']);
  });
  it('lifetime 1..max, whole days', () => {
    expect(fileTransferValidations({ ...base, lifetimeDays: 0 }).hasErrors('lifetimeDays')).toBe(true);
    expect(fileTransferValidations({ ...base, lifetimeDays: -3 }).hasErrors('lifetimeDays')).toBe(true);
    expect(fileTransferValidations({ ...base, lifetimeDays: 1.5 }).hasErrors('lifetimeDays')).toBe(true);
    expect(fileTransferValidations({ ...base, lifetimeDays: 31 }).hasErrors('lifetimeDays')).toBe(true);
    expect(fileTransferValidations({ ...base, lifetimeDays: 30 }).hasErrors('lifetimeDays')).toBe(false);
  });
  it('caps message and password', () => {
    expect(fileTransferValidations({ ...base, message: 'x'.repeat(501) }).hasErrors('message')).toBe(true);
    expect(fileTransferValidations({ ...base, password: 'x'.repeat(65) }).hasErrors('password')).toBe(true);
  });
});

describe('toFileTransferFormValues', () => {
  it('sums the file sizes and counts groups, persons and emails separately', () => {
    const data: FileTransferFormInput = {
      files: [{ size: 10 }, { size: 32 }], groupKeys: ['g1'], personKeys: ['p1', 'p2'], emails: ['a@b.ch'],
      message: 'hi', lifetimeDays: 7, password: '',
    };
    expect(toFileTransferFormValues(data, limits)).toEqual({
      fileCount: 2, totalBytes: 42, groupCount: 1, personCount: 2, emails: ['a@b.ch'],
      lifetimeDays: 7, message: 'hi', password: '', limits,
    });
  });
});
