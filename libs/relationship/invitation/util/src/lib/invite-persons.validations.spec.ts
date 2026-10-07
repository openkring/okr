import { describe, expect, it } from 'vitest';

import { COMMENT_LENGTH } from '@okr/shared-constants';
import { AvatarInfo } from '@okr/shared-models';

import { newInvitePersonsFormData } from './invite-persons.model';
import { invitePersonsValidations } from './invite-persons.validations';

const anna = { key: 'p-anna', name1: 'Anna', name2: 'Muster', modelType: 'person' } as AvatarInfo;

describe('invitePersonsValidations', () => {
  it('rejects an invitation without any person', () => {
    const result = invitePersonsValidations(newInvitePersonsFormData());
    expect(result.isValid()).toBe(false);
    expect(result.getErrors('invitees').length).toBeGreaterThan(0);
  });

  it('accepts one person and no message', () => {
    expect(invitePersonsValidations({ invitees: [anna], message: '' }).isValid()).toBe(true);
  });

  it('accepts a message up to the comment cap', () => {
    expect(invitePersonsValidations({ invitees: [anna], message: 'x'.repeat(COMMENT_LENGTH) }).isValid()).toBe(true);
  });

  it('rejects a message over the comment cap', () => {
    const result = invitePersonsValidations({ invitees: [anna], message: 'x'.repeat(COMMENT_LENGTH + 1) });
    expect(result.getErrors('message').length).toBeGreaterThan(0);
  });

  it('rejects an invitee without a key, filed under its array path', () => {
    const result = invitePersonsValidations({ invitees: [{ ...anna, key: '' }], message: '' });
    expect(result.getErrors('invitees[0].key').length).toBeGreaterThan(0);
  });
});
