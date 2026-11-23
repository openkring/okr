import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { IonContent } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { Header, Spinner } from '@okr/shared-ui';

import { TenantSettingsContent } from './tenant-settings.content';

/**
 * `/tenant/settings` (spec 1.174 §9.2). This shell sits in the eager bundle of every app (the barrel of this lib is
 * imported for `FeatureStore`), so it holds a header and nothing else: the cards, the store and the edit modal are in
 * `TenantSettingsContent`, which is deferred and must never be exported from `index.ts`.
 */
@Component({
  selector: 'okr-tenant-settings-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Header, Spinner, TenantSettingsContent, IonContent],
  template: `
    <okr-header [i18n]="{ title: title() }" />
    <ion-content>
      @defer (on immediate) {
        <okr-tenant-settings-content />
      } @placeholder {
        <okr-spinner />
      }
    </ion-content>
  `,
})
export class TenantSettingsPage {
  protected readonly title = toSignal(inject(I18nService).translate('@tenant/util.settings.title'), { initialValue: '' });
}
