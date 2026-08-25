import { Component, computed, input, output } from '@angular/core';
import { IonChip, IonIcon, IonLabel } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { coerceBoolean } from '@okr/shared-util-core';

/**
 * A dashed 'add' chip that reveals an optional field on demand: a form shows it instead of an
 * empty input pair, and only renders the fields once the user asks for them (e.g. 'Link
 * hinzufügen' in the calevent form). The label is passed in, so the chip carries no i18n of its
 * own; it renders nothing in read-only mode, where there is nothing to add.
 */
@Component({
  selector: 'okr-add-chip',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonChip, IonIcon, IonLabel
  ],
  styles: [`
    ion-chip { margin: 4px 8px 12px; border: 1px dashed var(--ion-color-medium, #6d7683); --background: transparent; }
    ion-chip ion-label { font-size: 14px; }
  `],
  template: `
    @if(!isReadOnly()) {
      <ion-chip [outline]="true" color="secondary" (click)="addClicked.emit()" title="{{ label() }}">
        <ion-icon src="{{ iconName() | svgIcon }}" />
        <ion-label>{{ label() }}</ion-label>
      </ion-chip>
    }
  `
})
export class AddChip {
  // inputs
  public label = input.required<string>();   // e.g. 'Link hinzufügen'
  public iconName = input('add');
  public readOnly = input(false);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // outputs
  public addClicked = output<void>();
}
