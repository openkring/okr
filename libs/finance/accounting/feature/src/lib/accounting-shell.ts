import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonContent, IonRouterOutlet } from '@ionic/angular/standalone';

import { AccountingStore } from './accounting.store';

@Component({
  selector: 'okr-accounting-shell',
  standalone: true,
  imports: [IonContent, IonRouterOutlet],
  template: `
    <ion-content>
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
