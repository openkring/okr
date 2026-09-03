import { Component, computed, input } from '@angular/core';

import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';

export type MemberBarRow = { label: string; male: number; female: number; total: number };

/**
 * Grouped male/female bar chart for the member-age / member-cat sections.
 * The last row (Total) is dropped — it is a summary, not a category.
 */
@Component({
  selector: 'okr-member-bar-chart',
  standalone: true,
  imports: [NgxEchartsDirective],
  providers: [
    provideEchartsCore({
      echarts: async () => {
        const [core, charts, comps, rend] = await Promise.all([
          import('echarts/core'), import('echarts/charts'), import('echarts/components'), import('echarts/renderers'),
        ]);
        core.use([charts.BarChart, comps.GridComponent, comps.LegendComponent, comps.TooltipComponent, rend.CanvasRenderer]);
        return core;
      },
    }),
  ],
  styles: [`.chart { height: 400px; }`],
  template: `<div echarts [options]="options()" class="chart"></div>`
})
export class MemberBarChart {

  // inputs
  public rows = input.required<MemberBarRow[]>();
  public maleLabel = input<string>('');
  public femaleLabel = input<string>('');

  protected readonly options = computed(() => {
    const rows = this.rows().slice(0, -1); // strip the Total row
    return {
      tooltip: { trigger: 'axis' },
      legend: {},
      grid: { left: 40, right: 16, top: 40, bottom: 40 },
      xAxis: { type: 'category', data: rows.map(r => r.label) },
      yAxis: { type: 'value' },
      series: [
        { name: this.maleLabel(), type: 'bar', data: rows.map(r => r.male) },
        { name: this.femaleLabel(), type: 'bar', data: rows.map(r => r.female) },
      ]
    };
  });
}
