import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonItem, IonNote, IonRow, IonSpinner } from '@ionic/angular/standalone';

import { DEFAULT_NOTES, DEFAULT_TAGS, DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { AvatarInfo, CONTRACT_STATES, CONTRACT_TYPES, ContractModel, ContractParty, LoanTerms, MoneyModel, NoticePeriod, NoticeTerms, RoleName, UserModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import {
  AmountInput, AmountInputI18n, Chips, DateInput, DateInputI18n, ErrorNote, NotesInput, NotesInputI18n,
  NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextareaInput, TextInput, TextInputI18n,
} from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';

import { AvatarLabel, AvatarSelect } from '@okr/avatar-ui';
import {
  CONFIDENTIALITY_LEVELS, ContractI18n, contractValidations, formatLeadDays, isLoanType, LOAN_DIRECTIONS,
  newLoanTerms, newMoney, NOTICE_ANCHORS, NOTICE_UNITS, parseLeadDays, PARTY_ROLES, REPAYMENT_KINDS,
} from '@okr/business-contract-util';

/** What the form asks its parent to pick: the responsible person, or a new party (person or org). */
export type ContractSelectTarget = 'responsible' | 'partyPerson' | 'partyOrg';

/**
 * The contract dossier's terms (spec 1.5 §8). A dumb form: picking a person/org and generating the
 * summary need services, so the form only emits `selectClicked` / `summarizeClicked` and the parent
 * modal applies the result to `formData`.
 */
@Component({
  selector: 'okr-contract-form',
  standalone: true,
  imports: [
    ErrorNote, TextInput, TextareaInput, NumberInput, AmountInput, DateInput, StringSelect, NotesInput, Chips,
    AvatarSelect, AvatarLabel, SvgIconPipe,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonButton, IonIcon, IonItem, IonNote, IonSpinner,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ion-card-title { font-size: 1rem; }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>

        <!-- Allgemein -->
        <ion-card>
          <ion-card-header><ion-card-title>{{ i18n().section_general() }}</ion-card-title></ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"
                    [autofocus]="true" [maxLength]="shortNameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="nameErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="contractTypeI18n()" [selectedString]="contractType()"
                    (selectedStringChange)="onTypeChange($event)"
                    [stringList]="contractTypes" [labels]="contractTypeLabels()" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="contractTypeErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="contractNumberI18n()" [value]="contractNumber()" (valueChange)="onFieldChange('contractNumber', $event)"
                    [maxLength]="shortNameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="contractNumberErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="stateI18n()" [selectedString]="state()"
                    (selectedStringChange)="onFieldChange('state', $event)"
                    [stringList]="contractStates" [labels]="stateLabels()" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="stateErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="confidentialityI18n()" [selectedString]="confidentiality()"
                    (selectedStringChange)="onFieldChange('confidentiality', $event)"
                    [stringList]="confidentialityLevels" [labels]="confidentialityLabels()" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <okr-avatar-select name="responsible" [avatar]="responsible()" [title]="i18n().responsible_label()"
          [note]="i18n().responsible_note()" [selectLabel]="i18n().select()" [clearable]="!isReadOnly()"
          [readOnly]="isReadOnly()" (selectClicked)="selectClicked.emit('responsible')"
          (clearClicked)="onFieldChange('responsible', undefined)" />

        <!-- Parteien -->
        <ion-card>
          <ion-card-header><ion-card-title>{{ i18n().section_parties() }}</ion-card-title></ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              @for (party of parties(); track $index) {
                <ion-row class="ion-align-items-center">
                  <ion-col size="12" size-md="6">
                    <okr-avatar-label [key]="avatarKey(party.avatar)" [label]="avatarName(party.avatar)" />
                  </ion-col>
                  <ion-col size="10" size-md="5">
                    <okr-string-select [i18n]="partyRoleI18n()" [selectedString]="party.role"
                      (selectedStringChange)="onPartyRoleChange($index, $event)"
                      [stringList]="partyRoles" [labels]="partyRoleLabels()" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="2" size-md="1">
                    @if (!isReadOnly()) {
                      <ion-button fill="clear" color="danger" [attr.aria-label]="i18n().parties_remove()" (click)="removeParty($index)">
                        <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
                      </ion-button>
                    }
                  </ion-col>
                </ion-row>
              }
              @if (!isReadOnly()) {
                <ion-row>
                  <ion-col size="12">
                    <ion-button fill="clear" color="secondary" size="small" (click)="selectClicked.emit('partyPerson')">
                      <ion-icon slot="start" src="{{ 'add' | svgIcon }}" />
                      {{ i18n().parties_addPerson() }}
                    </ion-button>
                    <ion-button fill="clear" color="secondary" size="small" (click)="selectClicked.emit('partyOrg')">
                      <ion-icon slot="start" src="{{ 'add' | svgIcon }}" />
                      {{ i18n().parties_addOrg() }}
                    </ion-button>
                  </ion-col>
                </ion-row>
              }
              <ion-row>
                <ion-col size="12">
                  <okr-error-note [errors]="partiesErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- Laufzeit & Kündigung -->
        <ion-card>
          <ion-card-header><ion-card-title>{{ i18n().section_term() }}</ion-card-title></ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="signingDateI18n()" [storeDate]="signingDate()"
                    (storeDateChange)="onFieldChange('signingDate', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="signingDateErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="startDateI18n()" [storeDate]="startDate()"
                    (storeDateChange)="onFieldChange('startDate', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="startDateErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="endDateI18n()" [storeDate]="endDate()"
                    (storeDateChange)="onFieldChange('endDate', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="endDateErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="autoRenewMonthsI18n()" [value]="autoRenewMonths()"
                    (valueChange)="onFieldChange('autoRenewMonths', $event)"
                    [integer]="true" [min]="0" [max]="120" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="autoRenewMonthsErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="6" size-md="3">
                  <okr-number-input [i18n]="noticeOursI18n()" [value]="noticeOurs().duration"
                    (valueChange)="onNoticePeriodChange('ours', 'duration', $event)"
                    [integer]="true" [min]="0" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="6" size-md="3">
                  <okr-string-select [i18n]="noticeUnitI18n()" [selectedString]="noticeOurs().unit"
                    (selectedStringChange)="onNoticePeriodChange('ours', 'unit', $event)"
                    [stringList]="noticeUnits" [labels]="noticeUnitLabels()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="6" size-md="3">
                  <okr-number-input [i18n]="noticeTheirsI18n()" [value]="noticeTheirs().duration"
                    (valueChange)="onNoticePeriodChange('theirs', 'duration', $event)"
                    [integer]="true" [min]="0" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="6" size-md="3">
                  <okr-string-select [i18n]="noticeUnitI18n()" [selectedString]="noticeTheirs().unit"
                    (selectedStringChange)="onNoticePeriodChange('theirs', 'unit', $event)"
                    [stringList]="noticeUnits" [labels]="noticeUnitLabels()" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="noticeToI18n()" [selectedString]="noticeTo()"
                    (selectedStringChange)="onNoticeToChange($event)"
                    [stringList]="noticeAnchors" [labels]="noticeToLabels()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="reminderLeadDaysI18n()" [value]="reminderLeadDays()"
                    (valueChange)="onLeadDaysChange($event)" [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- Darlehen -->
        @if (isLoan()) {
          <ion-card>
            <ion-card-header><ion-card-title>{{ i18n().section_loan() }}</ion-card-title></ion-card-header>
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                <ion-row>
                  <ion-col size="12">
                    <okr-error-note [errors]="loanErrors()" />
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="loanDirectionI18n()" [selectedString]="loan().direction"
                      (selectedStringChange)="onLoanChange('direction', $event)"
                      [stringList]="loanDirections" [labels]="loanDirectionLabels()" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-amount-input [i18n]="principalI18n()" [value]="loan().principal.amount"
                      (valueChange)="onLoanMoneyChange('principal', $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-number-input [i18n]="interestRateI18n()" [value]="loan().interestRate"
                      (valueChange)="onLoanChange('interestRate', $event)" [min]="0" [max]="100" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="interestRateErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-date-input [i18n]="rateFixedUntilI18n()" [storeDate]="loan().rateFixedUntil"
                      (storeDateChange)="onLoanChange('rateFixedUntil', $event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="rateFixedUntilErrors()" />
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="repaymentI18n()" [selectedString]="loan().repayment"
                      (selectedStringChange)="onLoanChange('repayment', $event)"
                      [stringList]="repaymentKinds" [labels]="repaymentLabels()" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-amount-input [i18n]="repaymentAmountI18n()" [value]="loan().repaymentAmount?.amount ?? 0"
                      (valueChange)="onLoanMoneyChange('repaymentAmount', $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-number-input [i18n]="repaymentIntervalMonthsI18n()" [value]="loan().repaymentIntervalMonths"
                      (valueChange)="onLoanChange('repaymentIntervalMonths', $event)" [integer]="true" [min]="0" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-date-input [i18n]="maturityDateI18n()" [storeDate]="loan().maturityDate"
                      (storeDateChange)="onLoanChange('maturityDate', $event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="maturityDateErrors()" />
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="accountNoI18n()" [value]="loan().accountNo"
                      (valueChange)="onLoanChange('accountNo', $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="collateralI18n()" [value]="loan().collateral"
                      (valueChange)="onLoanChange('collateral', $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-amount-input [i18n]="outstandingI18n()" [value]="loan().outstanding?.amount ?? 0"
                      (valueChange)="onLoanMoneyChange('outstanding', $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-date-input [i18n]="outstandingAsOfI18n()" [storeDate]="loan().outstandingAsOf"
                      (storeDateChange)="onLoanChange('outstandingAsOf', $event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="outstandingAsOfErrors()" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>
        }

        <!-- Zusammenfassung -->
        <ion-card>
          <ion-card-header><ion-card-title>{{ i18n().section_abstract() }}</ion-card-title></ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <okr-textarea-input [i18n]="abstractI18n()" [value]="abstract()" (valueChange)="onAbstractChange($event)"
                    [maxLength]="descriptionLength" [rows]="4" [showHelper]="true" [readOnly]="isReadOnly()" />
                  @if (abstractSource() === 'ai') {
                    <ion-item lines="none"><ion-note>{{ i18n().abstract_ai() }}</ion-note></ion-item>
                  }
                </ion-col>
              </ion-row>
              @if (canSummarize()) {
                <ion-row>
                  <ion-col size="12">
                    <ion-button fill="clear" color="secondary" size="small" [disabled]="summarizing()" (click)="summarizeClicked.emit()">
                      @if (summarizing()) {
                        <ion-spinner slot="start" name="dots" />
                      } @else {
                        <ion-icon slot="start" src="{{ 'document' | svgIcon }}" />
                      }
                      {{ i18n().summarize() }}
                    </ion-button>
                    <okr-error-note [errors]="summarizeErrors()" />
                  </ion-col>
                </ion-row>
              }
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- guarded, always last -->
        @if (isWriter()) {
          <okr-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)"
            [allChips]="allTags()" [readOnly]="isReadOnly()" />
          <okr-error-note [errors]="tagsErrors()" />
        }
        @if (isWriter()) {
          <okr-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)"
            [maxLength]="descriptionLength" [errors]="notesErrors()" [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `,
})
export class ContractForm {
  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly shortNameLength = SHORT_NAME_LENGTH;
  protected readonly descriptionLength = DESCRIPTION_LENGTH;

  // option catalogues
  protected readonly contractTypes: string[] = CONTRACT_TYPES;
  protected readonly contractStates: string[] = CONTRACT_STATES;
  protected readonly confidentialityLevels: string[] = CONFIDENTIALITY_LEVELS;
  protected readonly partyRoles: string[] = PARTY_ROLES;
  protected readonly noticeUnits: string[] = NOTICE_UNITS;
  protected readonly noticeAnchors: string[] = NOTICE_ANCHORS;
  protected readonly loanDirections: string[] = LOAN_DIRECTIONS;
  protected readonly repaymentKinds: string[] = REPAYMENT_KINDS;

  // inputs
  public readonly i18n = input.required<ContractI18n>();
  public formData = model.required<ContractModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly tenantId = input.required<string>();
  public readonly allTags = input(DEFAULT_TAGS);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);
  /** the parent's summarize call is running */
  public readonly summarizing = input(false);
  /** a translated message when the parent's summarize call failed, '' otherwise */
  public readonly summarizeError = input('');

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  public readonly selectClicked = output<ContractSelectTarget>();
  public readonly summarizeClicked = output<void>();

  protected readonly contractForm = form(this.formData, (path) =>
    validateVestTree(path, contractValidations as any),
  );

  // per-field Vest errors for the notes under each field (validateVestTree calls the suite with the model alone)
  private readonly validationResult = computed(() => contractValidations(this.formData(), this.tenantId(), this.allTags()));
  private errorsOf(field: string): string[] {
    return this.validationResult().getErrors(field);
  }
  protected nameErrors = computed(() => this.errorsOf('name'));
  protected contractTypeErrors = computed(() => this.errorsOf('contractType'));
  protected contractNumberErrors = computed(() => this.errorsOf('contractNumber'));
  protected stateErrors = computed(() => this.errorsOf('state'));
  protected partiesErrors = computed(() => this.errorsOf('parties'));
  protected signingDateErrors = computed(() => this.errorsOf('signingDate'));
  protected startDateErrors = computed(() => this.errorsOf('startDate'));
  protected endDateErrors = computed(() => this.errorsOf('endDate'));
  protected autoRenewMonthsErrors = computed(() => this.errorsOf('autoRenewMonths'));
  protected loanErrors = computed(() => this.errorsOf('loan'));
  protected interestRateErrors = computed(() => this.errorsOf('loan.interestRate'));
  protected rateFixedUntilErrors = computed(() => this.errorsOf('loan.rateFixedUntil'));
  protected maturityDateErrors = computed(() => this.errorsOf('loan.maturityDate'));
  protected outstandingAsOfErrors = computed(() => this.errorsOf('loan.outstandingAsOf'));
  protected notesErrors = computed(() => this.errorsOf('notes'));
  /** tagValidations files failures per item ('tags[0]') */
  protected tagsErrors = computed(() => {
    const all = this.validationResult().getErrors() as Record<string, string[]>;
    return Object.entries(all).filter(([k]) => k === 'tags' || k.startsWith('tags[')).flatMap(([, v]) => v);
  });
  protected summarizeErrors = computed(() => (this.summarizeError() ? [this.summarizeError()] : []));

  constructor() {
    effect(() => this.valid.emit(this.contractForm().valid()));
  }

  // computed field accessors
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly name = computed(() => this.formData()?.name ?? '');
  protected readonly contractType = computed(() => this.formData()?.contractType ?? 'other');
  protected readonly contractNumber = computed(() => this.formData()?.contractNumber ?? '');
  protected readonly state = computed(() => this.formData()?.state ?? 'draft');
  protected readonly confidentiality = computed(() => this.formData()?.confidentiality ?? 'internal');
  protected readonly responsible = computed(() => this.formData()?.responsible);
  protected readonly parties = computed(() => this.formData()?.parties ?? []);
  protected readonly signingDate = computed(() => this.formData()?.signingDate ?? '');
  protected readonly startDate = computed(() => this.formData()?.startDate ?? '');
  protected readonly endDate = computed(() => this.formData()?.endDate ?? '');
  protected readonly autoRenewMonths = computed(() => this.formData()?.autoRenewMonths ?? 0);
  protected readonly noticeOurs = computed(() => this.formData()?.notice?.ours ?? EMPTY_PERIOD);
  protected readonly noticeTheirs = computed(() => this.formData()?.notice?.theirs ?? EMPTY_PERIOD);
  protected readonly noticeTo = computed(() => this.formData()?.notice?.to ?? 'anytime');
  protected readonly reminderLeadDays = computed(() => formatLeadDays(this.formData()?.reminderLeadDays));
  protected readonly isLoan = computed(() => isLoanType(this.formData()?.contractType));
  protected readonly loan = computed(() => this.formData()?.loan ?? newLoanTerms());
  protected readonly abstract = computed(() => this.formData()?.abstract ?? '');
  protected readonly abstractSource = computed(() => this.formData()?.abstractSource ?? '');
  protected readonly notes = computed(() => this.formData()?.notes ?? DEFAULT_NOTES);
  protected readonly tags = computed(() => this.formData()?.tags ?? DEFAULT_TAGS);

  /** AI summary: only for a saved contract (the callable reads its files) and never for strictly confidential ones. */
  protected readonly canSummarize = computed(() =>
    !this.isReadOnly() && !!this.formData()?.okey && this.confidentiality() !== 'strictlyConfidential');

  // select labels, parallel to the option catalogues
  private labelsOf(prefix: string, ids: string[]): string[] {
    const i18n = this.i18n() as unknown as Record<string, () => string>;
    return ids.map((id) => i18n[`${prefix}_${id}`]?.() ?? id);
  }
  protected contractTypeLabels = computed(() => this.labelsOf('type', this.contractTypes));
  protected stateLabels = computed(() => this.labelsOf('state', this.contractStates));
  protected confidentialityLabels = computed(() => this.labelsOf('confidentiality', this.confidentialityLevels));
  protected partyRoleLabels = computed(() => this.labelsOf('partyRole', this.partyRoles));
  protected noticeUnitLabels = computed(() => this.labelsOf('unit', this.noticeUnits));
  protected noticeToLabels = computed(() => this.labelsOf('noticeTo', this.noticeAnchors));
  protected loanDirectionLabels = computed(() => this.labelsOf('direction', this.loanDirections));
  protected repaymentLabels = computed(() => this.labelsOf('repayment', this.repaymentKinds));

  // per-field i18n for the shared/ui primitives
  protected nameI18n = computed(() => this.text('name', this.i18n().name_label(), this.i18n().name_placeholder()));
  protected contractNumberI18n = computed(() => this.text('contractNumber', this.i18n().contractNumber_label()));
  protected reminderLeadDaysI18n = computed(() => this.text('reminderLeadDays', this.i18n().reminderLeadDays_label(), '90, 30, 7', this.i18n().reminderLeadDays_helper()));
  protected accountNoI18n = computed(() => this.text('accountNo', this.i18n().loan_accountNo_label()));
  protected collateralI18n = computed(() => this.text('collateral', this.i18n().loan_collateral_label()));
  protected abstractI18n = computed(() => this.text('abstract', this.i18n().abstract_label(), '', this.i18n().abstract_helper()));

  protected contractTypeI18n = computed(() => this.select('contractType', this.i18n().contractType_label()));
  protected stateI18n = computed(() => this.select('state', this.i18n().state_label()));
  protected confidentialityI18n = computed(() => this.select('confidentiality', this.i18n().confidentiality_label()));
  protected partyRoleI18n = computed(() => this.select('partyRole', this.i18n().parties_role()));
  protected noticeUnitI18n = computed(() => this.select('noticeUnit', this.i18n().noticeUnit_label()));
  protected noticeToI18n = computed(() => this.select('noticeTo', this.i18n().noticeTo_label()));
  protected loanDirectionI18n = computed(() => this.select('direction', this.i18n().loan_direction_label()));
  protected repaymentI18n = computed(() => this.select('repayment', this.i18n().loan_repayment_label()));

  protected signingDateI18n = computed(() => this.date('signingDate', this.i18n().signingDate_label()));
  protected startDateI18n = computed(() => this.date('startDate', this.i18n().startDate_label()));
  protected endDateI18n = computed(() => this.date('endDate', this.i18n().endDate_label(), this.i18n().endDate_helper()));
  protected rateFixedUntilI18n = computed(() => this.date('rateFixedUntil', this.i18n().loan_rateFixedUntil_label()));
  protected maturityDateI18n = computed(() => this.date('maturityDate', this.i18n().loan_maturityDate_label()));
  protected outstandingAsOfI18n = computed(() => this.date('outstandingAsOf', this.i18n().loan_outstandingAsOf_label()));

  protected autoRenewMonthsI18n = computed(() => this.number('autoRenewMonths', this.i18n().autoRenewMonths_label(), this.i18n().autoRenewMonths_helper()));
  protected noticeOursI18n = computed(() => this.number('noticeOurs', this.i18n().noticeOurs_label()));
  protected noticeTheirsI18n = computed(() => this.number('noticeTheirs', this.i18n().noticeTheirs_label()));
  protected interestRateI18n = computed(() => this.number('interestRate', this.i18n().loan_interestRate_label()));
  protected repaymentIntervalMonthsI18n = computed(() => this.number('repaymentIntervalMonths', this.i18n().loan_repaymentIntervalMonths_label()));

  protected principalI18n = computed(() => ({ name: 'principal', label: this.i18n().loan_principal_label() } as AmountInputI18n));
  protected repaymentAmountI18n = computed(() => ({ name: 'repaymentAmount', label: this.i18n().loan_repaymentAmount_label() } as AmountInputI18n));
  protected outstandingI18n = computed(() => ({ name: 'outstanding', label: this.i18n().loan_outstanding_label() } as AmountInputI18n));

  protected notesI18n = computed(() => ({
    name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder(),
  } as NotesInputI18n));

  private text(name: string, label: string, placeholder = '', helper = ''): TextInputI18n {
    return { name, label, placeholder, helper };
  }
  private select(name: string, label: string): StringSelectI18n {
    return { name, label };
  }
  private date(name: string, label: string, helper = ''): DateInputI18n {
    return { name, label, placeholder: '', helper };
  }
  private number(name: string, label: string, helper = ''): NumberInputI18n {
    return { name, label, placeholder: '', helper };
  }

  protected avatarKey(avatar: AvatarInfo): string {
    return `${avatar.modelType}.${avatar.key}`;
  }
  protected avatarName(avatar: AvatarInfo): string {
    return `${avatar.name1 ?? ''} ${avatar.name2 ?? ''}`.trim();
  }

  // ---------------------------------------------------------------- changes
  protected onFieldChange(fieldName: keyof ContractModel, fieldValue: unknown): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  /** Switching to loan/mortgage seeds empty loan terms, so the Darlehen section has something to edit. */
  protected onTypeChange(contractType: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({
      ...vm,
      contractType: contractType as ContractModel['contractType'],
      loan: isLoanType(contractType as ContractModel['contractType']) && !vm.loan ? newLoanTerms() : vm.loan,
    }));
  }

  protected onPartyRoleChange(index: number, role: string): void {
    this.updateParties((parties) => parties.map((p, i) => (i === index ? { ...p, role: role as ContractParty['role'] } : p)));
  }

  protected removeParty(index: number): void {
    this.updateParties((parties) => parties.filter((_, i) => i !== index));
  }

  private updateParties(fn: (parties: ContractParty[]) => ContractParty[]): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, parties: fn(vm.parties ?? []) }));
  }

  protected onNoticePeriodChange(side: 'ours' | 'theirs', key: keyof NoticePeriod, value: string | number): void {
    this.updateNotice((n) => ({ ...n, [side]: { ...(n[side] ?? EMPTY_PERIOD), [key]: value } }));
  }

  protected onNoticeToChange(to: string): void {
    this.updateNotice((n) => ({ ...n, to: to as NoticeTerms['to'] }));
  }

  private updateNotice(fn: (notice: NoticeTerms) => NoticeTerms): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, notice: fn(vm.notice ?? { ours: undefined, theirs: undefined, to: 'anytime' }) }));
  }

  protected onLeadDaysChange(text: string): void {
    this.onFieldChange('reminderLeadDays', parseLeadDays(text));
  }

  protected onLoanChange(key: keyof LoanTerms, value: unknown): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, loan: { ...(vm.loan ?? newLoanTerms()), [key]: value } }));
  }

  /** amount-input works in minor units; keep the existing currency/periodicity of the money value */
  protected onLoanMoneyChange(key: 'principal' | 'repaymentAmount' | 'outstanding', amount: number): void {
    const current = this.formData()?.loan?.[key] as MoneyModel | undefined;
    this.onLoanChange(key, current ? { ...current, amount } : newMoney(amount));
  }

  /** a manual edit of the abstract makes it the user's own, even if the AI wrote it first */
  protected onAbstractChange(text: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, abstract: text, abstractSource: 'manual' }));
  }

  /** admin and treasurer maintain contracts (spec 1.5 D4) */
  protected isWriter(): boolean {
    return this.hasRole('treasurer');
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

const EMPTY_PERIOD: NoticePeriod = { duration: 0, unit: 'months' };
