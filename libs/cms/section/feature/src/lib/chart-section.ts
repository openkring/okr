
import { Component, computed, input } from '@angular/core';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';

import { ChartSection } from '@okr/shared-models';
import { OptionalCardHeader, Spinner } from '@okr/shared-ui';

/**
 * Data grid based on open source (Generic UI Data Grid)[https://generic-ui.com/].
 * features virtual scrolling, editing, multi sorting, searching, automatic summaries calculations
 * themes
 * See Documentation: https://generic-ui.com/guide/nx-angular-cli
 */
@Component({
  selector: 'okr-chart-section',
  standalone: true,
  imports: [
    Spinner,
    OptionalCardHeader,
    NgxEchartsDirective,
    IonCard,
    IonCardContent
],
  providers: [
    // Lazy: a static `import * as echarts` here is the binding edge that put ~290 KB of
    // echarts+zrender before the dashboard's LCP (spec 1.49, F1). ngx-echarts accepts a loader.
    provideEchartsCore({
      echarts: async () => {
        const [core, charts, comps, rend] = await Promise.all([
          import('echarts/core'), import('echarts/charts'), import('echarts/components'), import('echarts/renderers'),
        ]);
        core.use([charts.BarChart, charts.LineChart, comps.GridComponent, comps.LegendComponent, comps.ToolboxComponent, comps.TooltipComponent, rend.CanvasRenderer]);
        return core;
      },
    }),
  ],
  styles: [`
  ion-card-content { padding: 0px; }
  ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
  .chart { height: 400px; }
`],
  template: `
  @if(section(); as section) {
    <ion-card>
      <okr-optional-card-header  [title]="title()" [subTitle]="subTitle()" />
      <ion-card-content>
        @if(content(); as content) {
          <div [innerHTML]="content"></div>
        }
        @if(echartsOption(); as echartsOption) {
          <div echarts [options]="echartsOption" class="chart"></div>
        }
      </ion-card-content>
    </ion-card>
  } @else {
    <okr-spinner />
  }
`
})
export class ChartSectionComponent {

  // inputs
  public section = input<ChartSection>();

  // derived values
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);  
  protected content = computed(() => this.section()?.content?.htmlContent ?? '<p></p>');
  protected echartsOption = computed(() => this.section()?.properties);
}
