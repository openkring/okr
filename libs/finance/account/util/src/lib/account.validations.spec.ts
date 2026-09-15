import { describe, expect, it } from 'vitest';

import { NAME_LENGTH } from '@okr/shared-constants';
import { AccountModel } from '@okr/shared-models';

import { accountValidations } from './account.validations';

function account(name: string): AccountModel {
  const a = new AccountModel('scs');
  a.name = name;
  a.type = 'leaf';
  return a;
}

describe('accountValidations', () => {
  it('accepts a name of 50 characters (the input counter allows 50)', () => {
    const result = accountValidations(account('x'.repeat(50)), 'scs', '');
    expect(result.getErrors('name')).toEqual([]);
  });

  it('rejects a name longer than NAME_LENGTH', () => {
    const result = accountValidations(account('x'.repeat(NAME_LENGTH + 1)), 'scs', '');
    expect(result.getErrors('name')).toContain('tooLong');
  });

  it('rejects an empty name', () => {
    const result = accountValidations(account(''), 'scs', '');
    expect(result.getErrors('name')).toContain('required');
  });
});
