import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActionSheetController, ModalController, IonButton, IonButtons, IonContent, IonHeader,
  IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { AvatarInfo, BookingLineModel, BookingModel, UserModel, VatCodeModel } from '@okr/shared-models';
import { ModelSelectService } from '@okr/shared-feature';
import { BOOKING_I18N_KEYS, BookingI18n, validateBookingBalance } from '@okr/finance-booking-util';
import { I18nService } from '@okr/shared-i18n';
import { VatCodeService } from '@okr/finance-vat-code-data-access';
import { AvatarSelect } from '@okr/avatar-ui';
import { dismissOverlay } from '@okr/shared-util-angular';

@Component({
  selector: 'okr-booking-edit-modal',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption,
    AvatarSelect,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ readOnly() ? 'View' : (editBooking.okey ? 'Edit' : 'New') }} Booking</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Cancel</ion-button>
          @if (!readOnly()) {
            <ion-button (click)="save()" [disabled]="!isBalanced">Save</ion-button>
          }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-item>
        <ion-label position="stacked">Date (YYYYMMDD)</ion-label>
        <ion-input [(ngModel)]="editBooking.date" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Description</ion-label>
        <ion-input [(ngModel)]="editBooking.title" [readonly]="readOnly()" />
      </ion-item>
      <okr-avatar-select
        name="counterparty"
        title="Gegenpartei"
        [selectLabel]="i18n.counterparty_select()"
        [avatar]="counterparty()"
        [clearable]="true"
        [readOnly]="readOnly()"
        (selectClicked)="selectCounterparty()"
        (clearClicked)="counterparty.set(undefined)" />

      @for (line of editLines; track $index) {
        <ion-item>
          <ion-label position="stacked">Account</ion-label>
          <ion-input [(ngModel)]="line.accountKey" [readonly]="readOnly()" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">Debit (cents)</ion-label>
          <ion-input type="number" [(ngModel)]="line.debitAmount!.amount" [readonly]="readOnly()" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">Credit (cents)</ion-label>
          <ion-input type="number" [(ngModel)]="line.creditAmount!.amount" [readonly]="readOnly()" />
        </ion-item>
        @if (vatCodes.length > 0) {
          <ion-item>
            <ion-label position="stacked">VAT Code</ion-label>
            <ion-select [(ngModel)]="line.vatCodeKey" [disabled]="readOnly()">
              <ion-select-option value="">— none —</ion-select-option>
              @for (vc of vatCodes; track vc.okey) {
                <ion-select-option [value]="vc.okey">{{ vc.code }} {{ vc.rate }}%</ion-select-option>
              }
            </ion-select>
          </ion-item>
        }
        <ion-item>
          <ion-label position="stacked">FX Amount (foreign currency cents, 0 = none)</ion-label>
          <ion-input type="number" [(ngModel)]="line.amountFx!.amount" [readonly]="readOnly()" />
        </ion-item>
      }

      @if (!isBalanced) {
        <p style="color:red">Debit and credit totals must be equal.</p>
      }

      @if (!readOnly()) {
        <ion-button expand="block" (click)="addLine()">+ Add Line</ion-button>
      }
    </ion-content>
  `,
})
export class BookingEditModal implements OnInit {
  public readonly booking = input.required<BookingModel>();
  public readonly lines = input.required<BookingLineModel[]>();
  public readonly readOnly = input<boolean>(true);
  public readonly currentUser = input<UserModel | undefined>(undefined);

  private readonly modalController = inject(ModalController);
  private readonly vatCodeService = inject(VatCodeService);
  private readonly modelSelectService = inject(ModelSelectService);
  private readonly actionSheetCtrl = inject(ActionSheetController);
  // Direct inject (no store): the store opens this modal, importing it back would be circular.
  protected readonly i18n = inject(I18nService).translateAll(BOOKING_I18N_KEYS) as BookingI18n;
  protected counterparty = signal<AvatarInfo | undefined>(undefined);

  protected editBooking!: BookingModel;
  protected editLines!: BookingLineModel[];
  protected vatCodes: VatCodeModel[] = [];

  public async ngOnInit(): Promise<void> {
    this.editBooking = { ...this.booking() };
    this.counterparty.set(this.editBooking.counterparty);
    this.editLines = this.lines().map(l => ({
      ...l,
      debitAmount:  l.debitAmount  ?? { amount: 0, currency: 'CHF' as const, periodicity: 'one-time' as const },
      creditAmount: l.creditAmount ?? { amount: 0, currency: 'CHF' as const, periodicity: 'one-time' as const },
      amountFx:     l.amountFx    ?? { amount: 0, currency: 'EUR' as const, periodicity: 'one-time' as const },
    }));
    if (this.editBooking.accountingTenantId) {
      this.vatCodes = await this.vatCodeService.listOnce(this.editBooking.accountingTenantId);
    }
  }

  protected get isBalanced(): boolean {
    return validateBookingBalance(this.editLines);
  }

  protected addLine(): void {
    const blank = new BookingLineModel(
      this.editBooking.tenants[0] ?? '',
      this.editBooking.accountingTenantId
    );
    blank.bookingKey = this.editBooking.okey;
    blank.debitAmount  = { amount: 0, currency: 'CHF', periodicity: 'one-time' };
    blank.creditAmount = { amount: 0, currency: 'CHF', periodicity: 'one-time' };
    blank.amountFx     = { amount: 0, currency: 'EUR', periodicity: 'one-time' };
    this.editLines = [...this.editLines, blank];
  }

  protected async selectCounterparty(): Promise<void> {
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
    if (avatar) this.counterparty.set(avatar);
  }

  protected async dismiss(): Promise<void> {
    await dismissOverlay(this.modalController, null, 'cancel');
  }

  protected async save(): Promise<void> {
    if (!this.isBalanced) return;
    const cleanLines = this.editLines.map(l => ({
      ...l,
      debitAmount:  (l.debitAmount?.amount  ?? 0) > 0 ? l.debitAmount  : undefined,
      creditAmount: (l.creditAmount?.amount ?? 0) > 0 ? l.creditAmount : undefined,
      amountFx:     (l.amountFx?.amount     ?? 0) > 0 ? l.amountFx     : undefined,
    }));
    this.editBooking.counterparty = this.counterparty();
    await dismissOverlay(this.modalController, { booking: this.editBooking, lines: cleanLines }, 'confirm');
  }
}
