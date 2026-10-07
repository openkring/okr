// libs/content/pdf-template/ui/src/lib/template-publish.form.ts
import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { NotesInput, NotesInputI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';
import { TemplateI18n, TemplatePublishFormModel, templatePublishValidations } from '@okr/content-pdf-template-util';

/** The changelog of a template version about to be published. The parent modal drives publishing. */
@Component({
  selector: 'okr-template-publish-form',
  standalone: true,
  imports: [NotesInput, IonCard, IonCardContent],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <okr-notes-input [i18n]="changelogI18n()" [value]="changelog()"
              (valueChange)="onFieldChange('changelog', $event)"
              [maxLength]="descriptionLength" [errors]="changelogErrors()" [readOnly]="isReadOnly()" />
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class TemplatePublishForm {
  // inputs
  public readonly i18n = input.required<TemplateI18n>();
  public formData = model.required<TemplatePublishFormModel>();
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly publishForm = form(this.formData, (path) => validateVestTree(path, templatePublishValidations as any));

  constructor() {
    effect(() => this.valid.emit(this.publishForm().valid()));
  }

  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly descriptionLength = DESCRIPTION_LENGTH;

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly changelog = computed(() => this.formData()?.changelog ?? '');
  protected readonly changelogErrors = computed(() => this.publishForm.changelog().errors().map(e => e.message ?? ''));
  protected readonly changelogI18n = computed(() => ({
    name: 'changelog',
    label: this.i18n().publish_changelog(),
    placeholder: this.i18n().publish_changelog_ph(),
  } as NotesInputI18n));

  protected onFieldChange(fieldName: keyof TemplatePublishFormModel, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
