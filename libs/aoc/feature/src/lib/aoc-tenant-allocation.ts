import { Component, inject, signal } from '@angular/core';
import { IonContent, IonNote } from '@ionic/angular/standalone';

import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { Header } from '@okr/shared-ui';
import { AOC_I18N_KEYS, TenantConfigMeta } from '@okr/aoc-util';

import { AllocationCard } from './allocation-card';
import { loadTenantConfigs } from './aoc-tenant-allocation.store';

/**
 * Move records between tenants (spec 1.47).
 *
 * One card per model — person, org, resource (D-TA-7). Each card owns its own store instance,
 * so the three selections and the three result logs never interfere. Adding a fourth model
 * (locations, pages, sections) is one more `<okr-allocation-card>` plus one more entry in
 * `ALLOCATION_SUBJECTS` and in the callable's collection map, not another screen.
 *
 * The tenant list is read here, once, and handed to every card: `app-config` is world-readable
 * and identical for all three.
 */
@Component({
  selector: 'okr-aoc-tenant-allocation',
  standalone: true,
  imports: [Header, AllocationCard, IonContent, IonNote],
  template: `
    <okr-header [i18n]="{ title: i18n.allocation_title() }" />
    <ion-content>
      @if (noTenants()) {
        <ion-note class="no-tenants">{{ noTenantsHint }}</ion-note>
      }
      <okr-allocation-card modelType="person" [tenantConfigs]="tenantConfigs()"
                           [cardTitle]="i18n.allocation_card_person()"
                           [selectHint]="i18n.allocation_person_select_content()"
                           [selectButton]="i18n.allocation_person_select_button()" />
      <okr-allocation-card modelType="org" [tenantConfigs]="tenantConfigs()"
                           [cardTitle]="i18n.allocation_card_org()"
                           [selectHint]="i18n.allocation_org_select_content()"
                           [selectButton]="i18n.allocation_org_select_button()" />
      <okr-allocation-card modelType="resource" [tenantConfigs]="tenantConfigs()"
                           [cardTitle]="i18n.allocation_card_resource()"
                           [selectHint]="i18n.allocation_resource_select_content()"
                           [selectButton]="i18n.allocation_resource_select_button()" />
    </ion-content>
  `,
  styles: [`.no-tenants { display: block; padding: 16px; }`],
})
export class AocTenantAllocation {
  private readonly firestoreService = inject(FirestoreService);
  protected readonly i18n = inject(I18nService).translateAll(AOC_I18N_KEYS);

  protected readonly tenantConfigs = signal<Record<string, TenantConfigMeta>>({});
  protected readonly noTenants = signal(false);

  /**
   * An empty result is indistinguishable from a denied read (`getDataOnce` swallows every
   * error into `[]`) — say so, so that three empty right-hand columns are never silently
   * confident.
   */
  protected readonly noTenantsHint =
    'Es wurden keine Mandanten gefunden. Das kann auch bedeuten, dass der Zugriff verweigert wurde.';

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const configs = await loadTenantConfigs(this.firestoreService);
    this.tenantConfigs.set(configs);
    this.noTenants.set(Object.keys(configs).length === 0);
  }
}
