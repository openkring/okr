import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import {
  IonBadge, IonContent, IonHeader, IonItem, IonLabel,
  IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { InvoiceCollection, InvoiceModel } from '@okr/shared-models';
import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { getSystemQuery } from '@okr/shared-util-core';
import { INVOICE_I18N_KEYS, InvoiceI18n } from '@okr/finance-invoice-util';

/** Bucket identity is stable and language-independent; the label is resolved via i18n. */
export type AgingBucketId = 'b0_30' | 'b31_60' | 'b61_90' | 'b90_plus';

export interface AgingBucket {
  id: AgingBucketId;
  invoices: InvoiceModel[];
}

function agingBuckets(invoices: InvoiceModel[]): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { id: 'b0_30', invoices: [] },
    { id: 'b31_60', invoices: [] },
    { id: 'b61_90', invoices: [] },
    { id: 'b90_plus', invoices: [] },
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
  selector: 'okr-invoice-aging',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonItem, IonLabel, IonBadge,
  ],
  template: `
    <ion-header>
      <ion-toolbar><ion-title>{{ i18n.invoice_aging() }}</ion-title></ion-toolbar>
    </ion-header>
    <ion-content>
      @for (bucket of buckets(); track bucket.id) {
        <ion-item>
          <ion-label>{{ bucketLabel(bucket.id) }}</ion-label>
          <ion-badge slot="end" [color]="bucket.invoices.length > 0 ? 'danger' : 'medium'">
            {{ bucket.invoices.length }}
          </ion-badge>
        </ion-item>
        @for (inv of bucket.invoices; track inv.okey) {
          <ion-item>
            <ion-label style="padding-left:16px">
              <h3>{{ inv.title }}</h3>
              <p>{{ i18n.aging_due_label() }}: {{ inv.dueDate }}</p>
            </ion-label>
          </ion-item>
        }
      }
    </ion-content>
  `,
})
export class InvoiceAging {
  protected readonly i18n = inject(I18nService).translateAll(INVOICE_I18N_KEYS) as InvoiceI18n;
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

  protected bucketLabel(id: AgingBucketId): string {
    switch (id) {
      case 'b0_30':  return this.i18n.aging_bucket_0_30();
      case 'b31_60': return this.i18n.aging_bucket_31_60();
      case 'b61_90': return this.i18n.aging_bucket_61_90();
      case 'b90_plus': return this.i18n.aging_bucket_90_plus();
    }
  }
}
