// apps/functions/src/srv/zurich-time.ts
//
// Cloud Functions containers run in UTC — `Date`'s local getters (and anything built on
// `new Date()` without a zone, such as `getTodayStr` from @okr/shared-util-core) produce UTC
// dates. But every StoreDate/StoreDateTime the app writes is Europe/Zurich wall-clock time
// (the client formats it that way, since that's the user's own clock). Any server-side code
// that stamps `now` as a StoreDate/StoreDateTime — a "today" cutoff, a `respondedAt`, a
// comment's `creationDateTime` — must go through Zurich, or it drifts 1–2h from what the app
// would have written, worst between 22:00 and midnight UTC where it is already the next day
// in Zurich.

/** The zone every stored date and time is expressed in. */
export const TIME_ZONE = 'Europe/Zurich';

// en-CA formats as yyyy-mm-dd, which is the StoreDate order without further rearranging.
export const DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
export const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

/** A Date as a StoreDate (yyyyMMdd) in Europe/Zurich wall-clock time. */
export function toStoreDate(d: Date): string {
  return DATE_FMT.format(d).replace(/-/g, '');
}

/** A Date as a StoreDateTime (yyyyMMddHHmmss) in Europe/Zurich wall-clock time. */
export function toStoreDateTime(d: Date): string {
  return toStoreDate(d) + TIME_FMT.format(d).replace(/:/g, '');
}
