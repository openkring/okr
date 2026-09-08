import { DeliveryChannel } from '@okr/shared-models';

/**
 * NOT a CategoryModel: `CategoryModel.id` is a number and DeliveryChannel is a string enum.
 * The old five-item list existed only to feed `okr-category-old`, and that dropdown is
 * replaced by three checkboxes (okr-delivery-channels), so nothing needs the category shape.
 */
export interface DeliveryChannelInfo {
  value: DeliveryChannel;
  name: string;
  i18nBase: string;
  icon: string;
}

export const DeliveryChannels: DeliveryChannelInfo[] = [
  { value: DeliveryChannel.Post,  name: 'post',  i18nBase: '@shared/categories.delivery.post',  icon: 'mail' },
  { value: DeliveryChannel.Email, name: 'email', i18nBase: '@shared/categories.delivery.email', icon: 'email' },
  { value: DeliveryChannel.Chat,  name: 'chat',  i18nBase: '@shared/categories.delivery.chat',  icon: 'chatbubble' },
];
