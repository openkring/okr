import { Component, computed, input } from '@angular/core';
import { AsyncPipe } from '@angular/common';

import { WeatherDaily } from '@okr/shared-models';
import { WeekdayPipe } from '@okr/shared-pipes';
import { TranslatePipe } from '@okr/shared-i18n';
import { formatTemp } from '@okr/weather-util';

import { WeatherIcon } from './weather-icon';

/**
 * `day-vertical` — a stacked tile. The caption is either the weekday (derived from `date`)
 * or a location name, so the same tile serves the forecast strip and a location list.
 *
 * The weekday goes through `WeekdayPipe | translate`: it is a runtime value, one of the few
 * places where `TranslatePipe` is correct rather than the store pattern.
 */
@Component({
  selector: 'okr-weather-day-tile',
  standalone: true,
  imports: [WeatherIcon, WeekdayPipe, TranslatePipe, AsyncPipe],
  styles: [`
    .tile {
      display: flex; flex-direction: column; align-items: center; gap: 5px;
      padding: 14px 10px; border-radius: 8px;
      background: var(--ion-color-step-100, #f2f4f8);
      color: var(--ion-text-color, #2f2f2f);
    }
    .tile.plain { background: transparent; padding: 4px 2px; }
    .caption { font-size: 17px; font-weight: 600; color: var(--ion-color-medium, #5f5f5f); }
    .caption.location { color: var(--ion-text-color, #2f2f2f); font-size: 16px; }
    .temps { font-size: 16px; font-weight: 500; white-space: nowrap; }
    .min { color: var(--ion-color-medium, #5f5f5f); }
    .sep { color: var(--ion-color-step-150, #e3e7ee); }
  `],
  template: `
    <div class="tile" [class.plain]="plain()">
      @if (locationName()) {
        <div class="caption location">{{ locationName() }}</div>
      } @else {
        <div class="caption">{{ date() | weekday | translate | async }}</div>
      }
      <okr-weather-icon [code]="daily().code" [size]="iconSize()" />
      <div class="temps"><span class="min">{{ min() }}</span> <span class="sep">|</span> {{ max() }}</div>
    </div>
  `
})
export class WeatherDayTile {
  public daily = input.required<WeatherDaily>();
  public date = input('');
  /** Set to show a location instead of the weekday. */
  public locationName = input('');
  public iconSize = input(52);
  /** Drop the tile background — used inside a card that already provides one. */
  public plain = input(false);

  protected min = computed(() => formatTemp(this.daily().tempMin));
  protected max = computed(() => formatTemp(this.daily().tempMax));
}
