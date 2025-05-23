import { DeliveryType } from '@bk2/shared/models';
import { DeepRequired } from 'ngx-vest-forms';

export type UserNotificationFormModel = {
  newsDelivery: DeliveryType,
  invoiceDelivery: DeliveryType
};


export const userNotificationFormModelShape: DeepRequired<UserNotificationFormModel> = {
  newsDelivery: DeliveryType.EmailAttachment,
  invoiceDelivery: DeliveryType.EmailAttachment
};