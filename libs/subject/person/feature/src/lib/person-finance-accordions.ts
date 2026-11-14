import { ChangeDetectorRef, Component, ComponentRef, computed, DestroyRef, effect, inject, input, untracked, viewChild, ViewContainerRef } from '@angular/core';

import { RoleName, UserModel } from '@okr/shared-models';
import { hasRole } from '@okr/shared-util-core';
import { FeatureStore } from '@okr/tenant-feature';

/**
 * The person's outgoing invoices (receiver) and incoming bills (vendor), as in the org modal.
 *
 * Shown only with the finance feature on and to treasurers/admins: the invoices and bills rules
 * let nobody else read another party's documents, so for anybody else the query is denied and the
 * accordions would stay silently empty.
 *
 * Both accordions are mounted through a DYNAMIC import (lazy-loading skill, pattern A): the person
 * modal is opened from many places (membership, reservation, ownership, personal-rel, aoc, chat),
 * and a static import would put the finance features into every one of those chunks.
 * Must be placed inside an `ion-accordion-group`.
 */
@Component({
  selector: 'okr-person-finance-accordions',
  standalone: true,
  template: `<ng-container #financeHost />`,
})
export class PersonFinanceAccordions {
  private readonly featureStore = inject(FeatureStore);
  private readonly cdr = inject(ChangeDetectorRef);

  public readonly personKey = input.required<string>();
  public readonly currentUser = input<UserModel | undefined>();

  protected readonly show = computed(() => !!this.personKey()
    && this.featureStore.isEnabled()('finance')
    && (this.hasRole('treasurer') || this.hasRole('admin')));

  private readonly host = viewChild('financeHost', { read: ViewContainerRef });
  private refs: ComponentRef<unknown>[] = [];
  private hostRef: ViewContainerRef | undefined;
  private loading = false;

  constructor() {
    effect(() => {
      const host = this.host();
      const show = this.show();
      const personKey = this.personKey();
      untracked(() => void this.sync(host, show, personKey));
    });
    inject(DestroyRef).onDestroy(() => this.drop());
  }

  /** Creates, re-keys or drops the lazily loaded accordions (memory: lazy host in @if, createComponent CD pass). */
  private async sync(host: ViewContainerRef | undefined, show: boolean, personKey: string): Promise<void> {
    if (host !== this.hostRef) {   // the host left or was re-rendered: its old refs are dead
      this.drop();
      this.hostRef = host;
    }
    if (!host || !show) {
      this.drop();
      return;
    }
    if (this.refs.length > 0) {
      this.refs.forEach((ref) => ref.setInput('listId', personKey));
      return;
    }
    if (this.loading) return;
    this.loading = true;
    try {
      const [{ InvoiceAccordion }, { BillAccordion }] = await Promise.all([
        import('@okr/finance-invoice-feature'),
        import('@okr/finance-bill-feature'),
      ]);
      if (host !== this.hostRef || this.refs.length > 0 || !this.show()) return;   // changed while loading
      const key = this.personKey();
      this.refs = [host.createComponent(InvoiceAccordion), host.createComponent(BillAccordion)];
      this.refs.forEach((ref) => {
        ref.setInput('listId', key);
        ref.changeDetectorRef.detectChanges();
      });
      this.cdr.markForCheck();
    } finally {
      this.loading = false;
    }
  }

  private drop(): void {
    this.refs.forEach((ref) => ref.destroy());
    this.refs = [];
  }

  private hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
