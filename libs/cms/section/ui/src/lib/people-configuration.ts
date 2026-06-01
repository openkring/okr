import { Component, computed, inject, input, linkedSignal, model, output, Signal } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';
import { FormsModule } from '@angular/forms';

import { ColorsIonic, NameDisplays } from '@bk2/shared-categories';
import { AvatarInfo, ColorIonic, NameDisplay, UserModel, PeopleConfig } from '@bk2/shared-models';
import { CategoryOld, CategoryOldI18n, Checkbox, CheckboxI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { I18nService } from '@bk2/shared-i18n';

import { Avatars } from '@bk2/avatar-ui';

interface PeopleConfigI18n {
  people_edit:                Signal<string>;
  title_label:                Signal<string>,
  title_placeholder:          Signal<string>,
  title_helper:               Signal<string>,
  altText_label:              Signal<string>,
  altText_placeholder:        Signal<string>,
  altText_helper:             Signal<string>,
  linkedSection_label:        Signal<string>,
  linkedSection_placeholder:  Signal<string>,
  linkedSection_helper:       Signal<string>,
  peopleType_label:           Signal<string>,
  color_label:                Signal<string>,
  nameDisplay_label:          Signal<string>,
  showName_label:             Signal<string>,
  showName_helper:            Signal<string>,
  showLabel_label:            Signal<string>,
  showLabel_helper:           Signal<string>,
}

@Component({
  selector: 'bk-people-config',
  standalone: true,
  imports: [
    vestForms, FormsModule,
    SvgIconPipe,
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonButton, IonIcon,
    CategoryOld, Avatars, StringSelect, Checkbox, TextInput
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().people_edit() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                <bk-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12">
                <bk-text-input [i18n]="altTextI18n()" [value]="altText()" (valueChange)="onFieldChange('altText', $event)" [readOnly]="isReadOnly()" [showHelper]=true />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="showNameI18n()" [checked]="showName()" (checkedChange)="onFieldChange('showName', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="showLabelI18n()" [checked]="showLabel()" (checkedChange)="onFieldChange('showLabel', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                  <bk-string-select [i18n]="peopleTypeI18n()" [selectedString]="type()" (selectedStringChange)="onTypeChange($event)" [readOnly]="readOnly()" [stringList]="['persons', 'group', 'responsibility']" />
              </ion-col>
               <ion-col size="12" size-md="6">
                @if(type() === 'group') {
                  <ion-button fill="outline" [disabled]="isReadOnly()" (click)="groupSelectClicked.emit()">
                    <ion-icon slot="start" src="{{ 'search' | svgIcon }}" />
                    {{ groupId() || '@content.section.type.people.select.group' }}
                  </ion-button>
                }
                @if(type() === 'responsibility') {
                  <ion-button fill="outline" [disabled]="isReadOnly()" (click)="responsibilitySelectClicked.emit()">
                    <ion-icon slot="start" src="{{ 'search' | svgIcon }}" />
                    {{ groupId() || '@content.section.type.people.select.responsibility' }}
                  </ion-button>
                }
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="colorI18n()" [value]="color()" (valueChange)="onFieldChange('color', $event)" [readOnly]="isReadOnly()" [categories]="colors" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="nameDisplayI18n()" [value]="nameDisplay()" (valueChange)="onFieldChange('nameDisplay', $event)" [readOnly]="isReadOnly()" [categories]="nameDisplays" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="linkedSectionI18n()" [value]="linkedSection()" (valueChange)="onFieldChange('linkedSection', $event)" [readOnly]="isReadOnly()" [showHelper]=true />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      @if(currentUser(); as currentUser) {
        @if(type() === 'persons') {
          <bk-avatars (selectClicked)="selectClicked.emit()"
            [avatars]="persons()"
            (avatarsChange)="onPersonsChange($event)"
            [readOnly]="readOnly()"
            [currentUser]="currentUser"
            title="@content.section.type.people.label"
            addLabel="@content.section.type.people.addLabel"
          />
        }
      }
  `
})
export class PeopleConfiguration {
  // inputs
  public formData = model.required<PeopleConfig>();
  public currentUser = input.required<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public readonly i18n = input.required<PeopleConfigI18n>();

  public selectClicked = output<void>();
  public groupSelectClicked = output<void>();
  public responsibilitySelectClicked = output<void>();

  // linked signals (fields)
  protected avatarConfig = linkedSignal(() => this.formData()?.avatar ?? {});
  protected title = linkedSignal(() => this.avatarConfig().title ?? 'Avatar');
  protected altText = linkedSignal(() => this.avatarConfig().altText ?? 'avatar');
  protected showName = linkedSignal(() => this.avatarConfig().showName ?? true);
  protected showLabel = linkedSignal(() => this.avatarConfig().showLabel ?? false);
  protected color = linkedSignal(() => this.avatarConfig().color ?? ColorIonic.Primary);
  protected nameDisplay = linkedSignal(() => this.avatarConfig().nameDisplay ?? NameDisplay.FirstLast);
  protected linkedSection = linkedSignal(() => this.avatarConfig().linkedSection ?? '');
  protected persons = linkedSignal(() => this.formData()?.persons ?? []);
  protected groupId = linkedSignal(() => this.formData()?.groupId ?? '');
  protected type = linkedSignal(() => this.formData().type ?? 'persons');

  // passing constants to template
  protected nameDisplays = NameDisplays;
  protected colors = ColorsIonic;

  protected titleI18n = computed(() => ({
    name: 'title',
    label: this.i18n().title_label(),
    placeholder: this.i18n().title_placeholder(),
    helper: this.i18n().title_helper(),
  } as TextInputI18n));

  protected altTextI18n = computed(() => ({
    name: 'altText',
    label: this.i18n().altText_label(),
    placeholder: this.i18n().altText_placeholder(),
    helper: this.i18n().altText_helper(),
  } as TextInputI18n));

  protected linkedSectionI18n = computed(() => ({
    name: 'linkedSection',
    label: this.i18n().linkedSection_label(),
    placeholder: this.i18n().linkedSection_placeholder(),
    helper: this.i18n().linkedSection_helper(),
  } as TextInputI18n));
  protected peopleTypeI18n  = computed(() => ({ name: 'peopleType',  label: this.i18n().peopleType_label()  } as StringSelectI18n));
  protected colorI18n       = computed(() => ({ name: 'color',       label: this.i18n().color_label()       } as CategoryOldI18n));
  protected nameDisplayI18n = computed(() => ({ name: 'nameDisplay', label: this.i18n().nameDisplay_label() } as CategoryOldI18n));

  protected showNameI18n = computed(() => ({
    name: 'showName',
    label: this.i18n().showName_label(),
    helper: this.i18n().showName_helper(),
  } as CheckboxI18n));

  protected showLabelI18n = computed(() => ({
    name: 'showLabel',
    label: this.i18n().showLabel_label(),
    helper: this.i18n().showLabel_helper(),
  } as CheckboxI18n));

  /************************************** actions *********************************************** */
  protected onPersonsChange(persons: AvatarInfo[]): void {
    this.formData.update(vm => ({ ...vm, persons }));
  }

  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.formData.update((vm) => {
      const avatar = { ...vm.avatar, [fieldName]: fieldValue };
      return { ...vm, avatar };
    });
  }

  protected onGroupIdChange(groupId: string): void {
    this.formData.update(vm => ({ ...vm, groupId }));
  }

  protected onTypeChange(type: string): void {
    this.formData.update(vm => ({ ...vm, type: type as PeopleConfig['type'] }));
  }
}
