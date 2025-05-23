import { only, staticSuite} from 'vest';
import { UserNotificationFormModel } from './user-notification-form.model';
import { categoryValidations } from '@bk2/shared/util';
import { DeliveryType } from '@bk2/shared/models';

export const userNotificationFormValidations = staticSuite((model: UserNotificationFormModel, field?: string) => {
  only(field);

  categoryValidations('newsDelivery', model.newsDelivery, DeliveryType);
  categoryValidations('invoiceDelivery', model.invoiceDelivery, DeliveryType);
});

