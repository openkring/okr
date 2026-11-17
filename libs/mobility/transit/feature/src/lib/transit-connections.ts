import { Component, WritableSignal, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Geolocation } from '@capacitor/geolocation';
import {
  AlertController, IonButton, IonDatetime, IonDatetimeButton, IonIcon, IonItem, IonLabel, IonModal, IonSegment,
  IonSegmentButton, ModalController, ToastController,
} from '@ionic/angular';
import { catchError, firstValueFrom, of, take } from 'rxjs';

import { ConnectionsConfig, LocationModel } from '@okr/shared-models';
import { AppStore, CalendarSelectModal } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Spinner } from '@okr/shared-ui';
import { okrPrompt, showToast } from '@okr/shared-util-angular';
import { fill, getAvatarInfoForCurrentUser, isOngoing } from '@okr/shared-util-core';
import { CalEventService } from '@okr/calendar-calevent-data-access';
import { LocationService } from '@okr/location-data-access';
import { MembershipService } from '@okr/relationship-membership-data-access';
import { TransitPlaceService, TransitService } from '@okr/mobility-transit-data-access';
import {
  LatLng, TIMETABLE_PAGE_SIZE, TRANSIT_I18N_KEYS, TRAVEL_MODES, TransitAnchor, TransitConnection, TransitPlace,
  TravelMode, clockTime, connectionToCalevent, earlierAt, eventPlaceLabel, inSwitzerland, isPrivatePlace, laterAt,
  mapsDirectionsUrl, mergeConnections, placeFromLocation, sbbPlaceLabel, sbbTimetableUrl, zurichLocalInput, zurichLocalToIso,
} from '@okr/mobility-transit-util';
import { ConnectionList } from '@okr/mobility-transit-ui';

import { TransitPlaceSelectModal } from './transit-place-select.modal';

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; at: string; anchor: TransitAnchor }
  | { kind: 'error'; message: string };

/** the way back keeps its own (unpaged) result list */
type ReturnState = Exclude<SearchState, { kind: 'done' }> | { kind: 'done'; connections: TransitConnection[]; at: string; anchor: TransitAnchor };

/** debounce of the automatic search after Von, Nach, time or anchor changed */
const SEARCH_DELAY_MS = 400;

let datetimeSeq = 0;

/**
 * «Fahrplan» (spec 1.162 §5.2): an SBB-style timetable between two places. Generic: hosts hand in the locations they
 * already have, and the viewer changes Von, Nach, date/time and Ab/An here only — nothing reaches the host's data.
 *
 * The search runs by itself, debounced, once Von and Nach are both set; nothing is requested while either is empty.
 * ÖV is searched in the app; zu Fuss, Velo and Auto hand off to Google Maps (1.131 §3.4).
 *
 * Privacy (§6): the device position and the home address are resolved for one request and held in this view only.
 * Calendar events, titles and links name them only by their generic labels.
 */
