import { describe, expect, it } from 'vitest';
import { accountChannels, bannerLogoUrl, eventUrl, pickChannels, recipientChannels } from './deliver';

describe('pickChannels', () => {
  it('reads the two electronic channels', () => {
    expect(pickChannels(['email', 'chat'])).toEqual({ push: true, email: true });
    expect(pickChannels(['email'])).toEqual({ push: false, email: true });
    expect(pickChannels(['chat'])).toEqual({ push: true, email: false });
  });
  it('ignores post', () => expect(pickChannels(['post'])).toEqual({ push: false, email: false }));
  it('treats a missing value as the default (both)', () => expect(pickChannels(undefined)).toEqual({ push: true, email: true }));
  it('maps the legacy number 4 (InAppNotification) to push', () => expect(pickChannels(4)).toEqual({ push: true, email: false }));
});

describe('accountChannels', () => {
  it('uses the account of the tenant, not a foreign one', () => {
    const accounts = [
      { uid: 'k', tenants: ['kwa'], newsDelivery: ['email'] },
      { uid: 's', tenants: ['scs'], newsDelivery: ['chat'] },
    ];
    expect(accountChannels(accounts, 'scs')).toEqual({ push: true, email: false });
  });
  it('is undefined without an account in the tenant', () => {
    expect(accountChannels([{ uid: 'k', tenants: ['kwa'], newsDelivery: ['email'] }], 'scs')).toBeUndefined();
  });
  it('skips an archived account', () => {
    expect(accountChannels([{ uid: 's', tenants: ['scs'], isArchived: true }], 'scs')).toBeUndefined();
  });
});

describe('recipientChannels', () => {
  const foreign = [{ uid: 'k', tenants: ['kwa'], newsDelivery: ['chat'] }];
  it('follows the account of the tenant when there is one', () => {
    expect(recipientChannels([{ uid: 's', tenants: ['scs'], newsDelivery: ['chat'] }], 'scs', true)).toEqual({ push: true, email: false });
  });
  it('skips a person without an account by default', () => {
    expect(recipientChannels(foreign, 'scs')).toBeUndefined();
    expect(recipientChannels([], 'scs')).toBeUndefined();
  });
  it('emails a person without an account when allowed', () => {
    expect(recipientChannels(foreign, 'scs', true)).toEqual({ push: false, email: true });
    expect(recipientChannels([], 'scs', true)).toEqual({ push: false, email: true });
  });
});

describe('eventUrl', () => {
  it('is absolute on the app domain', () => {
    expect(eventUrl({ appName: 'x', appUrl: 'https://app.seeclub.org', brandColor: '', logoUrl: '' }, 'abc')).toBe('https://app.seeclub.org/calevent/all/c-calevents?event=abc');
  });
});

describe('bannerLogoUrl', () => {
  it('points at the generated maskable raster beside the master', () => {
    expect(bannerLogoUrl('tenant/scs/logo/scs-logo.svg')).toBe('https://bkaiser.imgix.net/tenant/scs/logo/logo-maskable.png?w=96&h=96&fm=png&auto=');
    expect(bannerLogoUrl('/tenant/elab/logo/logo.png?x=1')).toBe('https://bkaiser.imgix.net/tenant/elab/logo/logo-maskable.png?w=96&h=96&fm=png&auto=');
  });
  it('is empty without a directory', () => {
    expect(bannerLogoUrl('logo.svg')).toBe('');
    expect(bannerLogoUrl('')).toBe('');
    expect(bannerLogoUrl(undefined)).toBe('');
  });
});
