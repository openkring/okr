import { Component, computed, input } from '@angular/core';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import type { EChartsOption } from 'echarts';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';

import { SankeySection } from '@okr/shared-models';
import { toSankeyOption } from '@okr/cms-section-util';
import { OptionalCardHeader, Spinner } from '@okr/shared-ui';

/**
 * Renders a flow (sankey) diagram from the static flows configured on the section.
 * Nodes are derived from the flows; see sankey-config.util.ts.
 */
@Component({
  selector: 'okr-sankey-section',
  standalone: true,
  imports: [
    Spinner,
    OptionalCardHeader,
    NgxEchartsDirective,
    IonCard, IonCardContent
  ],
  providers: [
    provideEchartsCore({
      echarts: async () => {
        const [core, charts, comps, rend] = await Promise.all([
          import('echarts/core'), import('echarts/charts'), import('echarts/components'), import('echarts/renderers'),
        ]);
        core.use([charts.SankeyChart, comps.TooltipComponent, rend.CanvasRenderer]);
        return core;
      },
    }),
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
export class SankeySectionComponent {

  // inputs
  public section = input<SankeySection>();

  // derived values
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected content = computed(() => this.section()?.content?.htmlContent ?? '<p></p>');
  protected echartsOption = computed(() => toSankeyOption(this.section()?.properties) as EChartsOption | undefined);
}
