import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { StartPage, type TripModel } from '@okr/shared-models';
import { START_PAGE_URLS } from '@okr/shared-util-core';
import { formatTripTime } from '@okr/trip-util';

import { accountsInTenant, pushToPersons } from '../srv/push';
import { TIME_FMT, toStoreDate } from '../srv/zurich-time';

/*
 * Spec 1.158 — Notfall page on departure. When a Logbuch trip becomes open, crew members who opted in
 * («Notfall-Seite bei Ausfahrt anzeigen», `users/{uid}.emergencyOnDeparture`) get a push to the Notfall page and
 * `activeTripKey` on their user doc, which makes the app open on the Notfall page while the trip is open.
 */

const LOGBUCH_TRIP_TYPE = 'logbuch';
/** A trip that started longer ago than this is a back-fill: nobody is on the water because of it. */
export const DEPARTURE_PAST_WINDOW_MIN = 120;
/** The kiosk may enter a trip a little ahead of the start time. */
export const DEPARTURE_AHEAD_WINDOW_MIN = 60;

type DepartureTrip = Pick<TripModel, 'type' | 'state' | 'isArchived' | 'participants' | 'startDate' | 'startTime'> & {
  deletedAt?: unknown;
};

export interface DepartureActions {
  /** person keys to push to and to set `activeTripKey` for (the handler keeps only the opted-in ones) */
  depart: string[];
  /** person keys whose `activeTripKey` must be cleared, if it still points at this trip */
  clear: string[];
}

/** A Logbuch trip with the boat out ('open' or 'open.rev'), not deleted or archived. Pure. */
function isOpenLogbuch(t: DepartureTrip | undefined): boolean {
  return !!t && t.type === LOGBUCH_TRIP_TYPE && (t.state ?? '').startsWith('open') && !t.deletedAt && !t.isArchived;
}

function crewOf(t: DepartureTrip | undefined): string[] {
  return [...new Set((t?.participants ?? []).map((p) => p.key ?? '').filter((k) => k !== ''))];
}

/** 'HH:mm' or legacy 'HHmm' → minutes after midnight; undefined when unparseable. Pure. */
function toMinutes(time: string | undefined): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(formatTripTime(time ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
}

/**
 * Did the trip start today (Zurich), between DEPARTURE_PAST_WINDOW_MIN ago and DEPARTURE_AHEAD_WINDOW_MIN ahead?
 * A back-filled trip (yesterday, or this morning's outing entered in the evening) is not a departure. Pure.
 */
export function isRecentStart(t: Pick<TripModel, 'startDate' | 'startTime'>, now: Date): boolean {
  if (t.startDate !== toStoreDate(now)) return false;
  const start = toMinutes(t.startTime);
  const current = toMinutes(TIME_FMT.format(now).slice(0, 5));
  if (start === undefined || current === undefined) return false;
  return start >= current - DEPARTURE_PAST_WINDOW_MIN && start <= current + DEPARTURE_AHEAD_WINDOW_MIN;
}

/**
 * What one trips write means for the departure feature (pure, spec 1.158 §2.2/§2.3, D3).
 * - becomes open (create, copy, re-open): the whole crew departs, if the start is recent;
 * - stays open: crew members added by this write depart (recent start), removed ones are cleared;
 * - leaves open (end, auto-close, delete, archive): the whole previous crew is cleared.
 */
export function departureActions(before: DepartureTrip | undefined, after: DepartureTrip | undefined, now: Date): DepartureActions {
  const wasOpen = isOpenLogbuch(before);
  const isOpen = isOpenLogbuch(after);
  const beforeCrew = wasOpen ? crewOf(before) : [];
  const afterCrew = isOpen ? crewOf(after) : [];

  const added = afterCrew.filter((k) => !beforeCrew.includes(k));
  const depart = isOpen && after && isRecentStart(after, now) ? added : [];
  const clear = beforeCrew.filter((k) => !afterCrew.includes(k));
  return { depart, clear };
}

/** The push of §2.2. German, like the other trip pushes; the app name is prefixed by pushToPersons. Pure. */
export function departurePush(trip: Pick<TripModel, 'resource'>): { title: string; body: string; url: string; type: 'departure' } {
  const boat = trip.resource?.name1 ?? '';
  return {
    title: boat ? `Gute Fahrt, ${boat}` : 'Gute Fahrt',
    body: 'Tippe hier für den Notfall-Knopf.',
    url: START_PAGE_URLS[StartPage.Emergency],
    type: 'departure',
  };
}

/**
 * The departure half of onTripWrite. Never throws: errors are logged, the stats work is not affected.
 */
export async function handleDeparture(
  before: TripModel | undefined,
  after: TripModel | undefined,
  tripId: string,
  now: Date = new Date(),
): Promise<void> {
  try {
    const { depart, clear } = departureActions(before, after, now);
    if (depart.length === 0 && clear.length === 0) return;
    const tenantId = (after ?? before)?.tenants?.[0];
    if (!tenantId) return;
    const db = getFirestore();

    if (depart.length > 0 && after) {
      const accounts = await accountsInTenant(depart, tenantId);
      const optedIn: string[] = [];
      for (const account of accounts) {
        const ref = db.collection('users').doc(account.uid);
        const snap = await ref.get();
        if (snap.get('emergencyOnDeparture') !== true) continue;
        await ref.update({ activeTripKey: tripId });
        const personKey = snap.get('personKey') as string | undefined;
        if (personKey) optedIn.push(personKey);
      }
      if (optedIn.length > 0) {
        const r = await pushToPersons(optedIn, { ...departurePush(after), tenantId, channelId: `departure_${tripId}` }, 'onTripWrite');
        logger.info(`onTripWrite: departure push sent=${r.sent} persons=${optedIn.length} trip=${tripId}`);
      }
    }

    if (clear.length > 0) {
      const accounts = await accountsInTenant(clear, tenantId);
      await Promise.all(accounts.map(async (account) => {
        const ref = db.collection('users').doc(account.uid);
        // only when it still points at this trip: the person may have left on another boat since
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (snap.get('activeTripKey') === tripId) tx.update(ref, { activeTripKey: '' });
        });
      }));
    }
  } catch (error) {
    logger.error(`onTripWrite: departure failed trip=${tripId}`, error);
  }
}

/**
 * Nightly safety net (spec 1.158 §4.1): clears every `activeTripKey` whose trip is no longer an open Logbuch trip —
 * for a trigger run that failed. `activeTripKey > ''` is a single-field range query (automatic index).
 */
export async function runDepartureCleanup(): Promise<void> {
  const db = getFirestore();
  const snap = await db.collection('users').where('activeTripKey', '>', '').get();
  if (snap.empty) return;

  const tripOpen = new Map<string, boolean>();
  let cleared = 0;
  for (const doc of snap.docs) {
    const tripKey = doc.get('activeTripKey') as string;
    if (!tripOpen.has(tripKey)) {
      const trip = await db.collection('trips').doc(tripKey).get();
      tripOpen.set(tripKey, trip.exists && isOpenLogbuch(trip.data() as DepartureTrip));
    }
    if (tripOpen.get(tripKey)) continue;
    await doc.ref.update({ activeTripKey: '' });
    cleared++;
  }
  logger.info(`departureCleanup: cleared ${cleared} of ${snap.size} activeTripKey(s)`);
}
