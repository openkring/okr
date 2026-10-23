import { Injectable, inject } from '@angular/core';

import { isValidRating } from '@okr/content-learning-util';
import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { RatingCollection, RatingModel } from '@okr/shared-models';

import { ratingData, ratingId } from './learning-request';

/** One star rating per person and document (rules: own rating only; aggregate maintained by a trigger). */
@Injectable({ providedIn: 'root' })
export class RatingService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  /** The caller's stars for a document, or undefined when not rated (or unreadable). */
  public async mine(docKey: string, personKey: string): Promise<number | undefined> {
    const rating = await this.firestoreService.readModelOnce<RatingModel & { isArchived: boolean }>(
      RatingCollection, ratingId(docKey, personKey));
    if (!rating || rating.isArchived === true || !isValidRating(rating.stars)) return undefined;
    return rating.stars;
  }

  /** Writes exactly the whitelisted fields (createObject → setDoc: create or overwrite). */
  public async rate(docKey: string, personKey: string, stars: number): Promise<void> {
    if (!isValidRating(stars)) throw new Error('A rating is an integer from 1 to 5.');
    const id = await this.firestoreService.createObject(
      RatingCollection, ratingId(docKey, personKey), ratingData(this.env.tenantId, docKey, personKey, stars, new Date()));
    if (!id) throw new Error('The rating could not be saved.');
  }

  /**
   * Removes the rating. A real delete: the rules only admit stars 1..5 on update, so "archive" is
   * not expressible, and the trigger recomputes the aggregate on delete.
   */
  public async clear(docKey: string, personKey: string): Promise<void> {
    const id = await this.firestoreService.deleteObject(RatingCollection, ratingId(docKey, personKey));
    if (!id) throw new Error('The rating could not be removed.');
  }
}
