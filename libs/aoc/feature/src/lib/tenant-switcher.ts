import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { combineLatest, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { IonButton, IonContent, IonIcon, IonPopover } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { I18nService } from '@okr/shared-i18n';
import { AppStore } from '@okr/shared-feature';
import { AppConfigService } from '@okr/shared-data-access';
import {
  buildSwitcherEntries,
  TenantConfigMeta,
  TenantSwitcherEntry,
  TENANT_SWITCHER_I18N_KEYS,
} from '@okr/aoc-util';

import { TenantSwitcherGrid } from './tenant-switcher-grid';

@Component({
  selector: 'okr-tenant-switcher',
  standalone: true,
  imports: [IonButton, IonContent, IonIcon, IonPopover, SvgIconPipe, TenantSwitcherGrid],
  styles: [`
    .switcher-title { padding: 12px 12px 0; font-size: 13px; font-weight: 600; color: var(--ion-color-medium); }
  `],
  template: `
    @if (isVisible()) {
      <ion-button id="okr-tenant-switcher-trigger" fill="clear"
                  [attr.title]="i18n.switcher_tooltip()" [attr.aria-label]="i18n.switcher_tooltip()">
        <ion-icon slot="icon-only" src="{{ 'apps' | svgIcon }}" />
      </ion-button>
      <ion-popover #switcherPopover trigger="okr-tenant-switcher-trigger" side="bottom" alignment="end">
        <ng-template>
          <ion-content>
            <div class="switcher-title">{{ i18n.switcher_title() }}</div>
            <okr-tenant-switcher-grid
              [entries]="entries()"
              [imgixBaseUrl]="imgixBaseUrl()"
              [currentLabel]="i18n.switcher_current()"
              (select)="onSelect($event, switcherPopover)" />
          </ion-content>
        </ng-template>
      </ion-popover>
    }
  `,
})
export class TenantSwitcher {
  private readonly appStore = inject(AppStore);
  private readonly appConfigService = inject(AppConfigService);
  protected readonly i18n = inject(I18nService).translateAll(TENANT_SWITCHER_I18N_KEYS);

  private readonly currentTenantId = computed(() => this.appStore.env.tenantId);
  protected readonly imgixBaseUrl = computed(() => this.appStore.env.services.imgixBaseUrl);
  private readonly tenantIds = computed(() => this.appStore.currentPerson()?.tenants ?? []);

  // Read every membership tenant's app-config doc (world-readable) into a metadata map.
  private readonly configsResource = rxResource({
    params: () => ({ ids: this.tenantIds() }),
    stream: ({ params }) => {
      const ids = params.ids;
      if (!ids.length) return of(new Map<string, TenantConfigMeta>());
      return combineLatest(ids.map((id) => this.appConfigService.read(id))).pipe(
        map((configs) => {
          const m = new Map<string, TenantConfigMeta>();
          configs.forEach((c, i) => {
            if (c) m.set(ids[i], { appName: c.appName, logoUrl: c.logoUrl, appDomain: c.appDomain });
          });
          return m;
        }),
      );
    },
  });

  protected readonly entries = computed<TenantSwitcherEntry[]>(() =>
    buildSwitcherEntries(
      this.tenantIds(),
      this.currentTenantId(),
      this.configsResource.value() ?? new Map<string, TenantConfigMeta>(),
    ),
  );

  // Show only when there is at least one OTHER tenant to switch to.
  protected readonly isVisible = computed(() => this.entries().some((e) => !e.isCurrent));

  protected onSelect(entry: TenantSwitcherEntry, popover: IonPopover): void {
    popover.dismiss();
    window.open(entry.url, '_blank', 'noopener');
  }
}
