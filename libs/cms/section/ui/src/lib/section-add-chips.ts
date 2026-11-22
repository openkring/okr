import { Component, computed, input, output } from '@angular/core';
import { IonChip, IonIcon, IonLabel } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { coerceBoolean } from '@okr/shared-util-core';

/** one optional part of a section that is not used yet, offered as a «+» chip */
export interface SectionAddChip {
  id: string;
  label: string;
}

/**
 * «Add, don't show» (spec 1.171 §4.2): the optional parts of a section that are still empty, as a row of «+» chips.
 * A click emits the chip's id; the parent then shows that part's field or card in place of the chip.
 * Nothing renders when every part is in use, or in read-only mode (there is nothing to add then).
 */
@Component({
  selector: 'okr-section-add-chips',
  standalone: true,
  imports: [IonChip, IonIcon, IonLabel, SvgIconPipe],
  styles: [`
    .add-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 4px 8px; }
    .add-label { font-size: 0.9rem; color: var(--ion-color-medium); margin-inline-end: 4px; }
  `],
  template: `
    @if (!isReadOnly() && chips().length > 0) {
      <div class="add-chips">
        <span class="add-label">{{ label() }}</span>
        @for (chip of chips(); track chip.id) {
          <ion-chip [outline]="true" color="primary" (click)="add.emit(chip.id)">
            <ion-icon src="{{ 'add' | svgIcon }}" />
            <ion-label>{{ chip.label }}</ion-label>
          </ion-chip>
        }
      </div>
    }
  `,
})
export class SectionAddChips {
  public readonly chips = input.required<SectionAddChip[]>();
  /** the text before the chips, e.g. «Hinzufügen:» */
  public readonly label = input('');
  public readonly readOnly = input(true);

  public readonly add = output<string>();

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
}
