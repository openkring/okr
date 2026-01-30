import { AsyncPipe } from '@angular/common';
import { Component, computed, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel, RoleName, SectionModel, UserModel } from '@bk2/shared-models';
import { ButtonCopyComponent, CategorySelectComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-section-config',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonLabel, IonItem,
    TextInputComponent, CategorySelectComponent, ButtonCopyComponent
  ],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ headerTitle() | translate | async }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          @if (hasRole('admin')) {
            <ion-row>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-label>{{ '@content.section.default.type' | translate | async }}: {{ type() }}</ion-label>
                </ion-item>
              </ion-col>
              @if(bkey(); as bkey) {
                <ion-col size="6">
                  <ion-item lines="none">
                    <ion-label>Section Key: {{ bkey }}</ion-label>
                    <bk-button-copy [value]="bkey" />
                  </ion-item>
                </ion-col>
              }
            </ion-row>
          }
        <ion-row>
          <ion-col size="12">
            <bk-text-input name="name" [value]="name()" (valueChange)="onFieldChange('name', $event)" [readOnly]="isReadOnly()" />
          </ion-col>
          <ion-col size="12">
            <bk-text-input name="title" [value]="title()" (valueChange)="onFieldChange('title', $event)" [readOnly]="isReadOnly()" />
          </ion-col>
          <ion-col size="12">
            <bk-text-input name="subTitle" [value]="subTitle()" (valueChange)="onFieldChange('subTitle', $event)" [readOnly]="isReadOnly()" />
          </ion-col>
          <ion-col size="12">
            <bk-text-input name="colSize" [value]="colSize()" (valueChange)="onFieldChange('colSize', $event)" [readOnly]="isReadOnly()" [showHelper]="true" />
          </ion-col>
          <ion-col size="6">
            <ion-item lines="none">
              <ion-label>{{ '@content.section.forms.roleNeeded.title' | translate | async }}</ion-label>
            </ion-item>
          </ion-col>
          <ion-col size="6">
            <bk-cat-select [category]="roles()!" [selectedItemName]="roleNeeded()" (selectedItemNameChange)="onFieldChange('roleNeeded', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
          </ion-col>
        </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class SectionConfigComponent {
  // inputs
  public formData = model.required<SectionModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly roles = input.required<CategoryListModel>();
  public readonly headerTitle = input('@content.section.forms.title');
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // fields
  protected bkey = computed(() => this.formData().bkey ?? '');
  protected name = linkedSignal(() => this.formData().name ?? '');
  protected title = linkedSignal(() => this.formData().title ?? '');
  protected subTitle = linkedSignal(() => this.formData().subTitle ?? '');
  protected type = computed(() => this.formData().type);
  protected roleNeeded = linkedSignal(() => this.formData().roleNeeded ?? 'registered');
  protected colSize = linkedSignal(() => this.formData().colSize ?? '12');

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | RoleName): void {
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
