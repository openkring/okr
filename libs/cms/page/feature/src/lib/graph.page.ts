import { Component, inject, input, signal } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonLabel, IonMenuButton, IonPopover, IonSegment, IonSegmentButton, IonTitle, IonToolbar, ModalController } from '@ionic/angular';
import { RoleName } from '@okr/shared-models';
import { hasRole, contextMenuId } from '@okr/shared-util-core';
import { SvgIconPipe } from '@okr/shared-pipes';
import { error } from '@okr/shared-util-angular';

import { Menu, MenuStore, MenuItemsStore } from '@okr/cms-menu-feature';

import { MenuGraph } from './menu-graph';
import { MenuGraphStore } from './menu-graph.store';
import { MenuTree } from './menu-tree';
import { PageStore } from './page.store';

/** The two views of a sitemap: the navigation as a visitor walks it, or the full dependency graph. */
export type SitemapView = 'website' | 'system';

/**
 * GraphPage renders the app sitemap in two views (segment, default «Website»):
 *  - website: the main menu as a plain indented list (`MenuTree`)
 *  - system:  the CMS dependency tree (`MenuGraph`, mode 'app'):
 *             Main Menu → Sub Menus → Navigate → Pages → Context Menus + Sections
 *
 * Clicking any node opens its edit modal via the appropriate root store.
 * Page type: 'graph'
 */
@Component({
  selector: 'okr-graph-page',
  standalone: true,
  imports: [
    SvgIconPipe, MenuGraph, MenuTree, Menu,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonContent, IonLabel,
    IonButton, IonIcon, IonPopover, IonSegment, IonSegmentButton
  ],
  providers: [MenuGraphStore],
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; width: 100%; }
  `],
  template: `
    @if(showMenu()) {
      <ion-header>
        <ion-toolbar color="secondary">
          <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
          <ion-title>{{ store.page()?.title }}</ion-title>
          @if(hasRole('contentAdmin')) {
            <ion-buttons slot="end">
              <ion-button id="help" (click)="showHelp()">
                <ion-icon slot="icon-only" src="{{ 'info-circle' | svgIcon }}" />
              </ion-button>
              @if(contextMenuName(); as contextMenuName) {
                @if (menuItemsStore.canOpen(contextMenuName)) {
                  <ion-button id="{{ popupId }}">
                    <ion-icon slot="icon-only" src="{{'ellipsis-vertical' | svgIcon }}" />
                  </ion-button>
                  <ion-popover trigger="{{ popupId }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
                    <ng-template>
                      <ion-content>
                        <okr-menu [menuName]="contextMenuName"/>
                      </ion-content>
                    </ng-template>
                  </ion-popover>
                }
              }
            </ion-buttons>
          }
        </ion-toolbar>
        <ion-toolbar>
          <ion-segment [value]="view()" (ionChange)="onViewChange($event.detail.value)">
            <ion-segment-button value="website">
              <ion-label>{{ store.i18n.graph_view_website() }}</ion-label>
            </ion-segment-button>
            <ion-segment-button value="system">
              <ion-label>{{ store.i18n.graph_view_system() }}</ion-label>
            </ion-segment-button>
          </ion-segment>
        </ion-toolbar>
      </ion-header>
    }

    <ion-content>
      @if (view() === 'website') {
        <okr-menu-tree />
      } @else {
        <okr-menu-graph mode="app" />
      }
    </ion-content>
  `
})
export class GraphPage {
  protected readonly menuItemsStore = inject(MenuItemsStore);
  protected store  = inject(PageStore);
  private menuStore    = inject(MenuStore);
  private readonly modalController = inject(ModalController);

  // inputs
  public contextMenuName = input<string>();
  public color = input('secondary');
  public showMenu = input(true);

  // state
  protected readonly view = signal<SitemapView>('website');

  protected onViewChange(value: unknown): void {
    this.view.set(value === 'system' ? 'system' : 'website');
  }
  private readonly graphStore = inject(MenuGraphStore);

  // derived signals
  protected readonly popupId = contextMenuId('c_graphpage');

  /******************************* actions *************************************** */
  /** Open the help modal explaining the menu types and how to use the sitemap. */
  protected async showHelp(): Promise<void> {
    const { GraphHelpModal } = await import('./graph-help.modal');
    const modal = await this.modalController.create({
      component: GraphHelpModal,
      componentProps: {
        i18n: this.store.i18n
      }
    });
    await modal.present();
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch(selectedMethod) {
      case 'exportRaw': await this.graphStore.export('raw'); break;
      case 'exportXml': await this.graphStore.export('xml'); break;
      case 'add': await this.menuStore.edit(undefined, false); break;
      default: error(undefined, `GraphPage.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}
