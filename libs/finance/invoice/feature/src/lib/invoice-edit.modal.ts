import { Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActionSheetController, IonContent, ModalController } from '@ionic/angular/standalone';
import { firstValueFrom, of } from 'rxjs';

import { AppStore, ModelSelectService } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AvatarInfo, InvoiceModel, MembershipModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header, Spinner } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean, DateFormat, getTodayStr, getYear, isAfterDate, safeStructuredClone } from '@okr/shared-util-core';

import { AccountService } from '@okr/finance-account-data-access';
import { AccountingConfigService } from '@okr/finance-accounting-data-access';
import { ReadOnlyBanner } from '@okr/finance-accounting-feature';
import { InvoiceService } from '@okr/finance-invoice-data-access';
import { FeePositionSelectModal, InvoiceEditForm } from '@okr/finance-invoice-ui';
import { MembershipService } from '@okr/relationship-membership-data-access';
import {
  addPickedPosition, feeOptionToPosition, FeePickOption, feePickOptions, INVOICE_I18N_KEYS, InvoiceI18n,
  InvoicePositionInput, isDraftInvoice, newInvoicePosition, toCategoryPriceLists, toPositionInputs,
} from '@okr/finance-invoice-util';

/** What the modal dismisses with on confirm. */
export interface InvoiceEditResult {
  invoice: InvoiceModel;
  positions: InvoicePositionInput[];
}

/**
 * Edits a native draft invoice with its positions (spec 1.76); anything but a draft is shown
 * read-only. Lives in the feature lib because it loads the positions and the chart of accounts and
 * picks the receiver with ModelSelectService. Dismisses with `InvoiceEditResult` on confirm — the
 * caller writes it through `writeInvoice`.
 */
