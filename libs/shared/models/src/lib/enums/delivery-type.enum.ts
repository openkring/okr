/**
 * How a document reaches its recipient. Textual values on purpose: the value is stored in
 * `users` documents, written into workflow activity logs and handed to PDF templates —
 * 'post' is readable there and survives a reordering of the enum, `0` does neither.
 */
export enum DeliveryChannel {
  Post = 'post',
  Email = 'email',
  Chat = 'chat',
}

/** What a user gets who never touched the setting: the two electronic ways. */
export const DEFAULT_DELIVERY_CHANNELS: DeliveryChannel[] = [DeliveryChannel.Email, DeliveryChannel.Chat];
