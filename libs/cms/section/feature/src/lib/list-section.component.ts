import { Component, input } from '@angular/core';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import { SectionModel } from '@bk2/shared-models';
import { SpinnerComponent } from '@bk2/shared-ui';

@Component({
  selector: 'bk-list-section',
  standalone: true,
  imports: [
    SpinnerComponent,
    IonCard, IonCardContent
  ],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
  `],
  template: `
    @if(section(); as section) {
      <ion-card>
        <ion-card-content>
        </ion-card-content>
      </ion-card>

    } @else {
      <bk-spinner />
    }
  `
})
export class ListSectionComponent {
  public section = input<SectionModel>();

}
