import { Component, computed, inject, input } from '@angular/core';
import type { ActionSheetButton } from '@ionic/angular';
import { ActionSheetController, IonAvatar, IonButton, IonCard, IonCardContent, IonChip, IonContent, IonIcon, IonImg, IonItem, IonLabel } from '@ionic/angular/standalone';

import { InvoiceModel, InvoiceReminder } from '@okr/shared-models';
import { formatMinorAmount, Header } from '@okr/shared-ui';
import { PrettyDatePipe, SvgIconPipe } from '@okr/shared-pipes';
import { fill, formatQrReference, getFullName, getTodayStr, hasRole, prettyFormatDate } from '@okr/shared-util-core';
import { AvatarPipe } from '@okr/avatar-ui';
import { AvatarDetailService, FinanceHistory, LedgerBookings, VoucherTiles } from '@okr/finance-accounting-feature';
import {
  invoiceAccountKeys, invoiceBookingAmounts, invoiceVoucherKeys, isDraftInvoice, invoiceBookingKeys, invoiceDisplayState, invoiceStateColor, invoiceStateLabel, isOverdueInvoice, isPayableState, openInvoiceAmount, canCreateReminder, waivableReminder,
} from '@okr/finance-invoice-util';
import { InvoiceStore } from './invoice.store';

