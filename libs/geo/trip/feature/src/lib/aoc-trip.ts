import { Component } from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';

@Component({
  selector: 'bk-aoc-trip',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>Ausfahrten Administration</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <p>Vollständige Implementierung folgt in Plan 2.</p>
    </ion-content>
  `,
})
export class AocTrip {}