@Component({
  selector: 'okr-invoice-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, InvoiceEditForm, ReadOnlyBanner, Spinner,
    IonContent,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (!positionsLoaded()) {
        <okr-spinner />
      } @else {
        @if(positionsFailed()) {
          <okr-read-only-banner [message]="i18n.positions_failed()" />
        }
        @if(formData(); as formData) {
          <okr-invoice-edit-form
            [formData]="formData"
            (formDataChange)="onFormDataChange($event)"
            [positions]="positions()"
            (positionsChange)="positions.set($event)"
            [accounts]="accounts()"
            [currentUser]="currentUser()"
            [readOnly]="isReadOnly()"
            [i18n]="i18n"
            (dirty)="formDirty.set($event)"
            (valid)="formValid.set($event)"
            (receiverSelect)="selectReceiver()"
            (feeSelect)="selectFeePosition()"
          />
        }
      }
    </ion-content>
  `
})
export class InvoiceEditModal {
  private readonly modalController = inject(ModalController);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly modelSelectService = inject(ModelSelectService);
  private readonly invoiceService = inject(InvoiceService);
  private readonly accountService = inject(AccountService);
  private readonly accountingConfigService = inject(AccountingConfigService);
  private readonly membershipService = inject(MembershipService);
  private readonly appStore = inject(AppStore);
  // direct inject, no store: the store opens this modal, importing it back would be circular
  protected readonly i18n = inject(I18nService).translateAll(INVOICE_I18N_KEYS) as InvoiceI18n;

  // inputs
  public readonly invoice = input.required<InvoiceModel>();
  public readonly currentUser = input.required<UserModel>();
  public readonly isNew = input.required<boolean>();
  public readonly readOnly = input(true);

  // signals
  protected formData = linkedSignal(() => safeStructuredClone(this.invoice()));
  protected readonly positions = signal<InvoicePositionInput[]>([]);
  protected readonly positionsLoaded = signal(false);
  /** the positions could not be read: saving would replace them with what is shown, so do not offer it */
  protected readonly positionsFailed = signal(false);
  protected formDirty = signal(false);
  protected formValid = signal(false);

  private readonly accountsResource = rxResource({
    params: () => ({ accountingTenantId: this.invoice().accountingTenantId }),
    stream: ({ params }) => params.accountingTenantId ? this.accountService.list(params.accountingTenantId) : of([]),
  });
  protected readonly accounts = computed(() => this.accountsResource.value() ?? []);

  // computed
  /** only a draft can be changed; issuing, pending, paid and cancelled invoices are frozen */
  protected readonly isReadOnly = computed(() =>
    coerceBoolean(this.readOnly()) || !isDraftInvoice(this.invoice()) || this.positionsFailed());
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty() && !this.isReadOnly());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save()} as ChangeConfirmationI18n));
  protected readonly headerTitle = computed(() =>
    this.isNew() ? this.i18n.create() : (this.isReadOnly() ? this.i18n.view() : this.i18n.update()));

  constructor() {
    // seed the editable positions once per invoice — never from a live stream (it would reset input)
    effect(() => {
      const invoice = this.invoice();
      const isNew = this.isNew();
      untracked(() => void this.loadPositions(invoice, isNew));
    });
  }

  private async loadPositions(invoice: InvoiceModel, isNew: boolean): Promise<void> {
    this.positionsLoaded.set(false);
    if (isNew || !invoice.okey) {
      this.positions.set([newInvoicePosition()]);
      this.positionsLoaded.set(true);
      return;
    }
    try {
      const positions = await this.invoiceService.listPositionsOnce(invoice.okey);
      // a non-zero total is the sum of stored positions: none found means the read came back incomplete
      if (positions.length === 0 && (invoice.totalAmount?.amount ?? 0) > 0) {
        throw new Error(`no positions found for invoice ${invoice.okey} with a total of ${invoice.totalAmount?.amount}`);
      }
      this.positions.set(toPositionInputs(positions));
    } catch (e) {
      console.error('InvoiceEditModal.loadPositions: could not read the positions', e);
      this.positions.set([]);
      this.positionsFailed.set(true);
    }
    this.positionsLoaded.set(true);
  }

  protected onFormDataChange(data: InvoiceModel): void {
    this.formData.set(data);
  }

  protected async selectReceiver(): Promise<void> {
    if (this.isReadOnly()) return;
    const sheet = await this.actionSheetController.create({
      header: this.i18n.receiver_select(),
      buttons: [
        { text: this.i18n.receiver_person(), role: 'person' },
        { text: this.i18n.receiver_org(), role: 'org' },
        { text: this.i18n.cancel(), role: 'cancel' },
      ],
    });
    await sheet.present();
    const { role } = await sheet.onDidDismiss();
    let receiver: AvatarInfo | undefined;
    if (role === 'person') receiver = await this.modelSelectService.selectPersonAvatar();
    else if (role === 'org') receiver = await this.modelSelectService.selectOrgAvatar();
    if (receiver) {
      this.formDirty.set(true);
      this.formData.update((vm) => (vm ? { ...vm, receiver } : vm));
    }
  }

  /**
   * «Aus Gebührenplan übernehmen» (spec 1.78): offers the current year's fee schedule of the
   * invoice's books, priced for the receiver, and adds the picked position. The owner org of the
   * books is orgs/{accountingTenantId}; its membershipCategoryKey is the default price list.
   */
  protected async selectFeePosition(): Promise<void> {
    if (this.isReadOnly()) return;
    const accountingTenantId = this.invoice().accountingTenantId;
    const config = await firstValueFrom(this.accountingConfigService.read(accountingTenantId));
    const year = getYear();
    const rules = config?.feeSchedule?.find(entry => entry.year === year)?.positions ?? [];
    const ownerOrg = this.appStore.allOrgs().find(org => org.okey === accountingTenantId);
    const options = feePickOptions(rules, {
      categoryLists: toCategoryPriceLists(this.appStore.allCategories()),
      defaultCategoryList: ownerOrg?.membershipCategoryKey || 'mcat',
      receiverCategory: await this.receiverCategory(accountingTenantId),
    });

    const modal = await this.modalController.create({
      component: FeePositionSelectModal,
      componentProps: { options, i18n: this.i18n },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<FeePickOption>();
    if (role !== 'confirm' || !data) return;
    this.formDirty.set(true);
    this.positions.update(list => addPickedPosition(list, feeOptionToPosition(data)));
  }

  /** the receiver's current membership category in the books' owner org; undefined = not a member */
  private async receiverCategory(orgKey: string): Promise<string | undefined> {
    const receiver = this.formData()?.receiver;
    if (!receiver?.key) return undefined;
    const today = getTodayStr(DateFormat.StoreDate);
    const memberships = await firstValueFrom(
      this.membershipService.listMembershipsOfMember(receiver.key, receiver.modelType, 'org'));
    return memberships.find((m: MembershipModel) =>
      m.orgKey === orgKey && isAfterDate(m.dateOfExit, today) && (m.state === 'active' || m.state === 'passive')
    )?.category;
  }

  protected async save(): Promise<void> {
    const invoice = this.formData();
    if (!invoice) return;
    const result: InvoiceEditResult = { invoice, positions: this.positions() };
    await dismissOverlay(this.modalController, result, 'confirm');
  }

  protected async cancel(): Promise<void> {
    await dismissOverlay(this.modalController, null, 'cancel');
  }
}
