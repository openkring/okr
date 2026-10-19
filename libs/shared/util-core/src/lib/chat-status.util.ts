import { ChatBlockedError, ChatExemption, ChatStatusModel } from '@okr/shared-models';

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
