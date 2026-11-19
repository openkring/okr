import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { AvatarInfo } from '@okr/shared-models';
import { getEventLocationName } from '@okr/shared-util-core';
import { setCacheHeaders, storeDateToIso, mapCategory } from '../utils';

export interface CalEventDoc {
  okey: string;
  name: string;
  description: string;
  startDate: string;
  startTime: string;
  type: string;
  locations?: AvatarInfo[];
  url: string;
  isArchived: boolean;
  calendars: string[];
  tenants: string[];
  state?: string; // 'cancelled' = called off; the website shows it struck through with cancelMessage
  cancelMessage?: string;
}

/** The filter of one /calendar request (spec 1.165 EV1). */
export interface CalendarQuery {
  tenantId: string;
  from: string; // StoreDate, inclusive
  to: string; // StoreDate, inclusive; '' = open end
  category?: string;
  calendarKeys: string[]; // [] = every public event; else events in at least one of these calendars
}

const MAX_CALENDAR_KEYS = 20;

/** `?calendar=a,b` → ['a','b']; trimmed, empties dropped, at most 20; a repeated query key (array) is ignored. */
export function parseCalendarKeys(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  return raw.split(',').map(k => k.trim()).filter(k => k.length > 0).slice(0, MAX_CALENDAR_KEYS);
}

/** The tenant's public events of the query, sorted by date then time. Input = the `public` calendar's docs. */
export function selectPublicEvents(docs: CalEventDoc[], q: CalendarQuery): CalEventDoc[] {
  return docs
    .filter(d => Array.isArray(d.tenants) && d.tenants.includes(q.tenantId))
    .filter(d => d.startDate >= q.from && (!q.to || d.startDate <= q.to))
    .filter(d => !q.category || mapCategory(d.type) === q.category)
    .filter(d => q.calendarKeys.length === 0 || (d.calendars ?? []).some(c => q.calendarKeys.includes(c)))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
}

export function docToApiEvent(doc: CalEventDoc) {
  const cancelled = doc.state === 'cancelled';
  return {
    id: doc.okey,
    date: storeDateToIso(doc.startDate),
    time: doc.startTime || undefined,
    topic: { de: doc.name },
    location: getEventLocationName(doc) || undefined,
    category: mapCategory(doc.type),
    description: doc.description ? { de: doc.description } : undefined,
    url: doc.url || undefined,
    calendars: (doc.calendars ?? []).filter(c => c !== 'public'),
    cancelled: cancelled ? (true as const) : undefined,
    cancelMessage: cancelled && doc.cancelMessage ? { de: doc.cancelMessage } : undefined,
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
  const calendarKeys = parseCalendarKeys(req.query['calendar']);
  const limitParam = parseInt(req.query['limit'] as string ?? '100', 10);
  const limit = isNaN(limitParam) || limitParam < 1 ? 100 : Math.min(limitParam, 500);

  try {
    const db = getFirestore();
    const snap = await db.collection('calevents')
      .where('calendars', 'array-contains', 'public')
      .where('isArchived', '==', false)
      .get();

    const all = snap.docs.map(d => ({ okey: d.id, ...d.data() } as CalEventDoc));
    const docs = selectPublicEvents(all, { tenantId, from, to, category, calendarKeys });

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
