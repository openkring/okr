import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvatarUsage, DefaultLanguage, DeliveryType, GenderType, NameDisplay, Language, PersonModel, PersonSortCriteria, PrivacyUsage, UserModel } from '@bk2/shared-models';
import * as angularUtils from '@bk2/shared-util-angular';
import { convertPersonToDataForm, convertUserToSettingsForm, convertUserToPrivacyForm, convertPersonalDataFormToPerson, convertSettingsFormToUser, convertPrivacyFormToUser } from './profile.util';
import { PersonalDataFormModel } from './personal-data-form.model';
import { SettingsFormModel } from './settings-form.model';
import { PrivacyFormModel } from './privacy-form.model';

// Mock external dependencies
vi.mock('@bk2/shared-util-angular', () => ({
  formatAhv: vi.fn((ssnId, format) => `formatted:${ssnId}:${format}`),
  AhvFormat: {
    Friendly: 'friendly',
    Electronic: 'electronic',
  },
}));

describe('Profile Utils', () => {
  const mockFormatAhv = vi.mocked(angularUtils.formatAhv);

  let person: PersonModel;
  let user: UserModel;

  beforeEach(() => {
    vi.clearAllMocks();

    person = {
      bkey: 'person-1',
      firstName: 'John',
      lastName: 'Doe',
      gender: GenderType.Male,
      dateOfBirth: '19900101',
      ssnId: '7561234567890',
    } as PersonModel;

    user = {
      bkey: 'user-1',
      loginEmail: 'john.doe@example.com',
      personKey: 'person-1',
      firstName: 'John',
      lastName: 'Doe',
      tenants: ['test'],
      isArchived: false,
      notes: 'Some notes',
      index: 'n: John Doe',
      tags: 'review',
      roles: { registered: true },
      useTouchId: false,
      useFaceId: false,
      userLanguage: Language.EN,
      avatarUsage: AvatarUsage.NoGravatar,
      gravatarEmail: 'test@example.com',
      nameDisplay: NameDisplay.LastFirst,
      useDisplayName: true,
      personSortCriteria: PersonSortCriteria.Firstname,
      newsDelivery: DeliveryType.EmailAttachment,
      invoiceDelivery: DeliveryType.EmailAttachment,
      showArchivedData: false,
      showDebugInfo: true,
      showHelpers: true,
      usage_images: PrivacyUsage.Protected,
      usage_dateOfBirth: PrivacyUsage.Protected,
      usage_postalAddress: PrivacyUsage.Protected,
      usage_email: PrivacyUsage.Protected,
      usage_phone: PrivacyUsage.Protected,
      usage_name: PrivacyUsage.Protected,
    } as UserModel;
  });

  describe('convertPersonToDataForm', () => {
    it('should convert a PersonModel to a PersonalDataFormModel', () => {
      const form = convertPersonToDataForm(person);
      expect(form.personKey).toBe('person-1');
      expect(form.firstName).toBe('John');
      expect(form.lastName).toBe('Doe');
      expect(form.gender).toBe(GenderType.Male);
      expect(form.dateOfBirth).toBe('19900101');
      expect(form.ssnId).toBe('formatted:7561234567890:friendly');

      expect(mockFormatAhv).toHaveBeenCalledWith('7561234567890', 'friendly');
    });

    it('should return a default object if person is undefined', () => {
      const form = convertPersonToDataForm();
      expect(form.personKey).toBe('personKey');
      expect(form.ssnId).toBe('');
    });
  });

  describe('convertUserToSettingsForm', () => {
    it('should convert a UserModel to a SettingsFormModel', () => {
      const form = convertUserToSettingsForm(user);
      expect(form.userKey).toBe('user-1');
      expect(form.language).toBe(Language.EN);
      expect(form.useFaceId).toBe(false);
      expect(form.nameDisplay).toBe(NameDisplay.LastFirst);
    });
  });

  describe('convertUserToPrivacyForm', () => {
    it('should convert a UserModel to a PrivacyFormModel', () => {
      const form = convertUserToPrivacyForm(user);
      expect(form.usage_images).toBe(PrivacyUsage.Protected);
      expect(form.usage_name).toBe(PrivacyUsage.Protected);
    });
  });

  describe('convertPersonalDataFormToPerson', () => {
    it('should update a PersonModel from a PersonalDataFormModel', () => {
      const form: PersonalDataFormModel = { ssnId: '756.1234.5678.90' } as PersonalDataFormModel;
      const updatedPerson = convertPersonalDataFormToPerson(form, person);
      expect(updatedPerson.ssnId).toBe('formatted:756.1234.5678.90:electronic');
      expect(mockFormatAhv).toHaveBeenCalledWith('756.1234.5678.90', 'electronic');
    });
  });

  describe('convertSettingsFormToUser', () => {
    it('should update a UserModel from a SettingsFormModel', () => {
      const form: SettingsFormModel = {
        language: Language.GE,
        useFaceId: false,
        nameDisplay: NameDisplay.FirstLast,
      } as SettingsFormModel;
      const updatedUser = convertSettingsFormToUser(form, user);
      expect(updatedUser.userLanguage).toBe(Language.GE);
      expect(updatedUser.useFaceId).toBe(false);
      expect(updatedUser.nameDisplay).toBe(NameDisplay.FirstLast);
    });

    it('should use default values for undefined form properties', () => {
      const form: SettingsFormModel = {} as SettingsFormModel;
      const updatedUser = convertSettingsFormToUser(form, user);
      expect(updatedUser.userLanguage).toBe(DefaultLanguage);
      expect(updatedUser.showDebugInfo).toBe(false);
      expect(updatedUser.avatarUsage).toBe(AvatarUsage.PhotoFirst);
    });
  });

  describe('convertPrivacyFormToUser', () => {
    it('should update a UserModel from a PrivacyFormModel', () => {
      const form: PrivacyFormModel = {
        usage_images: PrivacyUsage.Public,
        usage_name: PrivacyUsage.Public,
      } as PrivacyFormModel;
      const updatedUser = convertPrivacyFormToUser(form, user);
      expect(updatedUser.usage_images).toBe(PrivacyUsage.Public);
      expect(updatedUser.usage_name).toBe(PrivacyUsage.Public);
    });

    it('should use default values for undefined form properties', () => {
      const form: PrivacyFormModel = {} as PrivacyFormModel;
      const updatedUser = convertPrivacyFormToUser(form, user);
      expect(updatedUser.usage_images).toBe(PrivacyUsage.Public);
      expect(updatedUser.usage_dateOfBirth).toBe(PrivacyUsage.Restricted);
    });
  });
});
