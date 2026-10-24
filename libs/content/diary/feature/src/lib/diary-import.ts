import { Component, inject } from '@angular/core';
import {
  IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent,
  IonNote, IonSpinner,
} from '@ionic/angular';

import { Header } from '@okr/shared-ui';

import { DiaryImportStore } from './diary-import.store';

/**
 * The diary admin screen — `/diary/import`, `isAdminGuard`.
 *
 * The app is the master of the diary (spec 1.117), so the Drive import is gone; what stays is
 * the repair work: the places and people a diary names that are not matched to a record yet.
 * The two lists are built from the diaries themselves, which is also what makes a fix writable.
 */
@Component({
  selector: 'okr-diary-import',
  standalone: true,
  imports: [
    Header,
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonButton, IonNote,
    IonSpinner, IonBadge,
  ],
  providers: [DiaryImportStore],
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content>

      <ion-card>
        <ion-card-header>
          <ion-card-title>
            {{ store.i18n.locations_title() }}
            <ion-badge color="warning">{{ store.unresolvedLocationCount() }}</ion-badge>
          </ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-note>{{ store.i18n.locations_hint() }}</ion-note>
          <div class="ion-margin-top">
            <ion-button fill="outline" (click)="store.showReferences('location')" [disabled]="store.isLoading()">
              @if (store.isLoading()) {
                <ion-spinner name="dots" slot="start" /> {{ store.i18n.loading() }}
              } @else {
                {{ store.i18n.locations_action() }}
              }
            </ion-button>
          </div>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>
            {{ store.i18n.persons_title() }}
            <ion-badge color="warning">{{ store.unresolvedPersonCount() }}</ion-badge>
          </ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-note>{{ store.i18n.persons_hint() }}</ion-note>
          <div class="ion-margin-top">
            <ion-button fill="outline" (click)="store.showReferences('person')" [disabled]="store.isLoading()">
              @if (store.isLoading()) {
                <ion-spinner name="dots" slot="start" /> {{ store.i18n.loading() }}
              } @else {
                {{ store.i18n.persons_action() }}
              }
            </ion-button>
          </div>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class DiaryImport {
  protected readonly store = inject(DiaryImportStore);
}
