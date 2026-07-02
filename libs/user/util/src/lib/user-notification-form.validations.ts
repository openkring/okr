import { only, staticSuite } from 'vest';

import { DeliveryType } from '@okr/shared-models';
import { categoryValidations } from '@okr/shared-util-core';

import { UserNotificationFormModel } from './user-notification-form.model';

export const userNotificationFormValidations = staticSuite((model: UserNotificationFormModel, field?: string) => {
  only(field);

  categoryValidations('newsDelivery', model.newsDelivery, DeliveryType);
  categoryValidations('invoiceDelivery', model.invoiceDelivery, DeliveryType);
});

