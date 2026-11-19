import { describe, expect, it } from 'vitest';
import { noticeSenderOf } from './notice-sender.logic';

describe('noticeSenderOf', () => {
  it('keeps a bare address', () => {
    expect(noticeSenderOf('kommunikation@seeclub.org')).toBe('kommunikation@seeclub.org');
  });

  it('takes the address out of a display-name header', () => {
    expect(noticeSenderOf('"Seeclub" <app@seeclub.org>')).toBe('app@seeclub.org');
    expect(noticeSenderOf('Seeclub Kommunikation <kommunikation@seeclub.org> ')).toBe('kommunikation@seeclub.org');
  });

  it('is empty for an empty or missing From', () => {
    expect(noticeSenderOf('')).toBe('');
    expect(noticeSenderOf(undefined)).toBe('');
  });
});
