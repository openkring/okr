import { Component, inject, input, resource } from '@angular/core';
import { IonItem, IonLabel, IonNote } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { HostingDomainsService, HostingKind } from '@okr/cms-page-data-access';
import { PAGE_I18N_KEYS } from '@okr/cms-page-util';

/**
 * Every host the Hosting site answers on — custom domains and the built-in `*.web.app` / `*.firebaseapp.com`
 * hosts — shown above the segments of the app sitemap (`kind` 'app') and the website sitemap (`kind` 'website').
 * Each host is a link; a redirecting domain names its target, a domain that is not serving yet is marked.
 */
@Component({
  selector: 'okr-hosting-domains',
  standalone: true,
  imports: [IonItem, IonLabel, IonNote],
  styles: [`
    .domains { display: flex; flex-wrap: wrap; gap: 4px 16px; }
    .domains a { white-space: nowrap; }
  `],
  template: `
    @if (domains.value(); as result) {
      <ion-item lines="none">
        <ion-label>
          <ion-note>{{ i18n.graph_domains_label() }}</ion-note>
          <div class="domains">
            @for (d of result.domains; track d.host) {
              <span>
                <a [href]="'https://' + d.host" target="_blank" rel="noopener">{{ d.host }}</a>
                @if (d.internal) { <ion-note> ({{ i18n.graph_domains_internal() }})</ion-note> }
                @if (d.redirectTo) { <ion-note> {{ i18n.graph_domains_redirect() }} {{ d.redirectTo }}</ion-note> }
                @if (!d.active) { <ion-note color="warning"> ({{ i18n.graph_domains_inactive() }})</ion-note> }
              </span>
            }
          </div>
        </ion-label>
      </ion-item>
    }
  `,
})
export class HostingDomains {
  private readonly hostingDomainsService = inject(HostingDomainsService);

  public readonly kind = input.required<HostingKind>();
  /** `websites/{siteId}` for kind 'website'; ignored for the app */
  public readonly siteId = input('');

  protected readonly i18n = inject(I18nService).translateAll({
    graph_domains_label: PAGE_I18N_KEYS.graph_domains_label,
    graph_domains_internal: PAGE_I18N_KEYS.graph_domains_internal,
    graph_domains_redirect: PAGE_I18N_KEYS.graph_domains_redirect,
    graph_domains_inactive: PAGE_I18N_KEYS.graph_domains_inactive,
  });

  /** an error (no role, no site) hides the row instead of breaking the sitemap */
  protected readonly domains = resource({
    params: () => ({ kind: this.kind(), siteId: this.siteId() }),
    loader: async ({ params }) => {
      if (params.kind === 'website' && !params.siteId) return undefined;
      try {
        return await this.hostingDomainsService.list(params.kind, params.siteId);
      } catch {
        return undefined;
      }
    },
  });
}
