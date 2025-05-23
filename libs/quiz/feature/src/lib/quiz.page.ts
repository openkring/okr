import { Component, inject } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCol, IonContent, IonGrid, IonRow } from '@ionic/angular/standalone';

import { HeaderComponent } from '@bk2/shared/ui';
import { QuizStore } from './quiz.store';

@Component({
  selector: 'bk-quiz-page',
  imports: [
    HeaderComponent,
    IonContent, IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonButton
  ],
  template: `
    <bk-header title="Quiz" />
    <ion-content>
      @for(question of quizStore.questions(); track question) {
        <ion-card>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col size="12"><h1>{{ question.question }}</h1></ion-col>
              </ion-row>
              <ion-row>
                @for(choice of question.choices; track choice) {
                  <ion-col size="6">
                    <ion-button (click)="quizStore.answer(question.id, choice.id)">{{ choice.text }}</ion-button>
                  </ion-col>
                }
              </ion-row>
              @if(question.status !== 'unanswered') {
                <ion-row>
                  @switch(question.status) {
                    @case ('correct') {
                      <ion-col size="12" color="green">Richtig !</ion-col>
                    }
                    @case ('incorrect') {
                      <ion-col size="12" color="red">Falsch !</ion-col>
                    }
                  }
                  <ion-col size="12">{{ question.explanation }}</ion-col>
                </ion-row>
              }
            </ion-grid>
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `
})
export class QuizPageComponent {
  // private readonly env = inject(ENV);
  //public id = input.required<string>();  
  //private readonly tenantId = this.env.owner.tenantId;

  protected quizStore = inject(QuizStore);

}
