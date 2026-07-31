import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddressModel, UserModel } from '@okr/shared-models';
import { getCountryName } from '@okr/shared-util-core';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { browseUrl, createFavoriteEmailAddress, createFavoritePhoneAddress, createFavoriteWebAddress, createPostalAddress, createFavoritePostalAddress, directoryEntryToAddress, getAddressIndex, getWebUrl, normalizeAddressValue, openExternalUrl, readsAddressVault, shouldBecomeFavorite, stringifyAddress, stringifyPostalAddress } from './address.util';

// Mock all external dependencies
vi.mock('@capacitor/browser', () => ({ Browser: { open: vi.fn() } }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }));
// ToastController (used by copyAddress) pulls in @ionic/core ESM that fails to resolve under Vitest;
// stub it without importing the real module so collection can proceed.
vi.mock('@ionic/angular', () => ({ ToastController: class {} }));
// keep the real util helpers (replaceSubstring, die, isType, …) but spy on getCountryName
vi.mock('@okr/shared-util-core', async (importActual) => ({
  ...(await importActual<typeof import('@okr/shared-util-core')>()),
  getCountryName: vi.fn(),
}));

describe('Address Utils', () => {
  const mockGetCountryName = vi.mocked(getCountryName);
  const tenantId = 'tenant-1';
  let address: AddressModel;

  beforeEach(() => {
    vi.resetAllMocks();  // reset return values too (clearAllMocks leaves getCountryName's mockReturnValue leaking between tests)
    address = new AddressModel(tenantId);
  });

  describe('browseUrl', () => {
    const mockBrowserOpen = vi.mocked(Browser.open);

    beforeEach(() => {
      // jsdom blocks assigning to window.location.href; replace it with a writable stub.
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { href: '' },
      });
    });

    it('navigates the top frame for mailto: (no popup/new tab)', async () => {
      await browseUrl('mailto:member@example.org');

      expect(window.location.href).toBe('mailto:member@example.org');
      expect(mockBrowserOpen).not.toHaveBeenCalled();
    });

    it('navigates the top frame for tel:', async () => {
      await browseUrl('tel:+41441234567');

      expect(window.location.href).toBe('tel:+41441234567');
      expect(mockBrowserOpen).not.toHaveBeenCalled();
    });

    it('applies the prefix before scheme detection', async () => {
      await browseUrl('member@example.org', 'mailto:');

      expect(window.location.href).toBe('mailto:member@example.org');
      expect(mockBrowserOpen).not.toHaveBeenCalled();
    });

    it('uses Browser.open for http(s) URLs', async () => {
      mockBrowserOpen.mockResolvedValue(undefined);

      await browseUrl('https://example.org');

      expect(mockBrowserOpen).toHaveBeenCalledWith({ url: 'https://example.org' });
      expect(window.location.href).toBe('');
    });
  });

  describe('getWebUrl', () => {
    it('keeps an https web url as-is', () => {
      address.addressChannel = 'web';
      address.url = 'https://example.org';
      expect(getWebUrl(address)).toBe('https://example.org');
    });

    it('prepends https:// to a bare web url', () => {
      address.addressChannel = 'web';
      address.url = 'example.org';
      expect(getWebUrl(address)).toBe('https://example.org');
    });

    it('applies the social-network prefix', () => {
      address.addressChannel = 'twitter';
      address.url = 'handle';
      expect(getWebUrl(address)).toBe('https://twitter.com/handle');
    });

    it('returns undefined for non-web channels', () => {
      address.addressChannel = 'email';
      address.url = 'x@y.org';
      expect(getWebUrl(address)).toBeUndefined();
    });
  });

  describe('openExternalUrl', () => {
    const mockBrowserOpen = vi.mocked(Browser.open);
    const mockIsNative = vi.mocked(Capacitor.isNativePlatform);

    it('opens a new tab via window.open on the web', () => {
      mockIsNative.mockReturnValue(false);
      const windowOpen = vi.spyOn(window, 'open').mockReturnValue(null);

      openExternalUrl('https://example.org');

      expect(windowOpen).toHaveBeenCalledWith('https://example.org', '_blank');
      expect(mockBrowserOpen).not.toHaveBeenCalled();
    });

    it('uses the in-app Browser on native', () => {
      mockIsNative.mockReturnValue(true);
      mockBrowserOpen.mockResolvedValue(undefined);
      const windowOpen = vi.spyOn(window, 'open').mockReturnValue(null);

      openExternalUrl('https://example.org');

      expect(mockBrowserOpen).toHaveBeenCalledWith({ url: 'https://example.org' });
      expect(windowOpen).not.toHaveBeenCalled();
    });
  });

  describe('stringifyPostalAddress', () => {
    it('should return an empty string for non-postal addresses', () => {
      address.addressChannel = 'email';
      expect(stringifyPostalAddress(address, 'en')).toBe('');
    });

    it('should return a formatted string for postal addresses', () => {
      address.addressChannel = 'postal';
      address.streetName = 'Main St';
      address.streetNumber = '123';
      address.zipCode = '90210';
      address.city = 'Beverly Hills';
      address.countryCode = 'US';
      mockGetCountryName.mockReturnValue('USA');

      const result = stringifyPostalAddress(address, 'en');
      expect(result).toBe('Main St 123, 90210 Beverly Hills, USA');
      expect(mockGetCountryName).toHaveBeenCalledWith('US', 'en');
    });

    it('should return a formatted string without country if country name is not found', () => {
      address.addressChannel = 'postal';
      address.streetName = 'Main St';
      address.streetNumber = '123';
      address.zipCode = '90210';
      address.city = 'Beverly Hills';
      address.countryCode = '00';

      const result = stringifyPostalAddress(address, 'en');
      expect(result).toBe('Main St 123, 90210 Beverly Hills');
    });
  });

  describe('createAddress functions', () => {
    it('createAddress should create a valid AddressModel', () => {
      const newAddress = createFavoriteEmailAddress('home', 'test@test.com', tenantId);
      expect(newAddress.addressUsage).toBe('home');
      expect(newAddress.addressChannel).toBe('email');
      expect(newAddress.email).toBe('test@test.com');
      expect(newAddress.isFavorite).toBe(true);
      expect(newAddress.isValidated).toBe(false);
      expect(newAddress.isCc).toBe(false);
      expect(newAddress.isArchived).toBe(false);
    });

    it('createFavoriteEmailAddress should create a favorite email address', () => {
      const email = createFavoriteEmailAddress('work', 'work@example.com', tenantId);
      expect(email.addressChannel).toBe('email');
      expect(email.isFavorite).toBe(true);
    });

    it('createFavoritePhoneAddress should create a favorite phone address', () => {
      const phone = createFavoritePhoneAddress('mobile', '555-1234', tenantId);
      expect(phone.addressChannel).toBe('phone');
      expect(phone.isFavorite).toBe(true);
    });

    it('createFavoriteWebAddress should create a favorite web address', () => {
      const web = createFavoriteWebAddress('custom', 'http://a.co', tenantId);
      expect(web.addressChannel).toBe('web');
      expect(web.isFavorite).toBe(true);
    });

    it('createPostalAddress should create a valid postal address', () => {
      const postal = createPostalAddress(tenantId, 'home', 'street', '123', 'apt 1', '12345', 'city', 'US');
      expect(postal.addressChannel).toBe('postal');
      expect(postal.streetName).toBe('street');
      expect(postal.streetNumber).toBe('123');
      expect(postal.addressValue2).toBe('apt 1');
      expect(postal.zipCode).toBe('12345');
    });

    it('createFavoritePostalAddress should create a favorite postal address', () => {
      const favPostal = createFavoritePostalAddress('home', 'street', '123', '99999', 'city', 'US', tenantId);
      expect(favPostal.addressUsage).toBe('home');
      expect(favPostal.addressUsageLabel).toBe('');
      expect(favPostal.addressChannel).toBe('postal');
      expect(favPostal.addressChannelLabel).toBe('');
      expect(favPostal.email).toBe('');
      expect(favPostal.phone).toBe('');
      expect(favPostal.streetName).toBe('street');
      expect(favPostal.streetNumber).toBe('123');
      expect(favPostal.addressValue2).toBe('');
      expect(favPostal.zipCode).toBe('99999');
      expect(favPostal.city).toBe('city');
      expect(favPostal.countryCode).toBe('US');
      expect(favPostal.isFavorite).toBe(true);
    });
  });

  describe('stringifyAddress', () => {
    it('should return a formatted string for a postal address', () => {
      address.addressChannel = 'postal';
      address.streetName = 'Main St';
      address.streetNumber = '123';
      address.zipCode = '90210';
      address.city = 'Beverly Hills';
      expect(stringifyAddress(address)).toBe('Main St 123, 90210 Beverly Hills');
    });

    it('should return the value for a non-postal address', () => {
      address.addressChannel = 'email';
      address.email = 'test@example.com';
      expect(stringifyAddress(address)).toBe('test@example.com');
    });

    it('should format a Swiss phone number into international format', () => {
      address.addressChannel = 'phone';
      address.phone = '0791231234';
      expect(stringifyAddress(address)).toMatch(/^\+41/);
    });

    it('should format an international phone number', () => {
      address.addressChannel = 'phone';
      address.phone = '+4915123456789';
      expect(stringifyAddress(address)).toMatch(/^\+49/);
    });
  });

  describe('normalizeAddressValue', () => {
    it('should normalize a Swiss-local phone number to international format', () => {
      address.addressChannel = 'phone';
      address.phone = '0791231234';
      expect(normalizeAddressValue(address).phone).toMatch(/^\+41/);
    });

    it('should normalize a foreign (German) phone number', () => {
      address.addressChannel = 'phone';
      address.phone = '+4915123456789';
      expect(normalizeAddressValue(address).phone).toMatch(/^\+49/);
    });

    it('should strip a tel: prefix before formatting', () => {
      address.addressChannel = 'phone';
      address.phone = 'tel:0791231234';
      expect(normalizeAddressValue(address).phone).toMatch(/^\+41/);
    });

    it('should keep an unparseable phone number as entered', () => {
      address.addressChannel = 'phone';
      address.phone = 'not-a-number';
      expect(normalizeAddressValue(address).phone).toBe('not-a-number');
    });

    it('should leave non-phone channels untouched', () => {
      address.addressChannel = 'email';
      address.email = 'test@example.com';
      const result = normalizeAddressValue(address);
      expect(result.email).toBe('test@example.com');
      expect(result.phone).toBe('');
    });
  });
});

