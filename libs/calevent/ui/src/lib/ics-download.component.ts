import { Component, input } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { Browser } from '@capacitor/browser';

const ICS_FUNCTION_URL = 'https://europe-west6-bkaiser-org.cloudfunctions.net/generateCalendarICS';

@Component({
  selector: 'bk-ics-download',
  standalone: true,
  imports: [SvgIconPipe, IonIcon, IonButton],
  template: `
    @if (bkey()) {
      <ion-button fill="clear" (click)="download()">
        <ion-icon src="{{'calendar-number' | svgIcon }}" />
      </ion-button>
    }
  `
})
export class IcsDownload {
  public readonly bkey = input.required<string>();

  protected async download(): Promise<void> {
    const url = `${ICS_FUNCTION_URL}?calendar=e:${this.bkey()}`;
    await Browser.open({ url, windowName: '_blank' });
  }
}
