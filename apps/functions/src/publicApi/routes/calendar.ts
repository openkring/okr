import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { setCacheHeaders, storeDateToIso, locationName, mapCategory } from '../utils';

interface CalEventDoc {
  bkey: string;
  name: string;
  description: string;
  startDate: string;
  startTime: string;
  type: string;
  locationKey: string;
  url: string;
  isArchived: boolean;
  calendars: string[];
  tenants: string[];
}

function docToApiEvent(doc: CalEventDoc) {
  return {
    id: doc.bkey,
    date: storeDateToIso(doc.startDate),
    time: doc.startTime || undefined,
    topic: { de: doc.name },
    location: locationName(doc.locationKey) || undefined,
    category: mapCategory(doc.type),
    description: doc.description ? { de: doc.description } : undefined,
    url: doc.url || undefined,
  };
}

export async function calendarRouter(req: Request, res: Response): Promise<void> {
  const tenantId = (req.query['tenantId'] as string)?.trim();
  if (!tenantId) {
    res.status(400).json({ error: { code: 'validation_error', message: 'Missing tenantId' } });
    return;
  }

  const from = (req.query['from'] as string)?.replace(/-/g, '') || todayStoreDate();
  const to   = (req.query['to']   as string)?.replace(/-/g, '') || '';
  const category = (req.query['category'] as string)?.trim();
  const limitParam = parseInt(req.query['limit'] as string ?? '100', 10);
  const limit = isNaN(limitParam) || limitParam < 1 ? 100 : Math.min(limitParam, 500);

  try {
    const db = getFirestore();
    const snap = await db.collection('calevents')
      .where('calendars', 'array-contains', 'public')
      .where('isArchived', '==', false)
      .get();

    let docs = snap.docs
      .filter(d => {
        const data = d.data();
        return Array.isArray(data['tenants']) && (data['tenants'] as string[]).includes(tenantId);
      })
      .map(d => ({ bkey: d.id, ...d.data() } as CalEventDoc));

    docs = docs.filter(d => {
      if (d.startDate < from) return false;
      if (to && d.startDate > to) return false;
      return true;
    });

    if (category) {
      docs = docs.filter(d => mapCategory(d.type) === category);
    }

    docs.sort((a, b) => {
      const cmp = a.startDate.localeCompare(b.startDate);
      return cmp !== 0 ? cmp : a.startTime.localeCompare(b.startTime);
    });

    setCacheHeaders(res);
    res.json(docs.slice(0, limit).map(docToApiEvent));
  } catch (err) {
    logger.error('publicApi /calendar error', { tenantId, err });
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to fetch calendar' } });
  }
}

function todayStoreDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
