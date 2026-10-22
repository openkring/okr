import { fileTransferValidations } from './file-transfer.validations';

const base = { fileCount: 1, recipientCount: 1, emails: ['a@b.ch'], lifetimeDays: 7, maxLifetimeDays: 30 };

describe('fileTransferValidations', () => {
  it('passes a valid form', () => expect(fileTransferValidations(base).isValid()).toBe(true));
  it('needs a file', () => expect(fileTransferValidations({ ...base, fileCount: 0 }).hasErrors('files')).toBe(true));
  it('needs a recipient', () => expect(fileTransferValidations({ ...base, recipientCount: 0, emails: [] }).hasErrors('recipients')).toBe(true));
  it('rejects an invalid email', () => expect(fileTransferValidations({ ...base, emails: ['x'] }).hasErrors('emails')).toBe(true));
  it('lifetime 1..max', () => {
    expect(fileTransferValidations({ ...base, lifetimeDays: 0 }).hasErrors('lifetimeDays')).toBe(true);
    expect(fileTransferValidations({ ...base, lifetimeDays: 31 }).hasErrors('lifetimeDays')).toBe(true);
  });
});
