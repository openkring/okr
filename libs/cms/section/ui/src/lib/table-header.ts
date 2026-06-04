import { Component, input, model, Signal } from '@angular/core';

import { TextList } from '@bk2/shared-ui';

export interface TableHeaderI18n {
  table_header_title: Signal<string>;
  table_header_description: Signal<string>;
  table_header_add: Signal<string>;
}

@Component({
  selector: 'bk-table-header',
  standalone: true,
  imports: [
    TextList
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-text-list
        [(texts)]="formData"
        [maxLength]="maxLength()"
        [title]="i18n().table_header_title()"
        [readOnly]="readOnly()"
        [description]="i18n().table_header_description()"
        [add]="i18n().table_header_add()"
    />
    `
})
export class TableHeader {
  // inputs
  public formData = model.required<string[]>();
  public readonly readOnly = input(true);
  public maxLength = input(500);
  public readonly i18n = input.required<TableHeaderI18n>();
}
