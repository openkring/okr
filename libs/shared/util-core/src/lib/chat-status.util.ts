import { ChatBlockedError, ChatExemption, ChatStatusModel } from '@okr/shared-models';

import { convertDateFormatToString, DateFormat } from './date.util';
import { fill } from './text.util';

export function isChatEffectivelyBlocked(status: Partial<ChatStatusModel> | undefined, personKey: string | undefined): boolean {
  if (!status?.blocked) return false;
  if (!personKey) return true;
  return !(status.exempt ?? []).some((e) => e.personKey === personKey);
}

export function addChatExemption(list: ChatExemption[] | undefined, entry: ChatExemption): ChatExemption[] {
  const current = list ?? [];
  if (current.some((e) => e.personKey === entry.personKey)) return [...current];
  return [...current, entry];
}

export function removeChatExemption(list: ChatExemption[] | undefined, personKey: string): ChatExemption[] {
  return (list ?? []).filter((e) => e.personKey !== personKey);
}

/** True for ChatBlockedError, or any error while chat is effectively blocked (e.g. 'Client not initialized' after a live disconnect). */
export function isChatBlockedError(error: unknown, effectivelyBlocked: boolean): boolean {
  return error instanceof ChatBlockedError || effectivelyBlocked;
}

export function chatBlockedMessage(message: string | undefined, fallback: string): string {
  const trimmed = message?.trim();
  return trimmed ? trimmed : fallback;
}

/**
 * The HTML message of the «chat is blocked» alert shown when a user starts a chat action (1.107).
 * Ionic renders AlertOptions.message as HTML (innerHTMLTemplatesEnabled), and the admin's message
 * is free text from Firestore, so it is escaped here; its line breaks become <br>. `extraLine`
 * (e.g. «calls are not possible») follows after a blank line.
 */
export function chatBlockedAlertMessage(message: string | undefined, fallback: string, extraLine?: string): string {
  const escape = (value: string) => value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/\r?\n/g, '<br>');
  const body = escape(chatBlockedMessage(message, fallback));
  return extraLine ? `${body}<br><br>${escape(extraLine)}` : body;
}

/** «gesperrt seit {time}» with blockedAt (StoreDateTime) as d.M.yyyy HH:mm; '' when there is no blockedAt. */
export function chatBlockedSince(blockedAt: string | undefined, template: string): string {
  if (!blockedAt) return '';
  return fill(template, { time: convertDateFormatToString(blockedAt, DateFormat.StoreDateTime, DateFormat.ViewDateTime, false) });
}
