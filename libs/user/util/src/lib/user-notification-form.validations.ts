import { only, staticSuite } from 'vest';

import { DeliveryType } from '@bk2/shared-models';
import { categoryValidations } from '@bk2/shared-util-core';

import { UserNotificationFormModel } from './user-notification-form.model';

export const userNotificationFormValidations = staticSuite((model: UserNotificationFormModel, field?: string) => {
  only(field);

  categoryValidations('newsDelivery', model.newsDelivery, DeliveryType);
  categoryValidations('invoiceDelivery', model.invoiceDelivery, DeliveryType);
});

