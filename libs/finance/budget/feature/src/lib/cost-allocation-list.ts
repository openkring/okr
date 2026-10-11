import { Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList,
  IonItemDivider, IonMenuButton, IonNote, IonPopover, IonSelect, IonSelectOption, IonTitle, IonToolbar
} from '@ionic/angular/standalone';

import { Menu } from '@okr/cms-menu-feature';
import { CostAllocationModel, RoleName } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';

import { ReadOnlyBanner } from '@okr/finance-accounting-feature';
import { formatMinorAmount } from '@okr/finance-booking-util';
import { costCenterLabel } from '@okr/finance-cost-center-util';

import { BudgetStore } from './budget.store';

/**
 * Umlagen of one set of books (route `accounting/:accountingTenantId/allocation/:contextMenuName`, spec 1.65 D24),
 * per fiscal year: title, Aufwand/Ertrag, from → to Kostenstelle, percentage or fixed amount. Context menu
 * `c-allocation`: *add*. A row opens its action sheet (edit, archive). Treasurer only, native books.
 */
@Component({
  selector: 'okr-cost-allocation-list',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, Menu, ReadOnlyBanner,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonPopover,
    IonContent, IonList, IonItem, IonItemDivider, IonLabel, IonNote, IonSelect, IonSelectOption
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ rules().length }} {{ store.i18n.alloc_list_title() }}</ion-title>
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
    </ion-header>
    <ion-content>
      <okr-read-only-banner />
      <ion-item lines="none">
        <ion-select interface="popover" [label]="store.i18n.fiscalYear()" labelPlacement="stacked" [value]="year()" (ionChange)="year.set($event.detail.value)">
          @for (y of store.yearChoices(); track y) {
            <ion-select-option [value]="y">{{ store.fiscalYearLabel(y) }}</ion-select-option>
          }
        </ion-select>
      </ion-item>
      @if (store.isLoading()) {
        <okr-spinner />
      } @else if (rules().length === 0 && projectRules().length === 0) {
        <okr-empty-list [message]="store.i18n.alloc_empty()" />
      } @else {
        <ion-list lines="inset">
          @for (rule of rules(); track rule.okey) {
            <ion-item button [detail]="false" (click)="showActions(rule)">
              <ion-label>
                <h2>{{ rule.title }}</h2>
                <p>{{ sideLabel(rule) }} · {{ centerName(rule.fromCostCenterKey) }} → {{ rule.scope === 'centerToProject' ? projectName(rule.toProjectKey) : centerName(rule.toCostCenterKey) }}</p>
              </ion-label>
              <ion-note slot="end">{{ valueLabel(rule) }}</ion-note>
            </ion-item>
          }
          @if (projectRules().length > 0) {
            <ion-item-divider color="light"><ion-label>{{ store.i18n.alloc_lifetime() }}</ion-label></ion-item-divider>
            @for (rule of projectRules(); track rule.okey) {
              <ion-item button [detail]="false" (click)="showActions(rule)">
                <ion-label>
                  <h2>{{ rule.title }}</h2>
                  <p>{{ sideLabel(rule) }} · {{ projectName(rule.fromProjectKey) }} → {{ projectName(rule.toProjectKey) }}</p>
                </ion-label>
                <ion-note slot="end">{{ valueLabel(rule) }}</ion-note>
              </ion-item>
            }
          }
        </ion-list>
      }
    </ion-content>
  `
})
export class CostAllocationList {
  protected readonly store = inject(BudgetStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  public readonly contextMenuName = input.required<string>();
  protected readonly popupId = 'c_cost_allocations';
  protected readonly year = signal(this.store.currentFiscalYear());

  protected readonly rules = computed(() =>
    this.store.allocationRules().filter(r => (r.scope ?? 'center') !== 'project' && r.fiscalYear === this.year()));
  /** Projekt → Projekt Umlagen run over the projects' whole life — listed in their own section, independent of the year */
  protected readonly projectRules = computed(() => this.store.allocationRules().filter(r => r.scope === 'project'));
  private readonly projectNames = signal(new Map<string, string>());
  protected readonly canChange = computed(() => this.store.isEnabled() && this.hasRole('treasurer'));
  private readonly centerNames = computed(() => new Map(this.store.costCenterStore.costCenters().map(c => [c.okey, costCenterLabel(c)])));

  constructor() {
    this.store.loadAllocations();
    inject(DestroyRef).onDestroy(() => this.store.releaseAllocations());
    // listAll: an archived project still referenced by a rule keeps its name
    this.store.projectService.listAll().pipe(takeUntilDestroyed()).subscribe(ps => this.projectNames.set(new Map(ps.map(p => [p.okey, p.name ?? p.okey]))));
  }

  protected projectName(key: string): string {
    return this.projectNames().get(key) ?? key;
  }

  protected centerName(key: string): string {
    return this.centerNames().get(key) ?? key;
  }

  protected sideLabel(rule: CostAllocationModel): string {
    return rule.side === 'revenue' ? this.store.i18n.alloc_side_revenue() : this.store.i18n.alloc_side_expense();
  }

  protected valueLabel(rule: CostAllocationModel): string {
    return rule.mode === 'amount' ? formatMinorAmount(rule.amount?.amount ?? 0) : `${rule.percent ?? 0} %`;
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const _method = $event.detail.data;
    if (!_method) return;
    switch (_method) {
      case 'add': await this.store.editAllocation(this.year()); break;
      default: error(undefined, `CostAllocationList.onPopoverDismiss: unknown method ${_method}`);
    }
  }

  protected async showActions(rule: CostAllocationModel): Promise<void> {
    const options: ActionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    if (this.canChange()) {
      options.buttons.push(createActionSheetButton('allocation.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
      options.buttons.push(createActionSheetButton('allocation.archive', this.store.i18n.alloc_archive(), this.imgixBaseUrl, 'archive'));
    } else {
      options.buttons.push(createActionSheetButton('allocation.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
    }
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    switch (data?.action) {
      case 'allocation.edit':
      // a Projekt → Projekt rule has year 0: a scope switch in the form then needs the list's year
      case 'allocation.view': await this.store.editAllocation(rule.fiscalYear || this.year(), rule); break;
      case 'allocation.archive': await this.store.archiveAllocation(rule); break;
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}
