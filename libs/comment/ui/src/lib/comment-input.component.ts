import { Component, computed, input, output } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { IonCol, IonRow, IonTextarea } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared/i18n';

@Component({
  selector: 'bk-comment-input',
  imports: [
    TranslatePipe, AsyncPipe,
    IonRow, IonCol, IonTextarea
  ],
  template: `
    <ion-row>
      <ion-col size="11">
        <ion-textarea #bkComment 
          [value]="value()"
          (keyup.enter)="changed.emit(bkComment.value?.trim() ?? '')"
          label = "{{label() | translate | async }}"
          labelPlacement = "floating"
          placeholder = "{{placeholder() | translate | async }}"
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
export class CommentInputComponent {
  public name = input('comment'); // mandatory name for the form control
  public value = input<string | undefined>(''); // optional value for the form control
  protected label = computed(() => `@input.${this.name()}.label`);
  protected placeholder = computed(() => `@input.${this.name()}.placeholder`);

  public changed = output<string>();
}
