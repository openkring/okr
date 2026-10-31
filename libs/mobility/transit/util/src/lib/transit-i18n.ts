import type { Signal } from '@angular/core';

/** Translation keys of the connections view (spec 1.131); the scope mirrors libs/mobility/transit/feature. */
const PFX = '@mobility/transit/feature.';

export const TRANSIT_I18N_KEYS = {
  title: PFX + 'title',
  mode_transit: PFX + 'mode.transit',
  mode_walk: PFX + 'mode.walk',
  mode_bike: PFX + 'mode.bike',
  mode_car: PFX + 'mode.car',
  from: PFX + 'from',
  to: PFX + 'to',
  my_position: PFX + 'myPosition',
  change_source: PFX + 'changeSource',
  anchor_arrive: PFX + 'anchor.arrive',
  anchor_depart: PFX + 'anchor.depart',
  time: PFX + 'time',
  search: PFX + 'search',
  direct: PFX + 'direct',
  transfers_one: PFX + 'transfers.one',
  transfers_many: PFX + 'transfers.many',
  delay: PFX + 'delay',
  late: PFX + 'late',
  cancelled: PFX + 'cancelled',
  walk: PFX + 'leg.walk',
  transfer: PFX + 'leg.transfer',
  platform: PFX + 'leg.platform',
  direction: PFX + 'leg.direction',
  return_from: PFX + 'return.from',
  return_show: PFX + 'return.show',
  return_hide: PFX + 'return.hide',
  outbound: PFX + 'outbound',
  open_maps: PFX + 'maps.open',
  maps_hint: PFX + 'maps.hint',
  open_sbb: PFX + 'sbb.open',
  source: PFX + 'source',
  empty: PFX + 'empty',
  error: PFX + 'error',
  offline: PFX + 'offline',
  position_unavailable: PFX + 'positionUnavailable',
  no_coordinates: PFX + 'noCoordinates',
  abroad: PFX + 'abroad',
} satisfies Record<string, string>;

export type TransitI18n = { [K in keyof typeof TRANSIT_I18N_KEYS]: Signal<string> };

/** Translation keys of the departure board (spec 1.130), in the same scope under `departures.`. */
export const DEPARTURES_I18N_KEYS = {
  title: PFX + 'departures.title',
  in_minutes: PFX + 'departures.inMinutes',
  now: PFX + 'departures.now',
  delay: PFX + 'departures.delay',
  cancelled: PFX + 'departures.cancelled',
  quay_train: PFX + 'departures.quay.train',
  quay_other: PFX + 'departures.quay.other',
  distance: PFX + 'departures.distance',
  as_of: PFX + 'departures.asOf',
  stale: PFX + 'departures.stale',
  disruption: PFX + 'departures.disruption',
  upcoming_show: PFX + 'departures.upcoming.show',
  upcoming_hide: PFX + 'departures.upcoming.hide',
  announced: PFX + 'departures.announced',
  affected: PFX + 'departures.affected',
  empty: PFX + 'departures.empty',
  no_stop: PFX + 'departures.noStop',
  error: PFX + 'departures.error',
  offline: PFX + 'departures.offline',
  no_coordinates: PFX + 'departures.noCoordinates',
  abroad: PFX + 'departures.abroad',
  source: PFX + 'source',
  back: PFX + 'departures.back',
} satisfies Record<string, string>;

export type DeparturesI18n = { [K in keyof typeof DEPARTURES_I18N_KEYS]: Signal<string> };
