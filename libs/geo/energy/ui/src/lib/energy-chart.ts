import { Component, input } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle } from '@ionic/angular';

import type { EChartsOption } from 'echarts';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';

/**
 * One chart in a card, fixed height and full width. Builds nothing itself: the option comes from the
 * util chart builders. echarts loads lazily on first render (spec 1.49, F1): a static
 * `import * as echarts` would put it into the eager bundle, so only `import type` is allowed here.
 */
@Component({
  selector: 'okr-energy-chart',
  imports: [NgxEchartsDirective, IonCard, IonCardHeader, IonCardTitle, IonCardContent],
  providers: [
    provideEchartsCore({
      echarts: async () => {
        const [core, charts, comps, rend] = await Promise.all([
          import('echarts/core'), import('echarts/charts'), import('echarts/components'), import('echarts/renderers'),
        ]);
        core.use([charts.LineChart, charts.BarChart, comps.GridComponent, comps.LegendComponent, comps.TooltipComponent, rend.CanvasRenderer]);
        return core;
      },
    }),
  ],
  styles: [`
    ion-card { margin-inline: 0; }
    .chart { height: 300px; width: 100%; }
  `],
  template: `
    <ion-card>
      @if (title()) {
        <ion-card-header>
          <ion-card-title>{{ title() }}</ion-card-title>
        </ion-card-header>
      }
      <ion-card-content>
        <div echarts [options]="options()" class="chart"></div>
      </ion-card-content>
    </ion-card>
  `
})
export class EnergyChart {
  // inputs
  public title = input.required<string>();
  public options = input.required<EChartsOption>();
}
