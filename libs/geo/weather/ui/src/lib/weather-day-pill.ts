import { Component, computed, input } from '@angular/core';

import { WeatherDaily } from '@okr/shared-models';
import { formatTemp } from '@okr/weather-util';

import { WeatherIcon } from './weather-icon';

/**
 * `day-horizontal` — icon, location name, min and max. Also used as the pin of the `map`
 * widget, which is why the size is an input rather than fixed.
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
      <span class="name" [style.font-size.px]="height() * 0.32">{{ locationName() }}</span>
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

  protected min = computed(() => formatTemp(this.daily().tempMin));
  protected max = computed(() => formatTemp(this.daily().tempMax));
}
