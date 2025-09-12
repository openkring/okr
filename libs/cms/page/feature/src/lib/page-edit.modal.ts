import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { ModelType, PageModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { PageFormComponent } from '@bk2/cms-page-ui';
import { convertFormToPage, convertPageToForm } from '@bk2/cms-page-util';

@Component({
  selector: 'bk-page-edit-modal',
  standalone: true,
  imports: [TranslatePipe, AsyncPipe, HeaderComponent, ChangeConfirmationComponent, PageFormComponent, IonContent],
  template: `
    <bk-header title="{{ '@content.page.operation.update.label' | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
    <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-page-form [(vm)]="vm" [currentUser]="currentUser()" [pageTags]="pageTags()" (validChange)="formIsValid.set($event)" />
    </ion-content>
  `,
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
    return this.modalController.dismiss(convertFormToPage(this.page(), this.vm(), this.appStore.tenantId()), 'confirm');
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