describe('directoryEntryToAddress (spec 1.19 Phase 4)', () => {
  it('materializes a projection entry as a display AddressModel with a search index', () => {
    const entry = {
      addressOkey: 'a1', addressChannel: 'email', addressChannelLabel: '', addressUsage: 'home',
      addressUsageLabel: '', isFavorite: true, isCc: false, email: 'x@y.z', phone: '',
      streetName: '', streetNumber: '', addressValue2: '', zipCode: '', city: '', countryCode: '', url: '',
    };
    const address = directoryEntryToAddress(entry, 't1', 'person.p1');
    expect(address.okey).toBe('a1');
    expect(address.parentKey).toBe('person.p1');
    expect(address.tenants).toEqual(['t1']);
    expect(address.addressChannel).toBe('email');
    expect(address.email).toBe('x@y.z');
    expect(address.isFavorite).toBe(true);
    expect(address.index.length).toBeGreaterThan(0);
    // never carries vault values — the entry has none by construction
    expect(address.ssn).toBe('');
    expect(address.iban).toBe('');
  });
});

describe('readsAddressVault', () => {
  const member = { personKey: 'p1', roles: {} } as unknown as UserModel;
  const privileged = { personKey: 'p1', roles: { privileged: true } } as unknown as UserModel;
  const memberAdmin = { personKey: 'p1', roles: { memberAdmin: true } } as unknown as UserModel;

  it('lets the owner read their own raw addresses', () => {
    expect(readsAddressVault(member, 'person.p1')).toBe(true);
  });

  it('sends a plain member to the projection for someone else', () => {
    expect(readsAddressVault(member, 'person.p2')).toBe(false);
    expect(readsAddressVault(member, 'org.o1')).toBe(false);
  });

  it('lets privileged and memberAdmin read the vault of others', () => {
    expect(readsAddressVault(privileged, 'person.p2')).toBe(true);
    expect(readsAddressVault(memberAdmin, 'person.p2')).toBe(true);
  });

  it("treats the admin-guarded 'all' route as raw", () => {
    expect(readsAddressVault(member, 'all')).toBe(true);
  });

  it('sends an unauthenticated viewer to the projection', () => {
    expect(readsAddressVault(undefined, 'person.p1')).toBe(false);
  });
});

