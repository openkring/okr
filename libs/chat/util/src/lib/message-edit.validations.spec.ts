import { describe, expect, it } from 'vitest';

import { messageEditValidations } from './message-edit.validations';

describe('messageEditValidations', () => {
  it('accepts a non-empty text', () => {
    expect(messageEditValidations({ body: 'Hallo 👋' }).isValid()).toBe(true);
  });

  it('rejects an empty or blank text', () => {
    expect(messageEditValidations({ body: '' }).hasErrors('body')).toBe(true);
    expect(messageEditValidations({ body: '   ' }).hasErrors('body')).toBe(true);
  });
});
