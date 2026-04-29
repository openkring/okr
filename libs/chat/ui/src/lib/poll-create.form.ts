import { AsyncPipe } from '@angular/common';
import { Component, OnInit, computed, effect, input, linkedSignal, output, signal } from '@angular/core';
import {
  IonItem, IonInput, IonSelect, IonSelectOption, IonNote, IonList
} from '@ionic/angular/standalone';

import { AnyCharacterMask } from '@bk2/shared-config';
import { TranslatePipe } from '@bk2/shared-i18n';
import { StringsComponent } from '@bk2/shared-ui';
import { MatrixPollData } from '@bk2/chat-data-access';

@Component({
  selector: 'bk-poll-create-form',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe,
    StringsComponent,
    IonItem, IonInput, IonSelect, IonSelectOption, IonNote, IonList
  ],
  template: `
    <ion-list>
      <!-- Poll kind -->
      <ion-item>
        <ion-select
          [label]="'@chat.survey.kind' | translate | async"
          labelPlacement="floating"
          [value]="kind()"
          (ionChange)="kind.set($event.detail.value)"
          interface="popover"
        >
          <ion-select-option value="disclosed">{{ '@chat.survey.open' | translate | async }}</ion-select-option>
          <ion-select-option value="undisclosed">{{ '@chat.survey.closed' | translate | async }}</ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item lines="none">
        <ion-note>{{ kindDescription() | translate | async }}</ion-note>
      </ion-item>

      <!-- Question -->
      <ion-item>
        <ion-input
          [label]="'@chat.survey.questionLabel' | translate | async"
          labelPlacement="floating"
          [placeholder]="'@chat.survey.questionPlaceholder' | translate | async"
          [value]="question()"
          (ionInput)="question.set($any($event).detail.value ?? '')"
          [maxlength]="255"
          [counter]="true"
          inputMode="text"
          type="text"
        />
      </ion-item>

      <!-- Answers via bk-strings -->
      <bk-strings
        [(strings)]="answers"
        title="@chat.survey.answers"
        addLabel="@chat.survey.addAnswer"
        [readOnly]="false"
        [mask]="anyCharMask"
        [maxLength]="100"
      />
    </ion-list>
  `
})
export class PollCreateForm implements OnInit {
  public formData = input.required<MatrixPollData>();
  public formDataChange = output<MatrixPollData>();
  public valid = output<boolean>();

  protected readonly anyCharMask = AnyCharacterMask;

  protected kind = linkedSignal(() => this.formData().kind);
  protected question = linkedSignal(() => this.formData().question);
  protected answers = signal<string[]>([]);

  protected kindDescription = computed(() =>
    this.kind() === 'disclosed'
      ? '@chat.survey.openDescription'
      : '@chat.survey.closedDescription'
  );

  constructor() {
    effect(() => {
      const data: MatrixPollData = {
        kind: this.kind(),
        question: this.question(),
        answers: this.answers()
      };
      this.formDataChange.emit(data);
      this.valid.emit(data.question.trim().length > 0 && data.answers.length >= 2);
    });
  }

  ngOnInit(): void {
    this.answers.set([...this.formData().answers]);
  }
}
