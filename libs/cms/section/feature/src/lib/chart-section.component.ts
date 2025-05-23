import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import { EChartsOption } from 'echarts';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import { BarChart, LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([BarChart, GridComponent, CanvasRenderer, ToolboxComponent, LegendComponent, TooltipComponent, LineChart]);
import * as echarts from 'echarts/core';
import { GridComponent, ToolboxComponent, LegendComponent, TooltipComponent } from 'echarts/components';

import { EditorComponent, OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared/ui';
import { SectionModel } from '@bk2/shared/models';

/**
 * Data grid based on open source (Generic UI Data Grid)[https://generic-ui.com/].
 * features virtual scrolling, editing, multi sorting, searching, automatic summaries calculations
 * themes
 * See Documentation: https://generic-ui.com/guide/nx-angular-cli
 */
@Component({
  selector: 'bk-chart-section',
  imports: [
    SpinnerComponent, EditorComponent, OptionalCardHeaderComponent,
    CommonModule, NgxEchartsDirective,
    IonCard, IonCardContent
    ],
  providers: [
    provideEchartsCore({echarts})
  ],
  styles: [`
  ion-card-content { padding: 0px; }
  ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
  .chart { height: 400px; }
`],
  template: `
  @if(section(); as section) {
    <ion-card>
      <bk-optional-card-header  [title]="title()" [subTitle]="subTitle()" />
      <ion-card-content>
        @if(content(); as content) {
          <bk-editor [content]="content" [readOnly]="true" />
        }
        @if(echartsOption(); as echartsOption) {
          <div echarts [options]="echartsOption" class="chart"></div>
        }
      </ion-card-content>
    </ion-card>
  } @else {
    <bk-spinner />
  }
`
})
export class ChartSectionComponent {
  public section = input<SectionModel>();
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);  
  protected content = computed(() => this.section()?.properties?.content?.htmlContent ?? '<p></p>');
  protected echartsOption = computed(() => this.section()?.properties.echarts as EChartsOption ?? null);
}
