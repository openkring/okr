import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';

/**
 * A pending «remind me about this chat message» (spec 1.104 §5.1). Written by the owner's
 * client, swept every 5 minutes by a Cloud Function. Never archived: `state` carries the
 * lifecycle, and rules forbid delete. Holds no message text — only pointers.
 */
export const ChatReminderCollection = 'chatReminders';
export const ChatReminderModelName = 'chatReminder';

export type ChatReminderState = 'pending' | 'sent' | 'cancelled';

export class ChatReminderModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public personKey = '';          // owner (persons/<key>)
  public dueAt = 0;               // epoch ms
  public state: ChatReminderState = 'pending';
  public notesRoomId = '';        // the owner's Notes room holding the bookmark
  public bookmarkEventId = '';    // the bookmark entry in the Notes room
  public roomId = '';             // room of the original message
  public eventId = '';            // the original message
  public title = '';              // short label shown in the reminder
  public failures?: number;       // retryable sweep failures; Admin SDK only, 12 cancel (never client-written)

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}
