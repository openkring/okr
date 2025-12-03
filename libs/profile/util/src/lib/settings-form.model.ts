import { AvatarUsage, DefaultLanguage, DeliveryType, Language, NameDisplay, PersonSortCriteria } from '@bk2/shared-models';
import { DEFAULT_EMAIL, DEFAULT_KEY } from '@bk2/shared-constants';

// attributes from UserModel
export type SettingsFormModel = {
  language: Language;
  showDebugInfo: boolean;
  showArchivedData: boolean;
  showHelpers: boolean;
  userKey: string;
  useTouchId: boolean;
  useFaceId: boolean;
  avatarUsage: AvatarUsage;
  gravatarEmail: string;
  nameDisplay: NameDisplay;
  useDisplayName: boolean;
  personSortCriteria: PersonSortCriteria;
  newsDelivery: DeliveryType;
  invoiceDelivery: DeliveryType;
};

export const SETTINGS_FORM_SHAPE: SettingsFormModel = {
  language: DefaultLanguage,
  showDebugInfo: false,
  showArchivedData: false,
  showHelpers: true,
  userKey: DEFAULT_KEY,
  useTouchId: false,
  useFaceId: false,
  avatarUsage: AvatarUsage.PhotoFirst,
  gravatarEmail: DEFAULT_EMAIL,
  nameDisplay: NameDisplay.FirstLast,
  useDisplayName: false,
  personSortCriteria: PersonSortCriteria.Lastname,
  newsDelivery: DeliveryType.EmailAttachment,
  invoiceDelivery: DeliveryType.EmailAttachment,
};
