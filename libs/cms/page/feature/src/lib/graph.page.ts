import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { MenuItemModel, PageModel, RoleName, SectionModel } from '@bk2/shared-models';
import { SpinnerComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { MenuComponent, MenuStore } from '@bk2/cms-menu-feature';

import { PageStore } from './page.store';
import { SectionStore } from '@bk2/cms-section-feature';
import { DependencyNode, MenuGraphStore } from './menu-graph.store';
import { MenuGraphNode } from './menu-graph-node';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { error } from '@bk2/shared-util-angular';

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
    AsyncPipe, TranslatePipe, SvgIconPipe,
    SpinnerComponent, MenuGraphNode, MenuComponent,
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
    <ion-header>
      <ion-toolbar color="secondary">
        @if (showMainMenu()) {
          <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        }
        <ion-title>{{ pageStore.page()?.title | translate | async }}</ion-title>
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

    <ion-content>
      @if (graphStore.isLoading()) {
        <bk-spinner />
      } @else if (!graphStore.dependencyTree()) {
        <ion-item lines="none">
          <ion-label>{{ '@content.page.type.graph.nomain' | translate | async }}</ion-label>
        </ion-item>
      } @else {
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">{{ '@content.page.type.graph.description' | translate | async }}</ion-label>
        </ion-item>
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">{{ '@content.page.type.graph.description2' | translate | async }}</ion-label>
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
  protected pageStore  = inject(PageStore);
  protected graphStore = inject(MenuGraphStore);
  private menuStore    = inject(MenuStore);
  private sectionStore = inject(SectionStore);

  // inputs
  public contextMenuName = input<string>();
  public color = input('secondary');
  public showMainMenu = input(true);

  // derived signals
  protected popupId = computed(() => 'c_graphpage_' + this.pageStore.page()?.bkey);


  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'exportRaw': await this.pageStore.export("raw"); break;
      case 'exportXml': await this.pageStore.export("xml"); break;
      default: error(undefined, `GraphPage.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /** Dispatch to the appropriate store's edit() method based on node type. */
  protected async onNodeEdit(node: DependencyNode): Promise<void> {
    if (!hasRole('contentAdmin', this.pageStore.currentUser())) return;

    switch (node.nodeType) {
      case 'menu':
        await this.menuStore.edit(node.model as MenuItemModel, false);
        break;
      case 'page':
        await this.pageStore.edit(node.model as PageModel, false);
        break;
      case 'section':
        this.sectionStore.setSectionId((node.model as SectionModel).bkey);
        await this.sectionStore.edit(node.model as SectionModel, false);
        break;
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.pageStore.currentUser());
  }
}
