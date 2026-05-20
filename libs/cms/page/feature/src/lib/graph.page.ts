import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { MenuItemModel, PageModel, RoleName, SectionModel } from '@bk2/shared-models';
import { Spinner } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { error } from '@bk2/shared-util-angular';

import { Menu, MenuStore } from '@bk2/cms-menu-feature';
import { SectionStore } from '@bk2/cms-section-feature';

import { DependencyNode, MenuGraphStore } from './menu-graph.store';
import { MenuGraphNode } from './menu-graph-node';
import { PageStore } from './page.store';

/**
 * GraphPage renders the CMS dependency tree:
 *   Main Menu → Sub Menus → Navigate → Pages → Context Menus + Sections
 *
 * Clicking any node opens its edit modal via the appropriate root store.
 * Page type: 'graph'
 */
@Component({
  selector: 'bk-graph-page',
  standalone: true,
  imports: [
    SvgIconPipe,
    Spinner, MenuGraphNode, Menu,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonContent, IonItem, IonLabel,
    IonButton, IonIcon, IonPopover
  ],
  providers: [MenuGraphStore],
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; width: 100%; }
    .graph-container {
      padding: 16px;
      font-family: var(--ion-font-family);
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px 16px 0;
      font-size: 0.8rem;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .dot-menu     { background: var(--ion-color-primary); }
    .dot-navigate { background: var(--ion-color-secondary); }
    .dot-browse   { background: var(--ion-color-tertiary); }
    .dot-page     { background: var(--ion-color-success); }
    .dot-section  { background: var(--ion-color-warning); }
  `],
  template: `
    @if(showMenu()) {
      <ion-header>
        <ion-toolbar color="secondary">
          <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
          <ion-title>{{ store.page()?.title }}</ion-title>
          @if(hasRole('contentAdmin')) {
            <ion-buttons slot="end">
              <ion-button id="{{ popupId() }}">
                <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
              </ion-button>
              @if(contextMenuName(); as contextMenuName) {
                <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
                  <ng-template>
                    <ion-content>
                      <bk-menu [menuName]="contextMenuName"/>
                    </ion-content>
                  </ng-template>
                </ion-popover>
              }
            </ion-buttons>
          }
        </ion-toolbar>
      </ion-header>
    }

    <ion-content>
      @if (graphStore.isLoading()) {
        <bk-spinner />
      } @else if (!graphStore.dependencyTree()) {
        <ion-item lines="none">
          <ion-label>{{ store.i18n.graph_nomain() }}</ion-label>
        </ion-item>
      } @else {
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">{{ store.i18n.graph_description() }}</ion-label>
        </ion-item>
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">{{ store.i18n.graph_description2() }}</ion-label>
        </ion-item>

        <!-- Legend -->
        <div class="legend">
          <div class="legend-item"><div class="legend-dot dot-menu"></div> menu / sub</div>
          <div class="legend-item"><div class="legend-dot dot-navigate"></div> navigate</div>
          <div class="legend-item"><div class="legend-dot dot-browse"></div> browse</div>
          <div class="legend-item"><div class="legend-dot dot-page"></div> page</div>
          <div class="legend-item"><div class="legend-dot dot-section"></div> section</div>
        </div>

        <!-- Dependency tree -->
        <div class="graph-container">
          <bk-menu-graph-node
            [node]="graphStore.dependencyTree()!"
            (nodeEdit)="onNodeEdit($event)"
          />
        </div>
      }
    </ion-content>
  `
})
export class GraphPage {
  protected store  = inject(PageStore);
  protected graphStore = inject(MenuGraphStore);
  private menuStore    = inject(MenuStore);
  private sectionStore = inject(SectionStore);

  // inputs
  public contextMenuName = input<string>();
  public color = input('secondary');
  public showMenu = input(true);

  // derived signals
  protected popupId = computed(() => 'c_graphpage_' + this.store.page()?.bkey);


  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'exportRaw': await this.store.export("raw"); break;
      case 'exportXml': await this.store.export("xml"); break;
      default: error(undefined, `GraphPage.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /** Dispatch to the appropriate store's edit() method based on node type. */
  protected async onNodeEdit(node: DependencyNode): Promise<void> {
    if (!hasRole('contentAdmin', this.store.currentUser())) return;

    switch (node.nodeType) {
      case 'menu':
        await this.menuStore.edit(node.model as MenuItemModel, false);
        break;
      case 'page':
        await this.store.edit(node.model as PageModel, false);
        break;
      case 'section':
        this.sectionStore.setSectionId((node.model as SectionModel).bkey);
        await this.sectionStore.edit(node.model as SectionModel, false);
        break;
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}