describe('shouldBecomeFavorite', () => {
  const address = (overrides: Partial<AddressModel>): AddressModel =>
    Object.assign(new AddressModel('tenant1'), overrides);
  const newEmail = address({ okey: '', addressChannel: 'email', email: 'new@example.com' });

  it('flags the first address of a channel', () => {
    expect(shouldBecomeFavorite(newEmail, [])).toBe(true);
    expect(shouldBecomeFavorite(newEmail, [address({ okey: 'a1', addressChannel: 'phone', isFavorite: true })])).toBe(true);
  });

  it('flags a new address when the channel has no favorite yet', () => {
    expect(shouldBecomeFavorite(newEmail, [address({ okey: 'a1', addressChannel: 'email' })])).toBe(true);
  });

  it('does not flag when the channel already has a favorite', () => {
    expect(shouldBecomeFavorite(newEmail, [address({ okey: 'a1', addressChannel: 'email', isFavorite: true })])).toBe(false);
  });

  it('ignores archived and CC siblings when looking for the favorite', () => {
    expect(shouldBecomeFavorite(newEmail, [address({ okey: 'a1', addressChannel: 'email', isFavorite: true, isArchived: true })])).toBe(true);
    expect(shouldBecomeFavorite(newEmail, [address({ okey: 'a1', addressChannel: 'email', isFavorite: true, isCc: true })])).toBe(true);
  });

  it('never flags a CC or archived address itself', () => {
    expect(shouldBecomeFavorite(address({ addressChannel: 'email', isCc: true }), [])).toBe(false);
    expect(shouldBecomeFavorite(address({ addressChannel: 'email', isArchived: true }), [])).toBe(false);
  });
});

