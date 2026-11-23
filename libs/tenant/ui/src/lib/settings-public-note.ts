import { Component, input } from '@angular/core';
import { IonItem, IonNote } from '@ionic/angular';

/** The line on top of every settings form: `app-config` is world-readable (spec 1.174 §7.1). Never hidden, unlike helper texts. */
@Component({
  selector: 'okr-settings-public-note',
  standalone: true,
  imports: [IonItem, IonNote],
  template: `
    <ion-item lines="none" [button]="false">
      <ion-note class="ion-text-wrap">{{ text() }}</ion-note>
    </ion-item>
  `,
})
export class SettingsPublicNote {
  public readonly text = input.required<string>();
}
