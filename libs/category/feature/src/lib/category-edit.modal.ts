import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';

import { CategoryListFormComponent } from '@bk2/category-ui';
import { convertCategoryListToForm, convertFormToCategoryList } from '@bk2/category-util';

@Component({
  selector: 'bk-category-edit-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, CategoryListFormComponent,
    TranslatePipe, AsyncPipe,
    IonContent
  ],
  template: `
      <bk-header title="{{ '@category.operation.update.label' | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-category-list-form [(vm)]="vm" [currentUser]="currentUser()" [categoryTags]="categoryTags()" (validChange)="formIsValid.set($event)" />
    </ion-content>
  `
})
export class CategoryEditModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly appStore = inject(AppStore);

  public category = input.required<CategoryListModel>();
  public currentUser = input<UserModel | undefined>();
  
  public vm = linkedSignal(() => convertCategoryListToForm(this.category()));
  protected formIsValid = signal(false);

  protected categoryTags = computed(() => this.appStore.getTags('category'));

  public save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToCategoryList(this.category(), this.vm(), this.appStore.env.tenantId), 'confirm');
  }
}
