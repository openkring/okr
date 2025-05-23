import { Component, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { CalEventModel, UserModel } from '@bk2/shared/models';
import { convertCalEventToForm, convertFormToCalEvent } from '@bk2/calevent/util';
import { ENV, RoleName } from '@bk2/shared/config';
import { CalEventFormComponent } from '@bk2/calevent/ui';
import { AppStore } from '@bk2/auth/feature';
import { hasRole } from '@bk2/shared/util';

@Component({
  selector: 'bk-calevent-edit-modal',
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    CalEventFormComponent,
    TranslatePipe, AsyncPipe,
    IonContent
  ],
  template: `
    <bk-header title="{{ '@calEvent.operation.update.label' | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-calevent-form [(vm)]="vm" [isPrivileged]="hasRole('privileged')" [currentUser]="currentUser()" [calEventTags]="calEventTags()" [isAdmin]="hasRole('admin')" (validChange)="formIsValid.set($event)" />
    </ion-content>
  `
})
export class CalEventEditModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly appStore = inject(AppStore);
  private readonly env = inject(ENV);

  public event = input.required<CalEventModel>();
  public currentUser = input.required<UserModel | undefined>();
  public calEventTags = input.required<string>();

  public vm = linkedSignal(() => convertCalEventToForm(this.event()));
  protected formIsValid = signal(false);

  public save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToCalEvent(this.event(), this.vm(), this.env.owner.tenantId), 'confirm');
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.appStore.currentUser());
  }
}
