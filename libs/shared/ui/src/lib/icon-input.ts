
import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { IonIcon, IonItem } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { coerceBoolean } from '@okr/shared-util-core';

import { TextInput, TextInputI18n } from './text-input';

@Component({
  selector: 'okr-icon-input',
  standalone: true,
  imports: [
    SvgIconPipe,
    TextInput,
    IonItem, IonIcon
  ],
  styles: [`
    ion-item.helper { --min-height: 0; }
    okr-viewdate-input { width: 100%; }
  `],
  template: `
    <ion-item lines="none" class="ion-no-padding">
      <okr-text-input [i18n]="i18n()" [value]="icn()" (valueChange)="iconChange.emit($event)" [maxLength]="30" [showHelper]=true [readOnly]="isReadOnly()" />
      <ion-icon src="{{'search' | svgIcon }}" slot="end" (click)="selectClicked.emit()" />
    </ion-item>
  `
})
export class IconInput {
  public icon = input<string>('');
  public i18n = input.required<TextInputI18n>();
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected icn = linkedSignal(() => this.icon());
  public iconChange = output<string>();
  public selectClicked = output();
}
