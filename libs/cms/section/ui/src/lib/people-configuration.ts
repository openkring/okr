import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';
import { FormsModule } from '@angular/forms';

import { ColorsIonic, NameDisplays } from '@bk2/shared-categories';
import { AvatarInfo, ColorIonic, NameDisplay, UserModel, PeopleConfig } from '@bk2/shared-models';
import { CategoryOld, Checkbox, StringSelect, TextInput } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { Avatars } from '@bk2/avatar-ui';

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
          <ion-card-title>{{ headerTitle() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                <bk-text-input name="title" [value]="title()" (valueChange)="onFieldChange('title', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12">
                <bk-text-input name="altText" [value]="altText()" (valueChange)="onFieldChange('altText', $event)" [readOnly]="isReadOnly()" [showHelper]=true />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="showName" [checked]="showName()" (checkedChange)="onFieldChange('showName', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="showLabel" [checked]="showLabel()" (checkedChange)="onFieldChange('showLabel', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                  <bk-string-select name="peopleType" [selectedString]="type()" (selectedStringChange)="onTypeChange($event)" [readOnly]="readOnly()" [showHelper]="true" [stringList]="['persons', 'group', 'responsibility']" />
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
                  </ion-button>                }
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-category-old name="color" [value]="color()" (valueChange)="onFieldChange('color', $event)" [readOnly]="isReadOnly()" [categories]="colors" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-category-old name="nameDisplay" [value]="nameDisplay()" (valueChange)="onFieldChange('nameDisplay', $event)" [readOnly]="isReadOnly()" [categories]="nameDisplays" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input name="linkedSection" [value]="linkedSection()" (valueChange)="onFieldChange('linkedSection', $event)" [readOnly]="isReadOnly()" [showHelper]=true />
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
  public headerTitle = input('@content.section.type.people.edit');
  public currentUser = input.required<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

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
