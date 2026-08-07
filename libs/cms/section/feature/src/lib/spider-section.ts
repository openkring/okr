import { Component, computed, input } from '@angular/core';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import type { EChartsOption } from 'echarts';
import { RadarChart } from 'echarts/charts';
import { LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
echarts.use([RadarChart, TooltipComponent, LegendComponent, CanvasRenderer]);

import { SpiderSection } from '@okr/shared-models';
import { toSpiderOption } from '@okr/cms-section-util';
import { OptionalCardHeader, Spinner } from '@okr/shared-ui';

/**
 * Renders a spider/radar net from the axes and value series configured on the section.
 * Values are clamped to their axis maximum; see spider-config.util.ts.
 */
@Component({
  selector: 'okr-spider-section',
  standalone: true,
  imports: [
    Spinner,
    OptionalCardHeader,
    NgxEchartsDirective,
    IonCard, IonCardContent
  ],
  providers: [
    provideEchartsCore({ echarts })
  ],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important; }
    .chart { height: 400px; min-width: 320px; }
    .scroller { overflow-x: auto; }
  `],
  template: `
  @if(section(); as section) {
    <ion-card>
      <okr-optional-card-header [title]="title()" [subTitle]="subTitle()" />
      <ion-card-content>
        @if(content(); as content) {
          <div [innerHTML]="content"></div>
        }
        @if(echartsOption(); as echartsOption) {
          <div class="scroller">
            <div echarts [options]="echartsOption" class="chart"></div>
          </div>
        }
      </ion-card-content>
    </ion-card>
  } @else {
    <okr-spinner />
  }
`
})
export class SpiderSectionComponent {

  // inputs
  public section = input<SpiderSection>();

  // derived values
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected content = computed(() => this.section()?.content?.htmlContent ?? '<p></p>');
  protected echartsOption = computed(() => toSpiderOption(this.section()?.properties) as EChartsOption | undefined);
}