describe('getAddressIndex', () => {
  const tenantId = 'tenant-1';
  const address = (overrides: Partial<AddressModel>): AddressModel =>
    Object.assign(new AddressModel(tenantId), { parentKey: 'person.kaiser' }, overrides);

  it('appends the parentKey so the list can be searched by owner', () => {
    expect(getAddressIndex(address({ addressChannel: 'email', email: 'bruno@bkaiser.ch' })))
      .toBe('n:bruno@bkaiser.ch p:person.kaiser o:');
  });

  it('indexes every contact channel by value', () => {
    expect(getAddressIndex(address({ addressChannel: 'phone', phone: '+41 79 790 8929' })))
      .toBe('n:+41797908929 p:person.kaiser o:');
    expect(getAddressIndex(address({ addressChannel: 'web', url: 'https://www.brunokaiser.ch' })))
      .toBe('n:https://www.brunokaiser.ch p:person.kaiser o:');
    expect(getAddressIndex(address({
      addressChannel: 'postal', streetName: 'Rainstrasse', streetNumber: '65',
      countryCode: 'CH', zipCode: '8712', city: 'Stäfa'
    }))).toBe('n:Rainstrasse65CH8712Stäfa p:person.kaiser o:');
  });

  it('finds every address of an owner with one parentKey search term', () => {
    const addresses = [
      address({ addressChannel: 'phone', phone: '+41 79 790 8929' }),
      address({ addressChannel: 'postal', streetName: 'Rainstrasse', zipCode: '8712', city: 'Stäfa' }),
      address({ addressChannel: 'email', email: 'bruno@bkaiser.ch' }),
    ].map((a) => getAddressIndex(a));
    expect(addresses.every((index) => index.includes('person.kaiser'))).toBe(true);
  });

  it('never indexes the value of a sensitive scalar channel', () => {
    expect(getAddressIndex(address({ addressChannel: 'ssn', ssn: '7562923183107' })))
      .toBe('n: p:person.kaiser o:');
    expect(getAddressIndex(address({ addressChannel: 'dob', dob: '19630412' })))
      .toBe('n: p:person.kaiser o:');
    expect(getAddressIndex(address({ addressChannel: 'dod', dod: '20240101' })))
      .toBe('n: p:person.kaiser o:');
  });

  it('tolerates fields missing on legacy documents (Firestore reads skip model defaults)', () => {
    const legacy = { addressChannel: 'phone', parentKey: 'person.kaiser' } as AddressModel;
    expect(getAddressIndex(legacy)).toBe('n: p:person.kaiser o:');
  });
});

describe('getAddressIndex — owner segment', () => {
  const address = (overrides: Partial<AddressModel>): AddressModel =>
    Object.assign(new AddressModel('tenant-1'), { parentKey: 'person.kaiser' }, overrides);

  it('carries the resolved owner name so the list can be searched by name', () => {
    expect(getAddressIndex(address({ addressChannel: 'phone', phone: '+41 79 790 8929' }), 'Bruno Kaiser'))
      .toBe('n:+41797908929 p:person.kaiser o:Bruno Kaiser');
  });

  it('finds every address of an owner by name, whatever the channel', () => {
    const indexes = [
      address({ addressChannel: 'phone', phone: '+41 79 790 8929' }),
      address({ addressChannel: 'postal', streetName: 'Rainstrasse', city: 'Stäfa' }),
      address({ addressChannel: 'bankaccount', iban: 'CH98 0070 0112 9000 69345' }),
      address({ addressChannel: 'ssn', ssn: '7562923183107' }),
    ].map((a) => getAddressIndex(a, 'Bruno Kaiser'));
    expect(indexes.every((i) => i.toLowerCase().includes('bruno'))).toBe(true);
  });

  it('defaults to an empty owner segment when no name is supplied', () => {
    expect(getAddressIndex(address({ addressChannel: 'email', email: 'a@b.ch' })))
      .toBe('n:a@b.ch p:person.kaiser o:');
  });

  it('trims the owner name', () => {
    expect(getAddressIndex(address({ addressChannel: 'email', email: 'a@b.ch' }), '  Bruno Kaiser  '))
      .toBe('n:a@b.ch p:person.kaiser o:Bruno Kaiser');
  });
});
