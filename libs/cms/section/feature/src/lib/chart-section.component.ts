import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import { EChartsOption } from 'echarts';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, ToolboxComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
echarts.use([BarChart, GridComponent, CanvasRenderer, ToolboxComponent, LegendComponent, TooltipComponent, LineChart]);

import { SectionModel } from '@bk2/shared-models';
import { EditorComponent, OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';

/**
 * Data grid based on open source (Generic UI Data Grid)[https://generic-ui.com/].
 * features virtual scrolling, editing, multi sorting, searching, automatic summaries calculations
 * themes
 * See Documentation: https://generic-ui.com/guide/nx-angular-cli
 */
@Component({
  selector: 'bk-chart-section',
  standalone: true,
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
          <bk-editor [content]="content" [readOnly]="isReadOnly()" />
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
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => this.readOnly());

  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);  
  protected content = computed(() => this.section()?.properties?.content?.htmlContent ?? '<p></p>');
  protected echartsOption = computed(() => this.section()?.properties.echarts as EChartsOption ?? null);
}
