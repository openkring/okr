import { DEFAULT_DELIVERY_CHANNELS, DeliveryChannel } from '@okr/shared-models';

export type UserNotificationFormModel = {
  newsDelivery: DeliveryChannel[];
  invoiceDelivery: DeliveryChannel[];
};

export const USER_NOTIFICATION_FORM_SHAPE: UserNotificationFormModel = {
  newsDelivery: [...DEFAULT_DELIVERY_CHANNELS],
  invoiceDelivery: [...DEFAULT_DELIVERY_CHANNELS],
};
