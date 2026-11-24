import { Component, computed } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonNote, IonRow } from '@ionic/angular';

import { EMAIL_LENGTH } from '@okr/shared-constants';
import { EmailInput, ErrorNote } from '@okr/shared-ui';
import { allowedSenderDomains } from '@okr/tenant-util';

import { SettingsFormBase } from './settings-form.base';
import { SettingsPublicNote } from './settings-public-note';

/** Settings group «Mail»: the address the app suggests as sender. It must belong to a domain the app may send from. */
@Component({
  selector: 'okr-settings-mail-form',
  standalone: true,
  imports: [EmailInput, ErrorNote, SettingsPublicNote, IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonNote, IonRow],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <okr-settings-public-note [text]="publicNote()" />
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-email [i18n]="fields()['mailFrom']" [value]="values()['mailFrom']"
                    (valueChange)="onFieldChange('mailFrom', $event)"
                    [autofocus]="true" [maxLength]="emailLength" [copyable]="false" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['mailFrom']" />
                  <!-- always shown, whatever the helper setting: it says what the suite will accept -->
                  <ion-item lines="none" [button]="false">
                    <ion-note class="ion-text-wrap">{{ domainsText() }}</ion-note>
                  </ion-item>
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class SettingsMailForm extends SettingsFormBase {
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly emailLength = EMAIL_LENGTH;

  /** The domains the suite accepts, or the hint that the operator has to set one first. */
  protected readonly domainsText = computed(() => {
    const domains = allowedSenderDomains(this.context());
    return domains.length === 0 ? this.text('mail_domains_none') : `${this.text('mail_domains')} ${domains.map((d) => `@${d}`).join(', ')}`;
  });

  protected get group(): 'mail' { return 'mail'; }
}
