import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonContent, IonItem, IonNote, ModalController } from '@ionic/angular/standalone';
import { of } from 'rxjs';

import { AppStore, MultiSelectModal } from '@okr/shared-feature';
import { AccountService } from '@okr/finance-account-data-access';
import { AccountingStore, VoucherTiles } from '@okr/finance-accounting-feature';
import { CostCenterStore } from '@okr/finance-cost-center-feature';
import { ProjectService } from '@okr/project-project-data-access';
import { AvatarInfo, BillLine, BillModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, getAvatarInfo, safeStructuredClone } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

import { BillEditForm } from '@okr/finance-bill-ui';
import { BILL_I18N_KEYS, BillI18n, billVoucherKeys, isDraftBill, toBillLines } from '@okr/finance-bill-util';
import { dismissOverlay } from '@okr/shared-util-angular';

/** What the modal dismisses with on confirm. */
export interface BillEditResult {
  bill: BillModel;
  lines: BillLine[];
}

/**
 * Edits a native draft bill with its lines (spec 1.85 phase 3); anything but a draft is shown
 * read-only — unless `mode` is 'details' (spec 1.92): a booked or paid bill whose texts, notes, payment
 * data and line Kostenstelle / Kostenträger can still be changed. Lives in the feature lib because it loads the chart of accounts and picks the vendor with
 * MultiSelectModal. Dismisses with `BillEditResult` on confirm — the store writes it through `writeBill`.
 */
@Component({
  selector: 'okr-bill-edit-modal',
  standalone: true,
  imports: [
    VoucherTiles,
    Header, ChangeConfirmation, BillEditForm,
    IonContent, IonItem, IonNote,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <!-- same markup as okr-error-note, which cannot take a filled-in text (it translates its input as a key) -->
      @if(duplicateNote(); as duplicateNote) {
        <ion-item lines="none">
          <ion-note color="warning">{{ duplicateNote }}</ion-note>
        </ion-item>
      }
      @if(formData(); as formData) {
        <okr-bill-edit-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [lines]="lines()"
          (linesChange)="lines.set($event)"
          [accounts]="accounts()"
          [defaultAccountKey]="defaultAccountKey()"
          [costCenters]="costCenterStore.costCenters()"
          [costCentersEnabled]="costCenterStore.isEnabled()"
          [bookDefaultCostCenterKey]="bookDefaultCostCenterKey()"
          [projects]="ledgerProjects()"
          [currentUser]="currentUser()"
          [readOnly]="isReadOnly()"
          [isNew]="isNew()"
          [mode]="mode()"
          [storedDueDate]="bill().dueDate"
          [i18n]="i18n"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
          (vendorSelect)="selectVendor()"
        />
      }
      <!-- attachments migrated from bexio: finance-documents okeys, files in the private bucket (spec 1.74) -->
      <okr-voucher-tiles [documentKeys]="voucherKeys()" />
    </ion-content>
  `
})
export class BillEditModal {
  private readonly modalController = inject(ModalController);
  private readonly accountService = inject(AccountService);
  private readonly appStore = inject(AppStore);
  private readonly accountingStore = inject(AccountingStore);
  private readonly projectService = inject(ProjectService);
  protected readonly costCenterStore = inject(CostCenterStore);
  // direct inject, no store: the store opens this modal, importing it back would be circular
  protected readonly i18n = inject(I18nService).translateAll(BILL_I18N_KEYS) as BillI18n;

  // inputs
  public readonly bill = input.required<BillModel>();
  public readonly currentUser = input.required<UserModel>();
  public readonly isNew = input.required<boolean>();
  public readonly readOnly = input(true);
  /** 'details': edit the details of a booked or paid bill (the store saves them through `updateBillDetails`) */
  public readonly mode = input<'draft' | 'details'>('draft');
  /** the account a new line starts on (the books' default expense account) */
  public readonly defaultAccountKey = input('');
  /** a new bill that looks like one already captured (spec 1.91): the warning shown above the form; '' = none */
  public readonly duplicateNote = input('');

  // legacy bills still hold bexio file UUIDs — only migrated keys are vouchers
  protected readonly voucherKeys = computed(() => billVoucherKeys(this.bill()));

  // signals
  protected formData = linkedSignal(() => safeStructuredClone(this.bill()));
  protected readonly lines = linkedSignal(() => toBillLines(this.bill()));
  // a new bill starts dirty: a scanned or uploaded draft is already complete, so «Speichern» must show without an edit
  protected formDirty = linkedSignal(() => this.isNew());
  protected formValid = signal(false);

  private readonly accountsResource = rxResource({
    params: () => ({ accountingTenantId: this.bill().accountingTenantId }),
    stream: ({ params }) => params.accountingTenantId ? this.accountService.list(params.accountingTenantId) : of([]),
  });
  protected readonly accounts = computed(() => this.accountsResource.value() ?? []);
  // all projects incl. archived: the picker offers only active ones but still names an archived selected one (spec 3.14)
  private readonly projectsResource = rxResource({ stream: () => this.projectService.listAll() });
  /** like the Kostenstellen: no picker on an externally managed (bexio) ledger */
  protected readonly ledgerProjects = computed(() => this.accountingStore.isExternallyManaged() ? [] : (this.projectsResource.value() ?? []));
  protected readonly bookDefaultCostCenterKey = computed(() => this.accountingStore.config()?.defaultCostCenterKey ?? '');

  // computed
  /** only a draft can be changed in full; booked and paid bills take the details mode, else they are frozen */
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()) || (this.mode() === 'draft' && !isDraftBill(this.bill())));
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty() && !this.isReadOnly());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save() } as ChangeConfirmationI18n));
  protected readonly headerTitle = computed(() => {
    if (this.isNew()) return this.i18n.create();
    if (this.isReadOnly()) return this.i18n.view();
    return this.mode() === 'details' ? this.i18n.details_update() : this.i18n.update();
  });

  protected onFormDataChange(data: BillModel): void {
    this.formData.set(data);
  }

  /** one picker with a segment each for orgs and persons; orgs first — most vendors are companies */
  protected async selectVendor(): Promise<void> {
    if (this.isReadOnly()) return;
    const modal = await this.modalController.create({
      component: MultiSelectModal,
      cssClass: 'list-modal',
      componentProps: { contents: 'org,person', selectedTag: '', currentUser: this.currentUser(), title: this.i18n.vendor_select() },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<string>();
    if (role !== 'confirm' || !data) return;
    const vendor = this.toVendor(data);
    if (vendor) {
      this.formDirty.set(true);
      this.formData.update((vm) => (vm ? { ...vm, vendor } : vm));
    }
  }

  /** MultiSelectModal answers `modelType.okey`; resolve it against the loaded persons and orgs */
  private toVendor(selection: string): AvatarInfo | undefined {
    const [modelType, key] = selection.split('.');
    if (modelType === 'person') return getAvatarInfo(this.appStore.allPersons().find(p => p.okey === key), 'person');
    if (modelType === 'org') return getAvatarInfo(this.appStore.allOrgs().find(o => o.okey === key), 'org');
    return undefined;
  }

  protected async save(): Promise<void> {
    const bill = this.formData();
    if (!bill) return;
    const result: BillEditResult = { bill, lines: this.lines() };
    await dismissOverlay(this.modalController, result, 'confirm');
  }

  protected async cancel(): Promise<void> {
    await dismissOverlay(this.modalController, null, 'cancel');
  }
}
