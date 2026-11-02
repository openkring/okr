import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonContent, ModalController } from '@ionic/angular';
import { of } from 'rxjs';

import { AccountingConfigService } from '@okr/finance-accounting-data-access';
import { AccountService } from '@okr/finance-account-data-access';
import { CostCenterService } from '@okr/finance-cost-center-data-access';
import { getAccountKind } from '@okr/finance-account-util';
import { COURSE_I18N_KEYS, CourseI18n } from '@okr/calendar-course-util';
import { CourseFinanceForm, CourseForm } from '@okr/calendar-course-ui';
import { I18nService } from '@okr/shared-i18n';
import { AccountingConfigModel, CategoryListModel, CourseFinanceModel, CourseModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay, resourceParams } from '@okr/shared-util-angular';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';
import { AppStore } from '@okr/shared-feature';

/** What the modal hands back with role `'confirm'`. */
export type CourseEditResult = {
  course: CourseModel;
  /**
   * The finance document as edited — only when the modal showed it AND something in it was changed. `undefined`
   * means «leave the finance document alone»: `saveFinance` overwrites the whole document, so it is never sent
   * back unchanged, and never invented for a user who may not read it.
   */
  finance: CourseFinanceModel | undefined;
};

/**
 * Create or edit a course (spec 1.132 §7.1): header + change-confirmation + the course form, and below it the
 * finance form when the caller passes `finance`.
 *
 * `finance` is the contract with the caller: only people who may read the protected document (responsible persons,
 * group admins, privileged, treasurer) get it loaded, and the caller passes
 * - the loaded `CourseFinanceModel` to edit it,
 * - `new CourseFinanceModel()` to set up compensation for a course that has none yet (deliberately new),
 * - `undefined` for everybody else: the finance card is not shown and nothing is saved for finance. The modal
 *   makes no read attempt of its own, and never treats `undefined` as «empty, start fresh».
 */
@Component({
  selector: 'okr-course-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, CourseForm, CourseFinanceForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-course-form
          [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [calEventTypes]="calEventTypes()"
          [groupName]="groupName()"
          [locale]="locale()"
          [showForm]="showForm()"
          [readOnly]="isReadOnly()"
          (dirty)="courseDirty.set($event)"
          (valid)="courseValid.set($event)"
        />
      }
      @if (financeData(); as financeData) {
        <okr-course-finance-form
          [formData]="financeData" (formDataChange)="onFinanceChange($event)"
          [i18n]="i18n"
          [books]="books()"
          [defaultBooks]="defaultBooks()"
          [accounts]="accounts()"
          [costCenters]="costCenters()"
          [showForm]="showForm()"
          [readOnly]="isReadOnly()"
          (dirty)="financeDirty.set($event)"
          (valid)="financeValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class CourseEditModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: a store opens this modal, importing it back would be circular
  protected readonly i18n = inject(I18nService).translateAll(COURSE_I18N_KEYS) as CourseI18n;
  private readonly appStore = inject(AppStore);
  private readonly accountingConfigService = inject(AccountingConfigService);
  private readonly accountService = inject(AccountService);
  private readonly costCenterService = inject(CostCenterService);

  // inputs
  public readonly course = input.required<CourseModel>();
  /** see the class comment: loaded, deliberately new, or `undefined` = no finance part at all */
  public readonly finance = input<CourseFinanceModel | undefined>();
  public readonly currentUser = input<UserModel | undefined>();
  /** name of the course's group (shown read-only) */
  public readonly groupName = input('');
  /** the `calevent_type` category: one J+S mapping row per item */
  public readonly calEventTypes = input<CategoryListModel | undefined>();
  public readonly locale = input('de-ch');
  public readonly readOnly = input(false);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // state
  protected readonly courseDirty = signal(false);
  protected readonly courseValid = signal(false);
  protected readonly financeDirty = signal(false);
  protected readonly financeValid = signal(false);
  protected readonly showForm = signal(true);
  protected readonly formData = linkedSignal(() => safeStructuredClone(this.course()));
  protected readonly financeData = linkedSignal(() => safeStructuredClone(this.finance()));

  // The banner needs every form that is on screen to be valid, and any of them to be dirty.
  protected readonly showConfirmation = computed(() => {
    const valid = this.courseValid() && (!this.financeData() || this.financeValid());
    return valid && (this.courseDirty() || this.financeDirty());
  });
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.changeConfirmation_cancel(), save: this.i18n.changeConfirmation_ok(),
  } as ChangeConfirmationI18n));
  protected readonly headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.edit_view();
    return this.course()?.okey ? this.i18n.edit_update() : this.i18n.edit_create();
  });

  /******************************* books, accounts, cost centres ********************************
   * Only loaded when the finance part is shown. The books are the accounting-configs whose `tenants` contain the
   * tenant (`listForTenant`); the accounts and cost centres are those of the CHOSEN books, so they follow the
   * selection while the modal is open. The books are never derived from the app tenant. */
  private readonly booksResource = rxResource({
    params: resourceParams(() => !!this.financeData()),
    stream: ({ params: hasFinance }) => hasFinance ? this.accountingConfigService.listForTenant() : of([] as AccountingConfigModel[]),
  });
  protected readonly books = computed(() => this.booksResource.value() ?? []);
  /** the books the tenant has set as its default, or '' */
  protected readonly defaultBooks = computed(() => this.appStore.appConfig().defaultAccountingTenantId ?? '');

  private readonly chosenBooks = computed(() => this.financeData()?.accountingTenantId ?? '');
  private readonly accountsResource = rxResource({
    params: resourceParams(() => this.chosenBooks()),
    stream: ({ params: books }) => books ? this.accountService.list(books) : of([]),
  });
  /** compensation is an expense: only the Aufwand accounts of the chosen books are offered */
  protected readonly accounts = computed(() => (this.accountsResource.value() ?? []).filter(a => getAccountKind(a) === 'Aufwand'));
  private readonly costCentersResource = rxResource({
    params: resourceParams(() => this.chosenBooks()),
    stream: ({ params: books }) => books ? this.costCenterService.list(books) : of([]),
  });
  protected readonly costCenters = computed(() => this.costCentersResource.value() ?? []);

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    const result: CourseEditResult = {
      course: this.formData() as CourseModel,
      finance: this.financeData() && this.financeDirty() ? this.financeData() : undefined,
    };
    await dismissOverlay(this.modalController, result, 'confirm');
  }

  public cancel(): void {
    this.courseDirty.set(false);
    this.financeDirty.set(false);
    this.formData.set(safeStructuredClone(this.course()));
    this.financeData.set(safeStructuredClone(this.finance()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh forms → clears stale Vest state
  }

  protected onFormDataChange(formData: CourseModel): void {
    this.formData.set(formData);
  }

  protected onFinanceChange(finance: CourseFinanceModel): void {
    this.financeData.set(finance);
  }
}
