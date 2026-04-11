import { Component, computed, input } from '@angular/core';
import { IonCard, IonCardContent, IonChip, IonContent, IonIcon, IonItem, IonLabel } from '@ionic/angular/standalone';

import { InvoiceModel } from '@bk2/shared-models';
import { HeaderComponent } from '@bk2/shared-ui';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AsyncPipe } from '@angular/common';
import { PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';


@Component({
  selector: 'bk-invoice-view-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, PrettyDatePipe,
    HeaderComponent,
    IonContent, IonCard, IonIcon, IonLabel, IonCardContent, IonItem, IonChip
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .view-label { font-size: 0.8rem }
  `],
  template: `
    <bk-header title="@finance.invoice.operation.view.label" [isModal]="true" />
    <ion-content class="ion-no-padding">
        @if(invoice(); as invoice) {
            <ion-card>
                <ion-card-content>
                    <!-- invoiceId -->
                    <ion-item lines="none">
                        <ion-icon slot="start" src="{{'information' | svgIcon}}" />
                        <ion-label>
                        <p class="view-label">{{ '@finance.invoice.field.invoiceId.label' | translate | async }}</p>
                        <p class="view-value">{{ invoiceId() }}</p>
                        </ion-label>
                    </ion-item>
                    <!-- title -->
                    <ion-item lines="none">
                        <ion-icon slot="start" src="{{'edit' | svgIcon}}" />
                        <ion-label>
                        <p class="view-label">{{ '@finance.invoice.field.title.label' | translate | async }}</p>
                        <p class="view-value">{{ title() }}</p>
                        </ion-label>
                    </ion-item>
                    <!-- invoiceDate -->
                    <ion-item lines="none">
                        <ion-icon slot="start" src="{{'calendar-number' | svgIcon}}" />
                        <ion-label>
                        <p class="view-label">{{ '@finance.invoice.field.invoiceDate.label' | translate | async }}</p>
                        <p class="view-value">{{ invoiceDate() | prettyDate }}</p>
                        </ion-label>
                    </ion-item>
                    <!-- dueDate -->
                    <ion-item lines="none">
                        <ion-icon slot="start" src="{{'calendar-number' | svgIcon}}" />
                        <ion-label>
                        <p class="view-label">{{ '@finance.invoice.field.dueDate.label' | translate | async }}</p>
                        <p class="view-value">{{ dueDate() | prettyDate }}</p>
                        </ion-label>
                    </ion-item>
                    <!-- amount -->
                    <ion-item lines="none">
                        <ion-icon slot="start" src="{{'chf' | svgIcon}}" />
                        <ion-label>
                        <p class="view-label">{{ '@finance.invoice.field.amount.label' | translate | async }}</p>
                        <p class="view-value">{{ amount() }}</p>
                        </ion-label>
                    </ion-item>
                    <!-- state -->
                    <ion-item lines="none">
                        <ion-icon slot="start" src="{{'target' | svgIcon}}" />
                        <ion-label>
                            <p class="view-label">{{ '@finance.invoice.field.state.label' | translate | async }}</p>
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
                            <p class="view-label">{{ '@finance.invoice.field.paymentDate.label' | translate | async }}</p>
                            <p class="view-value">{{ paymentDate() | prettyDate }}</p>
                            </ion-label>
                        </ion-item>
                     }
                    <!-- notes -->
                    @if(invoice.notes.length > 0) {
                        <ion-item lines="none">
                            <ion-icon slot="start" src="{{'chatbox' | svgIcon}}" />
                            <ion-label>
                            <p class="view-label">{{ '@finance.invoice.field.notes.label' | translate | async }}</p>
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
    // inputs
    public readonly invoice = input.required<InvoiceModel>();

    // computed
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
