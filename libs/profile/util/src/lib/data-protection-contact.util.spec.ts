import { describe, expect, it } from 'vitest';

import { dataProtectionContact } from './data-protection-contact.util';

describe('dataProtectionContact', () => {
  it('returns name and e-mail', () => {
    expect(dataProtectionContact({ dpoName: ' Anna Muster ', dpoEmail: ' p@s.ch ', opEmail: 'info@s.ch' }))
      .toEqual({ name: 'Anna Muster', email: 'p@s.ch' });
  });
  it('returns an e-mail without a name', () => {
    expect(dataProtectionContact({ dpoName: '', dpoEmail: 'p@s.ch', opEmail: '' })).toEqual({ name: '', email: 'p@s.ch' });
  });
  it('uses the e-mail of the operator when only the name is set', () => {
    expect(dataProtectionContact({ dpoName: 'Anna', dpoEmail: '', opEmail: 'info@s.ch' })).toEqual({ name: 'Anna', email: 'info@s.ch' });
    expect(dataProtectionContact({ dpoName: 'Anna', dpoEmail: '', opEmail: '' })).toEqual({ name: 'Anna', email: '' });
  });
  it('is undefined when neither name nor e-mail is set', () => {
    expect(dataProtectionContact({ dpoName: ' ', dpoEmail: '', opEmail: 'info@s.ch' })).toBeUndefined();
    expect(dataProtectionContact(undefined)).toBeUndefined();
  });
  it('tolerates null and non-text values of a legacy document', () => {
    const raw = { dpoName: null, dpoEmail: 5, opEmail: undefined } as unknown as { dpoName: string; dpoEmail: string; opEmail: string };
    expect(dataProtectionContact(raw)).toBeUndefined();
  });
  it('never returns something that is not an address, so no link is built from it', () => {
    expect(dataProtectionContact({ dpoName: 'Anna', dpoEmail: 'nope', opEmail: '' })).toEqual({ name: 'Anna', email: '' });
  });
});
