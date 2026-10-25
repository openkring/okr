export interface TrackPoint {
  lat: number;
  lng: number;
  t: number; // ms epoch
  acc?: number;
}

const FACTOR = 1e5;

function encodeValue(v: number, out: string[]): void {
  let n = v < 0 ? -v * 2 - 1 : v * 2;
  while (n >= 0x20) {
    out.push(String.fromCharCode(0x20 + (n % 32) + 63));
    n = Math.floor(n / 32);
  }
  out.push(String.fromCharCode(n + 63));
}

/** Google polyline encoding (1e5) with a third channel: time in whole seconds (first absolute, then deltas). */
export function encodeTrack(points: TrackPoint[]): string {
  const out: string[] = [];
  let pLat = 0;
  let pLng = 0;
  let pT = 0;
  for (const p of points) {
    const lat = Math.round(p.lat * FACTOR);
    const lng = Math.round(p.lng * FACTOR);
    const t = Math.round(p.t / 1000);
    encodeValue(lat - pLat, out);
    encodeValue(lng - pLng, out);
    encodeValue(t - pT, out);
    pLat = lat;
    pLng = lng;
    pT = t;
  }
  return out.join('');
}

export function decodeTrack(encoded: string): TrackPoint[] {
  const values: number[] = [];
  let i = 0;
  while (i < encoded.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(i++) - 63;
      result += (b & 0x1f) * 2 ** shift; // safe beyond 32 bits (epoch seconds)
      shift += 5;
    } while (b >= 0x20 && i < encoded.length);
    values.push(result % 2 === 1 ? -(result + 1) / 2 : result / 2);
  }
  const points: TrackPoint[] = [];
  let lat = 0;
  let lng = 0;
  let t = 0;
  for (let k = 0; k + 2 < values.length; k += 3) {
    lat += values[k];
    lng += values[k + 1];
    t += values[k + 2];
    points.push({ lat: lat / FACTOR, lng: lng / FACTOR, t: t * 1000 });
  }
  return points;
}
