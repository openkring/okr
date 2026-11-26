import { Component, computed, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { IonButton, IonContent, IonNote, IonSpinner } from '@ionic/angular';

import { isValidTenantId, PORTAL_CHOOSER_PATH, TenantMode } from '@okr/shared-config';
import { AppConfigService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { Header } from '@okr/shared-ui';
import { resourceParams } from '@okr/shared-util-angular';
import { chooseTenant, PORTAL_I18N_KEYS, resolveTenantLink, TenantConfigMeta } from '@okr/aoc-util';

/**
 * A tenant link `/t/<tenantId>` (spec 1.179 §6.2). In the iOS portal it switches to that tenant; in
 * the kring web app (no portal) it sends the person to the tenant's own app; an unknown tenant shows
 * a note. The route passes the build's `tenantMode` as data.
 */
@Component({
  selector: 'okr-tenant-link-page',
  standalone: true,
  imports: [Header, IonButton, IonContent, IonNote, IonSpinner],
  styles: [`.center { padding: 24px; display: flex; flex-direction: column; gap: 16px; align-items: flex-start; }`],
  template: `
    <okr-header [i18n]="{ title: i18n.portal_title() }" [showCloseButton]="false" />
    <ion-content>
      <div class="center">
        @if (action()?.kind === 'chooser') {
          <ion-note class="ion-text-wrap">{{ i18n.portal_unknown() }}</ion-note>
          @if (tenantMode() === 'runtime') {
            <ion-button (click)="openChooser()">{{ i18n.portal_button() }}</ion-button>
          }
        } @else {
          <ion-spinner />
        }
      </div>
    </ion-content>
  `,
})
export class TenantLinkPage {
  /** route param `/t/:tenantId` */
  public readonly tenantId = input('');
  /** route data: the build's mode (`TENANT_MODE` of the app) */
  public readonly tenantMode = input<TenantMode>('fixed');

  private readonly appConfigService = inject(AppConfigService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService).translateAll(PORTAL_I18N_KEYS);

  private readonly configResource = rxResource({
    params: resourceParams(() => ({ id: this.tenantId() ?? '' })),
    stream: ({ params }) => {
      if (!isValidTenantId(params.id)) return of(null);
      return this.appConfigService.read(params.id).pipe(
        map((c): TenantConfigMeta | null => (c ? { appName: c.appName, logoUrl: c.logoUrl, appDomain: c.appDomain } : null)),
        catchError(() => of(null)),
      );
    },
  });

  protected readonly action = computed(() => {
    if (this.configResource.isLoading()) return undefined;
    return resolveTenantLink(this.tenantId() ?? '', this.tenantMode() ?? 'fixed', this.configResource.value() ?? undefined);
  });

  private readonly apply = effect(() => {
    const action = this.action();
    if (action?.kind === 'switch') {
      try {
        if (chooseTenant(globalThis.localStorage, action.tenantId, Date.now())) globalThis.location.replace('/');
      } catch {
        // blocked storage: the note path below is not reached; the person stays here
      }
    } else if (action?.kind === 'redirect') {
      globalThis.location.replace(action.url);
    }
  });

  protected openChooser(): void {
    void this.router.navigateByUrl(PORTAL_CHOOSER_PATH);
  }
}
