
import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { IonIcon, IonItem } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { coerceBoolean } from '@bk2/shared-util-core';

import { TextInputComponent } from 'libs/shared/ui/src/lib/text-input.component';

@Component({
  selector: 'bk-icon-input',
  standalone: true,
  imports: [
    SvgIconPipe,
    TextInputComponent,
    IonItem, IonIcon
  ],
  viewProviders: [vestFormsViewProviders],
  styles: [`
    ion-item.helper { --min-height: 0; }
    bk-viewdate-input { width: 100%; }
  `],
  template: `
    <ion-item lines="none" class="ion-no-padding">
      <bk-text-input name="icon" [value]="icn()" (valueChange)="iconChange.emit($event)" [maxLength]="30" [showHelper]=true [readOnly]="isReadOnly()" />
      <ion-icon src="{{'search' | svgIcon }}" slot="end" (click)="selectClicked.emit()" />
    </ion-item>
  `
})
export class IconInput {
  public icon = input<string>('');
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected icn = linkedSignal(() => this.icon());
  public iconChange = output<string>();
  public selectClicked = output();
}
