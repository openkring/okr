import { Component, input, model, Signal } from '@angular/core';

import { TextList } from '@bk2/shared-ui';

export interface TableBodyI18n {
  table_body_title: Signal<string>;
  table_body_description: Signal<string>;
  table_body_add: Signal<string>;
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
        [title]="i18n().table_body_title()"
        [readOnly]="readOnly()"
        [description]="i18n().table_body_description()"
        [add]="i18n().table_body_add()"
    />
    `
})
export class TableBody {
  // inputs
  public formData = model.required<string[]>();
  public readonly readOnly = input(true);
  public maxLength = input(500);
  public readonly i18n = input.required<TableBodyI18n>();
}
