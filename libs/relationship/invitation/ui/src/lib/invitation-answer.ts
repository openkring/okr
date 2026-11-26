import { Component, input, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonNote, IonRow } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { InvitationI18n } from '@okr/relationship-invitation-util';
import { InvitationModel } from '@okr/shared-models';

export type InvitationAnswerState = 'accepted' | 'declined';

/**
 * The invitee's two answers on the invitation detail view (view and edit mode alike). An answer is a
 * workflow action, not an edit: it bypasses the change-confirmation of the form below it. The button
 * of the current answer stays visible but disabled, so the answer can be read and changed here.
 * When someone else gave the answer under a Vollmacht (`actedByKey`), `actedFor` says who («von Beat für Anna»).
 */
@Component({
  selector: 'okr-invitation-answer',
  standalone: true,
  imports: [SvgIconPipe, IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonButton, IonIcon, IonNote],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`, `.acted-for { display: block; padding: 4px 8px 0; font-size: 0.85em; }`],
  template: `
    <ion-card>
      <ion-card-content class="ion-no-padding">
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <ion-button expand="block" color="success" [disabled]="state() === 'accepted'" (click)="answered.emit('accepted')">
                <ion-icon slot="start" src="{{ 'checkbox-circle' | svgIcon }}" />
                {{ i18n().subscribe() }}
              </ion-button>
            </ion-col>
            <ion-col size="12" size-md="6">
              <ion-button expand="block" color="danger" [disabled]="state() === 'declined'" (click)="answered.emit('declined')">
                <ion-icon slot="start" src="{{ 'cancel' | svgIcon }}" />
                {{ i18n().unsubscribe() }}
              </ion-button>
            </ion-col>
          </ion-row>
          @if(actedFor()) {
            <ion-row>
              <ion-col size="12"><ion-note class="acted-for">{{ actedFor() }}</ion-note></ion-col>
            </ion-row>
          }
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `,
})
export class InvitationAnswer {
  public readonly i18n = input.required<InvitationI18n>();
  public readonly state = input.required<InvitationModel['state']>();
  /** «von {actor} für {subject}» when the current answer was given under a Vollmacht; empty otherwise */
  public readonly actedFor = input<string>('');
  public readonly answered = output<InvitationAnswerState>();
}
