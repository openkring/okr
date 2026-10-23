import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';

/** One person's star rating of one document (learning rooms, spec 1.115). okey = `${docKey}__${personKey}`. */
export class RatingModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public parentKey = '';   // 'document.<docKey>'
  public personKey = '';
  public stars = 0;        // 1..5
  public updatedAt = '';   // ISO

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const RatingCollection = 'ratings';
export const RatingModelName = 'rating';
