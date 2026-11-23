import { Component, computed, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { ErrorNote, StringSelect } from '@okr/shared-ui';
import type { SettingsPageOption } from '@okr/tenant-util';

import { SettingsFormBase } from './settings-form.base';
import { SettingsPublicNote } from './settings-public-note';

/** Settings group «Startseite»: picked from the menus and public pages of the tenant, never typed (spec 1.174 §7.4). */
@Component({
  selector: 'okr-settings-start-form',
  standalone: true,
  imports: [ErrorNote, SettingsPublicNote, StringSelect, IonCard, IonCardContent, IonCol, IonGrid, IonRow],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <okr-settings-public-note [text]="publicNote()" />
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <okr-string-select [i18n]="fields()['rootUrl']" [selectedString]="values()['rootUrl']"
                    (selectedStringChange)="onFieldChange('rootUrl', $event)"
                    [stringList]="urls()" [labels]="labels()" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errors()['rootUrl']" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class SettingsStartForm extends SettingsFormBase {
  /** the pages the tenant can start with, the stored one always among them (`startOptions`) */
  public readonly startOptions = input<SettingsPageOption[]>([]);

  protected readonly urls = computed(() => this.startOptions().map((option) => option.key));
  protected readonly labels = computed(() => this.startOptions().map((option) => option.label));

  protected get group(): 'start' { return 'start'; }
}
