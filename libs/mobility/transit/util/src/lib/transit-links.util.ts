import type { LatLng, TransitAnchor, TravelMode } from './transit-connection.model';

const GOOGLE_TRAVELMODE: Record<TravelMode, string> = {
  transit: 'transit',
  walk: 'walking',
  bike: 'bicycling',
  car: 'driving',
};

/**
 * The route in Google Maps (spec 1.131 §3.4). A universal link: it opens the Google Maps app when
 * installed and the website otherwise — the same URL on every platform.
 *
 * Without `source` (the viewer's current position) the origin is left out, so the maps app uses
 * its own location and the app never needs to ask for it. The time is not passed: the maps URLs
 * do not support it reliably.
 */
export function mapsDirectionsUrl(source: LatLng | undefined, destination: LatLng, mode: TravelMode): string {
  const params = new URLSearchParams({ api: '1' });
  if (source) params.set('origin', `${source.lat},${source.lng}`);
  params.set('destination', `${destination.lat},${destination.lng}`);
  params.set('travelmode', GOOGLE_TRAVELMODE[mode]);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** A HAFAS coordinate stop for sbb.ch: WGS84 degrees × 1'000'000 as integers. */
function sbbStop(label: string, p: LatLng): string {
  const id = `A=2@X=${Math.round(p.lng * 1e6)}@Y=${Math.round(p.lat * 1e6)}`;
  return `${label.replace(/[~_]/g, ' ').trim() || '-'}_I${id}`;
}

/** `HH_MM` and `yyyy-MM-dd` of an instant on the Swiss wall clock. */
function zurichParts(ms: number): { day: string; time: string } {
  const parts: Record<string, string> = {};
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  for (const p of fmt.formatToParts(new Date(ms))) parts[p.type] = p.value;
  return { day: `${parts['year']}-${parts['month']}-${parts['day']}`, time: `${parts['hour']}_${parts['minute']}` };
}

/**
 * The same search in the SBB online timetable (spec 1.131 §8 q4). The format is NOT documented by
 * SBB: it is what the sbb.ch front end reads today (verified 2026-10-31). The documented JSON
 * format of ~2023 already broke once without notice, so the link lives here and nowhere else — a
 * format change is a fix in this function. A broken format shows as an empty SBB form, not as an
 * error. Coordinates are used because names may resolve to the wrong place. sbb.ch has no
 * universal links: the link opens the web timetable, not the SBB Mobile app.
 */
export function sbbTimetableUrl(
  source: { label: string; point: LatLng },
  destination: { label: string; point: LatLng },
  at: string,
  anchor: TransitAnchor,
): string {
  const stops = `${sbbStop(source.label, source.point)}~${sbbStop(destination.label, destination.point)}`;
  const ms = Date.parse(at);
  const { day, time } = zurichParts(Number.isFinite(ms) ? ms : Date.now());
  const params = new URLSearchParams({ stops, day, time, moment: anchor === 'arriveBy' ? 'arr' : 'dep' });
  return `https://www.sbb.ch/de?${params.toString()}`;
}
