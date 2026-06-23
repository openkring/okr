import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddressModel } from '@bk2/shared-models';
import { getCountryName } from '@bk2/shared-util-core';
import { createFavoriteEmailAddress, createFavoritePhoneAddress, createFavoriteWebAddress, createPostalAddress, createFavoritePostalAddress, normalizeAddressValue, stringifyAddress, stringifyPostalAddress } from './address.util';

// Mock all external dependencies
vi.mock('@capacitor/browser');
// ToastController (used by copyAddress) pulls in @ionic/core ESM that fails to resolve under Vitest;
// stub it without importing the real module so collection can proceed.
vi.mock('@ionic/angular', () => ({ ToastController: class {} }));
// keep the real util helpers (replaceSubstring, die, isType, …) but spy on getCountryName
vi.mock('@bk2/shared-util-core', async (importActual) => ({
  ...(await importActual<typeof import('@bk2/shared-util-core')>()),
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
