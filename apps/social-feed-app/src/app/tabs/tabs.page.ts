import { Component } from '@angular/core';
import { SvgIconPipe } from '@bk2/shared/pipes';
import { IonTabs, IonTabBar, IonTabButton, IonIcon } from '@ionic/angular/standalone';

@Component({
  selector: 'bk-tabs',
  imports: [
    IonTabs, IonTabBar, IonTabButton, IonIcon,
    SvgIconPipe
  ],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="feed" href="/feed">
          <ion-icon src="{{ 'globe' | svgIcon }}" />
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `
})
export class TabsPageComponent {
}
