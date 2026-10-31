import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';

import { LocationModel } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { Spinner } from '@okr/shared-ui';
import { TransitService } from '@okr/mobility-transit-data-access';
import {
  DEPARTURES_I18N_KEYS, DeparturesRes, departuresStale, inSwitzerland, locationPoint, visibleDepartures, walkMinutes,
} from '@okr/mobility-transit-util';
import { DepartureBoard } from '@okr/mobility-transit-ui';

/** Refresh period of the board and tick of its countdown (spec 1.130 §6.3). */
const POLL_MS = 60_000;
const TICK_MS = 15_000;
/** stops are searched this far around the location (spec §4) */
const NEAR_RADIUS_M = 1000;
/** the callable's maximum: walking time and the limit are applied here, the cache entry stays one per stop */
const FETCH_LIMIT = 20;

interface ResolvedStop { stopRef: string; name: string; distanceM: number }

/**
 * Live departures near a `LocationModel` (spec 1.130 §6.1), with the disruption messages that concern them.
 * Generic: the CMS section, the kiosk page or any other host hands in the location it already has.
 *
 * The stop is the one nearest to the location, unless the host pins a `stopRef`. Departures that leave before
 * you could walk there are hidden. Refreshes every minute while the page is visible; a failed refresh keeps the
 * last answer, which greys out after five minutes. Needs the network: a cold offline start shows a note.
 */
@Component({
  selector: 'okr-transit-departures',
  standalone: true,
  imports: [DepartureBoard, Spinner],
  styles: [`
    :host { display: block; }
    .note { font-size: 0.85rem; color: var(--ion-color-medium); margin: 8px 0; }
  `],
  template: `
    @if (blocker(); as blocker) {
      <p class="note">{{ blocker }}</p>
    } @else if (answer(); as answer) {
      <okr-departure-board
        [stopName]="answer.stopName || stop()?.name || ''"
        [distanceM]="stop()?.distanceM ?? 0"
        [departures]="visible()"
        [situations]="answer.situations"
        [now]="now()"
        [fetchedAt]="answer.fetchedAt"
        [stale]="stale()"
        [attribution]="answer.attribution"
        [i18n]="i18n"
        [size]="size()"
      />
    } @else {
      <okr-spinner />
    }
  `,
})
export class TransitDepartures {
  private readonly transitService = inject(TransitService);
  protected readonly i18n = inject(I18nService).translateAll(DEPARTURES_I18N_KEYS);

  public readonly location = input.required<LocationModel>();
  /** '' ⇒ the stop nearest to the location */
  public readonly stopRef = input('');
  /** the name of a pinned stop, shown until the first answer arrives */
  public readonly stopName = input('');
  /** 1..20 */
  public readonly limit = input(8);
  /** minutes on foot to the stop; undefined or negative ⇒ derived from the distance (a pinned stop: 0) */
  public readonly walkMinutes = input<number | undefined>(undefined);
  public readonly size = input<'compact' | 'large'>('compact');

  protected readonly now = signal(Date.now());
  protected readonly stop = signal<ResolvedStop | undefined>(undefined);
  protected readonly answer = signal<DeparturesRes | undefined>(undefined);
  /** why there is no board: no coordinates, abroad, no stop, offline/error before the first answer */
  private readonly failure = signal('');

  private readonly point = computed(() => locationPoint(this.location()));
  private generation = 0;

  protected readonly blocker = computed(() => {
    const p = this.point();
    if (!p) return this.i18n.no_coordinates();
    if (!inSwitzerland(p)) return this.i18n.abroad();
    return this.answer() ? '' : this.failure();
  });

  private readonly walk = computed(() => {
    const given = this.walkMinutes();
    return given !== undefined && given >= 0 ? given : walkMinutes(this.stop()?.distanceM);
  });
  protected readonly visible = computed(() => visibleDepartures(
    this.answer()?.departures ?? [], this.now(), this.walk(), Math.min(Math.max(this.limit(), 1), FETCH_LIMIT),
  ));
  protected readonly stale = computed(() => departuresStale(this.answer()?.fetchedAt ?? '', this.now()));

  constructor() {
    // a new location or pinned stop starts over: resolve the stop, then load
    effect(() => {
      const p = this.point();
      const pinned = this.stopRef();
      const pinnedName = this.stopName();
      untracked(() => void this.start(p, pinned, pinnedName));
    });

    if (typeof document === 'undefined') return;
    const tick = setInterval(() => this.now.set(Date.now()), TICK_MS);
    const poll = setInterval(() => { if (!document.hidden) void this.refresh(); }, POLL_MS);
    const onVisible = (): void => {
      if (document.hidden) return;
      this.now.set(Date.now());
      void this.refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  private offline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  private async start(p: { lat: number; lng: number } | undefined, pinned: string, pinnedName: string): Promise<void> {
    const gen = ++this.generation;
    this.stop.set(undefined);
    this.answer.set(undefined);
    this.failure.set('');
    if (!p || !inSwitzerland(p)) return;
    const stop = pinned ? { stopRef: pinned, name: pinnedName, distanceM: 0 } : await this.nearestStop(p);
    if (gen !== this.generation) return;
    if (typeof stop === 'string') {
      this.failure.set(stop);
      return;
    }
    this.stop.set(stop);
    await this.refresh();
  }

  /** The stop nearest to the point, or why there is none (a translated message). */
  private async nearestStop(p: { lat: number; lng: number }): Promise<ResolvedStop | string> {
    if (this.offline()) return this.i18n.offline();
    try {
      const res = await this.transitService.searchStops({ near: { ...p, radiusM: NEAR_RADIUS_M }, limit: 1 });
      const nearest = res.stops[0];
      return nearest ? { stopRef: nearest.stopRef, name: nearest.name, distanceM: nearest.distanceM ?? 0 } : this.i18n.no_stop();
    } catch {
      return this.offline() ? this.i18n.offline() : this.i18n.error();
    }
  }

  /** One load; on failure the last answer stays (and greys out once stale). */
  private async refresh(): Promise<void> {
    const stop = this.stop();
    if (!stop) {
      // the stop search itself failed (offline at start, an error): retry it with the next poll; «no stop» is final
      const retry = this.failure() === this.i18n.offline() || this.failure() === this.i18n.error();
      if (retry && this.point()) await this.start(this.point(), this.stopRef(), this.stopName());
      return;
    }
    const gen = this.generation;
    try {
      const res = await this.transitService.departures({ stopRef: stop.stopRef, limit: FETCH_LIMIT });
      if (gen !== this.generation) return;
      this.answer.set(res);
      this.failure.set('');
      this.now.set(Date.now());
    } catch {
      if (gen === this.generation && !this.answer()) this.failure.set(this.offline() ? this.i18n.offline() : this.i18n.error());
    }
  }
}
