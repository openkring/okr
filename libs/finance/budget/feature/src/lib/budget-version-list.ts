import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import {
  ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon,
  IonItem, IonItemDivider, IonItemGroup, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar
} from '@ionic/angular/standalone';

import { Menu } from '@okr/cms-menu-feature';
import { BudgetStatus, BudgetVersionModel, CategoryItemModel, CategoryListModel, RoleName } from '@okr/shared-models';
import { PrettyDatePipe, SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions, error } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';

import { ReadOnlyBanner } from '@okr/finance-accounting-feature';
import { BUDGET_I18N_SCOPE, isVersionEditable } from '@okr/finance-budget-util';

import { BudgetStore } from './budget.store';

/**
 * Budget versions of one accounting tenant, grouped by fiscal year (newest first) — spec 1.65 phase 2.
 * Each row: name, kind and status (plus approval date, body and reference once approved). Context
 * menu `c-budget`: a first version of a year (*add*) and the comparison (*compare*). Per row: open the
 * grid, copy into a new version, and for drafts approve / edit / archive; compare with this as A.
 * Externally managed books (bexio): read-only banner, no actions.
 */
@Component({
  selector: 'okr-budget-version-list',
  standalone: true,
  imports: [
    SvgIconPipe, PrettyDatePipe, Spinner, EmptyList, ListFilter, Menu, ReadOnlyBanner,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonContent, IonList, IonItemGroup, IonItemDivider, IonItem, IonLabel, IonChip, IonPopover
  ],
  styles: [`
    ion-chip { font-size: 0.75rem; height: 22px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCount() }}/{{ store.activeCount() }} {{ store.i18n.budgets() }}</ion-title>
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
    </ion-header>

    <ion-content>
      <okr-read-only-banner />
      @if (store.isLoading()) {
        <okr-spinner />
      } @else if (filteredCount() === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for (group of store.versionGroups(); track group.fiscalYear) {
            <ion-item-group>
              <ion-item-divider color="primary">
                <ion-label><strong>{{ store.i18n.fiscalYear() }} {{ group.label }}</strong></ion-label>
              </ion-item-divider>
              @for (version of group.versions; track version.okey) {
                <ion-item button [detail]="false" (click)="showActions(version)">
                  <ion-label [color]="version.isArchived ? 'medium' : undefined">
                    <h2>{{ version.name }}</h2>
                    @if (version.status === 'approved' || version.status === 'superseded') {
                      <p>{{ version.approvedAt | prettyDate }} · {{ bodyLabel(version) }}@if (version.approvalRef) { · {{ version.approvalRef }} }</p>
                    }
                  </ion-label>
                  @if (version.isArchived) {
                    <ion-chip slot="end" color="warning">{{ store.i18n.status_archived() }}</ion-chip>
                  }
                  <ion-chip slot="end" color="medium" class="ion-hide-sm-down">{{ kindLabel(version) }}</ion-chip>
                  <ion-chip slot="end" [color]="statusColor(version.status)">{{ statusLabel(version.status) }}</ion-chip>
                </ion-item>
              }
            </ion-item-group>
          }
        </ion-list>
      }
    </ion-content>
  `
})
export class BudgetVersionList {
  protected readonly store = inject(BudgetStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly router = inject(Router);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  public readonly contextMenuName = input.required<string>();

  protected readonly popupId = 'c_budget_versions';
  protected readonly filteredCount = computed(() => this.store.versions().length);
  protected readonly currentUser = computed(() => this.store.currentUser());
  /** a treasurer on natively managed books; bexio books carry no budgets (D9) */
  protected readonly canChange = computed(() => this.store.isEnabled() && this.hasRole('treasurer'));

  /** the state select of okr-list-filter; it prepends 'all' itself. Item names are the filter values. */
  protected readonly archiveStates = computed((): CategoryListModel => {
    const _category = new CategoryListModel(this.store.appStore.tenantId());
    _category.name = 'archiveState';
    _category.i18n = BUDGET_I18N_SCOPE;
    _category.translateItems = true;
    _category.items = ['active', 'archived'].map(name => new CategoryItemModel(name, ''));
    return _category;
  });

  protected statusLabel(status: BudgetStatus | undefined): string {
    switch (status) {
      case 'approved': return this.store.i18n.status_approved();
      case 'superseded': return this.store.i18n.status_superseded();
      default: return this.store.i18n.status_draft();
    }
  }

  protected statusColor(status: BudgetStatus | undefined): string {
    switch (status) {
      case 'approved': return 'success';
      case 'superseded': return 'medium';
      default: return 'primary';
    }
  }

  protected kindLabel(version: BudgetVersionModel): string {
    return version.kind === 'forecast' ? this.store.i18n.kind_forecast() : this.store.i18n.kind_budget();
  }

  protected bodyLabel(version: BudgetVersionModel): string {
    switch (version.approvedBy) {
      case 'gv': return this.store.i18n.body_gv();
      case 'board': return this.store.i18n.body_board();
      default: return '';
    }
  }

  /*-------------------------- context menu --------------------------------*/
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const _method = $event.detail.data;
    if (!_method) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch (_method) {
      case 'add': await this.store.newVersion(); break;
      case 'compare': await this.openCompare(); break;
      default: error(undefined, `BudgetVersionList.onPopoverDismiss: unknown method ${_method}`);
    }
  }

  /*-------------------------- row actions --------------------------------*/
  protected async showActions(version: BudgetVersionModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(options, version);
    await this.executeActions(options, version);
  }

  private addActionSheetButtons(options: ActionSheetOptions, version: BudgetVersionModel): void {
    if (!this.store.isEnabled()) return; // externally managed books: no actions at all
    options.buttons.push(createActionSheetButton('budget.open', this.store.i18n.open(), this.imgixBaseUrl, 'grid'));
    if (this.canChange()) {
      // an archived version is read-only, but a copy of it is a new draft — otherwise archiving is a dead end
      options.buttons.push(createActionSheetButton('budget.copy', this.store.i18n.copyFrom(), this.imgixBaseUrl, 'copy'));
      if (!version.isArchived && isVersionEditable(version)) {
        options.buttons.push(createActionSheetButton('budget.approve', this.store.i18n.approve(), this.imgixBaseUrl, 'checkmark'));
        options.buttons.push(createActionSheetButton('budget.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
        options.buttons.push(createActionSheetButton('budget.archive', this.store.i18n.archive(), this.imgixBaseUrl, 'archive'));
      }
    }
    options.buttons.push(createActionSheetButton('budget.compare', this.store.i18n.compare(), this.imgixBaseUrl, 'swap-horizontal'));
    options.buttons.push(createActionSheetDivider());
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
  }

  private async executeActions(options: ActionSheetOptions, version: BudgetVersionModel): Promise<void> {
    if (options.buttons.length === 0) return;
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'budget.open': await this.openGrid(version); break;
      case 'budget.copy': await this.store.copyFrom(version); break;
      case 'budget.approve': await this.store.approve(version); break;
      case 'budget.edit': await this.store.editVersion(version, false); break;
      case 'budget.archive': await this.store.archive(version); break;
      case 'budget.compare': await this.openCompare(version); break;
    }
  }

  /*-------------------------- navigation --------------------------------*/
  private async openGrid(version: BudgetVersionModel): Promise<void> {
    await this.router.navigate(['/accounting', this.store.accountingTenantId(), 'budget', 'version', version.okey]);
  }

  /** The comparison; with a version it is preselected as A (`?a=`). */
  private async openCompare(version?: BudgetVersionModel): Promise<void> {
    await this.router.navigate(['/accounting', this.store.accountingTenantId(), 'budget', 'compare'],
      version ? { queryParams: { a: version.okey } } : undefined);
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
