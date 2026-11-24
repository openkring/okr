import { describe, expect, it } from 'vitest';
import { staticSuite } from 'vest';

import { ibanValidations } from './iban.validations';

const suite = staticSuite((iban: unknown) => ibanValidations('iban', iban));

describe('ibanValidations', () => {
  it.each([
    'CH6700700110404474176',
    'CH67 0070 0110 4044 7417 6',
    'CH67 0070 0110 4044 7417 6 ',            // trailing blank from a paste
    'DE89 3704 0044 0532 0130 00',            // 27 characters
    'MT84 MALT 0110 0001 2345 MTLC AST0 01S', // 31 characters + blanks
    '',                                       // optional here; the caller decides if it is required
  ])('accepts %j', iban => {
    expect(suite(iban).hasErrors('iban')).toBe(false);
  });

  it.each(['CH6700700110404474177', 'not an iban'])('rejects %j', iban => {
    expect(suite(iban).hasErrors('iban')).toBe(true);
  });
});
