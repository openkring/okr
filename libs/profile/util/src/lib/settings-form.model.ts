import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

import { AvatarUsage, DefaultLanguage, DeliveryType, Language, NameDisplay, PersonSortCriteria } from '@bk2/shared-models';

// attributes from UserModel
export type SettingsFormModel = DeepPartial<{
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
}>;

export const settingsFormModelShape: DeepRequired<SettingsFormModel> = {
  language: DefaultLanguage,
  showDebugInfo: false,
  showArchivedData: false,
  showHelpers: true,
  userKey: '',
  useTouchId: false,
  useFaceId: false,
  avatarUsage: AvatarUsage.PhotoFirst,
  gravatarEmail: '',
  nameDisplay: NameDisplay.FirstLast,
  useDisplayName: false,
  personSortCriteria: PersonSortCriteria.Lastname,
  newsDelivery: DeliveryType.EmailAttachment,
  invoiceDelivery: DeliveryType.EmailAttachment,
};
