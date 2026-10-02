import { Component, computed, inject, input } from '@angular/core';
import {
  ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonMenuButton, IonNote, IonPopover, IonTitle, IonToolbar
} from '@ionic/angular/standalone';

import { Menu } from '@okr/cms-menu-feature';
import { CategoryItemModel, CategoryListModel, CostCenterModel, CostCenterType, RoleName } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions, error } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';

import { ReadOnlyBanner } from '@okr/finance-accounting-feature';
import { COST_CENTER_I18N_SCOPE } from '@okr/finance-cost-center-util';

import { CostCenterStore } from './cost-center.store';

/**
 * Kostenstellen of one accounting tenant as an indented tree (spec 1.65), like the Kontoplan.
 * Archived cost centres are hidden behind the list filter's state select. Actions: *add* in the
 * context menu, edit / archive per row. For an externally managed ledger (bexio) the list is
 * read-only: banner, no actions.
 */
@Component({
  selector: 'okr-cost-center-list',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, ListFilter, Menu, ReadOnlyBanner,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonNote, IonChip, IonPopover
  ],
  styles: [`
    ion-chip { font-size: 0.75rem; height: 22px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCount() }}/{{ store.activeCount() }} {{ store.i18n.costCenters() }}</ion-title>
        @if (canChange()) {
          <ion-buttons slot="end">
            <ion-button id="{{ popupId }}">
              <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
              <ng-template>
                <ion-content><okr-menu [menuName]="contextMenuName()" /></ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-toolbar>

      <okr-list-filter
        (searchTermChanged)="store.setSearchTerm($event)"
        [states]="archiveStates()" [selectedState]="store.archiveFilter()" (stateChanged)="store.setArchiveFilter($event)"
      />

      <ion-toolbar color="primary">
        <ion-item color="primary" lines="none">
          <ion-label><strong>{{ store.i18n.id() }} {{ store.i18n.name() }}</strong></ion-label>
          <ion-label slot="end" class="ion-hide-md-down"><strong>{{ store.i18n.responsibility() }}</strong></ion-label>
        </ion-item>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <okr-read-only-banner />
      @if (store.isLoading()) {
        <okr-spinner />
      } @else if (filteredCount() === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for (row of rows(); track row.center.okey) {
            <ion-item button [detail]="false" (click)="showActions(row.center)" [style.padding-inline-start.px]="row.depth * 16">
              <ion-label [color]="row.center.isArchived ? 'medium' : undefined">
                <strong>{{ row.center.id }}</strong>&nbsp;{{ row.center.name }}
              </ion-label>
              <ion-note slot="end" class="ion-hide-md-down">{{ store.responsibilityName(row.center.responsibilityKey) }}</ion-note>
              @if (row.center.isArchived) {
                <ion-chip slot="end" color="warning">{{ store.i18n.archived() }}</ion-chip>
              }
              <ion-chip slot="end" [color]="row.center.type === 'leaf' ? 'primary' : 'medium'">{{ typeLabel(row.center.type) }}</ion-chip>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `
})
export class CostCenterList {
  protected readonly store = inject(CostCenterStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  public readonly contextMenuName = input.required<string>();

  constructor() {
    // the list shows the responsible person per row; the pickers elsewhere never load them
    this.store.loadResponsibilities();
  }

  protected readonly popupId = 'c_cost_centers';
  protected readonly rows = computed(() => this.store.filteredTree());
  protected readonly filteredCount = computed(() => this.rows().length);
  protected readonly currentUser = computed(() => this.store.currentUser());
  /** a treasurer on natively managed books; bexio books are maintained in bexio */
  protected readonly canChange = computed(() => this.store.isEnabled() && this.hasRole('treasurer'));

  /** the state select of okr-list-filter; it prepends 'all' itself. Item names are the filter values. */
  protected readonly archiveStates = computed((): CategoryListModel => {
    const _category = new CategoryListModel(this.store.appStore.tenantId());
    _category.name = 'archiveState';
    _category.i18n = COST_CENTER_I18N_SCOPE;
    _category.translateItems = true;
    _category.items = ['active', 'archived'].map(name => new CategoryItemModel(name, ''));
    return _category;
  });

  protected typeLabel(type: CostCenterType): string {
    switch (type) {
      case 'root': return this.store.i18n.type_root();
      case 'group': return this.store.i18n.type_group();
      default: return this.store.i18n.type_leaf();
    }
  }

  /*-------------------------- context menu --------------------------------*/
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const _method = $event.detail.data;
    if (!_method) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch (_method) {
      case 'add': await this.store.add(); break;
      case 'migrate-free-text': await this.store.migrate('free-text'); break;
      case 'migrate-backfill': await this.store.migrate('backfill'); break;
      default: error(undefined, `CostCenterList.onPopoverDismiss: unknown method ${_method}`);
    }
  }

  /*-------------------------- row actions --------------------------------*/
  protected async showActions(center: CostCenterModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(options, center);
    await this.executeActions(options, center);
  }

  private addActionSheetButtons(options: ActionSheetOptions, center: CostCenterModel): void {
    if (!this.canChange()) return; // read-only books: no actions at all
    if (center.isArchived) {
      // archived = kept for the historic lines that point at it; shown, no longer changed
      options.buttons.push(createActionSheetButton('costCenter.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
    } else {
      options.buttons.push(createActionSheetButton('costCenter.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
      options.buttons.push(createActionSheetButton('costCenter.archive', this.store.i18n.archive(), this.imgixBaseUrl, 'archive'));
    }
    options.buttons.push(createActionSheetDivider());
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
  }

  private async executeActions(options: ActionSheetOptions, center: CostCenterModel): Promise<void> {
    if (options.buttons.length === 0) return;
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'costCenter.view': await this.store.edit(center, true); break;
      case 'costCenter.edit': await this.store.edit(center, false); break;
      case 'costCenter.archive': await this.store.archive(center); break;
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
