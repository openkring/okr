import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonRow, IonSelect, IonSelectOption } from '@ionic/angular/standalone';

import { DEFAULT_NOTES, DEFAULT_TAGS } from '@okr/shared-constants';
import { RoleName, UserModel, WhiteboardModel } from '@okr/shared-models';
import { Chips, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';

import { WhiteboardI18n, whiteboardValidations } from '@okr/instruments-whiteboard-util';

/** A template option resolved by the store (key + already-translated label) for the select. */
export interface WhiteboardTemplateOption { key: string; label: string; }

/**
 * Pure metadata form for a whiteboard (name, description, template, tags). The canvas itself is
 * edited on the editor page; this form is the create/rename detail (parent modal drives saving via
 * change-confirmation — no submit button here). Signal Forms + Vest per the `building-forms` skill.
 */
@Component({
  selector: 'okr-whiteboard-form',
  standalone: true,
  imports: [
    TextInput, NotesInput, Chips,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonLabel, IonSelect, IonSelectOption,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"
                    [autofocus]="true" [maxLength]="50" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-label>{{ i18n().chooseTemplate() }}</ion-label>
                    <ion-select [value]="templateKey()" [disabled]="isReadOnly()" interface="popover"
                                (ionChange)="onFieldChange('templateKey', $any($event).detail.value)">
                      @for (option of templateOptions(); track option.key) {
                        <ion-select-option [value]="option.key">{{ option.label }}</ion-select-option>
                      }
                    </ion-select>
                  </ion-item>
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        @if (hasRole('contentAdmin')) {
          <okr-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
        }
        @if (hasRole('contentAdmin')) {
          <okr-notes-input [i18n]="descriptionI18n()" [value]="description()" (valueChange)="onFieldChange('description', $event)" [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `,
})
export class WhiteboardForm {
  public readonly i18n = input.required<WhiteboardI18n>();
  public formData = model.required<WhiteboardModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly allTags = input(DEFAULT_TAGS);
  public readonly templateOptions = input<WhiteboardTemplateOption[]>([]);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly whiteboardForm = form(this.formData, (path) =>
    validateVestTree(path, whiteboardValidations as any),
  );

  constructor() {
    effect(() => this.valid.emit(this.whiteboardForm().valid()));
  }

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly name = computed(() => this.formData()?.name ?? '');
  protected readonly description = computed(() => this.formData()?.description ?? DEFAULT_NOTES);
  protected readonly tags = computed(() => this.formData()?.tags ?? DEFAULT_TAGS);
  protected readonly templateKey = computed(() => this.formData()?.templateKey ?? '');

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().name_label(),
    placeholder: this.i18n().name_placeholder(),
    helper: this.i18n().name_helper(),
  } as TextInputI18n));

  protected descriptionI18n = computed(() => ({
    name: 'description',
    label: this.i18n().description_label(),
    placeholder: this.i18n().description_placeholder(),
  } as NotesInputI18n));

  protected onFieldChange(fieldName: string, fieldValue: string | string[]): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue } as WhiteboardModel));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
