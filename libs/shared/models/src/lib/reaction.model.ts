import { DEFAULT_DATETIME, DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';

export type ReactionType = 'like';

/**
 * A reaction on a record (spec 1.113 §3.4, 1.154 §7). Old travel-journal likes: `type: 'like'` on a footprint, id
 * `reactionKey(parentKey, personKey)`. Since 1.154 an emoji reaction on a journal section or image: `emoji` set, one
 * document per person, emoji and parent (id from `reactionKey` in @okr/travel-journal-util); removing it archives it.
 */
export class ReactionModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public parentKey = DEFAULT_KEY; // 'modelType.okey', e.g. 'page.<okey>'
  public personKey = DEFAULT_KEY;
  public type: ReactionType = 'like'; // kept for old docs; a 1.154 reaction is identified by `emoji`
  public emoji?: string; // the emoji itself, e.g. '❤️' (spec 1.154 §10)
  public createdAt = DEFAULT_DATETIME;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export function reactionKey(parentKey: string, personKey: string): string {
  return `${parentKey}_${personKey}`;
}

export const ReactionCollection = 'reactions';
export const ReactionModelName = 'reaction';
