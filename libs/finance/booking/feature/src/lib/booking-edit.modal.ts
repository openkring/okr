import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { ActionSheetController, IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController, ToastController } from '@ionic/angular/standalone';

import { ModelSelectService } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AccountModel, AvatarInfo, BookingLineModel, BookingModel, BookingModelName, ProjectModel, UserModel, VatCodeModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay, showToast } from '@okr/shared-util-angular';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { CommentsAccordion } from '@okr/comment-feature';
import { FinanceDocumentService } from '@okr/finance-accounting-data-access';
import { AccountingStore, VoucherTiles } from '@okr/finance-accounting-feature';
import { ACCOUNTING_I18N_KEYS, AccountingI18n, isBookingVoucherFile } from '@okr/finance-accounting-util';
import { CostCenterStore } from '@okr/finance-cost-center-feature';
import { BookingForm } from '@okr/finance-booking-ui';
import { BOOKING_I18N_KEYS, BookingFormData, BookingI18n, pairsToLines, toBookingFormData, withSplitTitle } from '@okr/finance-booking-util';

/**
 * Header + change-confirmation + the booking form, then the Belege (its own and those of its invoice or
 * bill; new ones by button or drop) and comments of a saved booking. Lives in the feature lib because picking a counterparty needs ModelSelectService. Dismisses with `{ booking, lines }` on confirm: the
 * form's pairs are turned back into lines here, so the store's contract is unchanged.
 */
