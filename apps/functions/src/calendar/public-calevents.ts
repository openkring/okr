import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import corsLib from 'cors';

const cors = corsLib({ origin: true });

/**
 * What the public endpoint returns per event — an explicit allow-list. The endpoint is anonymous (no auth, CDN
 * cached), so personal data stored on the event never leaves: no `attendees`, no course `attendance` /
 * `attendanceConfirmedBy` (spec 1.132 — the attendance of minors), no `responsiblePersons`, no invitations.
 * Only scheduling and display fields.
 */
export interface PublicCalEventDoc {
  okey: string;
  name: string;
  description: string;
  type: string;
  startDate: string;
  startTime: string;
  fullDay: boolean;
  durationMinutes: number;
  endDate: string;
  periodicity: string;
  repeatUntilDate: string;
  seriesId: string;
  locationKey: string;
  url: string;
  urlLabel: string;
  state: string;
  cancelMessage: string;
  isArchived: boolean;
  calendars: string[];
  tenants: string[];
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const strArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Projects a stored calevent onto the public allow-list. Pure. */
export function toPublicCalEvent(okey: string, data: Record<string, unknown>): PublicCalEventDoc {
  return {
    okey,
    name: str(data['name']),
    description: str(data['description']),
    type: str(data['type']),
    startDate: str(data['startDate']),
    startTime: str(data['startTime']),
    fullDay: data['fullDay'] === true,
    durationMinutes: typeof data['durationMinutes'] === 'number' ? data['durationMinutes'] : 60,
    endDate: str(data['endDate']),
    periodicity: str(data['periodicity'], 'once'),
    repeatUntilDate: str(data['repeatUntilDate']),
    seriesId: str(data['seriesId']),
    locationKey: str(data['locationKey']),
    url: str(data['url']),
    urlLabel: str(data['urlLabel']),
    state: str(data['state'], 'definitive'),
    cancelMessage: str(data['cancelMessage']),
    isArchived: data['isArchived'] === true,
    calendars: strArray(data['calendars']),
    tenants: strArray(data['tenants']),
  };
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

      const events: PublicCalEventDoc[] = snap.docs
        .filter(doc => {
          const tenants = doc.data()['tenants'];
          return Array.isArray(tenants) && tenants.includes(tenantId);
        })
        .map(doc => toPublicCalEvent(doc.id, doc.data()));

      logger.info('getPublicCalEvents: found events', { tenantId, count: events.length });

      res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
      res.json(events);
    } catch (err) {
      logger.error('getPublicCalEvents: error', { tenantId, err });
      res.status(500).json({ error: 'Failed to fetch public calendar events' });
    }
  })
);