@Component({
  selector: 'okr-transit-connections',
  standalone: true,
  imports: [
    ConnectionList, Spinner, SvgIconPipe,
    IonSegment, IonSegmentButton, IonLabel, IonItem, IonButton, IonIcon, IonDatetime, IonDatetimeButton, IonModal,
  ],
  styles: [`
    :host { display: block; }
    .mode { margin-bottom: 8px; }
    .places {
      display: flex; align-items: center; gap: 4px; margin-bottom: 8px;
      border: 1px solid var(--ion-color-step-150, var(--ion-color-light-shade, #d7d8da)); border-radius: 8px;
    }
    .places .rows { flex: 1; min-width: 0; }
    .places ion-item { --background: transparent; --min-height: 44px; }
    .place-label { width: 48px; color: var(--ion-color-medium); font-size: 0.9rem; }
    .placeholder { color: var(--ion-color-medium); }
    .swap ion-icon { transform: rotate(90deg); }
    .when { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: flex-end; margin-bottom: 8px; }
    .when .date { display: flex; flex-direction: column; gap: 4px; }
    .when .caption { font-size: 0.8rem; color: var(--ion-color-medium); }
    .when ion-segment { width: auto; min-width: 120px; }
    .note { font-size: 0.85rem; color: var(--ion-color-medium); margin: 8px 0; }
    .warn { color: var(--ion-color-danger); }
    .return { margin-top: 12px; }
    .credit { font-size: 0.75rem; color: var(--ion-color-medium); margin-top: 8px; }
    .credit a { color: inherit; }
  `],
  template: `
    <ion-segment class="mode" [value]="mode()" (ionChange)="onMode($event.detail.value)">
      @for (m of modes; track m) {
        <ion-segment-button [value]="m"><ion-label>{{ modeLabel(m) }}</ion-label></ion-segment-button>
      }
    </ion-segment>

    <div class="places">
      <div class="rows">
        <ion-item button="true" [detail]="false" lines="full" (click)="pick('from')">
          <span class="place-label" slot="start">{{ i18n.from() }}</span>
          @if (fromSel(); as from) {
            <ion-label class="ion-text-wrap">{{ placeText(from) }}</ion-label>
          } @else {
            <ion-label class="ion-text-wrap placeholder">{{ i18n.pick_from() }}</ion-label>
          }
        </ion-item>
        <ion-item button="true" [detail]="false" lines="none" (click)="pick('to')">
          <span class="place-label" slot="start">{{ i18n.to() }}</span>
          @if (toSel(); as to) {
            <ion-label class="ion-text-wrap">{{ placeText(to) }}</ion-label>
          } @else {
            <ion-label class="ion-text-wrap placeholder">{{ i18n.pick_to() }}</ion-label>
          }
        </ion-item>
      </div>
      <ion-button class="swap" fill="clear" [attr.aria-label]="i18n.swap()" [disabled]="!fromSel() && !toSel()" (click)="swap()">
        <ion-icon slot="icon-only" src="{{ 'swap-horizontal' | svgIcon }}" />
      </ion-button>
    </div>

    @if (mode() === 'transit') {
      <div class="when">
        <div class="date">
          <span class="caption">{{ i18n.date() }}</span>
          <ion-datetime-button [datetime]="datetimeId" />
        </div>
        <ion-segment [value]="anchorSel()" (ionChange)="onAnchor($event.detail.value)">
          <ion-segment-button value="departAt"><ion-label>{{ i18n.anchor_dep_short() }}</ion-label></ion-segment-button>
          <ion-segment-button value="arriveBy"><ion-label>{{ i18n.anchor_arr_short() }}</ion-label></ion-segment-button>
        </ion-segment>
      </div>
      <ion-modal [keepContentsMounted]="true">
        <ng-template>
          <ion-datetime [id]="datetimeId" presentation="date-time" [preferWheel]="false" [hourCycle]="'h23'"
            [firstDayOfWeek]="1" [locale]="locale" [showDefaultButtons]="true" [doneText]="i18n.ok()" [cancelText]="i18n.cancel()"
            [value]="atInput()" (ionChange)="onAt($event.detail.value)" />
        </ng-template>
      </ion-modal>

      @if (!fromSel() || !toSel()) {
        <p class="note">{{ i18n.choose_both() }}</p>
      } @else {
        @switch (outbound().kind) {
          @case ('loading') { <okr-spinner /> }
          @case ('error') { <p class="note warn">{{ errorOf(outbound()) }}</p> }
          @case ('done') {
            @if (doneOf(outbound()); as r) {
              @if (connections().length) {
                <okr-connection-list [connections]="connections()" [i18n]="i18n" [at]="r.at" [anchor]="r.anchor" [lang]="lang"
                  [paging]="true" [loadingEarlier]="loadingEarlier()" [loadingLater]="loadingLater()"
                  [canAddToCalendar]="canAddToCalendar()" [(expandedKey)]="expandedKey"
                  (earlier)="page('earlier')" (later)="page('later')"
                  (addToCalendar)="addToCalendar($event)" (openSbb)="openSbb($event)" />
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
                  @if (returnDoneOf(inbound()); as r) {
                    @if (r.connections.length) {
                      <okr-connection-list [connections]="r.connections" [i18n]="i18n" [at]="r.at" [anchor]="r.anchor" [lang]="lang"
                        (openSbb)="openSbbReturn($event)" />
                    } @else {
                      <p class="note">{{ i18n.empty() }}</p>
                    }
                  }
                }
              }
            }
          </div>
        }
      }

      @if (attribution(); as a) {
        <p class="credit">{{ i18n.source() }} <a [href]="a.url" target="_blank" rel="noopener noreferrer">{{ a.provider }}</a></p>
      }
    } @else {
      @if (!toSel()) {
        <p class="note">{{ i18n.pick_to() }}</p>
      } @else if (toSel()?.kind === 'current') {
        <p class="note">{{ i18n.current_as_destination() }}</p>
      } @else if (!toSel()?.point) {
        <p class="note">{{ i18n.no_coordinates() }}</p>
      } @else {
        <ion-button expand="block" (click)="openMaps()">
          <ion-icon slot="start" src="{{ 'map' | svgIcon }}" />
          {{ i18n.open_maps() }}
        </ion-button>
        <p class="note">{{ i18n.maps_hint() }}</p>
      }
    }
  `,
})
export class TransitConnections {
  private readonly transitService = inject(TransitService);
  private readonly placeService = inject(TransitPlaceService);
  private readonly locationService = inject(LocationService);
  private readonly membershipService = inject(MembershipService);
  private readonly calEventService = inject(CalEventService);
  private readonly appStore = inject(AppStore);
  private readonly modalController = inject(ModalController);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly i18nService = inject(I18nService);
  protected readonly i18n = this.i18nService.translateAll(TRANSIT_I18N_KEYS);
  /** language of the day headers and the date/time control */
  protected readonly lang = this.i18nService.getActiveLang() || 'de';
  protected readonly locale = `${this.lang}-CH`;
  protected readonly datetimeId = `okr-transit-datetime-${++datetimeSeq}`;

