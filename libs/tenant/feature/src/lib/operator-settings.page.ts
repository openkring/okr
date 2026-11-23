import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { IonContent } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { Header, Spinner } from '@okr/shared-ui';

import { OperatorSettingsContent } from './operator-settings.content';

/**
 * `/operator/settings` in the bka app (spec 1.174 §9.2). A shell like `TenantSettingsPage` and for the same reason: the
 * barrel of this lib is in the eager bundle of every app, so the content is deferred and never exported from `index.ts`.
 */
@Component({
  selector: 'okr-operator-settings-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Header, Spinner, OperatorSettingsContent, IonContent],
  template: `
    <okr-header [i18n]="{ title: title() }" />
    <ion-content>
      @defer (on immediate) {
        <okr-operator-settings-content />
      } @placeholder {
        <okr-spinner />
      }
    </ion-content>
  `,
})
export class OperatorSettingsPage {
  protected readonly title = toSignal(inject(I18nService).translate('@tenant/util.settings.operator_page.title'), { initialValue: '' });
}
