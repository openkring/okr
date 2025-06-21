import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared/ui';
import { ModelType, PageModel, UserModel } from '@bk2/shared/models';
import { RoleName } from '@bk2/shared/config';
import { TranslatePipe } from '@bk2/shared/i18n';
import { hasRole } from '@bk2/shared/util';
import { AppStore } from '@bk2/shared/feature';

import { convertFormToPage, convertPageToForm, PageFormModel } from '@bk2/cms/page/util';
import { PageFormComponent } from '@bk2/cms/page/ui';

@Component({
  selector: 'bk-page-edit-modal',
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, ChangeConfirmationComponent, PageFormComponent,
    IonContent
  ],
  template: `
    <bk-header title="{{ '@content.page.operation.update.label' | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    } 
    <ion-content>
      <bk-page-form [(vm)]="vm" [currentUser]="currentUser()" [pageTags]="pageTags()" (validChange)="formIsValid.set($event)" />
    </ion-content>
  `
})
export class PageEditModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  public page = input.required<PageModel>();
  public currentUser = input.required<UserModel>();

  protected vm = linkedSignal(() => convertPageToForm(this.page()));
  protected pageTags = computed(() => this.appStore.getTags(ModelType.Page));
  protected formIsValid = signal(false);

  public save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToPage(this.page(), this.vm() as PageFormModel, this.appStore.tenantId()), 'confirm');
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
