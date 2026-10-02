import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid,
  IonHeader, IonIcon, IonItem, IonLabel, IonList, IonNote, IonRow, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';
import { catchError, of } from 'rxjs';

import { ContractDeadlines, ContractDossier } from '@okr/business-contract-ui';
import { FirestoreService } from '@okr/shared-data-access';
import { ContractCollection, ContractModel, MoneyModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, formatMinorAmount, Spinner } from '@okr/shared-ui';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

import { ContractStore } from './contract.store';

interface InfoRow { label: string; value: string; }

/**
 * `/contract/detail/:contractKey` (spec 1.5 §8): header (name, type, state, parties), deadlines,
 * dossier, abstract and the loan terms — all read-only; the treasurer edits through the modal.
 *
 * Access is the Firestore rules' job (staff or a party). A denied or missing document resolves to
 * undefined and the page shows its not-found state instead of an error.
 *
 * The store is provided here (own instance). The page is opened by the ROUTER, not by the store,
 * so injecting the store is not the store↔modal cycle.
 */
@Component({
  selector: 'okr-contract-page',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, ContractDeadlines, ContractDossier,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonButton, IonIcon,
    IonContent, IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonList, IonItem, IonLabel, IonNote,
  ],
  providers: [ContractStore],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ion-card-title { font-size: 1rem; }
    .abstract { white-space: pre-wrap; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start">
          <ion-back-button [defaultHref]="backHref()" />
        </ion-buttons>
        <ion-title>{{ contract()?.name || store.i18n.plural() }}</ion-title>
        @if (contract(); as c) {
          <ion-buttons slot="end">
            @if (store.canEdit()) {
              @if (c.state === 'active') {
                <ion-button (click)="store.giveNotice(c)">
                  <ion-icon slot="icon-only" src="{{ 'calendar' | svgIcon }}" [attr.aria-label]="store.i18n.notice_title()" />
                </ion-button>
              }
              <ion-button (click)="store.edit(c, false)">
                <ion-icon slot="icon-only" src="{{ 'edit' | svgIcon }}" [attr.aria-label]="store.i18n.edit()" />
              </ion-button>
            } @else {
              <ion-button (click)="store.edit(c, true)">
                <ion-icon slot="icon-only" src="{{ 'eye-on' | svgIcon }}" [attr.aria-label]="store.i18n.view()" />
              </ion-button>
            }
          </ion-buttons>
        }
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (isLoading()) {
        <okr-spinner />
      } @else if (!contract()) {
        <okr-empty-list [message]="store.i18n.notFound()" />
      } @else {
        @let c = contract()!;
        <ion-grid class="ion-no-padding">
          <ion-row>
            <ion-col size="12" size-md="6">
              <ion-card>
                <ion-card-header><ion-card-title>{{ store.i18n.section_general() }}</ion-card-title></ion-card-header>
                <ion-card-content class="ion-no-padding">
                  <ion-list lines="inset">
                    @for (row of generalRows(); track row.label) {
                      <ion-item>
                        <ion-label class="ion-text-wrap">{{ row.label }}</ion-label>
                        <ion-note slot="end">{{ row.value }}</ion-note>
                      </ion-item>
                    }
                    @for (party of partyRows(); track $index) {
                      <ion-item>
                        <ion-label class="ion-text-wrap">{{ party.label }}</ion-label>
                        <ion-note slot="end">{{ party.value }}</ion-note>
                      </ion-item>
                    }
                  </ion-list>
                </ion-card-content>
              </ion-card>

              <okr-contract-deadlines [contract]="c" />

              @if (loanRows().length > 0) {
                <ion-card>
                  <ion-card-header><ion-card-title>{{ store.i18n.section_loan() }}</ion-card-title></ion-card-header>
                  <ion-card-content class="ion-no-padding">
                    <ion-list lines="inset">
                      @for (row of loanRows(); track row.label) {
                        <ion-item>
                          <ion-label class="ion-text-wrap">{{ row.label }}</ion-label>
                          <ion-note slot="end">{{ row.value }}</ion-note>
                        </ion-item>
                      }
                    </ion-list>
                  </ion-card-content>
                </ion-card>
              }
            </ion-col>

            <ion-col size="12" size-md="6">
              <okr-contract-dossier [contract]="c" [canEdit]="store.canEdit()" (changed)="reload()" />

              @if (c.abstract) {
                <ion-card>
                  <ion-card-header><ion-card-title>{{ store.i18n.abstract_label() }}</ion-card-title></ion-card-header>
                  <ion-card-content>
                    <p class="abstract">{{ c.abstract }}</p>
                    @if (c.abstractSource === 'ai') {
                      <ion-note>{{ store.i18n.abstract_ai() }}</ion-note>
                    }
                  </ion-card-content>
                </ion-card>
              }
            </ion-col>
          </ion-row>
        </ion-grid>
      }
    </ion-content>
  `,
})
export class ContractPage {
  /** Route param `:contractKey`. */
  public readonly contractKey = input.required<string>();

  protected readonly store = inject(ContractStore);
  private readonly firestoreService = inject(FirestoreService);

  private readonly contractResource = rxResource<ContractModel | undefined, string>({
    params: () => this.contractKey(),
    // a rules denial must not leave the resource in error state (value() would throw)
    stream: ({ params }) => this.firestoreService.readModel<ContractModel>(ContractCollection, params).pipe(
      catchError(() => of(undefined)),
    ),
  });

  protected readonly isLoading = computed(() => this.contractResource.isLoading());
  /** undefined for missing, denied, archived or another tenant's contract → not-found state */
  protected readonly contract = computed(() => {
    if (this.contractResource.status() === 'error') return undefined;
    const c = this.contractResource.value();
    if (!c || c.isArchived || !(c.tenants ?? []).includes(this.store.tenantId())) return undefined;
    return c;
  });
  /** staff come from the full list, everybody else from their own contracts */
  protected readonly backHref = computed(() => this.store.canEdit() ? '/contract/all/c-contracts' : '/contract/my/c-contracts-my');

  protected readonly generalRows = computed<InfoRow[]>(() => {
    const c = this.contract();
    if (!c) return [];
    const i = this.store.i18n;
    const rows: InfoRow[] = [
      { label: i.contractType_label(), value: i[`type_${c.contractType}`]?.() ?? c.contractType },
      { label: i.state_label(), value: i[`state_${c.state}`]?.() ?? c.state },
    ];
    if (c.contractNumber) rows.push({ label: i.contractNumber_label(), value: c.contractNumber });
    if (c.signingDate) rows.push({ label: i.signingDate_label(), value: this.viewDate(c.signingDate) });
    if (c.startDate) rows.push({ label: i.startDate_label(), value: this.viewDate(c.startDate) });
    if (c.endDate) rows.push({ label: i.endDate_label(), value: this.viewDate(c.endDate) });
    if (c.responsible) rows.push({ label: i.responsible_label(), value: this.avatarName(c.responsible) });
    return rows;
  });

  protected readonly partyRows = computed<InfoRow[]>(() =>
    (this.contract()?.parties ?? []).map((p) => ({
      label: this.store.i18n[`partyRole_${p.role}`]?.() ?? p.role,
      value: this.avatarName(p.avatar),
    })));

  protected readonly loanRows = computed<InfoRow[]>(() => {
    const loan = this.contract()?.loan;
    if (!loan) return [];
    const i = this.store.i18n;
    const rows: InfoRow[] = [
      { label: i.loan_direction_label(), value: i[`direction_${loan.direction}`]?.() ?? loan.direction },
      { label: i.loan_principal_label(), value: this.money(loan.principal) },
      { label: i.loan_interestRate_label(), value: `${loan.interestRate ?? 0}` },
    ];
    if (loan.rateFixedUntil) rows.push({ label: i.loan_rateFixedUntil_label(), value: this.viewDate(loan.rateFixedUntil) });
    rows.push({ label: i.loan_repayment_label(), value: i[`repayment_${loan.repayment}`]?.() ?? loan.repayment });
    if (loan.repaymentAmount) rows.push({ label: i.loan_repaymentAmount_label(), value: this.money(loan.repaymentAmount) });
    if (loan.repaymentIntervalMonths) rows.push({ label: i.loan_repaymentIntervalMonths_label(), value: `${loan.repaymentIntervalMonths}` });
    if (loan.maturityDate) rows.push({ label: i.loan_maturityDate_label(), value: this.viewDate(loan.maturityDate) });
    if (loan.outstanding) rows.push({ label: i.loan_outstanding_label(), value: this.money(loan.outstanding) });
    if (loan.outstandingAsOf) rows.push({ label: i.loan_outstandingAsOf_label(), value: this.viewDate(loan.outstandingAsOf) });
    if (loan.accountNo) rows.push({ label: i.loan_accountNo_label(), value: loan.accountNo });
    if (loan.collateral) rows.push({ label: i.loan_collateral_label(), value: loan.collateral });
    return rows;
  });

  protected reload(): void {
    this.contractResource.reload();
  }

  private viewDate(storeDate: string): string {
    return storeDate ? convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false) : '';
  }

  private money(m: MoneyModel | undefined): string {
    return m ? `${m.currency ?? 'CHF'} ${formatMinorAmount(m.amount)}` : '';
  }

  private avatarName(a: { name1?: string; name2?: string } | undefined): string {
    return `${a?.name1 ?? ''} ${a?.name2 ?? ''}`.trim();
  }
}
