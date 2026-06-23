import { Component, computed, inject, input } from '@angular/core';
import { IonAvatar, IonCard, IonCardContent, IonChip, IonContent, IonIcon, IonImg, IonItem, IonLabel } from '@ionic/angular/standalone';

import { InvoiceModel } from '@bk2/shared-models';
import { Header } from '@bk2/shared-ui';
import { PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { getFullName } from '@bk2/shared-util-core';
import { AvatarPipe } from '@bk2/avatar-ui';
import { InvoiceStore } from './invoice.store';

@Component({
  selector: 'bk-invoice-view-modal',
  standalone: true,
  providers: [InvoiceStore],
  imports: [
    SvgIconPipe, PrettyDatePipe, AvatarPipe,
    Header,
    IonContent, IonCard, IonIcon, IonLabel, IonCardContent, IonItem, IonChip, IonAvatar, IonImg
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .view-label { font-size: 0.8rem }
  `],
  template: `
    <bk-header [i18n]="{ title: store.i18n.view() }" [isModal]="true" />
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
                <p class="view-value">{{ dueDate() | prettyDate }}</p>
              </ion-label>
            </ion-item>
            <!-- amount -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'chf' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.amount_label() }}</p>
                <p class="view-value">{{ amount() }}</p>
              </ion-label>
            </ion-item>
            <!-- state -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'target' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.state_label() }}</p>
                <ion-chip [outline]="true" size="small" [color]="getStateColor(state())">
                  {{ state() }}
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
      }
    </ion-content>
  `
})
export class InvoiceViewModal {
  protected readonly store = inject(InvoiceStore);

  public readonly invoice = input.required<InvoiceModel>();

  protected readonly receiverName = computed(() => {
    const receiver = this.invoice()?.receiver;
    if (!receiver) return '';
    return receiver.label || getFullName(receiver.name1, receiver.name2);
  });
  protected readonly title = computed(() => this.invoice()?.title ?? '');
  protected readonly invoiceId = computed(() => this.invoice()?.invoiceId ?? '');
  protected readonly invoiceDate = computed(() => this.invoice()?.invoiceDate ?? '');
  protected readonly dueDate = computed(() => this.invoice()?.dueDate ?? '');
  protected readonly amount = computed(() => ((this.invoice()?.totalAmount?.amount ?? 0) / 100).toFixed(2));
  protected readonly state = computed(() => this.invoice()?.state ?? 'draft');
  protected readonly paymentDate = computed(() => this.invoice()?.paymentDate ?? '');
  protected readonly notes = computed(() => this.invoice()?.notes ?? '');

  protected getStateColor(state: string): string {
    switch(state) {
      case 'paid': return 'success';
      case 'overdue': return 'danger';
      case 'draft': return 'warning';
    }
    return '';
  }
}
