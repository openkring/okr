import {
  Component, ComponentRef, DestroyRef, ViewContainerRef, computed, effect, inject, input,
  signal, untracked, viewChild
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import { LocationModel, WeatherModel, WeatherSection } from '@okr/shared-models';
import { OptionalCardHeader, Spinner } from '@okr/shared-ui';
import { I18nService } from '@okr/shared-i18n';
import { DateFormat, convertDateFormatToString } from '@okr/shared-util-core';
import { LocationService } from '@okr/location-data-access';
import { WeatherService } from '@okr/weather-data-access';
import { WEATHER_I18N_KEYS, WIND_DIRECTION_KEYS } from '@okr/weather-util';
import {
  WeatherForecastDetail, WeatherForecastOverview, WeatherForecastTable, WeatherDayPill,
  WeatherDayTile, WeatherHourlyDetail, WeatherMap, WeatherMapPin
} from '@okr/weather-ui';

// Type-only: importing the symbol would bind Leaflet into whatever chunk this file lands in.
import type { WeatherRainRadar } from './weather-rain-radar';

/**
 * Container for every weather widget. The variant picks the presentation; the data flow is
 * identical for all of them, which is why there is one section type rather than eight.
 *
 * `rain_radar` is the exception: it is the only widget that needs a real map, so it is created
 * dynamically (`await import`) instead of being listed in `imports:`. A static import here —
 * even inside `@defer` — would pull Leaflet into the eager bundle of every page that renders
 * any section at all.
 */
@Component({
  selector: 'okr-weather-section',
  standalone: true,
  imports: [
    WeatherDayPill, WeatherDayTile, WeatherForecastOverview, WeatherForecastTable,
    WeatherHourlyDetail, WeatherForecastDetail, WeatherMap,
    OptionalCardHeader, Spinner, IonCard, IonCardContent
  ],
  styles: [`
    ion-card { margin: 0; padding: 0; border: 0; box-shadow: none !important; }
    ion-card-content { padding: 12px 16px 16px; }
    .radar-host { display: block; min-height: 320px; }
  `],
  template: `
    @if (section(); as section) {
      <ion-card>
        <okr-optional-card-header [title]="section.title" [subTitle]="section.subTitle" />
        <ion-card-content>
          @switch (section.properties.variant) {

            @case ('day-horizontal') {
              @if (today(); as day) {
                <okr-weather-day-pill [daily]="day.daily" [locationName]="locationName()" />
              } @else { <div>{{ i18n.empty() }}</div> }
            }

            @case ('day-vertical') {
              @if (today(); as day) {
                <okr-weather-day-tile [daily]="day.daily" [locationName]="locationName()" />
              } @else { <div>{{ i18n.empty() }}</div> }
            }

            @case ('forecast_overview') {
              <okr-weather-forecast-overview
                [days]="days()" [locationName]="locationName()"
                [orientation]="section.properties.orientation ?? 'horizontal'"
                [emptyLabel]="i18n.empty()" />
            }

            @case ('forecast_table') {
              <okr-weather-forecast-table
                [days]="days()" [todayLabel]="i18n.today()" [emptyLabel]="i18n.empty()" />
            }

            @case ('hourly_detail') {
              <okr-weather-hourly-detail
                [hour]="currentHour()" [dateLabel]="todayLabel()"
                [uncertaintyLabel]="i18n.uncertainty()" [windFromLabel]="i18n.wind_from()"
                [sunshineLabel]="i18n.sunshine()" [emptyLabel]="i18n.empty()"
                [directionLabels]="directionLabels()" />
            }

            @case ('forecast_detail') {
              <okr-weather-forecast-detail
                [days]="days()" [dayLabels]="dayLabels()"
                [titleLabel]="i18n.local_forecast()" [placeLabel]="placeLabel()"
                [probabilityLabel]="i18n.precipitation_prob()"
                [sunshineLabel]="i18n.sunshine_duration()" [windLabel]="i18n.wind_and_gusts()"
                [emptyLabel]="i18n.empty()" />
            }

            @case ('map') {
              <okr-weather-map [pins]="pins()" [credit]="i18n.source()" [emptyLabel]="i18n.empty()" />
            }

            @case ('rain_radar') {
              <div class="radar-host" #radarHost></div>
              @if (!radarRef()) { <okr-spinner /> }
            }
          }
        </ion-card-content>
      </ion-card>
    } @else {
      <okr-spinner />
    }
  `
})
export class WeatherSectionComponent {
  private readonly locationService = inject(LocationService);
  private readonly weatherService = inject(WeatherService);
  private readonly i18nService = inject(I18nService);

  public section = input<WeatherSection>();
  /** The page's location. Used whenever the section does not name one of its own. */
  public pageLocationKey = input('');

  protected readonly i18n = this.i18nService.translateAll(WEATHER_I18N_KEYS);
  private readonly directions = this.i18nService.translateAll({
    d0: WIND_DIRECTION_KEYS[0], d1: WIND_DIRECTION_KEYS[1], d2: WIND_DIRECTION_KEYS[2], d3: WIND_DIRECTION_KEYS[3],
    d4: WIND_DIRECTION_KEYS[4], d5: WIND_DIRECTION_KEYS[5], d6: WIND_DIRECTION_KEYS[6], d7: WIND_DIRECTION_KEYS[7],
  });
  protected directionLabels = computed(() => [
    this.directions.d0(), this.directions.d1(), this.directions.d2(), this.directions.d3(),
    this.directions.d4(), this.directions.d5(), this.directions.d6(), this.directions.d7(),
  ]);

  /** Today as a StoreDate (yyyyMMdd) — the anchor of every query below. */
  private readonly todayKey = toStoreDate(new Date());

  protected effectiveLocationKey = computed(() =>
    this.section()?.properties?.locationKey || this.pageLocationKey());

  private locations = toSignal(this.locationService.list(), { initialValue: [] as LocationModel[] });

  protected locationName = computed(() =>
    this.locations().find((l) => l.okey === this.effectiveLocationKey())?.name ?? '');

  protected placeLabel = computed(() => {
    const loc = this.locations().find((l) => l.okey === this.effectiveLocationKey());
    if (!loc) return '';
    return loc.seaLevel ? `${loc.name} (${loc.seaLevel} m ü. M.)` : loc.name;
  });

  /** The configured days, forecast only — the archive is read by other views, not by a widget. */
  private daysQuery = computed(() => ({
    key: this.effectiveLocationKey(),
    days: this.section()?.properties?.days ?? 6,
  }));

  protected days = toSignal(
    toObservable(this.daysQuery).pipe(switchMap(({ key, days }) =>
      key ? this.weatherService.list(key, this.todayKey, addDays(this.todayKey, days - 1))
          : of([] as WeatherModel[]))),
    { initialValue: [] as WeatherModel[] });

  protected today = computed(() => this.days().find((d) => d.date === this.todayKey) ?? this.days()[0]);

  protected todayLabel = computed(() =>
    convertDateFormatToString(this.todayKey, DateFormat.StoreDate, DateFormat.ViewDate, false));

  protected dayLabels = computed(() => this.days().map((d) =>
    convertDateFormatToString(d.date, DateFormat.StoreDate, DateFormat.ViewDate, false)));

  /** The hour the clock is in, falling back to the first one the provider returned. */
  protected currentHour = computed(() => {
    const hours = this.today()?.hourly ?? [];
    const now = `${String(new Date().getHours()).padStart(2, '0')}:00`;
    return hours.find((h) => h.time === now) ?? hours[0];
  });

  /** `map` — its own location list, joined to the day's weather. */
  private mapKeys = computed(() => this.section()?.properties?.locationKeys ?? []);

  private mapDays = toSignal(
    toObservable(this.mapKeys)
      .pipe(switchMap((keys) =>
        keys.length ? this.weatherService.listForDate(keys, this.todayKey) : of([] as WeatherModel[]))),
    { initialValue: [] as WeatherModel[] });

  protected pins = computed<WeatherMapPin[]>(() =>
    this.mapDays().flatMap((w) => {
      const loc = this.locations().find((l) => l.okey === w.locationKey);
      return loc ? [{ locationKey: w.locationKey, name: loc.name, latitude: loc.latitude, longitude: loc.longitude, daily: w.daily }] : [];
    }));

  // ---- rain_radar: created by hand so Leaflet stays out of the eager bundle ----
  private radarHost = viewChild('radarHost', { read: ViewContainerRef });
  protected radarRef = signal<ComponentRef<WeatherRainRadar> | undefined>(undefined);

  constructor() {
    effect(() => {
      const host = this.radarHost();
      if (!host || untracked(() => this.radarRef())) return;
      void (async () => {
        const { WeatherRainRadar } = await import('./weather-rain-radar');
        const ref = host.createComponent(WeatherRainRadar);
        ref.setInput('measuredLabel', untracked(() => this.i18n.radar_measured()));
        ref.setInput('forecastLabel', untracked(() => this.i18n.radar_forecast()));
        ref.setInput('playLabel', untracked(() => this.i18n.radar_play()));
        ref.setInput('degradedLabel', untracked(() => this.i18n.radar_degraded()));
        this.radarRef.set(ref);
      })();
    });
    inject(DestroyRef).onDestroy(() => this.radarRef()?.destroy());
  }
}

/** A Date as a StoreDate (yyyyMMdd) in local wall-clock time — never UTC, or the day flips. */
function toStoreDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** Adds `n` days to a StoreDate (yyyyMMdd) and returns a StoreDate. */
function addDays(storeDate: string, n: number): string {
  const d = new Date(Number(storeDate.slice(0, 4)), Number(storeDate.slice(4, 6)) - 1, Number(storeDate.slice(6, 8)));
  d.setDate(d.getDate() + n);
  return toStoreDate(d);
}
