import { Component, computed, inject, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';

import { CategoryListModel, RoleName, SectionModel, UserModel } from '@bk2/shared-models';
import { ButtonCopy, ButtonCopyI18n, CategorySelect, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, hasRole } from '@bk2/shared-util-core';
import { LONG_NAME_LENGTH } from '@bk2/shared-constants';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

@Component({
  selector: 'bk-section-config',
  standalone: true,
  imports: [
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonLabel, IonItem,
    TextInput, CategorySelect, ButtonCopy
  ],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ headerTitle() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          @if (hasRole('admin')) {
            <ion-row>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-label>{{ '@content.section.default.type' }}: {{ type() }}</ion-label>
                </ion-item>
              </ion-col>
              @if(bkey(); as bkey) {
                <ion-col size="6">
                  <ion-item lines="none">
                    <ion-label>Section Key: {{ bkey }}</ion-label>
                    <bk-button-copy [i18n]="buttonCopyI18n()" [value]="bkey" />
                  </ion-item>
                </ion-col>
              }
            </ion-row>
          }
        <ion-row>
          <ion-col size="12">
            <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [readOnly]="isReadOnly()" />
          </ion-col>
          <ion-col size="12">
            <bk-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)" [maxLength]="maxLength" [readOnly]="isReadOnly()" />
          </ion-col>
          <ion-col size="12">
            <bk-text-input [i18n]="subTitleI18n()" [value]="subTitle()" (valueChange)="onFieldChange('subTitle', $event)" [maxLength]="maxLength" [readOnly]="isReadOnly()" />
          </ion-col>
          <ion-col size="12">
            <bk-text-input [i18n]="colSizeI18n()" [value]="colSize()" (valueChange)="onFieldChange('colSize', $event)" [readOnly]="isReadOnly()" [showHelper]="true" />
          </ion-col>
          <ion-col size="6">
            <ion-item lines="none">
              <ion-label>{{ '@content.section.forms.roleNeeded.title' }}</ion-label>
            </ion-item>
          </ion-col>
          <ion-col size="6">
            <bk-cat-select [category]="roles()!" [selectedItemName]="roleNeeded()" (selectedItemNameChange)="onFieldChange('roleNeeded', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
          </ion-col>
          <ion-col size="6">
            <ion-item lines="none">
              <ion-label>{{ '@content.section.forms.state.title' }}</ion-label>
            </ion-item>
          </ion-col>
          <ion-col size="6">
            <bk-cat-select [category]="states()!" [selectedItemName]="state()" (selectedItemNameChange)="onFieldChange('state', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
          </ion-col>
        </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class SectionConfiguration {
  private readonly i18nService = inject(I18nService);

  // inputs
  public formData = model.required<SectionModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly roles = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly headerTitle = input('@content.section.forms.title');
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // fields
  protected bkey = computed(() => this.formData().bkey ?? '');
  protected name = linkedSignal(() => this.formData().name ?? '');
  protected title = linkedSignal(() => this.formData().title ?? '');
  protected subTitle = linkedSignal(() => this.formData().subTitle ?? '');
  protected type = computed(() => this.formData().type);
  protected state = computed(() => this.formData().state);
  protected roleNeeded = linkedSignal(() => this.formData().roleNeeded ?? 'registered');
  protected colSize = linkedSignal(() => this.formData().colSize ?? '12');

  protected maxLength = LONG_NAME_LENGTH;

  protected readonly fieldI18n = this.i18nService.translateAll({
    name_label:           PFX + 'name.label',
    name_placeholder:     PFX + 'name.placeholder',
    name_helper:          PFX + 'name.helper',
    title_label:          PFX + 'title.label',
    title_placeholder:    PFX + 'title.placeholder',
    title_helper:         PFX + 'title.helper',
    subTitle_label:       PFX + 'subTitle.label',
    subTitle_placeholder: PFX + 'subTitle.placeholder',
    subTitle_helper:      PFX + 'subTitle.helper',
    colSize_label:        PFX + 'colSize.label',
    colSize_placeholder:  PFX + 'colSize.placeholder',
    colSize_helper:       PFX + 'colSize.helper',
    copy_conf:            '@shared/ui.copy.conf',
  });
  protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.fieldI18n.copy_conf() } as ButtonCopyI18n));

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.fieldI18n.name_label(),
    placeholder: this.fieldI18n.name_placeholder(),
    helper: this.fieldI18n.name_helper(),
  } as TextInputI18n));

  protected titleI18n = computed(() => ({
    name: 'title',
    label: this.fieldI18n.title_label(),
    placeholder: this.fieldI18n.title_placeholder(),
    helper: this.fieldI18n.title_helper(),
  } as TextInputI18n));

  protected subTitleI18n = computed(() => ({
    name: 'subTitle',
    label: this.fieldI18n.subTitle_label(),
    placeholder: this.fieldI18n.subTitle_placeholder(),
    helper: this.fieldI18n.subTitle_helper(),
  } as TextInputI18n));

  protected colSizeI18n = computed(() => ({
    name: 'colSize',
    label: this.fieldI18n.colSize_label(),
    placeholder: this.fieldI18n.colSize_placeholder(),
    helper: this.fieldI18n.colSize_helper(),
  } as TextInputI18n));

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | RoleName): void {
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
