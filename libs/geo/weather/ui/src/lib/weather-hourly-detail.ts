import { Component, computed, input } from '@angular/core';

import { WeatherHour } from '@okr/shared-models';
import {
  formatPrecipitationRate, formatSunshine, formatTemp, formatWind, windDirectionIndex
} from '@okr/weather-util';

import { WeatherIcon } from './weather-icon';

/**
 * `hourly_detail` — one hour in full: temperature, precipitation, wind and sunshine, each
 * with the provider's uncertainty range where it differs from the expected value.
 *
 * A range identical to the value carries no information, so it is hidden rather than
 * printed as "27.4 – 27.4 °C".
 */
@Component({
  selector: 'okr-weather-hourly-detail',
  standalone: true,
  imports: [WeatherIcon],
  styles: [`
    :host { display: block; }
    .band { display: flex; align-items: center; gap: 30px; flex-wrap: wrap; }
    .when { min-width: 190px; font-size: 17px; font-weight: 600; letter-spacing: -0.2px; }
    .divider { width: 1px; align-self: stretch; background: var(--ion-color-step-150, #e3e7ee); }
    .metric { display: flex; align-items: flex-start; gap: 12px; }
    .metric .glyph { flex: none; margin-top: 2px; }
    .value { font-size: 19px; font-weight: 600; }
    .caption { font-size: 12px; color: var(--ion-color-medium, #5f5f5f); margin-top: 2px; }
    .range { font-size: 13px; color: var(--ion-color-medium, #5f5f5f); }
    .empty { color: var(--ion-color-medium, #5f5f5f); font-size: 14px; }
  `],
  template: `
    @if (hour(); as h) {
      <div class="band">
        <okr-weather-icon [code]="h.code" [isDay]="h.isDay" [size]="72" />

        <div class="when">
          <div>{{ dateLabel() }}</div>
          <div>{{ h.time }} – {{ endTime() }}</div>
        </div>

        <div class="divider"></div>

        <div class="metric">
          <svg class="glyph" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path d="M14 13.6V5a2 2 0 1 0-4 0v8.6a4.5 4.5 0 1 0 4 0z" fill="none" stroke="currentColor" stroke-width="1.7" />
            <circle cx="12" cy="17.5" r="2.4" fill="currentColor" />
          </svg>
          <div>
            <div class="value">{{ temp() }}</div>
            @if (tempRange()) {
              <div class="caption">{{ uncertaintyLabel() }}</div>
              <div class="range">{{ tempRange() }}</div>
            }
          </div>
        </div>

        <div class="metric">
          <svg class="glyph" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <g fill="currentColor">
              <path d="M6 4l2.6 5.2A3 3 0 1 1 3.4 9.2z" /><path d="M12 4l2.6 5.2A3 3 0 1 1 9.4 9.2z" />
              <path d="M18 4l2.6 5.2A3 3 0 1 1 15.4 9.2z" />
            </g>
          </svg>
          <div>
            <div class="value">{{ precip() }}</div>
            @if (precipRange()) {
              <div class="caption">{{ uncertaintyLabel() }}</div>
              <div class="range">{{ precipRange() }}</div>
            }
          </div>
        </div>

        <div class="metric">
          <svg class="glyph" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <circle cx="5" cy="7" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path d="M5 9.6V21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            <path d="M8 4.4l12 1.8-12 3.4z" fill="currentColor" />
          </svg>
          <div>
            <div class="value">{{ wind() }}</div>
            <div class="caption">{{ windFromLabel() }} {{ directionLabel() }}</div>
          </div>
        </div>

        <div class="metric">
          <svg class="glyph" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <g stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
            </g>
            <circle cx="12" cy="12" r="4.6" fill="currentColor" />
          </svg>
          <div>
            <div class="value">{{ sunshine() }}</div>
            <div class="caption">{{ sunshineLabel() }}</div>
          </div>
        </div>
      </div>
    } @else {
      <div class="empty">{{ emptyLabel() }}</div>
    }
  `
})
export class WeatherHourlyDetail {
  public hour = input<WeatherHour | undefined>();
  /** Already-formatted date, e.g. "Mittwoch, 26.08.2026" — formatting is the container's job. */
  public dateLabel = input('');
  /** Resolved i18n labels, passed down from the store. */
  public uncertaintyLabel = input('');
  public windFromLabel = input('');
  public sunshineLabel = input('');
  public emptyLabel = input('');
  /** The eight compass labels, index 0 = north. */
  public directionLabels = input<string[]>([]);

  protected temp = computed(() => formatTemp(this.hour()?.temp ?? 0));
  protected precip = computed(() => formatPrecipitationRate(this.hour()?.precipitation ?? 0));
  protected wind = computed(() => formatWind(this.hour()?.wind ?? 0));
  protected sunshine = computed(() => formatSunshine(this.hour()?.sunshineMinutes ?? 0));

  /** `'16:00'` + 1 h, without pulling a date library in for an hour boundary. */
  protected endTime = computed(() => {
    const [h] = (this.hour()?.time ?? '00:00').split(':');
    return `${String((Number(h) + 1) % 24).padStart(2, '0')}:00`;
  });

  protected tempRange = computed(() => {
    const h = this.hour();
    if (!h || Math.round(h.tempMin) === Math.round(h.tempMax)) return '';
    return `${formatTemp(h.tempMin)} – ${formatTemp(h.tempMax)}`;
  });

  protected precipRange = computed(() => {
    const h = this.hour();
    if (!h || (h.precipitationMin <= 0 && h.precipitationMax <= 0)) return '';
    return `${formatPrecipitationRate(h.precipitationMin)} – ${formatPrecipitationRate(h.precipitationMax)}`;
  });

  protected directionLabel = computed(() =>
    this.directionLabels()[windDirectionIndex(this.hour()?.windDirection ?? 0)] ?? '');
}
