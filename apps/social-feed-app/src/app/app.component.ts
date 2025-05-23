import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

@Component({
  selector: 'bk-root',
  imports: [
    IonApp, IonRouterOutlet
  ],
  template: `
    <ion-app>
      <ion-router-outlet />
    </ion-app>
  `
})
export class AppComponent {}