@Component({
  selector: 'okr-invoice-view-modal',
  standalone: true,
  providers: [InvoiceStore],
  imports: [
    SvgIconPipe, PrettyDatePipe, AvatarPipe,
    Header, LedgerBookings, VoucherTiles, FinanceHistory,
    IonContent, IonCard, IonIcon, IonLabel, IonCardContent, IonItem, IonChip, IonAvatar, IonImg, IonButton
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .view-label { font-size: 0.8rem }
    .overdue { color: var(--ion-color-danger); }
  `],
  template: `
    <okr-header [i18n]="{ title: store.i18n.view() }" [isModal]="true" />
    <ion-content class="ion-no-padding">
      @if(invoice(); as invoice) {
        <ion-card>
          <ion-card-content>
            <!-- invoiceId -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'info-circle' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.id_label() }}</p>
                <p class="view-value">{{ invoiceId() }}</p>
              </ion-label>
            </ion-item>
            <!-- receiver -->
            @if(invoice.receiver; as receiver) {
              <ion-item lines="none">
                <ion-avatar slot="start">
                  <ion-img src="{{ receiver.modelType + '.' + receiver.key | avatar:receiver.modelType }}" alt="Receiver Logo" />
                </ion-avatar>
                <ion-label>
                  <p class="view-label">{{ store.i18n.receiver_label() }}</p>
                  <p class="view-value">{{ receiverName() }}</p>
                </ion-label>
                <ion-button slot="end" fill="clear" [title]="store.i18n.receiver_label()" (click)="showReceiver()">
                  <ion-icon slot="icon-only" src="{{ 'link' | svgIcon }}" />
                </ion-button>
              </ion-item>
            }
            <!-- title -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'edit' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.title_label() }}</p>
                <p class="view-value">{{ title() }}</p>
              </ion-label>
            </ion-item>
            <!-- invoiceDate -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'calendar-number' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.invoice_date_label() }}</p>
                <p class="view-value">{{ invoiceDate() | prettyDate }}</p>
              </ion-label>
            </ion-item>
            <!-- dueDate -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'calendar-number' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.due_date_label() }}</p>
                <p class="view-value" [class.overdue]="isOverdue()">{{ dueDate() | prettyDate }}</p>
              </ion-label>
            </ion-item>
            <!-- amount -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'chf' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.amount_label() }}</p>
                <p class="view-value" [class.overdue]="isOverdue()">{{ amount() }}</p>
              </ion-label>
            </ion-item>
            <!-- state -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'target' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.state_label() }}</p>
                <ion-chip [outline]="true" size="small" [color]="stateColor()">
                  {{ stateLabel() }}
                </ion-chip>
              </ion-label>
            </ion-item>
            <!-- paymentDate -->
            @if(paymentDate().length > 0) {
              <ion-item lines="none">
                <ion-icon slot="start" src="{{'calendar-number' | svgIcon}}" />
                <ion-label>
                  <p class="view-label">{{ store.i18n.payment_date_label() }}</p>
                  <p class="view-value">{{ paymentDate() | prettyDate }}</p>
                </ion-label>
              </ion-item>
            }
            <!-- QR payment reference -->
            @if(paymentReference().length > 0) {
              <ion-item lines="none">
                <ion-icon slot="start" src="{{'chf' | svgIcon}}" />
                <ion-label>
                  <p class="view-label">{{ store.i18n.payment_reference_label() }}</p>
                  <p class="view-value">{{ paymentReference() }}</p>
                </ion-label>
              </ion-item>
            }
            <!-- payments (read-only; recorded through the list's "Zahlung erfassen") -->
            @if(payments().length > 0) {
              <ion-item lines="none">
                <ion-icon slot="start" src="{{'chf' | svgIcon}}" />
                <ion-label>
                  <p class="view-label">{{ store.i18n.payments_title() }}</p>
                  @for(payment of payments(); track $index) {
                    <p class="view-value">{{ payment.date | prettyDate }} · CHF {{ formatChf(payment.amount) }}</p>
                  }
                </ion-label>
              </ion-item>
            }
            <!-- open amount incl. reminder fees (spec 1.76 D14) -->
            @if(showOpenAmount()) {
              <ion-item lines="none">
                <ion-icon slot="start" src="{{'chf' | svgIcon}}" />
                <ion-label>
                  <p class="view-label">{{ store.i18n.open_amount_label() }}</p>
                  <p class="view-value">CHF {{ openAmount() }}</p>
                </ion-label>
              </ion-item>
            }
            <!-- last send of the invoice PDF, by email or by post -->
            @if(sentAt().length > 0) {
              <ion-item lines="none">
                <ion-icon slot="start" src="{{ (sentVia() === 'post' ? 'mail' : 'email') | svgIcon}}" />
                <ion-label>
                  <p class="view-value">{{ sentAtText() }}</p>
                </ion-label>
              </ion-item>
            }
            <!-- reminders: one line per reminder, tap for its actions (treasurer) -->
            @if(reminders().length > 0 || canCreateReminder()) {
              <ion-item lines="none">
                <ion-icon slot="start" src="{{'alarm' | svgIcon}}" />
                <ion-label><p class="view-label">{{ store.i18n.reminders_title() }}</p></ion-label>
              </ion-item>
              @for(reminder of reminders(); track reminder.documentKey || $index) {
                <ion-item lines="none" [button]="canAct()" [detail]="false" (click)="reminderActions(reminder)">
                  <ion-label class="ion-text-wrap">
                    <p class="view-value">
                      {{ store.reminderName(reminder) }} · {{ reminder.date | prettyDate }} · {{ store.i18n.reminder_due() }} {{ reminder.dueDate | prettyDate }}
                      · {{ store.i18n.reminder_fee_short() }} CHF {{ formatChf(reminder.fee) }}
                      @if(reminder.waivedAt) {
                        · {{ waivedText(reminder.waivedAt) }}
                      }
                      · {{ sentText(reminder) }}
                    </p>
                  </ion-label>
                </ion-item>
              }
              @if(canCreateReminder()) {
                <ion-item lines="none" button="true" [detail]="false" (click)="store.createReminder(live())">
                  <ion-icon slot="start" src="{{'add' | svgIcon}}" />
                  <ion-label>{{ store.i18n.reminder_create() }}</ion-label>
                </ion-item>
              }
            }
            <!-- notes -->
            @if(invoice.notes.length > 0) {
              <ion-item lines="none">
                <ion-icon slot="start" src="{{'chatbox' | svgIcon}}" />
                <ion-label>
                  <p class="view-label">{{ store.i18n.notes_label() }}</p>
                  <p class="view-value">{{ notes() }}</p>
                </ion-label>
              </ion-item>
            }
          </ion-card-content>
        </ion-card>
        <!-- issue, payment, reminder fee and storno bookings as journal rows, each linked to its booking in the journal;
             a migrated invoice has none: the bank accounts of its payments instead -->
        <okr-ledger-bookings [accountingTenantId]="invoice.accountingTenantId" [bookingKeys]="bookingKeys()"
          [bookingAmounts]="bookingAmounts()" [accountKeys]="accountKeys()" [date]="invoice.invoiceDate" />
        <!-- a draft has no PDF yet: render a preview on demand (nothing numbered or booked) -->
        @if(canPreview()) {
          <ion-item lines="none">
            <ion-button slot="end" fill="outline" (click)="store.preview(invoice)">
              <ion-icon slot="start" src="{{'eye-on' | svgIcon}}" />
              {{ store.i18n.show_preview() }}
            </ion-button>
          </ion-item>
        }
        <!-- the issued invoice PDF and its reminder PDFs (finance-documents), treasurer/privileged only -->
        @if(mayReadVouchers()) {
          <okr-voucher-tiles [documentKeys]="voucherKeys()" />
          <!-- Verlauf: events written by the Cloud Functions, bexio comments and the treasurer's notes -->
          <okr-finance-history [parentKey]="'invoice.' + invoice.okey" />
        }
      }
    </ion-content>
  `
})
export class InvoiceViewModal {
  protected readonly store = inject(InvoiceStore);
  private readonly avatarDetailService = inject(AvatarDetailService);
  private readonly actionSheetController = inject(ActionSheetController);

  public readonly invoice = input.required<InvoiceModel>();

  /** the invoice as the store streams it now (a new reminder shows without reopening); the input until it is loaded */
  protected readonly live = computed(() => {
    const input = this.invoice();
    // only treasurer/privileged may stream all invoices; for others the resource errors and value() throws
    if (!this.mayReadVouchers() || !this.store.allInvoicesResource.hasValue()) return input;
    return (this.store.allInvoicesResource.value() ?? []).find((i) => i.okey === input.okey) ?? input;
  });

  protected readonly receiverName = computed(() => {
    const receiver = this.invoice()?.receiver;
    if (!receiver) return '';
    return receiver.label || getFullName(receiver.name1, receiver.name2);
  });
  protected readonly title = computed(() => this.invoice()?.title ?? '');
  protected readonly invoiceId = computed(() => this.invoice()?.invoiceId ?? '');
  protected readonly invoiceDate = computed(() => this.invoice()?.invoiceDate ?? '');
  protected readonly dueDate = computed(() => this.invoice()?.dueDate ?? '');
  protected readonly amount = computed(() => formatMinorAmount(this.invoice()?.totalAmount?.amount ?? 0));
  private readonly today = getTodayStr();
  protected readonly isOverdue = computed(() => isOverdueInvoice(this.invoice(), this.today));
  protected readonly state = computed(() => invoiceDisplayState(this.invoice(), this.today));
  protected readonly stateColor = computed(() => invoiceStateColor(this.state()));
  protected readonly stateLabel = computed(() => invoiceStateLabel(this.state(), this.store.i18n));
  protected readonly bookingKeys = computed(() => invoiceBookingKeys(this.invoice()));
  protected readonly bookingAmounts = computed(() => invoiceBookingAmounts(this.invoice()));
  protected readonly accountKeys = computed(() => invoiceAccountKeys(this.invoice()));
  protected readonly paymentDate = computed(() => this.invoice()?.paymentDate ?? '');
  protected readonly paymentReference = computed(() => formatQrReference(this.invoice()?.paymentReference));
  protected readonly notes = computed(() => this.invoice()?.notes ?? '');
  // legacy invoices lack the field (Firestore reads skip model defaults)
  protected readonly payments = computed(() => this.invoice()?.payments ?? []);

  // legacy invoices lack the fields (Firestore reads skip model defaults); legacy reminders lack the fee
  protected readonly reminders = computed(() =>
    [...(this.live()?.reminders ?? [])].map(r => ({ ...r, fee: Number.isFinite(r.fee) ? r.fee : 0 })).sort((a, b) => (a.level ?? 0) - (b.level ?? 0)));
  protected readonly sentAt = computed(() => this.live()?.sentAt ?? '');
  protected readonly sentVia = computed(() => this.live()?.sentVia ?? '');
  // sentAt is a StoreDate; an invoice sent before sentVia existed says only "Versendet am"
  protected readonly sentAtText = computed(() => {
    const via = this.sentVia();
    const text = via === 'post' ? this.store.i18n.email_sent_by_post() : via === 'email' ? this.store.i18n.email_sent_by_email() : this.store.i18n.email_sent_at();
    return fill(text, { date: prettyFormatDate(this.sentAt()) });
  });
  protected readonly voucherKeys = computed(() => invoiceVoucherKeys(this.invoice()));
  protected readonly mayReadVouchers = computed(() => {
    const user = this.store.appStore.currentUser();
    return hasRole('treasurer', user) || hasRole('privileged', user);
  });
  protected readonly canPreview = computed(() => isDraftInvoice(this.invoice()) && hasRole('treasurer', this.store.appStore.currentUser())
    && this.store.accountingStore.isExternallyManaged() === false);
  /** shown while the invoice is open (pending, partial, unpaid) — not for a paid or cancelled one */
  protected readonly showOpenAmount = computed(() => isPayableState(this.live()?.state));
  protected readonly openAmount = computed(() => formatMinorAmount(openInvoiceAmount(this.live())));

  protected readonly canAct = computed(() => hasRole('treasurer', this.store.appStore.currentUser()) && this.store.accountingStore.isExternallyManaged() === false);
  protected readonly canCreateReminder = computed(() => this.canAct() && canCreateReminder(this.live()));

  protected sentText(reminder: InvoiceReminder): string {
    if (!reminder.isSent) return this.store.i18n.reminder_not_sent();
    const text = reminder.sentVia === 'post' ? this.store.i18n.email_sent_by_post() : reminder.sentVia === 'email' ? this.store.i18n.email_sent_by_email() : this.store.i18n.reminder_sent();
    return reminder.sentAt ? fill(text, { date: prettyFormatDate(reminder.sentAt) }) : this.store.i18n.reminder_sent();
  }

  protected async reminderActions(reminder: InvoiceReminder): Promise<void> {
    if (!this.canAct()) return;
    const invoice = this.live();
    const buttons: ActionSheetButton[] = [{ text: this.store.i18n.reminder_download(), data: 'download' }];
    if (isPayableState(invoice.state) && !reminder.waivedAt) {
      buttons.push({ text: this.store.i18n.reminder_send_email(), data: 'email' });
      buttons.push({ text: this.store.i18n.reminder_send_email_with_invoice(), data: 'emailWithInvoice' });
    }
    buttons.push({ text: this.store.i18n.email_post(), data: 'post' });
    if (waivableReminder(invoice)?.documentKey === reminder.documentKey) buttons.push({ text: this.store.i18n.waive_fee(), data: 'waive' });
    buttons.push({ text: this.store.i18n.cancel(), role: 'cancel', data: 'cancel' });
    const sheet = await this.actionSheetController.create({ header: this.store.reminderName(reminder), buttons });
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    switch (data) {
      case 'download': await this.store.downloadReminderPdf(invoice, reminder); break;
      case 'email': await this.store.sendReminderEmail(invoice, reminder, false); break;
      case 'emailWithInvoice': await this.store.sendReminderEmail(invoice, reminder, true); break;
      case 'post': await this.store.markReminderPosted(invoice, reminder); break;
      case 'waive': await this.store.waiveReminderFee(invoice); break;
    }
  }

  protected waivedText(waivedAt: string): string {
    return fill(this.store.i18n.reminder_waived_on(), { date: prettyFormatDate(waivedAt) });
  }

  protected formatChf(rappen: number): string {
    return formatMinorAmount(rappen);
  }

  protected async showReceiver(): Promise<void> {
    await this.avatarDetailService.show(this.invoice()?.receiver);
  }
}
