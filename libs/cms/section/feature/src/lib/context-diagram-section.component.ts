import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { ActionSheetController, IonCard, IonCardContent, ModalController } from '@ionic/angular/standalone';

import { GraphChart } from 'echarts/charts';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
echarts.use([GraphChart, CanvasRenderer]);

import type { EChartsOption } from 'echarts';

import { ContextDiagramConfig, ContextDiagramSection, UserModel } from '@bk2/shared-models';
import { OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';
import { SectionService } from '@bk2/cms-section-data-access';

import { ContextDiagramStore, ContextDiagramNode, ContextDiagramEdge } from './context-diagram-section.store';
import { ContextDiagramConfigModal } from './context-diagram-config.modal';

@Component({
  selector: 'bk-context-diagram-section',
  standalone: true,
  providers: [provideEchartsCore({ echarts }), ContextDiagramStore],
  imports: [
    SpinnerComponent, OptionalCardHeaderComponent,
    NgxEchartsDirective,
    IonCard, IonCardContent,
  ],
  styles: [`
    ion-card { padding: 0; margin: 0; border: 0; box-shadow: none !important; }
    ion-card-content { padding: 0; }
    .chart { height: 520px; width: 100%; }
  `],
  template: `
    @if (isLoading()) {
      <bk-spinner />
    } @else {
      <ion-card>
        <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          @if (echartsOption(); as opt) {
            <div echarts [options]="opt" class="chart"
              (chartInit)="onChartInit($event)"
              (chartClick)="onChartNodeClick($event)">
            </div>
          }
        </ion-card-content>
      </ion-card>
    }
  `,
})
export class ContextDiagramSectionComponent {
  private readonly store = inject(ContextDiagramStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly modalController = inject(ModalController);
  private readonly sectionService = inject(SectionService);

  public section = input<ContextDiagramSection>();
  public editMode = input(false);

  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  private readonly config = computed(() => this.section()?.properties as ContextDiagramConfig | undefined);
  protected readonly isLoading = computed(() => this.store.isLoading());

  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private chartInstance: any = null;

  protected readonly echartsOption = computed((): EChartsOption | undefined => {
    const { nodes, edges } = this.store.graphData();
    if (!nodes.length) return undefined;
    const config = this.config();
    return buildGraphOption(nodes, edges, config);
  });

  constructor() {
    effect(() => {
      const section = this.section();
      if (section) {
        untracked(() => this.store.setConfig(section));
      }
    });

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
    const nodeId = event?.data?.id as string | undefined;
    if (!nodeId) return;

    const currentUser = this.store.appStore.currentUser();
    if (hasRole('contentAdmin', currentUser)) {
      void this.showAdminActions(nodeId);
    } else if (hasRole('registered', currentUser)) {
      this.store.setCenter(nodeId);
    }
  }

  protected async showAdminActions(nodeId: string): Promise<void> {
    const isCurrentCenter = nodeId === this.store.currentCenter();
    const options = createActionSheetOptions('@actionsheet.label.choose');
    options.buttons = [
      createActionSheetButton('contextDiagram.edit', this.imgixBaseUrl, 'edit'),
      ...(!isCurrentCenter ? [createActionSheetButton('contextDiagram.center', this.imgixBaseUrl, 'locate')] : []),
      createActionSheetButton('contextDiagram.displayConfig', this.imgixBaseUrl, 'settings'),
      createActionSheetButton('cancel', this.imgixBaseUrl, 'cancel'),
    ];
    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data?.action) return;
    switch (data.action) {
      case 'contextDiagram.edit':
        await this.store.editNode(nodeId);
        break;
      case 'contextDiagram.center':
        this.store.setCenter(nodeId);
        break;
      case 'contextDiagram.displayConfig':
        await this.showConfigModal();
        break;
    }
  }

  protected async showConfigModal(): Promise<void> {
    const currentConfig = this.config();
    if (!currentConfig) return;
    const modal = await this.modalController.create({
      component: ContextDiagramConfigModal,
      componentProps: {
        config: currentConfig,
        currentUser: this.store.appStore.currentUser(),
      },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role !== 'confirm' || !data) return;

    const { _saveChanges, ...updatedConfig } = data as ContextDiagramConfig & { _saveChanges: boolean };

    // Always apply transiently
    this.store.updateConfig(updatedConfig);

    // Persist if memberAdmin requested it
    if (_saveChanges && hasRole('memberAdmin', this.store.appStore.currentUser())) {
      const section = this.section();
      if (section) {
        await this.sectionService.update(
          { ...section, properties: updatedConfig },
          this.store.appStore.currentUser(),
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// ECharts helpers
// ---------------------------------------------------------------------------

function buildGraphOption(
  nodes: ContextDiagramNode[],
  edges: ContextDiagramEdge[],
  config: ContextDiagramConfig | undefined,
): EChartsOption {
  const showName = config?.showName ?? true;
  const showLabels = config?.connectionNames ?? true;

  const echartsNodes = nodes.map(n => ({
    id: n.id,
    name: n.name,
    value: n.id,
    symbol: `image://${n.symbolUrl}`,
    symbolSize: n.symbolSize,
    label: { show: showName },
    itemStyle: {
      borderWidth: n.isCenter ? 3 : 0,
      borderColor: '#4a90d9',
    },
  }));

  const echartsLinks = edges.map(e => ({
    source: e.source,
    target: e.target,
    value: e.label,
    label: { show: showLabels, formatter: '{c}', fontSize: 10 },
    lineStyle: { color: '#aaa', width: 1 },
  }));

  // GraphChart is not part of the core type union when using tree-shakeable imports — cast required
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    tooltip: { show: false },
    series: [
      {
        type: 'graph',
        layout: 'force',
        roam: true,
        draggable: true,
        label: {
          show: showName,
          position: 'bottom',
          fontSize: 11,
        },
        edgeLabel: {
          show: showLabels,
          formatter: '{c}',
          fontSize: 10,
        },
        force: {
          repulsion: 200,
          edgeLength: [80, 150],
          gravity: 0.1,
        },
        emphasis: {
          focus: 'adjacency',
          lineStyle: { width: 2 },
        },
        data: echartsNodes,
        links: echartsLinks,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ],
  } as EChartsOption;
}
