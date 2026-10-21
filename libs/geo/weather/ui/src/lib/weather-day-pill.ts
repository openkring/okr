import { Component, computed, input } from '@angular/core';

import { WeatherDaily } from '@okr/shared-models';
import { formatPrecipitation, formatTemp, formatWind } from '@okr/weather-util';

import { WeatherIcon } from './weather-icon';

/**
 * `day-horizontal` — icon, precipitation (amount and probability), wind, min and max. Also
 * used as the pin of the `map` widget (icon, name, min and max), which is why the size is an
 * input and the detail values are opt-in.
 */
@Component({
  selector: 'okr-weather-day-pill',
  standalone: true,
  imports: [WeatherIcon],
  styles: [`
    .pill {
      display: flex; align-items: center; position: relative;
      background: var(--ion-color-step-100, #f2f4f8);
      color: var(--ion-text-color, #2f2f2f);
      white-space: nowrap;
    }
    .icon { position: absolute; top: -4%; }
    .name { font-weight: 600; letter-spacing: -0.2px; }
    .precip { display: flex; flex-direction: column; line-height: 1.2; color: var(--ion-color-tertiary-shade, #0090e0); font-variant-numeric: tabular-nums; }
    .precip .prob { color: var(--ion-color-medium, #5f5f5f); }
    .wind { flex: 1; text-align: center; color: var(--ion-color-secondary, #014da2); font-variant-numeric: tabular-nums; }
    .temps { margin-left: auto; font-weight: 500; }
    .min { color: var(--ion-color-medium, #5f5f5f); }
    .sep { color: var(--ion-color-step-150, #e3e7ee); }
  `],
  template: `
    <div class="pill"
      [style.height.px]="height()"
      [style.border-radius.px]="height() / 2"
      [style.padding-left.px]="height() * 1.2"
      [style.padding-right.px]="height() * 0.3">
      <span class="icon" [style.left.px]="-height() * 0.06">
        <okr-weather-icon [code]="daily().code" [size]="height() * 1.08" />
      </span>
      @if (locationName()) {
        <span class="name" [style.font-size.px]="height() * 0.32">{{ locationName() }}</span>
      }
      @if (details()) {
        <span class="precip" [style.font-size.px]="height() * 0.22">
          <span>{{ precipitation() }}</span>
          <span class="prob">{{ probability() }}</span>
        </span>
        <span class="wind" [style.font-size.px]="height() * 0.24">{{ wind() }}</span>
      }
      <span class="temps" [style.font-size.px]="height() * 0.29">
        <span class="min">{{ min() }}</span> <span class="sep">|</span> {{ max() }}
      </span>
    </div>
  `
})
export class WeatherDayPill {
  public daily = input.required<WeatherDaily>();
  public locationName = input('');
  /** Drives every other dimension, so the pill scales as one piece. */
  public height = input(72);
  /** Shows precipitation and wind — on for the `day-horizontal` widget, off for map pins. */
  public details = input(false);

  protected min = computed(() => formatTemp(this.daily().tempMin));
  protected max = computed(() => formatTemp(this.daily().tempMax));
  // Firestore reads skip model defaults, so an older document may lack any of these
  protected precipitation = computed(() => formatPrecipitation(this.daily().precipitation ?? 0));
  protected probability = computed(() => `${Math.round(this.daily().precipitationProbability ?? 0)} %`);
  protected wind = computed(() => formatWind(this.daily().windMax ?? 0));
}
