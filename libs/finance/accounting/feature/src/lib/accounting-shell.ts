import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonRouterOutlet } from '@ionic/angular/standalone';

import { AccountingStore } from './accounting.store';

/**
 * Routing shell for `/accounting/:accountingTenantId/**` — it only maps the route param into
 * `AccountingStore` and hosts the child routes.
 *
 * The outlet must NOT be wrapped in an `<ion-content>`. Ionic gives `ion-router-outlet`
 * `position: absolute; inset: 0; contain: layout size style` and every routed `.ion-page` the
 * same, so nested inside a scroll container they contribute nothing to its scroll height — the
 * wrapping content measured 996/996 (viewport height, nothing to scroll) no matter how long the
 * child page was. Each child page brings its own `ion-content`, which is what scrolls; a second
 * one here only added a dead scroller and a stacking context around the routed views.
 */
@Component({
  selector: 'okr-accounting-shell',
  standalone: true,
  imports: [IonRouterOutlet],
  template: `<ion-router-outlet />`,
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
