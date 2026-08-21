import { Component, inject, input } from '@angular/core';
import { IonButton, IonContent, IonFooter, IonItem, IonLabel, IonList, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';
import { PersonDuplicateCandidate, PersonI18n } from '@okr/subject-person-util';
import { dismissOverlay } from '@okr/shared-util-angular';

@Component({
  selector: 'okr-person-duplicate-modal',
  standalone: true,
  imports: [Header, IonContent, IonList, IonItem, IonLabel, IonButton, IonFooter, IonToolbar],
  template: `
    <okr-header [i18n]="{ title: i18n().duplicate_title() }" [isModal]="true" />
    <ion-content class="ion-padding">
      <p>{{ i18n().duplicate_intro() }}</p>
      <ion-list>
        @for (c of candidates(); track c.okey) {
          <ion-item button (click)="select(c)">
            <ion-label>
              <h2>{{ c.firstName }} {{ c.lastName }}</h2>
              <p>
                {{ c.gender }}
                @if (c.dateOfBirth) { · {{ c.dateOfBirth }} }
                @if (c.ssnId) { · {{ c.ssnId }} }
              </p>
              <p>
                @if (c.favEmail) { {{ c.favEmail }} }
                @if (c.favPhone) { · {{ c.favPhone }} }
                @if (c.favZipCode) { · {{ c.favZipCode }} }
              </p>
              <p>{{ i18n().duplicate_tenants() }}: {{ c.tenants.join(', ') }}</p>
            </ion-label>
            <ion-button slot="end" fill="outline">{{ i18n().select() }}</ion-button>
          </ion-item>
        }
      </ion-list>
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-button slot="end" fill="clear" (click)="createNew()">{{ i18n().duplicate_create_new() }}</ion-button>
      </ion-toolbar>
    </ion-footer>
  `,
})
export class PersonDuplicateModal {
  private readonly modalController = inject(ModalController);

  public candidates = input.required<PersonDuplicateCandidate[]>();
  public i18n = input.required<PersonI18n>();

  protected select(candidate: PersonDuplicateCandidate): void {
    dismissOverlay(this.modalController, candidate, 'select');
  }

  protected createNew(): void {
    dismissOverlay(this.modalController, null, 'create');
  }
}