@Component({
  selector: 'okr-booking-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, BookingForm, VoucherTiles, CommentsAccordion, IonContent, IonAccordionGroup, IonCard, IonCardContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-booking-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [currentUser]="currentUser()"
          [accounts]="accounts()"
          [vatCodes]="vatCodes()"
          [costCenters]="costCenterStore.costCenters()"
          [projects]="ledgerProjects()"
          [costCentersEnabled]="costCenterStore.isEnabled()"
          [bookDefaultCostCenterKey]="bookDefaultCostCenterKey()"
          [locale]="locale()"
          [readOnly]="isReadOnly()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
          (counterpartySelect)="selectCounterparty()"
        />
      }
      <!-- Belege: the invoice's/bill's, then the booking's own (booking.documentKeys, private bucket, spec 1.74) -->
      <okr-voucher-tiles [documentKeys]="voucherKeys()" [canAdd]="canAddVouchers()" [uploading]="uploading()" (filesAdded)="addVouchers($event)" />
      <!-- comments hang on the booking's key, so they appear once the booking is saved -->
      @if (booking().okey) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group [multiple]="true">
              <okr-comments-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `,
})
export class BookingEditModal {
  private readonly modalController = inject(ModalController);
  private readonly modelSelectService = inject(ModelSelectService);
  private readonly actionSheetCtrl = inject(ActionSheetController);
  // direct inject, no store: the store opens this modal, importing it back would be circular
  protected readonly costCenterStore = inject(CostCenterStore);
  private readonly accountingStore = inject(AccountingStore);
  private readonly financeDocumentService = inject(FinanceDocumentService);
  private readonly toastController = inject(ToastController);
  protected readonly i18n = inject(I18nService).translateAll(BOOKING_I18N_KEYS) as BookingI18n;
  private readonly accountingI18n = inject(I18nService).translateAll(ACCOUNTING_I18N_KEYS) as AccountingI18n;

  public readonly booking = input.required<BookingModel>();
  public readonly lines = input.required<BookingLineModel[]>();
  public readonly readOnly = input<boolean>(true);
  public readonly currentUser = input<UserModel | undefined>(undefined);
  public readonly accounts = input<AccountModel[]>([]);
  public readonly vatCodes = input<VatCodeModel[]>([]);
  /** all projects of the tenant incl. archived (Kostenträger picker) */
  public readonly projects = input<ProjectModel[]>([]);
  public readonly locale = input('de-ch');
  /** the Belege of the booking's invoice or bill */
  public readonly linkedVoucherKeys = input<string[]>([]);
  public readonly canAddVouchers = input(false);

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  // the accounting-wide fallback Kostenstelle; legacy configs lack the field
  protected readonly bookDefaultCostCenterKey = computed(() => this.accountingStore.config()?.defaultCostCenterKey ?? '');
  protected readonly parentKey = computed(() => `${BookingModelName}.${this.booking().okey}`);
  /** Belege added while this modal is open: `booking` is a snapshot and does not see them */
  private readonly addedVoucherKeys = signal<string[]>([]);
  // legacy docs predate the field — coalesce
  protected readonly voucherKeys = computed(() =>
    [...new Set([...this.linkedVoucherKeys(), ...(this.booking().documentKeys ?? []), ...this.addedVoucherKeys()])]);
  protected readonly uploading = signal(false);
  /** like the Kostenstellen: no picker on an externally managed (bexio) ledger */
  protected readonly ledgerProjects = computed(() => this.accountingStore.isExternallyManaged() ? [] : this.projects());
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal<BookingFormData>(() => this.initialFormData());
  protected showForm = signal(true);

  protected showConfirmation = computed(() => !this.isReadOnly() && this.formValid() && this.formDirty());
  protected readonly headerTitle = computed(() =>
    this.isReadOnly() ? this.i18n.modal_view() : (this.booking().okey ? this.i18n.modal_edit() : this.i18n.modal_create()));
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.changeConfirmation_cancel(),
    save: this.i18n.changeConfirmation_ok(),
  } as ChangeConfirmationI18n));

  /** The stored booking as form data; a split booking shows its generated name 'Sammelbuchung · <Gegenpartei>'. */
  private initialFormData(): BookingFormData {
    const data = safeStructuredClone(toBookingFormData(this.booking(), this.lines())) as BookingFormData;
    return withSplitTitle(data, this.i18n.split_title());
  }

  protected onFormDataChange(data: BookingFormData): void {
    this.formData.set(data);
  }

  protected async selectCounterparty(): Promise<void> {
    if (this.isReadOnly()) return;
    const sheet = await this.actionSheetCtrl.create({
      header: this.i18n.counterparty_title(),
      buttons: [
        { text: this.i18n.counterparty_person(), role: 'person' },
        { text: this.i18n.counterparty_org(), role: 'org' },
        { text: this.i18n.cancel(), role: 'cancel' },
      ],
    });
    await sheet.present();
    const { role } = await sheet.onDidDismiss();
    let avatar: AvatarInfo | undefined;
    if (role === 'person') avatar = await this.modelSelectService.selectPersonAvatar();
    else if (role === 'org') avatar = await this.modelSelectService.selectOrgAvatar();
    if (avatar) {
      this.formDirty.set(true);
      this.formData.update(vm => withSplitTitle({ ...vm, counterparty: avatar }, this.i18n.split_title()));
    }
  }

  /** Uploads the files one by one as Belege of this booking; they are stored at once, independent of «Speichern». */
  protected async addVouchers(files: File[]): Promise<void> {
    const booking = this.booking();
    if (!this.canAddVouchers() || !booking.okey || this.uploading()) return;
    const accepted = files.filter(f => isBookingVoucherFile(f));
    if (accepted.length < files.length) await showToast(this.toastController, this.accountingI18n.voucher_type_error());
    if (accepted.length === 0) return;
    this.uploading.set(true);
    try {
      for (const file of accepted) {
        // the booking's own books — never the app tenant
        const key = await this.financeDocumentService.addBookingVoucher(booking.accountingTenantId, booking.okey, file);
        this.addedVoucherKeys.update(keys => [...keys, key]);
      }
    } catch (error) {
      console.error('BookingEditModal.addVouchers: upload failed', error);
      await showToast(this.toastController, this.accountingI18n.voucher_upload_error());
    } finally {
      this.uploading.set(false);
    }
  }

  public async save(): Promise<void> {
    const data = this.formData();
    const source = this.booking();
    const booking: BookingModel = { ...source, title: data.title, date: data.date, notes: data.notes, counterparty: data.counterparty };
    const currency = this.lines().find(l => l.debitAmount || l.creditAmount)?.debitAmount?.currency
      ?? this.lines().find(l => l.creditAmount)?.creditAmount?.currency ?? 'CHF';
    const lines = pairsToLines(data.pairs, source.tenants[0] ?? '', source.accountingTenantId, source.okey, currency);
    await dismissOverlay(this.modalController, { booking, lines }, 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(this.initialFormData());
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}
