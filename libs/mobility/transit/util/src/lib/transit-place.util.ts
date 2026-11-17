import type { ConnectionsConfig, LocationModel } from '@okr/shared-models';

import { locationPoint } from './transit-connection.util';
import type { TransitPlace } from './transit-place.model';

/** Private places (device position, home address) never leave the device as a label or a link. */
export function isPrivatePlace(p: TransitPlace): boolean {
  return p.kind === 'current' || p.kind === 'home';
}

export function placeFromLocation(loc: LocationModel): TransitPlace {
  const place: TransitPlace = { kind: 'location', label: loc.name, locationKey: loc.okey };
  const point = locationPoint(loc);
  if (point) place.point = point;
  return place;
}

/** One-line postal address, e.g. «Seestrasse 1, 8712 Stäfa, CH»; '' when street or city is empty. */
export function postalLine(e: { streetName: string; streetNumber: string; zipCode: string; city: string; countryCode: string }): string {
  const street = e.streetName?.trim();
  const city = e.city?.trim();
  if (!street || !city) return '';
  return [
    [street, e.streetNumber?.trim()].filter(Boolean).join(' '),
    [e.zipCode?.trim(), city].filter(Boolean).join(' '),
    e.countryCode?.trim(),
  ].filter(Boolean).join(', ');
}

/** The favourites at the top of the Von/Nach picker: org, home, then pinned locations in key order. */
export function favoritePlaces(input: {
  cfg: ConnectionsConfig;
  org?: { name: string; address: string };
  home?: string;
  pinned: LocationModel[];
  homeLabel: string;
}): TransitPlace[] {
  const { cfg, org, home, pinned, homeLabel } = input;
  const out: TransitPlace[] = [];
  if (cfg.favoriteDefaultOrg && org?.address) out.push({ kind: 'org', label: org.name, address: org.address });
  if (cfg.favoriteHomeAddress && home) out.push({ kind: 'home', label: homeLabel, address: home });
  for (const key of cfg.favoriteLocationKeys ?? []) {
    const loc = pinned.find((l) => l.okey === key);
    if (loc) out.push(placeFromLocation(loc));
  }
  return out;
}

/** The label for events and links: the generic label for private places, never their address. */
export function eventPlaceLabel(p: TransitPlace, labels: { current: string; home: string }): string {
  if (p.kind === 'current') return labels.current;
  if (p.kind === 'home') return labels.home;
  return p.label;
}

/**
 * The label of a place in the sbb.ch link (spec 1.162 §5.5): a private place (position, home address) goes out only as
 * the neutral «Start» (Von) or «Ziel» (Nach), never as «Meine Adresse» / «Aktueller Standort» or its address.
 */
export function sbbPlaceLabel(p: TransitPlace, role: 'from' | 'to', labels: { start: string; end: string }): string {
  if (isPrivatePlace(p)) return role === 'from' ? labels.start : labels.end;
  return p.label;
}
