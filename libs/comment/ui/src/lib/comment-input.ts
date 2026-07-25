import { Component, input, output } from '@angular/core';
import { IonCol, IonRow, IonTextarea } from '@ionic/angular/standalone';

import { CommentListI18n } from '@okr/comment-util';

@Component({
  selector: 'okr-comment-input',
  standalone: true,
  imports: [
    IonRow, IonCol, IonTextarea
  ],
  template: `
    <ion-row>
      <ion-col size="11">
        <ion-textarea #okrComment 
          [value]="value()"
          (keyup.enter)="changed.emit(okrComment.value?.trim() ?? '')"
          label = "{{ i18n().input_label() }}"
          labelPlacement = "floating"
          placeholder = "{{ i18n().input_placeholder() }}"
          [counter]="true"
          fill="outline"
          [maxlength]="1000"
          [rows]="2"
          inputmode="text"
          type="text"
          [autoGrow]="true">
        </ion-textarea>
      </ion-col>
    </ion-row>
`
})
export class CommentInput {
  public readonly i18n = input.required<CommentListI18n>();
  public name = input('comment'); // mandatory name for the form control
  public value = input<string | undefined>(''); // optional value for the form control

  public changed = output<string>();
}
