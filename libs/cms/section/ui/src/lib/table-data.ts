import { Component, computed, input, model } from '@angular/core';

import { StringsComponent, TextInputComponent, TextList } from '@bk2/shared-ui';

@Component({
  selector: 'bk-table-data',
  standalone: true,
  imports: [
    TextList
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-text-list
        [(texts)]="formData"
        [maxLength]="maxLength()"
        [title]="title()"
        [readOnly]="readOnly()"
        [description]="description()"
        [addLabel]="addLabel()"
    />
    `
})
export class TableDataComponent {
  // inputs
  public formData = model.required<string[]>();
  public name = input.required<'tableHeader' | 'tableBody'>();
  public readonly readOnly = input(true);
  public maxLength = input(500);

  // linked signals (fields)
  protected title = computed(() => `@input.${this.name()}.title`);
  protected description = computed(() => `@input.${this.name()}.description`);
  protected addLabel = computed(() => `@input.${this.name()}.addLabel`);
} 