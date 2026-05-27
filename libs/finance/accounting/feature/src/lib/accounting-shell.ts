import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonContent, IonHeader, IonRouterOutlet, IonToolbar } from '@ionic/angular/standalone';

import { AccountingStore } from './accounting.store';
import { ReadOnlyBanner } from './read-only-banner';
import { TenantSelector } from './tenant-selector';

@Component({
  selector: 'bk-accounting-shell',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonContent, IonRouterOutlet, ReadOnlyBanner, TenantSelector],
  providers: [AccountingStore],
  template: `
    <ion-header>
      <ion-toolbar>
        <bk-tenant-selector />
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <bk-read-only-banner />
      <ion-router-outlet />
    </ion-content>
  `,
})
export class AccountingShell {
  protected readonly store = inject(AccountingStore);
  private readonly route = inject(ActivatedRoute);

  constructor() {
    this.route.params.pipe(takeUntilDestroyed()).subscribe(params => {
      const id = params['accountingTenantId'] as string;
      if (id) this.store.setTenant(id);
    });
  }
}
