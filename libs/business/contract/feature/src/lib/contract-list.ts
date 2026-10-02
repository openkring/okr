import { Component, computed, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import {
  ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonChip, IonCol, IonContent, IonGrid, IonHeader,
  IonIcon, IonLabel, IonMenuButton, IonNote, IonPopover, IonRow, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { Menu } from '@okr/cms-menu-feature';
import { contractStateFilterCategory, contractTypeFilterCategory } from '@okr/business-contract-util';
import { ContractModel, DeadlineKind, MoneyModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, formatMinorAmount, ListFilter, Spinner } from '@okr/shared-ui';
import { AlertService, createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, fill } from '@okr/shared-util-core';

import { ContractListId, ContractStore } from './contract.store';

/**
 * Router input binding sets an unbound input to undefined. An unbound or misspelled listId falls
 * back to 'my' — the list every user may read — never to the staff list.
 */
function toListId(value: string | undefined | null): ContractListId {
  return value === 'all' ? 'all' : 'my';
}

/**
 * Contract list (spec 1.5 §8). `listId` (route data or param):
 * - `all` — staff list (treasurer/privileged/auditor, see isContractReaderGuard); treasurer edits.
 * - `my`  — contracts where the current person is a party; read-only.
 *
 * List-level actions come from the DB context menu (`c-contracts`: add, reload; `c-contracts-my`: reload).
 */
@Component({
  selector: 'okr-contract-list',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, ListFilter, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonPopover,
    IonContent, IonGrid, IonRow, IonCol, IonLabel, IonNote, IonChip,
  ],
  providers: [ContractStore],
  styles: [`
    ion-row.contract-row { cursor: pointer; border-bottom: 1px solid var(--ion-color-light); }
    ion-col p { margin: 2px 0 0; font-size: 0.85rem; color: var(--ion-color-medium); }
    .filter-row { padding: 0 8px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCount() }}/{{ count() }} {{ title() }}</ion-title>
        @if (contextMenuName()) {
          <ion-buttons slot="end">
            <ion-button id="{{ popupId() }}">
              <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName()" />
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-toolbar>

      <okr-list-filter
        (searchTermChanged)="store.setSearchTerm($event)"
        (typeChanged)="store.setTypeFilter($event)" [types]="types()" [selectedType]="store.typeFilter()" [hideTypesOnMobile]="true"
        (stateChanged)="store.setStateFilter($event)" [states]="states()" [selectedState]="store.stateFilter()"
      />
      <ion-toolbar class="filter-row">
        <ion-chip [outline]="!store.dueSoon()" [color]="store.dueSoon() ? 'primary' : 'medium'" (click)="store.toggleDueSoon()">
          <ion-icon src="{{ 'calendar' | svgIcon }}" />
          <ion-label>{{ store.i18n.filter_dueSoon() }}</ion-label>
        </ion-chip>
        @if (store.hasLoans()) {
          <ion-note slot="end" class="ion-padding-end">{{ loanTotals() }}</ion-note>
        }
      </ion-toolbar>

      <ion-toolbar color="primary" class="ion-hide-sm-down">
        <ion-grid>
          <ion-row>
            <ion-col size="8" size-md="4"><ion-label><strong>{{ store.i18n.name_label() }}</strong></ion-label></ion-col>
            <ion-col size="2" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.contractType_label() }}</strong></ion-label></ion-col>
            <ion-col size="4" size-md="2"><ion-label><strong>{{ store.i18n.state_label() }}</strong></ion-label></ion-col>
            <ion-col size="2" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.deadline_next() }}</strong></ion-label></ion-col>
            <ion-col size="2" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.section_parties() }}</strong></ion-label></ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (isLoading()) {
        <okr-spinner />
      } @else if (filteredCount() === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-grid>
          @for (contract of filtered(); track contract.okey) {
            <ion-row class="contract-row ion-align-items-center" (click)="showActions(contract)">
              <ion-col size="8" size-md="4">
                <ion-label>{{ contract.name }}</ion-label>
                @if (contract.loan) {
                  <p>{{ store.i18n.loan_principal_label() }}: {{ money(contract.loan.principal) }}
                    @if (contract.loan.outstanding) {
                      · {{ store.i18n.loan_outstanding_label() }}: {{ money(contract.loan.outstanding) }}
                      @if (contract.loan.outstandingAsOf) { ({{ viewDate(contract.loan.outstandingAsOf) }}) }
                    }
                  </p>
                }
              </ion-col>
              <ion-col size="2" class="ion-hide-md-down"><ion-label>{{ typeLabel(contract) }}</ion-label></ion-col>
              <ion-col size="4" size-md="2"><ion-label>{{ stateLabel(contract) }}</ion-label></ion-col>
              <ion-col size="2" class="ion-hide-md-down">
                <ion-label>{{ viewDate(contract.nextDeadline) }}</ion-label>
                @if (contract.nextDeadlineKind) {
                  <p>{{ kindLabel(contract.nextDeadlineKind) }}</p>
                }
              </ion-col>
              <ion-col size="2" class="ion-hide-md-down"><ion-label>{{ counterparties(contract) }}</ion-label></ion-col>
            </ion-row>
          }
        </ion-grid>
      }
    </ion-content>
  `,
})
export class ContractList {
  protected readonly store = inject(ContractStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertService = inject(AlertService);
  private readonly router = inject(Router);

  // inputs (route binding)
  public readonly listId = input<ContractListId, string | undefined | null>('my', { transform: toListId });
  public readonly contextMenuName = input<string, string | undefined | null>('', { transform: (v) => v ?? '' });

  // data
  protected readonly filtered = computed(() => this.store.filteredContracts());
  protected readonly count = computed(() => this.store.contracts().length);
  protected readonly filteredCount = computed(() => this.filtered().length);
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly isMyList = computed(() => this.listId() === 'my');
  /** the `my` list is read-only even for a treasurer (spec §8) */
  protected readonly canEdit = computed(() => this.store.canEdit() && !this.isMyList());
  protected readonly title = computed(() => this.isMyList() ? this.store.i18n.myPlural() : this.store.i18n.plural());
  protected readonly popupId = computed(() => `c_contracts_${this.listId()}`);
  protected readonly types = computed(() => contractTypeFilterCategory(this.store.tenantId()));
  protected readonly states = computed(() => contractStateFilterCategory(this.store.tenantId()));
  protected readonly loanTotals = computed(() => {
    const { principal, outstanding } = this.store.loanTotals();
    return fill(this.store.i18n.loanTotals(), { principal: formatMinorAmount(principal), outstanding: formatMinorAmount(outstanding) });
  });

  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => this.store.setListId(this.listId()));
  }

  /******************************* labels *************************************** */
  protected typeLabel(c: ContractModel): string {
    return this.store.i18n[`type_${c.contractType}`]?.() ?? c.contractType;
  }

  protected stateLabel(c: ContractModel): string {
    return this.store.i18n[`state_${c.state}`]?.() ?? c.state;
  }

  protected kindLabel(kind: DeadlineKind): string {
    return this.store.i18n[`deadlineKind_${kind}`]?.() ?? kind;
  }

  protected viewDate(storeDate: string): string {
    return storeDate ? convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false) : '';
  }

  protected money(m: MoneyModel | undefined): string {
    return m ? `${m.currency ?? 'CHF'} ${formatMinorAmount(m.amount)}` : '';
  }

  /** the other side: counterparties (and guarantors), never our own internal party */
  protected counterparties(c: ContractModel): string {
    return (c.parties ?? [])
      .filter((p) => p.role !== 'internal')
      .map((p) => `${p.avatar.name1 ?? ''} ${p.avatar.name2 ?? ''}`.trim())
      .filter(Boolean)
      .join(', ');
  }

  /******************************* actions *************************************** */
  protected async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return;   // dismissed via backdrop/escape — not an error
    switch (selectedMethod) {
      case 'add': if (this.canEdit()) await this.store.add(); break;
      case 'reload': this.store.reload(); break;
      default: this.alertService.error(`ContractList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  protected async showActions(contract: ContractModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(options, contract);
    await this.executeActions(options, contract);
  }

  private addActionSheetButtons(options: ActionSheetOptions, contract: ContractModel): void {
    if (this.canEdit()) {
      options.buttons.push(createActionSheetButton('contract.edit', this.store.i18n.edit(), this.imgixBaseUrl, 'edit'));
      options.buttons.push(createActionSheetButton('contract.dossier', this.store.i18n.dossier(), this.imgixBaseUrl, 'folder'));
      if (contract.state === 'active') {
        options.buttons.push(createActionSheetButton('contract.notice', this.store.i18n.notice_title(), this.imgixBaseUrl, 'calendar'));
      }
      // the summarize button lives in the edit modal; offered only where it can run (saved, not strict)
      if (contract.okey && contract.isStrictlyConfidential === false) {
        options.buttons.push(createActionSheetButton('contract.summarize', this.store.i18n.summarize(), this.imgixBaseUrl, 'document'));
      }
      options.buttons.push(createActionSheetDivider());
      options.buttons.push(createActionSheetButton('contract.archive', this.store.i18n.as_archive(), this.imgixBaseUrl, 'archive'));
    } else {
      options.buttons.push(createActionSheetButton('contract.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
      options.buttons.push(createActionSheetButton('contract.dossier', this.store.i18n.dossier(), this.imgixBaseUrl, 'folder'));
    }
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    if (options.buttons.length === 1) options.buttons = [];   // only cancel → show nothing
  }

  private async executeActions(options: ActionSheetOptions, contract: ContractModel): Promise<void> {
    if (options.buttons.length === 0) return;
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'contract.view': await this.store.edit(contract, true); break;
      case 'contract.edit': await this.store.edit(contract, false); break;
      case 'contract.summarize': await this.store.edit(contract, false); break;
      case 'contract.dossier': await this.router.navigate(['/contract', 'detail', contract.okey]); break;
      case 'contract.notice': await this.store.giveNotice(contract); break;
      case 'contract.archive': await this.store.archive(contract); break;
    }
  }
}
