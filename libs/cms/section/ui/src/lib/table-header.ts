import { Component, inject, input, model } from '@angular/core';

import { I18nService } from '@bk2/shared-i18n';
import { TextList } from '@bk2/shared-ui';

import { PFX } from './scope';

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
        [title]="i18n.title()"
        [readOnly]="readOnly()"
        [description]="i18n.description()"
        [addLabel]="i18n.add()"
    />
    `
})
export class TableHeader {
  private i18nService = inject(I18nService);

  // inputs
  public formData = model.required<string[]>();
  public readonly readOnly = input(true);
  public maxLength = input(500);

  // i18n
  protected readonly i18n = this.i18nService.translateAll({
    title: PFX + 'table.header.title',
    description: PFX + 'table.header.description',
    add: PFX + 'table.header.add'
  });
} 