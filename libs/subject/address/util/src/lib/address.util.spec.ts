import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastController } from '@ionic/angular';
import { bkTranslate } from '@bk2/shared-i18n';
import { AddressChannel, AddressModel, AddressUsage, ModelType } from '@bk2/shared-models';
import { copyToClipboard, showToast } from '@bk2/shared-util-angular';
import { getCountryName, getModelAndKey } from '@bk2/shared-util-core';
import { getAddressModalTitle, getStringifiedPostalAddress, getAddressCollection, createAddress, createFavoriteEmailAddress, createFavoritePhoneAddress, createFavoriteWebAddress, createPostalAddress, createFavoritePostalAddress, copyAddress, stringifyAddress } from './address.util';

// Mock all external dependencies
vi.mock('@capacitor/browser');
vi.mock('@bk2/shared-i18n', () => ({
  bkTranslate: vi.fn(),
}));
vi.mock('@bk2/shared-util-angular', () => ({
  copyToClipboard: vi.fn(),
  showToast: vi.fn(),
}));
vi.mock('@bk2/shared-util-core');

describe('Address Utils', () => {
  const mockGetCountryName = vi.mocked(getCountryName);
  const mockGetModelAndKey = vi.mocked(getModelAndKey);
  const mockCopyToClipboard = vi.mocked(copyToClipboard);
  const mockShowToast = vi.mocked(showToast);
  const mockBkTranslate = vi.mocked(bkTranslate);

  const tenantId = 'tenant-1';
  let address: AddressModel;

  beforeEach(() => {
    vi.clearAllMocks();
    address = new AddressModel(tenantId);
  });

  describe('getAddressModalTitle', () => {
    it('should return the create title if key is undefined', () => {
      const title = getAddressModalTitle(undefined);
      expect(title).toBe('@subject.address.operation.create.label');
    });

    it('should return the update title if key is provided', () => {
      const title = getAddressModalTitle('some-key');
      expect(title).toBe('@subject.address.operation.update.label');
    });
  });

  describe('getStringifiedPostalAddress', () => {
    it('should return undefined for non-postal addresses', () => {
      address.channelType = AddressChannel.Email;
      expect(getStringifiedPostalAddress(address, 'en')).toBeUndefined();
    });

    it('should return a formatted string for postal addresses', () => {
      address.channelType = AddressChannel.Postal;
      address.addressValue = '123 Main St';
      address.zipCode = '90210';
      address.city = 'Beverly Hills';
      address.countryCode = 'US';
      mockGetCountryName.mockReturnValue('USA');

      const result = getStringifiedPostalAddress(address, 'en');
      expect(result).toBe('123 Main St, 90210 Beverly Hills, USA');
      expect(mockGetCountryName).toHaveBeenCalledWith('US', 'en');
    });

    it('should return a formatted string without country if country name is not found', () => {
      address.channelType = AddressChannel.Postal;
      address.addressValue = '123 Main St';
      address.zipCode = '90210';
      address.city = 'Beverly Hills';
      address.countryCode = 'US';
      mockGetCountryName.mockReturnValue(undefined as unknown);

      const result = getStringifiedPostalAddress(address, 'en');
      expect(result).toBe('123 Main St, 90210 Beverly Hills');
    });
  });

  describe('getAddressCollection', () => {
    it('should return the correct collection for a Person', () => {
      mockGetModelAndKey.mockReturnValue([ModelType.Person, 'person-key']);
      const collection = getAddressCollection('Person.person-key');
      expect(collection).toBe('persons/person-key/addresses');
    });

    it('should return the correct collection for an Org', () => {
      mockGetModelAndKey.mockReturnValue([ModelType.Org, 'org-key']);
      const collection = getAddressCollection('Org.org-key');
      expect(collection).toBe('orgs/org-key/addresses');
    });
  });

  describe('createAddress functions', () => {
    it('createAddress should create a valid AddressModel', () => {
      const newAddress = createAddress(tenantId, AddressUsage.Home, AddressChannel.Email, 'test@test.com', true, true, true, true);
      expect(newAddress.usageType).toBe(AddressUsage.Home);
      expect(newAddress.channelType).toBe(AddressChannel.Email);
      expect(newAddress.addressValue).toBe('test@test.com');
      expect(newAddress.isFavorite).toBe(true);
      expect(newAddress.isValidated).toBe(true);
      expect(newAddress.isCc).toBe(true);
      expect(newAddress.isArchived).toBe(true);
    });

    it('createFavoriteEmailAddress should create a favorite email address', () => {
      const email = createFavoriteEmailAddress(AddressUsage.Work, 'work@example.com', tenantId);
      expect(email.channelType).toBe(AddressChannel.Email);
      expect(email.isFavorite).toBe(true);
    });

    it('createFavoritePhoneAddress should create a favorite phone address', () => {
      const phone = createFavoritePhoneAddress(AddressUsage.Mobile, '555-1234', tenantId);
      expect(phone.channelType).toBe(AddressChannel.Phone);
      expect(phone.isFavorite).toBe(true);
    });

    it('createFavoriteWebAddress should create a favorite web address', () => {
      const web = createFavoriteWebAddress(AddressUsage.Other, 'http://a.co', tenantId);
      expect(web.channelType).toBe(AddressChannel.Web);
      expect(web.isFavorite).toBe(true);
    });

    it('createPostalAddress should create a valid postal address', () => {
      const postal = createPostalAddress(tenantId, AddressUsage.Home, 'street', 'apt 1', '12345', 'city', 'US');
      expect(postal.channelType).toBe(AddressChannel.Postal);
      expect(postal.addressValue).toBe('street');
      expect(postal.addressValue2).toBe('apt 1');
      expect(postal.zipCode).toBe('12345');
    });

    it('createFavoritePostalAddress should create a favorite postal address', () => {
      const favPostal = createFavoritePostalAddress(AddressUsage.Home, 'street', '12345', 'city', 'US', tenantId);
      expect(favPostal.channelType).toBe(AddressChannel.Postal);
      expect(favPostal.isFavorite).toBe(true);
    });
  });

  describe('copyAddress', () => {
    const mockToastController = {} as ToastController;

    it('should copy a stringified postal address', async () => {
      address.channelType = AddressChannel.Postal;
      mockBkTranslate.mockReturnValue('Copied!');
      await copyAddress(mockToastController, address, 'en');
      expect(mockCopyToClipboard).toHaveBeenCalledWith(getStringifiedPostalAddress(address, 'en'));
      expect(mockShowToast).toHaveBeenCalledWith(mockToastController, 'Copied!');
    });

    it('should copy the value of a non-postal address', async () => {
      address.channelType = AddressChannel.Email;
      address.addressValue = 'test@example.com';
      mockBkTranslate.mockReturnValue('Copied!');
      await copyAddress(mockToastController, address, 'en');
      expect(mockCopyToClipboard).toHaveBeenCalledWith('test@example.com');
      expect(mockShowToast).toHaveBeenCalledWith(mockToastController, 'Copied!');
    });
  });

  describe('stringifyAddress', () => {
    it('should return an empty string for a null address', () => {
      expect(stringifyAddress(null as unknown)).toBe('');
    });

    it('should return a formatted string for a postal address', () => {
      address.channelType = AddressChannel.Postal;
      address.addressValue = '123 Main St';
      address.zipCode = '90210';
      address.city = 'Beverly Hills';
      expect(stringifyAddress(address)).toBe('123 Main St, 90210 Beverly Hills');
    });

    it('should return the value for a non-postal address', () => {
      address.channelType = AddressChannel.Email;
      address.addressValue = 'test@example.com';
      expect(stringifyAddress(address)).toBe('test@example.com');
    });
  });
});
