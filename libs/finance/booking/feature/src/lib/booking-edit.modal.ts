import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { ActionSheetController, IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { ModelSelectService } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AccountModel, AvatarInfo, BookingLineModel, BookingModel, BookingModelName, UserModel, VatCodeModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { CommentsAccordion } from '@okr/comment-feature';
import { DocumentsAccordion } from '@okr/content-document-feature';
import { BookingForm } from '@okr/finance-booking-ui';
import { BOOKING_I18N_KEYS, BookingFormData, BookingI18n, pairsToLines, toBookingFormData } from '@okr/finance-booking-util';

/**
 * Header + change-confirmation + the booking form, then the Belege (documents) and comments of a
 * saved booking. Lives in the feature lib because picking a counterparty needs ModelSelectService. Dismisses with `{ booking, lines }` on confirm: the
 * form's pairs are turned back into lines here, so the store's contract is unchanged.
 */
@Component({
  selector: 'okr-booking-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, BookingForm, DocumentsAccordion, CommentsAccordion, IonContent, IonAccordionGroup, IonCard, IonCardContent],
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
          [locale]="locale()"
          [readOnly]="isReadOnly()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
          (counterpartySelect)="selectCounterparty()"
        />
      }
      <!-- Belege and comments hang on the booking's key, so they appear once the booking is saved -->
      @if (booking().okey) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="documents" [multiple]="true">
              <okr-documents-accordion [parentKey]="parentKey()" [title]="i18n.form_documents_label()" [readOnly]="isReadOnly()" />
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
  protected readonly i18n = inject(I18nService).translateAll(BOOKING_I18N_KEYS) as BookingI18n;

  public readonly booking = input.required<BookingModel>();
  public readonly lines = input.required<BookingLineModel[]>();
  public readonly readOnly = input<boolean>(true);
  public readonly currentUser = input<UserModel | undefined>(undefined);
  public readonly accounts = input<AccountModel[]>([]);
  public readonly vatCodes = input<VatCodeModel[]>([]);
  public readonly locale = input('de-ch');

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly parentKey = computed(() => `${BookingModelName}.${this.booking().okey}`);
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal<BookingFormData>(() => safeStructuredClone(toBookingFormData(this.booking(), this.lines())) as BookingFormData);
  protected showForm = signal(true);

  protected showConfirmation = computed(() => !this.isReadOnly() && this.formValid() && this.formDirty());
  protected readonly headerTitle = computed(() =>
    this.isReadOnly() ? this.i18n.modal_view() : (this.booking().okey ? this.i18n.modal_edit() : this.i18n.modal_create()));
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.changeConfirmation_cancel(),
    save: this.i18n.changeConfirmation_ok(),
  } as ChangeConfirmationI18n));

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
      this.formData.update(vm => ({ ...vm, counterparty: avatar }));
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
    this.formData.set(safeStructuredClone(toBookingFormData(this.booking(), this.lines())) as BookingFormData);
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}
