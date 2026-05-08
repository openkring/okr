import { AsyncPipe } from '@angular/common';
import { Component, OnInit, effect, input, output, signal } from '@angular/core';
import { IonItem, IonInput, IonList } from '@ionic/angular/standalone';

import { AnyCharacterMask } from '@bk2/shared-config';
import { TranslatePipe } from '@bk2/shared-i18n';
import { CheckboxComponent, StringsComponent } from '@bk2/shared-ui';
import { MatrixPollData } from '@bk2/chat-data-access';

@Component({
  selector: 'bk-poll-create-form',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe,
    StringsComponent, CheckboxComponent,
    IonItem, IonInput, IonList
  ],
  template: `
    <ion-list>
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

      <!-- Multiple answers toggle -->
      <bk-checkbox
        name="allowMultipleAnswers"
        [(checked)]="allowMultipleAnswers"
        [readOnly]="false"
      />
    </ion-list>
  `
})
export class PollCreateForm implements OnInit {
  public formData = input.required<MatrixPollData>();
  public formDataChange = output<MatrixPollData>();
  public valid = output<boolean>();

  protected readonly anyCharMask = AnyCharacterMask;

  protected question = signal('');
  protected answers = signal<string[]>([]);
  protected allowMultipleAnswers = signal(false);

  constructor() {
    effect(() => {
      const data: MatrixPollData = {
        question: this.question(),
        answers: this.answers(),
        maxSelections: this.allowMultipleAnswers() ? 20 : 1,
      };
      this.formDataChange.emit(data);
      this.valid.emit(data.question.trim().length > 0 && data.answers.length >= 2);
    });
  }

  ngOnInit(): void {
    this.question.set(this.formData().question);
    this.answers.set([...this.formData().answers]);
    this.allowMultipleAnswers.set((this.formData().maxSelections ?? 1) > 1);
  }
}
