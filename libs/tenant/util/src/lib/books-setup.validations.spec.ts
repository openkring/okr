import { describe, expect, it } from 'vitest';

import { booksSetupValidations, newBooksSetupInput } from './books-setup.validations';

describe('booksSetupValidations', () => {
  it('accepts the defaults for a tenant', () => {
    expect(booksSetupValidations(newBooksSetupInput('la21staefa', 'LA21 Stäfa')).isValid()).toBe(true);
  });

  it('files an invalid id under booksId with its message key', () => {
    const result = booksSetupValidations({ ...newBooksSetupInput('la21staefa', 'LA21'), booksId: 'LA 21' });
    expect(result.getErrors('booksId')).toEqual(['@tenant/util.books.validation.booksId']);
    expect(result.getErrors('name')).toEqual([]);
  });

  it('rejects a blank name and a month outside 1–12', () => {
    const result = booksSetupValidations({ ...newBooksSetupInput('x1', ' '), fiscalYearStart: 13 });
    expect(result.hasErrors('name')).toBe(true);
    expect(result.hasErrors('fiscalYearStart')).toBe(true);
  });
});
