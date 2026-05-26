// libs/esign/feature/src/lib/esign-list.ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { EsignStore } from './esign.store';

@Component({
  selector: 'bk-esign-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [EsignStore],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
  template: `<ion-header><ion-toolbar><ion-title>Esign</ion-title></ion-toolbar></ion-header><ion-content></ion-content>`,
})
export class EsignList {}
