import { CategoryModel, DeliveryType } from '@bk2/shared-models';

export type DeliveryTypeCategory = CategoryModel;

export const DeliveryTypes: DeliveryTypeCategory[] = [
  {
    id: DeliveryType.Mail,
    abbreviation: 'MAIL',
    name: 'mail',
    i18nBase: '@shared/categories.delivery.mail',
    icon: 'mail'
  },
  {
    id: DeliveryType.EmailAttachment,
    abbreviation: 'EMAIL',
    name: 'emailAttachment',
    i18nBase: '@shared/categories.delivery.emailAttachment',
    icon: 'document'
  },
  {
    id: DeliveryType.SmsNotification,
    abbreviation: 'SMS',
    name: 'smsNotification',
    i18nBase: '@shared/categories.delivery.smsNotification',
    icon: 'send'
  },
  {
    id: DeliveryType.EmailNotification,
    abbreviation: 'EMNO',
    name: 'emailNotification',
    i18nBase: '@shared/categories.delivery.emailNotification',
    icon: 'email'
  },
  {
    id: DeliveryType.InAppNotification,
    abbreviation: 'INAPP',
    name: 'inappNotification',
    i18nBase: '@shared/categories.delivery.inappNotification',
    icon: 'chatbubble'
  }
]
