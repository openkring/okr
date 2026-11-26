import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { combineLatest, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  IonContent, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonListHeader, IonNote,
} from '@ionic/angular';

import { activeFirebaseApp } from '@okr/shared-config';
import { AppConfigService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { Header, ImgDirective } from '@okr/shared-ui';
import { resourceParams } from '@okr/shared-util-angular';
import { getImgixUrlWithAutoParams } from '@okr/shared-util-core';
import {
  buildChooserEntries, ChooserEntry, ChooserSource, chooseTenant, PORTAL_I18N_KEYS, readSavedTenants,
  removeSavedTenant, TenantConfigMeta,
} from '@okr/aoc-util';

/** Never throws: reading `localStorage` itself throws where site data is blocked. */
function deviceStorage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The iOS portal's app chooser (spec 1.179 §6.2): the tenants opened on this device, the tenants the
 * person can log in to, and the tenants listed in the portal. Choosing one stores it and reloads the
 * app, which then starts as that tenant with its own login (one Firebase app per tenant).
 * Only routed in the runtime build (`kring-app --configuration runtime|portal`).
 */
@Component({
  selector: 'okr-portal-chooser-page',
  standalone: true,
  imports: [
    Header, ImgDirective,
    IonContent, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonListHeader, IonNote,
  ],
  styles: [`
    .logo { width: 40px; height: 40px; margin-right: 12px; border-radius: 8px; }
    .empty { display: block; padding: 16px; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.portal_title() }" [showCloseButton]="false" />
    <ion-content>
      @if (entries().length === 0) {
        <ion-note class="empty ion-text-wrap" color="medium">{{ i18n.portal_empty() }}</ion-note>
      }
      @for (section of sections(); track section.source) {
        <ion-list>
          <ion-list-header>{{ section.title }}</ion-list-header>
          @for (entry of section.entries; track entry.tenantId) {
            <ion-item-sliding [disabled]="entry.source !== 'saved'">
              <ion-item button (click)="open(entry)" [detail]="true">
                @if (logoSrc(entry); as src) {
                  <img okrImg class="logo" slot="start" [src]="src" [alt]="entry.name" />
                }
                <ion-label>{{ entry.name }}</ion-label>
              </ion-item>
              <ion-item-options side="end">
                <ion-item-option color="danger" (click)="remove(entry)">{{ i18n.portal_remove() }}</ion-item-option>
              </ion-item-options>
            </ion-item-sliding>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class PortalChooserPage {
  private readonly appStore = inject(AppStore);
  private readonly appConfigService = inject(AppConfigService);
  protected readonly i18n = inject(I18nService).translateAll(PORTAL_I18N_KEYS);
  private readonly imgixBaseUrl = computed(() => this.appStore.env.services.imgixBaseUrl);

  private readonly saved = signal(readSavedTenants(deviceStorage()));

  /** The tenants the person can log in to; needs a login in the tenant of this start. */
  private readonly loginTenantsResource = rxResource({
    params: resourceParams(() => ({ uid: this.appStore.currentUser()?.okey ?? '' })),
    stream: ({ params }) => {
      if (!params.uid) return of([] as string[]);
      const fn = httpsCallable<void, { tenants: string[] }>(getFunctions(activeFirebaseApp(), 'europe-west6'), 'listMyLoginTenants');
      return from(fn().then((result) => result.data.tenants ?? [])).pipe(catchError(() => of([] as string[])));
    },
  });

  private readonly listedResource = rxResource({
    stream: () => this.appConfigService.readListedTenantIds().pipe(catchError(() => of([] as string[]))),
  });

  private readonly allIds = computed(() => [...new Set([
    ...this.saved().map((t) => t.tenantId),
    ...(this.loginTenantsResource.value() ?? []),
    ...(this.listedResource.value() ?? []),
  ])]);

  private readonly configsResource = rxResource({
    params: resourceParams(() => ({ ids: this.allIds() })),
    stream: ({ params }) => {
      if (!params.ids.length) return of(new Map<string, TenantConfigMeta>());
      return combineLatest(params.ids.map((id) => this.appConfigService.read(id).pipe(catchError(() => of(undefined))))).pipe(
        map((configs) => {
          const m = new Map<string, TenantConfigMeta>();
          configs.forEach((c, i) => {
            if (c) m.set(params.ids[i], { appName: c.appName, logoUrl: c.logoUrl, appDomain: c.appDomain });
          });
          return m;
        }),
      );
    },
  });

  protected readonly entries = computed(() => buildChooserEntries(
    this.saved(),
    this.loginTenantsResource.value() ?? [],
    this.listedResource.value() ?? [],
    this.configsResource.value() ?? new Map<string, TenantConfigMeta>(),
  ));

  protected readonly sections = computed(() => {
    const titles: Record<ChooserSource, string> = {
      saved: this.i18n.portal_recent(), login: this.i18n.portal_mine(), listed: this.i18n.portal_listed(),
    };
    return (['saved', 'login', 'listed'] as const)
      .map((source) => ({ source, title: titles[source], entries: this.entries().filter((e) => e.source === source) }))
      .filter((s) => s.entries.length > 0);
  });

  protected logoSrc(entry: ChooserEntry): string {
    if (!entry.logoUrl || !this.imgixBaseUrl()) return '';
    return `${this.imgixBaseUrl()}/${getImgixUrlWithAutoParams(entry.logoUrl)}`;
  }

  protected open(entry: ChooserEntry): void {
    const storage = deviceStorage();
    if (!storage || !chooseTenant(storage, entry.tenantId, Date.now())) return;
    globalThis.location.replace('/');
  }

  protected remove(entry: ChooserEntry): void {
    const storage = deviceStorage();
    if (!storage) return;
    removeSavedTenant(storage, entry.tenantId);
    this.saved.set(readSavedTenants(storage));
  }
}
