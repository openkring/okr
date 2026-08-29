import { Component, computed, input } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { WEATHER_ICON_SET, weatherCodeToIcon } from '@okr/weather-util';

/**
 * Renders the icon for a WMO weather code from the `weather` icon set.
 *
 * The icons are multi-colour with fixed fills, so unlike the single-colour `icons` set they
 * do not follow `ion-icon`'s `color`. That is intentional — a yellow sun and a blue raindrop
 * are the point.
 */
@Component({
  selector: 'okr-weather-icon',
  standalone: true,
  imports: [SvgIconPipe, IonIcon],
  styles: [`
    ion-icon { display: block; }
  `],
  template: `
    <ion-icon
      [src]="iconName() | svgIcon: iconSet"
      [style.font-size.px]="size()"
      [attr.aria-hidden]="true" />
  `
})
export class WeatherIcon {
  public code = input.required<number>();
  public isDay = input(true);
  public size = input(48);

  protected readonly iconSet = WEATHER_ICON_SET;
  protected iconName = computed(() => weatherCodeToIcon(this.code(), this.isDay()));
}
