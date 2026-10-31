import { DestroyRef, effect, inject, Signal, signal, untracked } from '@angular/core';

import type { MapView, RouteBaseLayer } from '@okr/shared-ui';
import type { BaseLayerOption, Bbox, JournalI18n } from '@okr/travel-journal-util';

/** The copyright is fetched this long after the last pan or zoom (carried decision 2). */
const ATTRIBUTION_DEBOUNCE_MS = 400;

type GoogleType = NonNullable<BaseLayerOption['googleType']>;

/** The i18n label of each base-layer option (phase 4 design §2). */
const LABEL_OF: Record<BaseLayerOption['id'], keyof JournalI18n> = {
  'google-roadmap': 'layer_google_roadmap',
  'google-satellite': 'layer_google_satellite',
  'swisstopo-live': 'layer_swisstopo_live',
  'offline-osm': 'layer_offline_osm',
  'offline-satellite': 'layer_offline_satellite',
  'offline-swisstopo': 'layer_offline_swisstopo',
  world: 'layer_world',
};

/** The options as the route map's `baseLayers`, labelled (read in a computed: the labels are signals). */
export function routeBaseLayers(options: BaseLayerOption[], i18n: JournalI18n): RouteBaseLayer[] {
  return options.map((o) => ({
    id: o.id, label: i18n[LABEL_OF[o.id]](), sources: o.sources, ...(o.googleType ? { googleType: o.googleType } : {}),
  }));
}

/**
 * The viewport copyright of the selected Google layer (design §1), for the route map's `googleAttribution`. Fetched at
 * once when a Google option becomes selected, then 400 ms after the last pan or zoom while it stays selected; cleared
 * when the selection leaves Google. Call in an injection context.
 */
export function googleAttributionOf(
  googleType: Signal<GoogleType | undefined>,
  view: Signal<MapView | undefined>,
  fetch: (view: Bbox, zoom: number, type: GoogleType) => Promise<string>,
): Signal<string> {
  const attribution = signal('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let run = 0;
  let fetchedType: GoogleType | undefined; // the type of the last fetch: a new type fetches without the debounce
  const cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const load = (type: GoogleType, current: MapView): void => {
    const id = ++run;
    fetchedType = type;
    void fetch(current.bounds, current.zoom, type).then(
      (copyright) => { if (id === run) attribution.set(copyright); },
      () => undefined, // keeps the last copyright; the next pan tries again
    );
  };

  effect(() => {
    const type = googleType();
    const current = view();
    untracked(() => {
      cancel();
      if (!type) {
        run++; // a response still on its way must not bring the copyright back
        fetchedType = undefined;
        attribution.set('');
        return;
      }
      if (!current) return; // the map reports its first view right after it is drawn
      if (type !== fetchedType) {
        attribution.set('');
        load(type, current);
      } else {
        timer = setTimeout(() => load(type, current), ATTRIBUTION_DEBOUNCE_MS);
      }
    });
  });
  inject(DestroyRef).onDestroy(() => {
    cancel();
    run++;
  });
  return attribution;
}
