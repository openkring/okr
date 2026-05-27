import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import {
  IonBadge, IonContent, IonHeader, IonItem, IonLabel,
  IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { InvoiceCollection, InvoiceModel } from '@bk2/shared-models';
import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { getSystemQuery } from '@bk2/shared-util-core';

export interface AgingBucket {
  label: string;
  invoices: InvoiceModel[];
}

function agingBuckets(invoices: InvoiceModel[]): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { label: '0–30 Tage', invoices: [] },
    { label: '31–60 Tage', invoices: [] },
    { label: '61–90 Tage', invoices: [] },
    { label: '>90 Tage', invoices: [] },
  ];
  const todayDate = new Date();
  for (const inv of invoices) {
    if (inv.state === 'paid') continue;
    if (!inv.dueDate) continue;
    const due = inv.dueDate;
    const dueDate = new Date(`${due.substring(0, 4)}-${due.substring(4, 6)}-${due.substring(6, 8)}`);
    const diffDays = Math.floor((todayDate.getTime() - dueDate.getTime()) / 86400000);
    if (diffDays <= 30)       buckets[0].invoices.push(inv);
    else if (diffDays <= 60)  buckets[1].invoices.push(inv);
    else if (diffDays <= 90)  buckets[2].invoices.push(inv);
    else                      buckets[3].invoices.push(inv);
  }
  return buckets;
}

@Component({
  selector: 'bk-invoice-aging',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonItem, IonLabel, IonBadge,
  ],
  template: `
    <ion-header>
      <ion-toolbar><ion-title>Debitorenalterung</ion-title></ion-toolbar>
    </ion-header>
    <ion-content>
      @for (bucket of buckets(); track bucket.label) {
        <ion-item>
          <ion-label>{{ bucket.label }}</ion-label>
          <ion-badge slot="end" [color]="bucket.invoices.length > 0 ? 'danger' : 'medium'">
            {{ bucket.invoices.length }}
          </ion-badge>
        </ion-item>
        @for (inv of bucket.invoices; track inv.bkey) {
          <ion-item>
            <ion-label style="padding-left:16px">
              <h3>{{ inv.title }}</h3>
              <p>Due: {{ inv.dueDate }}</p>
            </ion-label>
          </ion-item>
        }
      }
    </ion-content>
  `,
})
export class InvoiceAging {
  private readonly firestoreService = inject(FirestoreService);
  private readonly appStore = inject(AppStore);

  private readonly invoicesResource = rxResource({
    params: () => ({
      currentUser: this.appStore.currentUser(),
      tenantId: this.appStore.tenantId(),
    }),
    stream: ({ params }) => {
      if (!params.currentUser) return of([]);
      return this.firestoreService.searchData<InvoiceModel>(
        InvoiceCollection,
        getSystemQuery(params.tenantId),
        'invoiceDate',
        'desc'
      );
    },
  });

  protected readonly buckets = computed(() =>
    agingBuckets(this.invoicesResource.value() ?? [])
  );
}
