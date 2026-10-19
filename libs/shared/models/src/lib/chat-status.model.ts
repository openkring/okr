export const ChatStatusCollection = 'app-status';
export const ChatStatusDocId = 'chat';

export interface ChatExemption {
  personKey: string;
  name: string;
}

/**
 * Global chat switch (doc app-status/chat). Deliberately not a BaseModel:
 * no okey, no tenants[] — one document for all tenant apps.
 */
export interface ChatStatusModel {
  blocked: boolean;
  message: string;
  blockedAt: string;
  blockedBy: string;
  exempt: ChatExemption[];
  updatedAt: string;
  updatedBy: string;
}

export class ChatBlockedError extends Error {
  constructor(message = 'chat blocked') {
    super(message);
    this.name = 'ChatBlockedError';
  }
}