  // inputs (spec 1.131 §3.1, 1.162 §5.6)
  /** Nach; undefined ⇒ the viewer picks it */
  public readonly destination = input<LocationModel | undefined>(undefined);
  /** Von; undefined ⇒ the viewer's current position */
  public readonly source = input<LocationModel | undefined>(undefined);
  /** ISO instant the search is anchored on; '' ⇒ now */
  public readonly at = input('');
  public readonly anchor = input<TransitAnchor>('departAt');
  public readonly transportMode = input<TravelMode>('transit');
  public readonly allowReturn = input(false);
  /** earliest departure of the way back (Nach → Von), e.g. an event's end */
  public readonly returnAt = input('');
  /**
   * the section's favourites config; the favourites (default org, the viewer's home address, pinned locations) are read
   * only when the viewer opens the Von/Nach picker. undefined ⇒ no favourites (the event view).
   */
  public readonly favoritesConfig = input<ConnectionsConfig | undefined>(undefined);
  /** offers «In Kalender eintragen» on an expanded connection (signed-in viewers only) */
  public readonly allowAddToCalendar = input(false);

  protected readonly modes = TRAVEL_MODES;

  // view state: seeded from the inputs, changed only here
  protected readonly mode = linkedSignal(() => this.transportMode());
  protected readonly fromSel = linkedSignal<TransitPlace | undefined>(() => {
    const source = this.source();
    return source ? placeFromLocation(source) : { kind: 'current', label: '' };
  });
  protected readonly toSel = linkedSignal<TransitPlace | undefined>(() => {
    const destination = this.destination();
    return destination ? placeFromLocation(destination) : undefined;
  });
  protected readonly anchorSel = linkedSignal(() => this.anchor());
  protected readonly atSel = linkedSignal(() => this.at() || new Date().toISOString());
  protected readonly atInput = computed(() => zurichLocalInput(this.atSel()));

