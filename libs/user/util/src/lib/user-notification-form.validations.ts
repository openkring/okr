import { staticSuite } from 'vest';

import { deliveryChannelsValidations } from '@okr/shared-util-core';

import { UserNotificationFormModel } from './user-notification-form.model';

export const userNotificationFormValidations = staticSuite((model: UserNotificationFormModel) => {
  deliveryChannelsValidations('newsDelivery', model.newsDelivery);
  deliveryChannelsValidations('invoiceDelivery', model.invoiceDelivery);
});
