import { randomBytes, createHash } from 'node:crypto';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { buildICS } from './index';
import { computeWindow, filterMyFeed, resolveListId, toPartstat } from './feed.util';

const FEEDS = 'calendarFeeds';

interface FeedDoc { uid: string; personKey: string; tenantId: string; createdAt: string }

/** 32 Zeichen Base62 aus 24 Zufallsbytes — serverseitig, damit die Entropie nie am Client hängt. */
function mintToken(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(randomBytes(32), b => alphabet[b % alphabet.length]).join('');
}

/**
 * Liefert das ICS-Abo-Token des Aufrufers und legt es an, falls keins existiert.
 * `{ regenerate: true }` widerruft das alte und gibt ein neues aus — bestehende Abos
 * hören damit sofort auf zu funktionieren.
 */
export const ensureCalendarFeedToken = onCall(
  { cors: true, region: 'europe-west6', enforceAppCheck: true },
  async (request): Promise<{ token: string }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Must be authenticated');

    const db = getFirestore();
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) throw new HttpsError('not-found', 'No user document');
    const user = userSnap.data() as { personKey?: string; tenants?: string[]; isArchived?: boolean };
    if (user.isArchived) throw new HttpsError('permission-denied', 'User is archived');

    const regenerate = (request.data as { regenerate?: boolean } | undefined)?.regenerate === true;

    // Read-then-write must be atomic, or two concurrent `regenerate:true` calls can each read
    // the same `existing` snapshot before either commits and both mint a fresh token — leaving
    // two live tokens for one uid. A transaction closes that race (all reads before all writes).
    const token = await db.runTransaction(async tx => {
      const existing = await tx.get(db.collection(FEEDS).where('uid', '==', uid));

      if (!regenerate && !existing.empty) {
        return existing.docs[0].id;
      }

      for (const doc of existing.docs) tx.delete(doc.ref);
      const fresh = mintToken();
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const doc: FeedDoc = {
        uid,
        personKey: user.personKey ?? '',
        tenantId: user.tenants?.[0] ?? '',
        createdAt: `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
      };
      tx.set(db.collection(FEEDS).doc(fresh), doc);
      return fresh;
    });

    // Nur ein Präfix ins Log — das Token selbst ist der Ausweis.
    logger.info('ensureCalendarFeedToken: issued', { uid, regenerate, tokenPrefix: token.slice(0, 6) });
    return { token };
  }
);

/**
 * Öffentlicher Abo-Endpunkt. Unauthentifiziert im Firebase-Sinn — das Token IST der Ausweis.
 * Jeder Ablehnungsgrund antwortet mit 404, nie mit 403: der Endpunkt darf nicht bestätigen,
 * dass ein Token gültig ist. Nur eine fehlende `token`- oder `calendar`-Query ist 400.
 */
export const calendarFeed = onRequest(
  { region: 'europe-west6' },
  async (req, res) => {
    const token = (req.query['token'] as string)?.trim();
    const rawCalendar = (req.query['calendar'] as string)?.trim();
    if (!token || !rawCalendar) {
      res.status(400).send('Missing required query parameter: token and calendar');
      return;
    }

    const db = getFirestore();
    const feedSnap = await db.collection(FEEDS).doc(token).get();
    if (!feedSnap.exists) { res.status(404).send('Not found'); return; }
    const feed = feedSnap.data() as FeedDoc;

    const userSnap = await db.collection('users').doc(feed.uid).get();
    const user = userSnap.data() as { firstName?: string; lastName?: string; loginEmail?: string; isArchived?: boolean } | undefined;
    if (!userSnap.exists || user?.isArchived) { res.status(404).send('Not found'); return; }

    // Mitgliedschaften → erlaubte Kalender. Wird bei JEDEM Abruf neu aufgelöst, damit ein
    // Mitgliedschaftsentzug ohne Zutun wirkt (es gibt keinen zwischengespeicherten Satz).
    const memberships = await db.collection('memberships')
      .where('memberKey', '==', feed.personKey)
      .where('memberModelType', '==', 'person')
      .where('isArchived', '==', false)
      .get();
    const orgKeys = memberships.docs.map(d => {
      const m = d.data() as { orgKey: string; orgModelType: string };
      return `${m.orgModelType}.${m.orgKey}`;
    });

    const calendarsSnap = await db.collection('calendars')
      .where('isArchived', '==', false)
      .where('tenants', 'array-contains', feed.tenantId)
      .get();
    const calendars = calendarsSnap.docs
      .map(d => ({ okey: d.id, ...(d.data() as { owner?: string; title?: string; name?: string; defaultIsOpen?: boolean }) }));
    const allowedCalendarKeys = calendars.filter(c => orgKeys.includes(c.owner ?? '')).map(c => c.okey);

    const mode: 'my' | 'calendar' = rawCalendar === 'my' ? 'my' : 'calendar';
    const requestedKeys = mode === 'my'
      ? []
      : [...new Set(rawCalendar.split(',').map(k => k.trim()).filter(Boolean))];

    // Zugangsprüfung für den Kalender-Feed: Mitgliedschaft ODER offener Kalender.
    if (mode === 'calendar') {
      const ok = requestedKeys.length > 0 && requestedKeys.every(k => {
        const cal = calendars.find(c => c.okey === k);
        return !!cal && (allowedCalendarKeys.includes(k) || cal.defaultIsOpen === true);
      });
      if (!ok) { res.status(404).send('Not found'); return; }
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const { from, to } = computeWindow(today);

    // Einladungen des Abonnenten — in beiden Feed-Arten, damit PARTSTAT sich gleich verhält.
    const invitationsSnap = await db.collection('invitations')
      .where('inviteeKey', '==', feed.personKey)
      .where('isArchived', '==', false)
      .get();
    const stateByEvent = new Map<string, string>();
    for (const d of invitationsSnap.docs) {
      const inv = d.data() as { caleventKey: string; state: string };
      stateByEvent.set(inv.caleventKey, inv.state);
    }

    const collected = new Map<string, Record<string, unknown>>();
    const add = (id: string, data: Record<string, unknown>) => { if (!collected.has(id)) collected.set(id, { okey: id, ...data }); };

    const base = db.collection('calevents')
      .where('isArchived', '==', false)
      .where('startDate', '>=', from)
      .where('startDate', '<=', to);

    if (mode === 'calendar') {
      const chunks: string[][] = [];
      for (let i = 0; i < requestedKeys.length; i += 30) chunks.push(requestedKeys.slice(i, i + 30));
      for (const chunk of chunks) {
        const snap = await base.where('calendars', 'array-contains-any', chunk).get();
        for (const d of snap.docs) add(d.id, d.data());
      }
    } else {
      if (allowedCalendarKeys.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < allowedCalendarKeys.length; i += 30) chunks.push(allowedCalendarKeys.slice(i, i + 30));
        for (const chunk of chunks) {
          const snap = await base.where('calendars', 'array-contains-any', chunk).get();
          for (const d of snap.docs) add(d.id, d.data());
        }
      }
      // Persönliche Anlässe sind per Definition die ohne Kalender. `responsiblePersons` ist ein
      // Array von Objekten (AvatarInfo[]) — `array-contains` kann nicht auf `.key` matchen. Also
      // Gleichheitsabfrage auf das leere Array, tenant-gescoped; die Organisator-/Eingeladen-Prüfung
      // erledigt `filterMyFeed` danach im Speicher.
      const personalSnap = await base
        .where('calendars', '==', [])
        .where('tenants', 'array-contains', feed.tenantId)
        .get();
      for (const d of personalSnap.docs) add(d.id, d.data());
    }

    let events = [...collected.values()] as never[];
    if (mode === 'my') {
      events = filterMyFeed(events as never, {
        allowedCalendarKeys,
        personKey: feed.personKey,
        invitedEventKeys: [...stateByEvent.keys()],
      }) as never[];
    }

    const calendarName = mode === 'my'
      ? 'Mein Kalender'
      : requestedKeys.map(k => { const c = calendars.find(x => x.okey === k); return c?.title || c?.name || k; }).join(', ');

    const configSnap = await db.collection('app-config').doc(feed.tenantId).get();
    const appDomain = (configSnap.data() as { appDomain?: string } | undefined)?.appDomain ?? '';

    const ics = buildICS(calendarName, events, {
      appOrigin: appDomain ? `https://${appDomain}` : undefined,
      listIdFor: (e) => resolveListId(e as never, mode, requestedKeys),
      attendee: user?.loginEmail
        ? { cn: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(), email: user.loginEmail }
        : undefined,
      partstatFor: (e) => toPartstat(stateByEvent.get((e as { okey: string }).okey)),
    });

    const etag = `"${createHash('sha1').update(ics).digest('hex')}"`;
    res.set('ETag', etag);
    if (req.headers['if-none-match'] === etag) { res.status(304).end(); return; }

    logger.info('calendarFeed: served', { mode, count: events.length, tokenPrefix: token.slice(0, 6) });
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    // `inline`, nicht `attachment` — genau das macht aus dem Download ein Abo.
    res.set('Content-Disposition', 'inline; filename="calendar.ics"');
    // `private`: der Feed ist benutzerspezifisch (PARTSTAT) und darf nie in einem CDN landen.
    res.set('Cache-Control', 'private, max-age=900');
    res.send(ics);
  }
);
