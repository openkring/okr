import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { DocumentCollection, RatingCollection } from '@okr/shared-models';

import { aggregateForDoc, ratingDocKeysToRefresh } from './rating-aggregate';

/**
 * Keeps docs/{docKey}.ratingCount / ratingSum in step with the ratings of that document
 * (spec 1.115 §6). Recomputes from all ratings of the doc (single-field query on parentKey, no
 * composite index) inside a transaction, so a redelivered event writes the same numbers.
 * A missing document is a no-op.
 */
export const onRatingWritten = onDocumentWritten(
  { document: `${RatingCollection}/{id}`, region: 'europe-west6' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    // An update could in theory move a rating to another doc; refresh both.
    const keys = ratingDocKeysToRefresh(before, after);
    if (keys.length === 0) return;

    const db = getFirestore();
    for (const docKey of keys) {
      const docRef = db.collection(DocumentCollection).doc(docKey);
      await db.runTransaction(async (tx) => {
        const docSnap = await tx.get(docRef);
        const ratings = await tx.get(db.collection(RatingCollection).where('parentKey', '==', `document.${docKey}`));
        const agg = aggregateForDoc(docSnap.data(), ratings.docs.map((d) => d.data()));
        if (!agg) {
          logger.info('onRatingWritten: document missing, skipped', { docKey });
          return;
        }
        tx.update(docRef, { ratingCount: agg.count, ratingSum: agg.sum });
      });
    }
  },
);
