import { Component, WritableSignal, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Geolocation } from '@capacitor/geolocation';
import {
  IonButton, IonIcon, IonInput, IonItem, IonLabel, IonSegment, IonSegmentButton, IonSelect, IonSelectOption,
} from '@ionic/angular';

import { LocationModel } from '@okr/shared-models';
import { ModelSelectService } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Spinner } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';
import { TransitService } from '@okr/mobility-transit-data-access';
import {
  LatLng, TRANSIT_I18N_KEYS, TRAVEL_MODES, TransitAnchor, TransitConnection, TravelMode, clockTime, inSwitzerland,
  locationPoint, mapsDirectionsUrl, sbbTimetableUrl,
} from '@okr/mobility-transit-util';
import { ConnectionList } from '@okr/mobility-transit-ui';

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; connections: TransitConnection[]; from: LatLng; to: LatLng; at: string; anchor: TransitAnchor }
  | { kind: 'error'; message: string };

/** `yyyy-MM-ddTHH:mm` on the device clock, the value format of `<input type="datetime-local">`. */
function toLocalInput(iso: string): string {
  const d = new Date(Number.isFinite(Date.parse(iso)) ? iso : Date.now());
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Public-transport connections between two `LocationModel`s (spec 1.131 §3). Generic: it knows nothing about events
 * or pages — hosts hand in the locations they already have. The source defaults to the viewer's current position.
 *
 * Nothing is requested until «Verbindungen suchen» is tapped, so embedding it costs no API call. ÖV is searched in
 * the app; zu Fuss, Velo and Auto hand off to Google Maps (§3.4, §8 q5). Everything the viewer changes here (start,
 * time, mode) lives in this view only and never reaches the host's data.
 */
@Component({
  selector: 'okr-transit-connections',
  standalone: true,
  imports: [
    ConnectionList, Spinner, SvgIconPipe,
    IonSegment, IonSegmentButton, IonLabel, IonItem, IonButton, IonIcon, IonInput, IonSelect, IonSelectOption,
  ],
  styles: [`
    :host { display: block; }
    ion-segment { margin-bottom: 8px; }
    ion-item { --padding-start: 0; --inner-padding-end: 0; }
    .place-label { width: 48px; color: var(--ion-color-medium); font-size: 0.9rem; }
    .when { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .when ion-select { max-width: 150px; }
    .when ion-input { max-width: 220px; }
    .note { font-size: 0.85rem; color: var(--ion-color-medium); margin: 8px 0; }
    .warn { color: var(--ion-color-danger); }
    .return { margin-top: 12px; }
    .credit { font-size: 0.75rem; color: var(--ion-color-medium); margin-top: 8px; }
    .credit a { color: inherit; }
  `],
  template: `
    <ion-segment [value]="mode()" (ionChange)="onMode($event.detail.value)">
      @for (m of modes; track m) {
        <ion-segment-button [value]="m"><ion-label>{{ modeLabel(m) }}</ion-label></ion-segment-button>
      }
    </ion-segment>

    <ion-item lines="none">
      <span class="place-label" slot="start">{{ i18n.from() }}</span>
      <ion-label class="ion-text-wrap">{{ sourceLabel() }}</ion-label>
      <ion-button slot="end" fill="clear" size="small" (click)="changeSource()">{{ i18n.change_source() }}</ion-button>
    </ion-item>
    <ion-item lines="none">
      <span class="place-label" slot="start">{{ i18n.to() }}</span>
      <ion-label class="ion-text-wrap">{{ destination().name }}</ion-label>
    </ion-item>

    @if (blocker(); as blocker) {
      <p class="note">{{ blocker }}</p>
    } @else if (mode() === 'transit') {
      <div class="when">
        <ion-select [value]="anchorSel()" (ionChange)="anchorSel.set($event.detail.value)" interface="popover" [label]="i18n.time()" labelPlacement="stacked">
          <ion-select-option value="arriveBy">{{ i18n.anchor_arrive() }}</ion-select-option>
          <ion-select-option value="departAt">{{ i18n.anchor_depart() }}</ion-select-option>
        </ion-select>
        <ion-input type="datetime-local" [value]="atInput()" (ionChange)="onAt($event.detail.value)" />
        <ion-button (click)="search()" [disabled]="outbound().kind === 'loading'">{{ i18n.search() }}</ion-button>
      </div>

      @switch (outbound().kind) {
        @case ('loading') { <okr-spinner /> }
        @case ('error') { <p class="note warn">{{ errorOf(outbound()) }}</p> }
        @case ('done') {
          @if (doneOf(outbound()); as r) {
            @if (r.connections.length) {
              <okr-connection-list [connections]="r.connections" [i18n]="i18n" [at]="r.at" [anchor]="r.anchor" />
              <ion-button fill="clear" size="small" (click)="openSbb(r)">{{ i18n.open_sbb() }}</ion-button>
            } @else {
              <p class="note">{{ i18n.empty() }}</p>
            }
          }
        }
      }

      @if (allowReturn() && returnAt()) {
        <div class="return">
          <ion-item lines="none">
            <ion-label>{{ returnLabel() }}</ion-label>
            <ion-button slot="end" fill="clear" size="small" (click)="toggleReturn()">
              {{ showReturn() ? i18n.return_hide() : i18n.return_show() }}
            </ion-button>
          </ion-item>
          @if (showReturn()) {
            @switch (inbound().kind) {
              @case ('loading') { <okr-spinner /> }
              @case ('error') { <p class="note warn">{{ errorOf(inbound()) }}</p> }
              @case ('done') {
                @if (doneOf(inbound()); as r) {
                  @if (r.connections.length) {
                    <okr-connection-list [connections]="r.connections" [i18n]="i18n" [at]="r.at" [anchor]="r.anchor" />
                  } @else {
                    <p class="note">{{ i18n.empty() }}</p>
                  }
                }
              }
            }
          }
        </div>
      }

      @if (attribution(); as a) {
        <p class="credit">{{ i18n.source() }} <a [href]="a.url" target="_blank" rel="noopener noreferrer">{{ a.provider }}</a></p>
      }
    } @else {
      <ion-button expand="block" (click)="openMaps()">
        <ion-icon slot="start" src="{{ 'map' | svgIcon }}" />
        {{ i18n.open_maps() }}
      </ion-button>
      <p class="note">{{ i18n.maps_hint() }}</p>
    }
  `,
})
export class TransitConnections {
  private readonly transitService = inject(TransitService);
  private readonly modelSelectService = inject(ModelSelectService);
  protected readonly i18n = inject(I18nService).translateAll(TRANSIT_I18N_KEYS);

  // inputs (spec §3.1)
  public readonly destination = input.required<LocationModel>();
  /** undefined ⇒ the viewer's current position */
  public readonly source = input<LocationModel | undefined>(undefined);
  /** ISO instant the search is anchored on; '' ⇒ now */
  public readonly at = input('');
  public readonly anchor = input<TransitAnchor>('departAt');
  public readonly transportMode = input<TravelMode>('transit');
  public readonly allowReturn = input(false);
  /** earliest departure of the way back (destination → source), e.g. an event's end */
  public readonly returnAt = input('');

  protected readonly modes = TRAVEL_MODES;

  // view state: seeded from the inputs, changed only here
  protected readonly mode = linkedSignal(() => this.transportMode());
  protected readonly sourceSel = linkedSignal<LocationModel | undefined>(() => this.source());
  protected readonly anchorSel = linkedSignal(() => this.anchor());
  protected readonly atSel = linkedSignal(() => this.at() || new Date().toISOString());
  protected readonly atInput = computed(() => toLocalInput(this.atSel()));

  protected readonly outbound = signal<SearchState>({ kind: 'idle' });
  protected readonly inbound = signal<SearchState>({ kind: 'idle' });
  protected readonly showReturn = signal(false);
  protected readonly attribution = signal<{ provider: string; url: string } | undefined>(undefined);

  protected readonly destinationPoint = computed(() => locationPoint(this.destination()));
  protected readonly sourceLabel = computed(() => this.sourceSel()?.name || this.i18n.my_position());
  protected readonly returnLabel = computed(() => fill(this.i18n.return_from(), { time: clockTime(this.returnAt()) }));

  /** Why nothing can be searched or handed off for this destination; '' when all is fine. */
  protected readonly blocker = computed(() => {
    const to = this.destinationPoint();
    if (!to) return this.i18n.no_coordinates();
    if (this.mode() === 'transit' && !inSwitzerland(to)) return this.i18n.abroad();
    return '';
  });

  protected modeLabel(m: TravelMode): string {
    switch (m) {
      case 'transit': return this.i18n.mode_transit();
      case 'walk': return this.i18n.mode_walk();
      case 'bike': return this.i18n.mode_bike();
      case 'car': return this.i18n.mode_car();
    }
  }

  protected onMode(value: unknown): void {
    if (TRAVEL_MODES.includes(value as TravelMode)) this.mode.set(value as TravelMode);
  }

  protected onAt(value: string | number | null | undefined): void {
    const ms = Date.parse(String(value ?? ''));
    if (Number.isFinite(ms)) this.atSel.set(new Date(ms).toISOString());
  }

  protected errorOf(s: SearchState): string {
    return s.kind === 'error' ? s.message : '';
  }

  protected doneOf(s: SearchState): Extract<SearchState, { kind: 'done' }> | undefined {
    return s.kind === 'done' ? s : undefined;
  }

  /** «Start ändern»: a saved location; the choice lives in this view only. */
  protected async changeSource(): Promise<void> {
    const result = await this.modelSelectService.selectLocation('', true, false);
    if (result?.kind === 'predefined') {
      this.sourceSel.set(result.location);
      this.outbound.set({ kind: 'idle' });
      this.inbound.set({ kind: 'idle' });
      this.showReturn.set(false);
    }
  }

  /** The start point: the chosen location, or the device position for this one request (never stored). */
  private async sourcePoint(): Promise<LatLng | string> {
    const chosen = this.sourceSel();
    if (chosen) {
      const p = locationPoint(chosen);
      if (!p) return this.i18n.no_coordinates();
      return inSwitzerland(p) ? p : this.i18n.abroad();
    }
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 });
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      return inSwitzerland(p) ? p : this.i18n.abroad();
    } catch {
      return this.i18n.position_unavailable();
    }
  }

  private offline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  private async run(target: WritableSignal<SearchState>, from: LatLng, to: LatLng, at: string, anchor: TransitAnchor): Promise<void> {
    target.set({ kind: 'loading' });
    try {
      const res = await this.transitService.planTrip({ from, to, at, anchor, limit: 3 });
      this.attribution.set(res.attribution);
      target.set({ kind: 'done', connections: res.connections, from, to, at, anchor });
    } catch {
      target.set({ kind: 'error', message: this.offline() ? this.i18n.offline() : this.i18n.error() });
    }
  }

  protected async search(): Promise<void> {
    const to = this.destinationPoint();
    if (!to) return;
    if (this.offline()) {
      this.outbound.set({ kind: 'error', message: this.i18n.offline() });
      return;
    }
    this.outbound.set({ kind: 'loading' });
    const from = await this.sourcePoint();
    if (typeof from === 'string') {
      this.outbound.set({ kind: 'error', message: from });
      return;
    }
    await this.run(this.outbound, from, to, this.atSel(), this.anchorSel());
    if (this.showReturn()) await this.searchReturn(from);
  }

  protected async toggleReturn(): Promise<void> {
    const show = !this.showReturn();
    this.showReturn.set(show);
    if (show && this.inbound().kind !== 'done') await this.searchReturn();
  }

  /** The way back: destination → start, leaving from `returnAt`. */
  private async searchReturn(known?: LatLng): Promise<void> {
    const back = this.destinationPoint();
    if (!back || !this.returnAt()) return;
    if (this.offline()) {
      this.inbound.set({ kind: 'error', message: this.i18n.offline() });
      return;
    }
    this.inbound.set({ kind: 'loading' });
    const home = known ?? (await this.sourcePoint());
    if (typeof home === 'string') {
      this.inbound.set({ kind: 'error', message: home });
      return;
    }
    await this.run(this.inbound, back, home, this.returnAt(), 'departAt');
  }

  /**
   * Hand-off to the maps app. Synchronous on purpose: Safari blocks `window.open` outside the tap's user gesture.
   * With the current position as start, the origin is left out — the maps app uses its own location.
   */
  protected openMaps(): void {
    const to = this.destinationPoint();
    if (!to) return;
    const chosen = this.sourceSel();
    this.openExternal(mapsDirectionsUrl(chosen ? locationPoint(chosen) : undefined, to, this.mode()));
  }

  protected openSbb(r: Extract<SearchState, { kind: 'done' }>): void {
    this.openExternal(sbbTimetableUrl(
      { label: this.sourceLabel(), point: r.from },
      { label: this.destination().name, point: r.to },
      r.at, r.anchor,
    ));
  }

  private openExternal(url: string): void {
    if (Capacitor.isNativePlatform()) {
      void Browser.open({ url });
      return;
    }
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
  }
}
