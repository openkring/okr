import type { LatLng } from './transit-connection.model';

/** Spec 1.162 — where a Von/Nach end comes from. `current` and `home` are private (see `isPrivatePlace`). */
export type TransitPlaceKind = 'current' | 'location' | 'org' | 'home';

export interface TransitPlace {
  kind: TransitPlaceKind;
  /** shown in the picker and the Von/Nach card */
  label: string;
  /** known for 'location'; resolved on selection for 'org' / 'home' (geocode) and 'current' (device) */
  point?: LatLng;
  /** LocationModel okey for 'location' */
  locationKey?: string;
  /** one-line postal address for 'org' / 'home', geocoding input only — never persisted */
  address?: string;
}
