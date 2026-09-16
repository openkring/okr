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

describe('accountValidations — duplicate account number', () => {
  function numbered(id: string): AccountModel {
    const a = account('Kasse');
    a.id = id;
    return a;
  }

  it('rejects a number that another account of the chart already carries', () => {
    const result = accountValidations(numbered('1000'), 'scs', '', ['1000', '1020']);
    expect(result.getErrors('id')).toContain('@finance/account/feature.id.duplicate');
  });

  it('accepts a free number', () => {
    const result = accountValidations(numbered('1010'), 'scs', '', ['1000', '1020']);
    expect(result.getErrors('id')).toEqual([]);
  });

  it('accepts an account without a number (a chart of accounts)', () => {
    const result = accountValidations(numbered(''), 'scs', '', ['1000']);
    expect(result.getErrors('id')).toEqual([]);
  });

  it('does not check duplicates when no numbers are given', () => {
    const result = accountValidations(numbered('1000'), 'scs', '');
    expect(result.getErrors('id')).toEqual([]);
  });
});

describe('accountValidations — Hauptkonto', () => {
  it('requires a parent on a normal account', () => {
    const result = accountValidations(account('Kasse'), 'scs', '');
    expect(result.getErrors('parentKey')).toContain('required');
  });

  it('accepts a normal account that hangs in a group', () => {
    const a = account('Kasse');
    a.parentKey = 'g10';
    const result = accountValidations(a, 'scs', '');
    expect(result.getErrors('parentKey')).toEqual([]);
  });

  it('does not require a parent on a chart of accounts', () => {
    const a = account('Kontoplan');
    a.type = 'root';
    const result = accountValidations(a, 'scs', '');
    expect(result.getErrors('parentKey')).toEqual([]);
  });
});
