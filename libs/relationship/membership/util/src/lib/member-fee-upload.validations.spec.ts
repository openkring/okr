import { describe, expect, it } from 'vitest';
import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { MEMBER_FEE_UPLOAD_DEFAULT_FOOTER, memberFeeUploadValidations, newMemberFeeUploadFormModel } from './member-fee-upload.validations';

describe('memberFeeUploadValidations', () => {
  it('accepts the untouched default (empty header, default footer)', () => {
    const model = newMemberFeeUploadFormModel();
    expect(model.footer).toBe(MEMBER_FEE_UPLOAD_DEFAULT_FOOTER);
    expect(memberFeeUploadValidations(model).isValid()).toBe(true);
  });

  it('accepts empty header and footer', () => {
    expect(memberFeeUploadValidations({ header: '', footer: '' }).isValid()).toBe(true);
  });

  it('rejects a header longer than DESCRIPTION_LENGTH', () => {
    expect(memberFeeUploadValidations({ header: 'x'.repeat(DESCRIPTION_LENGTH + 1), footer: '' }).hasErrors('header')).toBe(true);
  });

  it('rejects a footer longer than DESCRIPTION_LENGTH', () => {
    expect(memberFeeUploadValidations({ header: '', footer: 'x'.repeat(DESCRIPTION_LENGTH + 1) }).hasErrors('footer')).toBe(true);
  });
});
