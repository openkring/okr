import { AsyncPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { IonCard, IonCardContent, IonChip, IonContent, IonIcon, IonItem, IonLabel } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { BillModel } from '@bk2/shared-models';
import { HeaderComponent } from '@bk2/shared-ui';
import { PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';

@Component({
  selector: 'bk-bill-view-modal',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, SvgIconPipe, PrettyDatePipe,
    HeaderComponent,
    IonContent, IonCard, IonCardContent, IonIcon, IonItem, IonLabel, IonChip
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .view-label { font-size: 0.8rem; }
  `],
  template: `
    <bk-header title="@finance.bill.operation.view.label" [isModal]="true" />
    <ion-content class="ion-no-padding">
      @if(bill(); as bill) {
        <ion-card>
          <ion-card-content>
            <!-- billId -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'information' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ '@finance.bill.field.billId.label' | translate | async }}</p>
                <p class="view-value">{{ billId() }}</p>
              </ion-label>
            </ion-item>
            <!-- title -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'edit' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ '@finance.bill.field.title.label' | translate | async }}</p>
                <p class="view-value">{{ title() }}</p>
              </ion-label>
            </ion-item>
            <!-- billDate -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'calendar-number' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ '@finance.bill.field.billDate.label' | translate | async }}</p>
                <p class="view-value">{{ billDate() | prettyDate }}</p>
              </ion-label>
            </ion-item>
            <!-- dueDate -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'calendar-number' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ '@finance.bill.field.dueDate.label' | translate | async }}</p>
                <p class="view-value">{{ dueDate() | prettyDate }}</p>
              </ion-label>
            </ion-item>
            <!-- amount -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'chf' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ '@finance.bill.field.amount.label' | translate | async }}</p>
                <p class="view-value">{{ amount() }}</p>
              </ion-label>
            </ion-item>
            <!-- state -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'target' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ '@finance.bill.field.state.label' | translate | async }}</p>
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
                  <p class="view-label">{{ '@finance.bill.field.paymentDate.label' | translate | async }}</p>
                  <p class="view-value">{{ paymentDate() | prettyDate }}</p>
                </ion-label>
              </ion-item>
            }
            <!-- notes -->
            @if(notes().length > 0) {
              <ion-item lines="none">
                <ion-icon slot="start" src="{{'chatbox' | svgIcon}}" />
                <ion-label>
                  <p class="view-label">{{ '@finance.bill.field.notes.label' | translate | async }}</p>
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
export class BillViewModal {
  public readonly bill = input.required<BillModel>();

  protected readonly billId = computed(() => this.bill()?.billId ?? '');
  protected readonly title = computed(() => this.bill()?.title ?? '');
  protected readonly billDate = computed(() => this.bill()?.billDate ?? '');
  protected readonly dueDate = computed(() => this.bill()?.dueDate ?? '');
  protected readonly amount = computed(() => ((this.bill()?.totalAmount?.amount ?? 0) / 100).toFixed(2));
  protected readonly state = computed(() => this.bill()?.state ?? 'draft');
  protected readonly paymentDate = computed(() => this.bill()?.paymentDate ?? '');
  protected readonly notes = computed(() => this.bill()?.notes ?? '');

  protected getStateColor(state: string): string {
    switch (state) {
      case 'paid': return 'success';
      case 'overdue': return 'danger';
      case 'draft': return 'warning';
      case 'todo': return 'primary';
    }
    return '';
  }
}
