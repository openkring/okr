import { describe, expect, it } from 'vitest';
import { DeliveryChannel } from '@okr/shared-models';
import { toDeliveryChannels, toEditableChannels } from './delivery-channel.util';

describe('toDeliveryChannels', () => {
  it('maps the legacy numeric DeliveryType values', () => {
    expect(toDeliveryChannels(0)).toEqual([DeliveryChannel.Post]);          // Mail
    expect(toDeliveryChannels(1)).toEqual([DeliveryChannel.Email]);         // EmailAttachment
    expect(toDeliveryChannels(2)).toEqual([DeliveryChannel.Email]);         // SmsNotification -> email
    expect(toDeliveryChannels(3)).toEqual([DeliveryChannel.Email]);         // EmailNotification
    expect(toDeliveryChannels(4)).toEqual([DeliveryChannel.Chat]);          // InAppNotification
  });

  it('falls back to the default for missing or unknown input', () => {
    expect(toDeliveryChannels(undefined)).toEqual([DeliveryChannel.Email, DeliveryChannel.Chat]);
    expect(toDeliveryChannels(null)).toEqual([DeliveryChannel.Email, DeliveryChannel.Chat]);
    expect(toDeliveryChannels(99)).toEqual([DeliveryChannel.Email, DeliveryChannel.Chat]);
    expect(toDeliveryChannels('nonsense')).toEqual([DeliveryChannel.Email, DeliveryChannel.Chat]);
    expect(toDeliveryChannels([])).toEqual([DeliveryChannel.Email, DeliveryChannel.Chat]);
  });

  it('accepts a single textual channel', () => {
    expect(toDeliveryChannels('post')).toEqual([DeliveryChannel.Post]);
    expect(toDeliveryChannels('chat')).toEqual([DeliveryChannel.Chat]);
  });

  it('passes a valid list through, de-duplicated and in canonical order', () => {
    expect(toDeliveryChannels(['chat', 'post'])).toEqual([DeliveryChannel.Post, DeliveryChannel.Chat]);
    expect(toDeliveryChannels(['email', 'email'])).toEqual([DeliveryChannel.Email]);
  });

  it('drops unknown entries but keeps the valid ones', () => {
    expect(toDeliveryChannels(['email', 'fax'])).toEqual([DeliveryChannel.Email]);
  });
});

describe('toEditableChannels', () => {
  it('converts a legacy numeric value', () => {
    expect(toEditableChannels(0)).toEqual([DeliveryChannel.Post]);
  });

  it('falls back to the default for undefined', () => {
    expect(toEditableChannels(undefined)).toEqual([DeliveryChannel.Email, DeliveryChannel.Chat]);
  });

  it('passes a valid array through unchanged', () => {
    expect(toEditableChannels([DeliveryChannel.Post, DeliveryChannel.Chat])).toEqual([DeliveryChannel.Post, DeliveryChannel.Chat]);
  });

  it('passes an empty array through unchanged, unlike toDeliveryChannels', () => {
    expect(toEditableChannels([])).toEqual([]);
  });

  it('passes an array with an unknown entry through unchanged', () => {
    expect(toEditableChannels(['fax'])).toEqual(['fax']);
  });
});
