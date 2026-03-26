import { AsyncPipe, isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActionSheetController, IonCard, IonCardContent, IonLabel, IonSegment, IonSegmentButton } from '@ionic/angular/standalone';
import { EMPTY, fromEvent, map, startWith } from 'rxjs';

import { TreeChart } from 'echarts/charts';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
echarts.use([TreeChart, CanvasRenderer]);

import type { EChartsOption } from 'echarts';

import { GroupModel, OrgchartConfig, OrgchartSection } from '@bk2/shared-models';
import { OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

import { OrgchartNodeComponent } from './orgchart-node.component';
import { OrgchartStore, OrgchartTreeNode } from './orgchart-section.store';
import { TranslatePipe } from '@bk2/shared-i18n';

type ViewMode = 'accordion' | 'chart';

@Component({
  selector: 'bk-orgchart-section',
  standalone: true,
  providers: [provideEchartsCore({ echarts }), OrgchartStore],
  imports: [
    TranslatePipe, AsyncPipe,
    OrgchartNodeComponent, SpinnerComponent, OptionalCardHeaderComponent,
    NgxEchartsDirective, FormsModule,
    IonCard, IonCardContent, IonSegment, IonSegmentButton, IonLabel,
  ],
  styles: [`
    ion-card { padding: 0; margin: 0; border: 0; box-shadow: none !important; }
    ion-card-content { padding: 0; }
    ion-segment { margin: 8px 0; }
    .chart { height: 480px; width: 100%; }
  `],
  template: `
    @if (isLoading()) {
      <bk-spinner />
    } @else {
      <ion-card>
        <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          <ion-segment [(ngModel)]="viewMode">
            <ion-segment-button value="accordion">
              <ion-label>{{ '@cms.orgchart.view.accordion' | translate | async }}</ion-label>
            </ion-segment-button>
            <ion-segment-button value="chart">
              <ion-label>{{ '@cms.orgchart.view.chart' | translate | async }}</ion-label>
            </ion-segment-button>
          </ion-segment>

          @if (viewMode() === 'accordion') {
            @if (rootGroup(); as root) {
              <bk-orgchart-node
                [group]="root"
                [depth]="0"
                [showName]="showName()"
                [editMode]="editMode()"
                (groupAction)="showActions($event)"
              />
            }
          } @else {
            @if (echartsOption(); as opt) {
              <div echarts [options]="opt" class="chart"
                (chartInit)="onChartInit($event)"
                (chartClick)="onChartNodeClick($event)"></div>
            }
          }
        </ion-card-content>
      </ion-card>
    }
  `,
})
export class OrgchartSectionComponent {
  private readonly orgchartStore = inject(OrgchartStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly platformId = inject(PLATFORM_ID);

  public section = input<OrgchartSection>();
  public editMode = input(false);

  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  private readonly config = computed(() => this.section()?.properties as OrgchartConfig | undefined);
  protected readonly showName = computed(() => this.config()?.showName ?? true);
  protected readonly isLoading = computed(() => this.orgchartStore.isLoading());
  protected readonly rootGroup = computed(() => this.orgchartStore.rootGroup());

  protected viewMode = signal<ViewMode>('accordion');

  // Responsive tree orientation: LR on medium+ screens, TB on mobile
  private readonly windowWidth = toSignal(
    isPlatformBrowser(this.platformId)
      ? fromEvent(window, 'resize').pipe(startWith(null), map(() => window.innerWidth))
      : EMPTY,
    { initialValue: isPlatformBrowser(this.platformId) ? window.innerWidth : 768 },
  );
  private readonly orient = computed(() => (this.windowWidth() ?? 768) >= 768 ? 'LR' : 'TB');

  protected readonly echartsOption = computed(() => {
    const treeData = this.orgchartStore.treeData();
    if (!treeData) return undefined;
    return buildEchartsOption(treeData, this.orient(), this.showName());
  });

  private readonly imgixBaseUrl = this.orgchartStore.appStore.env.services.imgixBaseUrl;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private chartInstance: any = null;

  constructor() {
    effect(() => {
      const config = this.config();
      if (config) {
        untracked(() => {
          this.orgchartStore.setConfig(config.topGroup, config.showName);
        });
      }
    });

    // Re-render with notMerge=true so ECharts fully resets layout and zoom
    // after structural changes (e.g. detaching a group).
    effect(() => {
      const opt = this.echartsOption();
      if (!opt || !this.chartInstance) return;
      untracked(() => {
        this.chartInstance.setOption(opt, true);
        this.chartInstance.resize();
      });
    });
  }

  protected onChartInit(instance: unknown): void {
    this.chartInstance = instance;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected onChartNodeClick(event: any): void {
    const bkey = event?.data?.value as string | undefined;
    if (!bkey) return;
    const group = this.orgchartStore.allGroups().find(g => g.bkey === bkey);
    if (group) void this.showActions(group);
  }

  protected async showActions(group: GroupModel): Promise<void> {
    const options = createActionSheetOptions('@actionsheet.label.choose');
    options.buttons = [
      createActionSheetButton('orgchart.addNewGroup', this.imgixBaseUrl, 'add-circle'),
      createActionSheetButton('orgchart.addExistingGroup', this.imgixBaseUrl, 'search'),
      createActionSheetButton('orgchart.editGroup', this.imgixBaseUrl, 'create_edit'),
      createActionSheetButton('orgchart.removeGroup', this.imgixBaseUrl, 'trash_delete'),
      createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'),
    ];
    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data?.action) return;
    switch (data.action) {
      case 'orgchart.addNewGroup':
        await this.orgchartStore.addNewGroup(group.bkey);
        break;
      case 'orgchart.addExistingGroup':
        await this.orgchartStore.addExistingGroup(group.bkey);
        break;
      case 'orgchart.editGroup':
        await this.orgchartStore.editGroup(group);
        break;
      case 'orgchart.removeGroup':
        await this.orgchartStore.removeGroup(group);
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface EChartsTreeNode {
  name: string;
  value: string;
  children: EChartsTreeNode[];
}

function toEchartsNode(node: OrgchartTreeNode): EChartsTreeNode {
  return {
    name: node.name,
    value: node.bkey,
    children: node.children.map(toEchartsNode),
  };
}

function buildEchartsOption(
  treeData: OrgchartTreeNode,
  orient: 'LR' | 'TB',
  showName: boolean,
): EChartsOption {
  const labelPos = orient === 'LR' ? 'left' : 'top';
  const labelAlign = orient === 'LR' ? 'right' : 'center';
  const leavesLabelPos = orient === 'LR' ? 'right' : 'bottom';
  const leavesLabelAlign = orient === 'LR' ? 'left' : 'center';

  return {
    series: [
      {
        type: 'tree',
        data: [toEchartsNode(treeData)],
        orient,
        layout: 'orthogonal',
        symbol: 'emptyCircle',
        symbolSize: 10,
        roam: true,
        initialTreeDepth: -1,
        expandAndCollapse: true,
        animationDuration: 350,
        animationDurationUpdate: 450,
        label: {
          show: showName,
          position: labelPos,
          verticalAlign: 'middle',
          align: labelAlign,
          fontSize: 12,
        },
        leaves: {
          label: {
            show: showName,
            position: leavesLabelPos,
            verticalAlign: 'middle',
            align: leavesLabelAlign,
          },
        },
        emphasis: { focus: 'descendant' },
        top: '5%',
        left: '7%',
        bottom: '5%',
        right: '20%',
      },
    ],
  };
}
