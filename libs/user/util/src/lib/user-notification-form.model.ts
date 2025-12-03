import { DeliveryType } from '@bk2/shared-models';

export type UserNotificationFormModel = {
  newsDelivery: DeliveryType;
  invoiceDelivery: DeliveryType;
};

export const USER_NOTIFICATION_FORM_SHAPE: UserNotificationFormModel = {
  newsDelivery: DeliveryType.EmailAttachment,
  invoiceDelivery: DeliveryType.EmailAttachment,
};
