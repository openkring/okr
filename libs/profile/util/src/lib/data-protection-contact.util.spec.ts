import { describe, expect, it } from 'vitest';

import { dataProtectionContact, profileIntroHtml } from './data-protection-contact.util';

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
  it.each(['"a"@x.ch', 'a<b@x.ch', 'a>b@x.ch', 'a,b@x.ch', 'a\\b@x.ch', 'a@x.ch>', 'a%2Cb@x.ch', 'a#b@x.ch'])('builds no link from %j', (dpoEmail) => {
    expect(dataProtectionContact({ dpoName: 'Anna', dpoEmail, opEmail: '' })).toEqual({ name: 'Anna', email: '' });
  });
});

describe('profileIntroHtml', () => {
  it('ends with a mail link to the operator', () => {
    expect(profileIntroHtml('Frag den ', { opEmail: ' info@s.ch ' })).toBe('Frag den <a href="mailto:info@s.ch">Website Admin</a>.');
  });
  it('names the operator without a link when there is no usable address', () => {
    for (const opEmail of ['', ' ', 'nope', 'a?bcc=x@s.ch', 'a" onclick="x@s.ch', 'a"><img/src=x@s.ch', undefined as unknown as string]) {
      expect(profileIntroHtml('Frag den', { opEmail }), opEmail).toBe('Frag den Website Admin.');
    }
    expect(profileIntroHtml('Frag den', undefined)).toBe('Frag den Website Admin.');
  });
});
