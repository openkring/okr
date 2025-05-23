import { CategoryModel, DeliveryType } from "@bk2/shared/models";

export type DeliveryTypeCategory = CategoryModel;

export const DeliveryTypes: DeliveryTypeCategory[] = [
  {
    id: DeliveryType.Mail,
    abbreviation: 'MAIL',
    name: 'mail',
    i18nBase: 'delivery.type.mail',
    icon: 'mail'
  },
  {
    id: DeliveryType.EmailAttachment,
    abbreviation: 'EMAIL',
    name: 'emailAttachment',
    i18nBase: 'delivery.type.emailAttachment',
    icon: 'email'
  },
  {
    id: DeliveryType.SmsNotification,
    abbreviation: 'SMS',
    name: 'smsNotification',
    i18nBase: 'delivery.type.smsNotification',
    icon: 'send'
  },
  {
    id: DeliveryType.EmailNotification,
    abbreviation: 'EMNO',
    name: 'emailNotification',
    i18nBase: 'delivery.type.emailNotification',
    icon: 'email'
  },
  {
    id: DeliveryType.InAppNotification,
    abbreviation: 'INAPP',
    name: 'inappNotification',
    i18nBase: 'delivery.type.inappNotification',
    icon: 'chatbubble'
  }
]
