import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signImgixUrl } from './imgix-sign';

const md5 = (s: string) => createHash('md5').update(s).digest('hex');

describe('signImgixUrl', () => {
  it('signs token + path + ?query and appends s last (imgix Secure URLs)', () => {
    const url = signImgixUrl('bkaiser-private.imgix.net', 'TOKEN', 'tenant/scs/a b.pdf', { w: 240, fm: 'jpg', expires: 1700000000 });
    const u = new URL(url);
    expect(u.host).toBe('bkaiser-private.imgix.net');
    expect(u.pathname).toBe('/tenant/scs/a%20b.pdf');
    const query = 'w=240&fm=jpg&expires=1700000000';
    expect(url).toBe(`https://bkaiser-private.imgix.net/tenant/scs/a%20b.pdf?${query}&s=${md5('TOKEN/tenant/scs/a%20b.pdf?' + query)}`);
  });
  it('signs the bare path when there are no params', () => {
    expect(signImgixUrl('h.imgix.net', 'T', '/x.png', {})).toBe(`https://h.imgix.net/x.png?s=${md5('T/x.png')}`);
  });
  it('refuses to sign without a token', () => {
    expect(() => signImgixUrl('h.imgix.net', '', 'x.png', {})).toThrow(/token/);
  });
});