  protected readonly outbound = signal<SearchState>({ kind: 'idle' });
  protected readonly connections = signal<TransitConnection[]>([]);
  protected readonly expandedKey = signal('');
  protected readonly loadingEarlier = signal(false);
  protected readonly loadingLater = signal(false);
  /** the points of the last search, for paging and the sbb.ch link; held here only, never stored */
  private readonly points = signal<{ from: LatLng; to: LatLng } | undefined>(undefined);
  protected readonly inbound = signal<ReturnState>({ kind: 'idle' });
  protected readonly showReturn = signal(false);
  protected readonly attribution = signal<{ provider: string; url: string } | undefined>(undefined);

  protected readonly canAddToCalendar = computed(() => this.allowAddToCalendar() && !!this.appStore.currentUser());
  protected readonly returnLabel = computed(() => fill(this.i18n.return_from(), { time: clockTime(this.returnAt()) }));

  /** geocoded favourites of this session (org / home address), keyed by kind and label; never stored */
  private readonly geocoded = new Map<string, LatLng>();
  /** incremented by every change of Von, Nach, time, anchor or mode; a response of an older request is dropped */
  private requestId = 0;

  constructor() {
    effect((onCleanup) => {
      const from = this.fromSel();
      const to = this.toSel();
      const at = this.atSel();
      const anchor = this.anchorSel();
      const mode = this.mode();
      const id = untracked(() => this.reset());
      if (mode !== 'transit' || !from || !to) return;
      const timer = setTimeout(() => void this.search(id, from, to, at, anchor), SEARCH_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected modeLabel(m: TravelMode): string {
    switch (m) {
      case 'transit': return this.i18n.mode_transit();
      case 'walk': return this.i18n.mode_walk();
      case 'bike': return this.i18n.mode_bike();
      case 'car': return this.i18n.mode_car();
    }
  }

  protected placeText(p: TransitPlace): string {
    return p.kind === 'current' ? this.i18n.my_position() : p.label;
  }

  protected onMode(value: unknown): void {
    if (TRAVEL_MODES.includes(value as TravelMode)) this.mode.set(value as TravelMode);
  }

  protected onAnchor(value: unknown): void {
    if (value === 'departAt' || value === 'arriveBy') this.anchorSel.set(value);
  }

  protected onAt(value: string | string[] | null | undefined): void {
    const iso = zurichLocalToIso(Array.isArray(value) ? value[0] : value);
    if (iso && iso !== this.atSel()) this.atSel.set(iso);
  }

  protected swap(): void {
    const from = this.fromSel();
    this.fromSel.set(this.toSel());
    this.toSel.set(from);
  }

  protected errorOf(s: SearchState | ReturnState): string {
    return s.kind === 'error' ? s.message : '';
  }

  protected doneOf(s: SearchState): Extract<SearchState, { kind: 'done' }> | undefined {
    return s.kind === 'done' ? s : undefined;
  }

  protected returnDoneOf(s: ReturnState): Extract<ReturnState, { kind: 'done' }> | undefined {
    return s.kind === 'done' ? s : undefined;
  }

  /** Von/Nach picker (§5.3). A postal favourite is geocoded on this tap only; a failed geocode keeps the old choice. */
  protected async pick(which: 'from' | 'to'): Promise<void> {
    const [locations, favorites] = await Promise.all([
      firstValueFrom(this.locationService.list(undefined, 'name').pipe(take(1), catchError(() => of([] as LocationModel[])))),
      this.readFavorites(),
    ]);
    const modal = await this.modalController.create({
      component: TransitPlaceSelectModal,
      componentProps: {
        favorites,
        locations,
        title: which === 'from' ? this.i18n.pick_from() : this.i18n.pick_to(),
        i18n: { current: this.i18n.my_position, favorites: this.i18n.favorites, locations: this.i18n.locations },
      },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<TransitPlace>();
    if (role !== 'confirm' || !data) return;

    const slot = which === 'from' ? this.fromSel : this.toSel;
    const before = slot();
    let place = data;
    if ((place.kind === 'org' || place.kind === 'home') && !place.point) {
      const cacheKey = `${place.kind}|${place.label}`;
      const point = this.geocoded.get(cacheKey) ?? (await this.placeService.resolvePoint(place));
      // a swap or another pick while geocoding wins: this answer is no longer wanted
      if (slot() !== before) return;
      if (!point) {
        await showToast(this.toastController, this.i18n.geocode_failed());
        return;
      }
      this.geocoded.set(cacheKey, point);
      place = { ...place, point };
    }
    slot.set(place);
  }

  /** The picker's favourites; read on each picker open only, never before the viewer interacts. */
  private async readFavorites(): Promise<TransitPlace[]> {
    const cfg = this.favoritesConfig();
    if (!cfg) return [];
    const org = this.appStore.defaultOrg();
    const personKey = this.appStore.currentUser()?.personKey;
    const args: Parameters<TransitPlaceService['favorites']>[0] = { cfg, homeLabel: this.i18n.home() };
    if (org) args.defaultOrg = { okey: org.okey, name: org.name };
    if (personKey) args.personKey = personKey;
    return firstValueFrom(this.placeService.favorites(args).pipe(take(1), catchError(() => of([] as TransitPlace[]))));
  }

  /** Starts a new search generation: clears results, paging and the expanded row; returns the new request id. */
  private reset(): number {
    this.requestId++;
    this.outbound.set({ kind: 'idle' });
    this.connections.set([]);
    this.expandedKey.set('');
    this.loadingEarlier.set(false);
    this.loadingLater.set(false);
    this.points.set(undefined);
    this.inbound.set({ kind: 'idle' });
    return this.requestId;
  }

  /** The coordinates of a place, or the message why there are none. The device position is asked for this request only. */
  private async pointOf(p: TransitPlace): Promise<LatLng | string> {
    let point: LatLng | undefined;
    if (p.kind === 'current') {
      try {
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 });
        point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      } catch {
        return this.i18n.position_unavailable();
      }
    } else {
      point = p.point ?? (await this.placeService.resolvePoint(p));
      if (!point) return p.kind === 'location' ? this.i18n.no_coordinates() : this.i18n.geocode_failed();
    }
    return inSwitzerland(point) ? point : this.i18n.abroad();
  }

  private offline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  private failure(): string {
    return this.offline() ? this.i18n.offline() : this.i18n.error();
  }

  private async search(id: number, from: TransitPlace, to: TransitPlace, at: string, anchor: TransitAnchor): Promise<void> {
    if (this.offline()) {
      this.outbound.set({ kind: 'error', message: this.i18n.offline() });
      return;
    }
    this.outbound.set({ kind: 'loading' });
    const [fromPt, toPt] = await Promise.all([this.pointOf(from), this.pointOf(to)]);
    if (id !== this.requestId) return;
    if (typeof fromPt === 'string' || typeof toPt === 'string') {
      this.outbound.set({ kind: 'error', message: typeof fromPt === 'string' ? fromPt : (toPt as string) });
      return;
    }
    try {
      const res = await this.transitService.planTrip({ from: fromPt, to: toPt, at, anchor, limit: TIMETABLE_PAGE_SIZE });
      if (id !== this.requestId) return;
      this.attribution.set(res.attribution);
      this.points.set({ from: fromPt, to: toPt });
      this.connections.set(mergeConnections([], res.connections));
      this.outbound.set({ kind: 'done', at, anchor });
    } catch {
      if (id !== this.requestId) return;
      this.outbound.set({ kind: 'error', message: this.failure() });
      return;
    }
    if (this.showReturn()) await this.searchReturn(id);
  }

  /**
   * «Frühere / Spätere Verbindungen»: one more page. Earlier arrives by the first arrival − 1 min
   * (arriveBy, ruling R21); later departs at the last departure + 1 min (departAt).
   */
  protected async page(dir: 'earlier' | 'later'): Promise<void> {
    const pts = this.points();
    const earlier = dir === 'earlier';
    const at = earlier ? earlierAt(this.connections()) : laterAt(this.connections());
    const busy = earlier ? this.loadingEarlier : this.loadingLater;
    if (!pts || !at || busy()) return;
    const id = this.requestId;
    busy.set(true);
    try {
      const anchor = earlier ? 'arriveBy' : 'departAt';
      const res = await this.transitService.planTrip({ from: pts.from, to: pts.to, at, anchor, limit: TIMETABLE_PAGE_SIZE });
      if (id !== this.requestId) return;
      this.connections.update((cs) => mergeConnections(cs, res.connections));
    } catch {
      if (id === this.requestId) await showToast(this.toastController, this.failure());
    } finally {
      if (id === this.requestId) busy.set(false);
    }
  }

  protected async toggleReturn(): Promise<void> {
    const show = !this.showReturn();
    this.showReturn.set(show);
    // while the outbound search is pending or running, it starts the way back itself once its points are known
    if (show && this.points()) await this.searchReturn(this.requestId);
    else if (show && this.outbound().kind === 'error') await this.searchReturn(this.requestId);
  }

  /** The way back: Nach → Von, leaving from `returnAt`. */
  private async searchReturn(id: number): Promise<void> {
    const from = this.fromSel();
    const to = this.toSel();
    if (!from || !to || !this.returnAt()) return;
    // one way-back search at a time
    const state = this.inbound().kind;
    if (state === 'loading' || state === 'done') return;
    if (this.offline()) {
      this.inbound.set({ kind: 'error', message: this.i18n.offline() });
      return;
    }
    this.inbound.set({ kind: 'loading' });
    const known = this.points();
    const back = known?.to ?? (await this.pointOf(to));
    const home = known?.from ?? (await this.pointOf(from));
    if (id !== this.requestId) return;
    if (typeof back === 'string' || typeof home === 'string') {
      this.inbound.set({ kind: 'error', message: typeof back === 'string' ? back : (home as string) });
      return;
    }
    await this.run(id, this.inbound, back, home, this.returnAt(), 'departAt');
  }

  private async run(id: number, target: WritableSignal<ReturnState>, from: LatLng, to: LatLng, at: string, anchor: TransitAnchor): Promise<void> {
    target.set({ kind: 'loading' });
    try {
      const res = await this.transitService.planTrip({ from, to, at, anchor, limit: TIMETABLE_PAGE_SIZE });
      if (id !== this.requestId) return;
      this.attribution.set(res.attribution);
      target.set({ kind: 'done', connections: res.connections, at, anchor });
    } catch {
      if (id === this.requestId) target.set({ kind: 'error', message: this.failure() });
    }
  }

  /** labels of private places in titles, events and links (§5.4, §6) */
  private placeLabels(): { current: string; home: string } {
    return { current: this.i18n.my_position(), home: this.i18n.home() };
  }

  /**
   * «In Kalender eintragen» (§5.4): calendar picker → title prompt → save. Only generic labels of private places reach
   * the event (`connectionToCalevent`). No «Anzeigen» action: opening the event view would import
   * `@okr/calendar-calevent-feature`, which imports this lib.
   */
  protected async addToCalendar(connection: TransitConnection): Promise<void> {
    const user = this.appStore.currentUser();
    const from = this.fromSel();
    const to = this.toSel();
    if (!this.allowAddToCalendar() || !user || !from || !to) return;
    const organiser = getAvatarInfoForCurrentUser(user);
    if (!organiser) return;

    const memberships = await firstValueFrom(
      this.membershipService.listMembershipsOfMember(user.personKey, 'person', 'group').pipe(take(1), catchError(() => of([]))),
    );
    // only current memberships: a former member is not offered the group's calendar
    const memberGroupKeys = [...new Set(memberships.filter((m) => isOngoing(m.dateOfExit)).map((m) => m.orgKey).filter(Boolean))];
    const modal = await this.modalController.create({
      component: CalendarSelectModal,
      componentProps: { currentUser: user, allowPersonal: true, memberGroupKeys },
    });
    await modal.present();
    const { data: calendarKey, role } = await modal.onDidDismiss<string>();
    if (role !== 'confirm' || !calendarKey) return;

    const labels = this.placeLabels();
    const suggested = fill(this.i18n.trip_title(), { from: eventPlaceLabel(from, labels), to: eventPlaceLabel(to, labels) });
    const title = await okrPrompt(
      this.alertController, this.i18n.trip_title_label(), this.i18n.trip_title_label(), this.i18n.ok(), this.i18n.cancel(), suggested, 'text',
    );
    if (title === undefined) return;

    // the points of public places complete the sbb.ch link; private places never get one
    const pts = this.points();
    const withPoint = (p: TransitPlace, point: LatLng | undefined): TransitPlace =>
      isPrivatePlace(p) || p.point || !point ? p : { ...p, point };
    const event = connectionToCalevent({
      connection,
      from: withPoint(from, pts?.from),
      to: withPoint(to, pts?.to),
      calendarKey,
      title: title.trim() || suggested,
      tenantId: this.appStore.tenantId(),
      organiser,
      labels: {
        ...labels,
        change: this.i18n.leg_change(),
        walk: this.i18n.walk(),
        platform: this.i18n.platform(),
        sbb: this.i18n.buy_ticket(),
      },
    });
    await this.calEventService.create(event, user, { conf: this.i18n.added(), error: this.i18n.add_error() });
  }

  /**
   * Hand-off to the maps app. Synchronous on purpose: Safari blocks `window.open` outside the tap's user gesture.
   * With the current position as start, the origin is left out — the maps app uses its own location.
   */
  protected openMaps(): void {
    const to = this.toSel()?.point;
    if (!to) return;
    const from = this.fromSel();
    this.openExternal(mapsDirectionsUrl(from && from.kind !== 'current' ? from.point : undefined, to, this.mode()));
  }

  /** «Billett auf sbb.ch» (§5.5): this connection at the top; synchronous for the same user-gesture rule. */
  protected openSbb(connection: TransitConnection): void {
    const pts = this.points();
    const from = this.fromSel();
    const to = this.toSel();
    if (!pts || !from || !to) return;
    const labels = this.sbbLabels();
    this.openExternal(sbbTimetableUrl(
      { label: sbbPlaceLabel(from, 'from', labels), point: pts.from },
      { label: sbbPlaceLabel(to, 'to', labels), point: pts.to },
      connection.departure, 'departAt',
    ));
  }

  /** the same for a connection of the way back (Nach → Von) */
  protected openSbbReturn(connection: TransitConnection): void {
    const pts = this.points();
    const from = this.fromSel();
    const to = this.toSel();
    if (!pts || !from || !to) return;
    const labels = this.sbbLabels();
    // the way back starts at Nach and ends at Von
    this.openExternal(sbbTimetableUrl(
      { label: sbbPlaceLabel(to, 'from', labels), point: pts.to },
      { label: sbbPlaceLabel(from, 'to', labels), point: pts.from },
      connection.departure, 'departAt',
    ));
  }

  private sbbLabels(): { start: string; end: string } {
    return { start: this.i18n.sbb_start(), end: this.i18n.sbb_end() };
  }

  private openExternal(url: string): void {
    if (Capacitor.isNativePlatform()) {
      void Browser.open({ url });
      return;
    }
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
  }
}
