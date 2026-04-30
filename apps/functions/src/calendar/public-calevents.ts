import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import corsLib from 'cors';

const cors = corsLib({ origin: true });

interface CalEventDoc {
  bkey: string;
  name: string;
  description: string;
  startDate: string;
  startTime: string;
  fullDay: boolean;
  durationMinutes: number;
  endDate: string;
  periodicity: string;
  repeatUntilDate: string;
  locationKey: string;
  url: string;
  isArchived: boolean;
  calendars: string[];
  tenants: string[];
}

/**
 * Public HTTP function returning JSON calendar events for the 'public' calendar.
 * GET /getPublicCalEvents?tenantId=<tenant>
 *
 * Uses admin SDK (bypasses Firestore security rules). Filters by tenantId
 * post-query because Firestore does not allow two array-contains operators.
 * Response is cached for 60 s at the client and 5 min at CDN level.
 */
export const getPublicCalEvents = onRequest(
  { region: 'europe-west6' },
  (req, res) => cors(req, res, async () => {
    const tenantId = (req.query['tenantId'] as string)?.trim();
    if (!tenantId) {
      res.status(400).json({ error: 'Missing required query parameter: tenantId' });
      return;
    }

    logger.info('getPublicCalEvents: request', { tenantId });

    try {
      const db = getFirestore();
      const snap = await db.collection('calevents')
        .where('calendars', 'array-contains', 'public')
        .where('isArchived', '==', false)
        .get();

      const events: CalEventDoc[] = snap.docs
        .filter(doc => {
          const tenants = doc.data()['tenants'];
          return Array.isArray(tenants) && tenants.includes(tenantId);
        })
        .map(doc => ({ bkey: doc.id, ...doc.data() } as CalEventDoc));

      logger.info('getPublicCalEvents: found events', { tenantId, count: events.length });

      res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
      res.json(events);
    } catch (err) {
      logger.error('getPublicCalEvents: error', { tenantId, err });
      res.status(500).json({ error: 'Failed to fetch public calendar events' });
    }
  })
);
