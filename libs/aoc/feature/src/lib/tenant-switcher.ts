import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { combineLatest, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { IonButton, IonContent, IonIcon, IonPopover } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { browse } from '@okr/shared-ui';
import { I18nService } from '@okr/shared-i18n';
import { AppStore } from '@okr/shared-feature';
import { AppConfigService } from '@okr/shared-data-access';
import { resourceParams } from '@okr/shared-util-angular';
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
    ion-popover { --width: 320px; --max-width: 92vw; }
    .switcher-title { padding: 12px 14px 0; font-size: 17px; font-weight: 600; color: var(--ion-color-medium); }
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
              (selectEntry)="onSelect($event, switcherPopover)" />
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

  // The tenants the signed-in person can actually LOG IN to — NOT person.tenants. The person doc is
  // shared and collects a tenant id as soon as data is delivered there (a contact in someone else's
  // tenant), which would offer a tile to an app that only ever shows a login wall. A login needs a
  // users/{uid} doc plus an enabled Firebase Auth account; neither is readable client-side, hence
  // the self-scoped callable.
  private readonly loginTenantsResource = rxResource({
    params: resourceParams(() => ({ uid: this.appStore.currentUser()?.okey ?? '' })),
    stream: ({ params }) => {
      if (!params.uid) return of([] as string[]);
      const fn = httpsCallable<void, { tenants: string[] }>(
        getFunctions(getApp(), 'europe-west6'), 'listMyLoginTenants');
      return from(fn().then((result) => result.data.tenants ?? [])).pipe(
        // A failed lookup hides the switcher rather than guessing from person.tenants.
        catchError(() => of([] as string[])),
      );
    },
  });
  private readonly tenantIds = computed(() => this.loginTenantsResource.value() ?? []);

  // Read every login tenant's app-config doc (world-readable) into a metadata map.
  private readonly configsResource = rxResource({
    params: resourceParams(() => ({ ids: this.tenantIds() })),
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
    // `browse` (Capacitor Browser.open) works on native (in-app browser) AND web (new tab);
    // a raw window.open('_blank') silently no-ops on native Capacitor builds.
    void browse(entry.url);
    popover.dismiss();
  }
}
