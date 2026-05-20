import { Component, input, model } from '@angular/core';

import { TextList } from '@bk2/shared-ui';

export interface TableBodyI18n {
  title: string;
  description: string;
  add: string;
}

@Component({
  selector: 'bk-table-body',
  standalone: true,
  imports: [
    TextList
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-text-list
        [(texts)]="formData"
        [maxLength]="maxLength()"
        [title]="i18n().title"
        [readOnly]="readOnly()"
        [description]="i18n().description"
        [add]="i18n().add"
    />
    `
})
export class TableBody {
  // inputs
  public formData = model.required<string[]>();
  public readonly readOnly = input(true);
  public maxLength = input(500);
  public readonly i18n = input<TableBodyI18n>({ title: '', description: '', add: '' });
}
