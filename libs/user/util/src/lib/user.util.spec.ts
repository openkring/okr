import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserModel, NameDisplay, PersonSortCriteria, DeliveryType, AvatarUsage, PrivacyUsage, Roles, Language } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';
import {
  flattenRoles,
  structureRoles,
  convertUserToAuthForm,
  convertUserToDisplayForm,
  convertUserToModelForm,
  convertUserToNotificationForm,
  convertUserToPrivacyForm,
  convertAuthFormToUser,
  convertDisplayFormToUser,
  convertModelFormToUser,
  convertNotificationFormToUser,
  convertPrivacyFormToUser,
  isUser,
  getUserIndex,
  getUserIndexInfo,
} from './user.util';
import { UserAuthFormModel } from './user-auth-form.model';
import { UserDisplayFormModel } from './user-display-form.model';
import { UserModelFormModel } from './user-model-form.model';
import { UserNotificationFormModel } from './user-notification-form.model';
import { UserPrivacyFormModel } from './user-privacy-form.model';

// Mock shared utility functions
vi.mock('@bk2/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof coreUtils>();
  return {
    ...actual,
    isType: vi.fn(),
  };
});

describe('User Utils', () => {
  const mockIsType = vi.mocked(coreUtils.isType);
  const tenantId = 'tenant-1';
  let user: UserModel;

  beforeEach(() => {
    vi.clearAllMocks();
    user = new UserModel(tenantId);
    user.bkey = 'user-1';
    user.personKey = 'person-1';
    user.firstName = 'John';
    user.lastName = 'Doe';
    user.loginEmail = 'john.doe@example.com';
    user.gravatarEmail = 'gravatar@example.com';
    user.roles = { admin: true, registered: true };
    user.userLanguage = Language.EN;
    user.showDebugInfo = true;
    user.showArchivedData = false;
    user.useTouchId = true;
    user.useFaceId = false;
    user.avatarUsage = AvatarUsage.PhotoFirst;
    user.nameDisplay = NameDisplay.LastFirst;
    user.useDisplayName = true;
    user.personSortCriteria = PersonSortCriteria.Firstname;
    user.newsDelivery = DeliveryType.EmailAttachment;
    user.invoiceDelivery = DeliveryType.EmailAttachment;
    user.usage_images = PrivacyUsage.Protected;
    user.usage_dateOfBirth = PrivacyUsage.Restricted;
  });

  describe('Roles functions', () => {
    it('flattenRoles should convert a Roles object to a comma-separated string', () => {
      const roles: Roles = { admin: true, registered: true };
      expect(flattenRoles(roles)).toBe('admin,registered');
    });

    it('structureRoles should convert a comma-separated string to a Roles object', () => {
      const rolesString = 'admin,registered';
      const expectedRoles: Roles = { admin: true, registered: true };
      expect(structureRoles(rolesString)).toEqual(expectedRoles);
    });
  });

  describe('Form Conversion functions', () => {
    it('convertUserToAuthForm should convert user to auth form model', () => {
      const form = convertUserToAuthForm(user);
      expect(form.roles).toEqual({ admin: true, registered: true });
      expect(form.useFaceId).toBe(false);
    });

    it('convertUserToDisplayForm should convert user to display form model', () => {
      const form = convertUserToDisplayForm(user);
      expect(form.userLanguage).toBe(Language.EN);
      expect(form.nameDisplay).toBe(NameDisplay.LastFirst);
    });

    it('convertUserToModelForm should convert user to model form model', () => {
      const form = convertUserToModelForm(user, 'John', 'Doe');
      expect(form.bkey).toBe('user-1');
      expect(form.loginEmail).toBe('john.doe@example.com');
    });

    it('convertUserToNotificationForm should convert user to notification form model', () => {
      const form = convertUserToNotificationForm(user);
      expect(form.newsDelivery).toBe(DeliveryType.EmailAttachment);
    });

    it('convertUserToPrivacyForm should convert user to privacy form model', () => {
      const form = convertUserToPrivacyForm(user);
      expect(form.usage_images).toBe(PrivacyUsage.Protected);
      expect(form.usage_dateOfBirth).toBe(PrivacyUsage.Restricted);
    });

    it('convertAuthFormToUser should update user from auth form model', () => {
      const form: UserAuthFormModel = { roles: { admin: true }, useTouchId: true, useFaceId: true };
      const updatedUser = convertAuthFormToUser(form, user);
      expect(updatedUser.roles).toEqual({ admin: true });
      expect(updatedUser.useTouchId).toBe(true);
      expect(updatedUser.useFaceId).toBe(true);
    });

    it('convertDisplayFormToUser should update user from display form model', () => {
      const form: UserDisplayFormModel = {
        avatarUsage: AvatarUsage.GravatarFirst,
        personSortCriteria: PersonSortCriteria.Firstname,
        userLanguage: Language.GE,
        nameDisplay: NameDisplay.FirstLast,
        useDisplayName: true,
        showArchivedData: false,
        showDebugInfo: true,
        showHelpers: false,
      };
      const updatedUser = convertDisplayFormToUser(form, user);
      expect(updatedUser.userLanguage).toBe(Language.GE);
      expect(updatedUser.nameDisplay).toBe(NameDisplay.FirstLast);
    });

    it('convertModelFormToUser should update user from model form model', () => {
      const form: UserModelFormModel = { gravatarEmail: 'new@gravatar.com' } as UserModelFormModel;
      const updatedUser = convertModelFormToUser(form, user);
      expect(updatedUser.gravatarEmail).toBe('new@gravatar.com');
    });

    it('convertNotificationFormToUser should update user from notification form model', () => {
      const form: UserNotificationFormModel = { newsDelivery: DeliveryType.SmsNotification, invoiceDelivery: DeliveryType.InAppNotification };
      const updatedUser = convertNotificationFormToUser(form, user);
      expect(updatedUser.newsDelivery).toBe(DeliveryType.SmsNotification);
      expect(updatedUser.invoiceDelivery).toBe(DeliveryType.InAppNotification);
    });

    it('convertPrivacyFormToUser should update user from privacy form model', () => {
      const form: UserPrivacyFormModel = { usage_images: PrivacyUsage.Public };
      const updatedUser = convertPrivacyFormToUser(form, user);
      expect(updatedUser.usage_images).toBe(PrivacyUsage.Public);
    });
  });

  describe('isUser', () => {
    it('should use the isType utility to check the object type', () => {
      mockIsType.mockReturnValue(true);
      expect(isUser({}, tenantId)).toBe(true);
      expect(mockIsType).toHaveBeenCalledWith({}, expect.any(UserModel));
    });
  });

  describe('Index functions', () => {
    it('getUserIndex should return a formatted index string', () => {
      const index = getUserIndex(user);
      expect(index).toBe('l:john.doe@example.com p:person-1');
    });

    it('getUserIndexInfo should return the info string', () => {
      expect(getUserIndexInfo()).toBe('l:loginEmail p:personKey');
    });
  });
});
