import { Component, computed, input } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle } from '@ionic/angular/standalone';

import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import type { EChartsCoreOption } from 'echarts/core';

import { DailyActivityStats } from '@okr/activity-util';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

export type ActivityStatsLabels = {
  title: string;
  users: string;
  logins: string;
  errors: string;
  usage: string;
};

// Categorical slots 1–3 (counts) and 7 (usage time, a different measure), light / dark steps.
const PALETTE = {
  light: { users: '#2a78d6', logins: '#eb6834', errors: '#1baf7a', usage: '#4a3aa7', text: '#52514e', grid: '#e5e5e5' },
  dark:  { users: '#3987e5', logins: '#d95926', errors: '#199e70', usage: '#9085e9', text: '#c3c2b7', grid: '#3a3a38' },
};

/**
 * Daily usage of the tenant over the statistics window: users, successful logins and auth errors
 * as lines, and usage time in hours as bars below. Two grids with one shared date axis instead
 * of a second y-scale; hovering either shows the whole day.
 *
 * echarts itself is loaded on demand by the provider, so it stays out of every eager bundle.
 */
@Component({
  selector: 'okr-activity-stats-chart',
  standalone: true,
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
    .chart { height: 380px; width: 100%; }
    ion-card-title { font-size: 1rem; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ labels().title }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <div echarts [options]="options()" class="chart"></div>
      </ion-card-content>
    </ion-card>
  `,
})
export class ActivityStatsChart {
  // inputs
  public readonly stats = input.required<DailyActivityStats[]>();
  public readonly labels = input.required<ActivityStatsLabels>();

  private readonly dark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

  protected readonly options = computed((): EChartsCoreOption => {
    const stats = this.stats();
    const l = this.labels();
    const c = this.dark ? PALETTE.dark : PALETTE.light;
    const days = stats.map(s => convertDateFormatToString(s.day, DateFormat.StoreDate, DateFormat.ViewDate, false).substring(0, 6));
    const axisLabel = { color: c.text, fontSize: 11 };
    const splitLine = { lineStyle: { color: c.grid } };
    const line = (name: string, color: string, data: number[]) => ({
      name, type: 'line', data, color, xAxisIndex: 0, yAxisIndex: 0,
      lineStyle: { width: 2 }, symbol: 'circle', symbolSize: 6, showSymbol: false,
    });

    return {
      backgroundColor: 'transparent',
      textStyle: { color: c.text },
      legend: { top: 0, textStyle: { color: c.text }, data: [l.users, l.logins, l.errors, l.usage] },
      tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: [
        { left: 40, right: 12, top: 36, height: '50%' },
        { left: 40, right: 12, top: '72%', bottom: 28 },
      ],
      xAxis: [
        { type: 'category', data: days, gridIndex: 0, axisLabel: { show: false }, axisTick: { show: false } },
        { type: 'category', data: days, gridIndex: 1, axisLabel },
      ],
      yAxis: [
        { type: 'value', gridIndex: 0, minInterval: 1, axisLabel, splitLine },
        { type: 'value', gridIndex: 1, axisLabel, splitLine, splitNumber: 2 },
      ],
      series: [
        line(l.users, c.users, stats.map(s => s.users)),
        line(l.logins, c.logins, stats.map(s => s.logins)),
        line(l.errors, c.errors, stats.map(s => s.errors)),
        {
          name: l.usage, type: 'bar', data: stats.map(s => Math.round(s.usageMinutes / 6) / 10), color: c.usage,
          xAxisIndex: 1, yAxisIndex: 1, barMaxWidth: 12, itemStyle: { borderRadius: [4, 4, 0, 0] },
        },
      ],
    };
  });
}
