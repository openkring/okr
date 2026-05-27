import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonItem, IonLabel, IonSelect, IonSelectOption } from '@ionic/angular/standalone';

import { AccountingStore } from './accounting.store';

@Component({
  selector: 'bk-tenant-selector',
  standalone: true,
  imports: [IonItem, IonLabel, IonSelect, IonSelectOption],
  template: `
    <ion-item>
      <ion-label>{{ store.i18n.select_tenant() }}</ion-label>
      <ion-select
        [value]="store.accountingTenantId()"
        (ionChange)="onTenantChange($event)">
        @for (tenant of store.availableTenants(); track tenant.bkey) {
          <ion-select-option [value]="tenant.bkey">{{ tenant.bkey }}</ion-select-option>
        }
      </ion-select>
    </ion-item>
  `,
})
export class TenantSelector {
  protected readonly store = inject(AccountingStore);
  private readonly router = inject(Router);

  protected onTenantChange(event: CustomEvent): void {
    const id = event.detail.value as string;
    this.router.navigate(['/accounting', id, 'journal']);
  }
}
