import { DEFAULT_DATETIME, DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';

export type ReactionType = 'like';

/**
 * A like on a record (spec 1.113 §3.4), e.g. a travel-journal footprint. The document id is
 * `reactionKey(parentKey, personKey)`, so liking twice is a no-op and unliking is a delete.
 */
export class ReactionModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public parentKey = DEFAULT_KEY; // 'modelType.okey', e.g. 'page.<okey>'
  public personKey = DEFAULT_KEY;
  public type: ReactionType = 'like';
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
