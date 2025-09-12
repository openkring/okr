import { DeepRequired } from 'ngx-vest-forms';

import { DeliveryType } from '@bk2/shared-models';

export type UserNotificationFormModel = {
  newsDelivery: DeliveryType;
  invoiceDelivery: DeliveryType;
};

export const userNotificationFormModelShape: DeepRequired<UserNotificationFormModel> = {
  newsDelivery: DeliveryType.EmailAttachment,
  invoiceDelivery: DeliveryType.EmailAttachment,
};
