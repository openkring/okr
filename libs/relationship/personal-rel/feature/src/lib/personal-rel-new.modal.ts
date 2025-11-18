import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { PersonalRelNewFormComponent } from '@bk2/relationship-personal-rel-ui';
import { convertPersonsToNewForm } from '@bk2/relationship-personal-rel-util';
import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import {  PersonModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';
import { PersonalRelModalsService } from './personal-rel-modals.service';

@Component({
  selector: 'bk-personal-rel-new-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, PersonalRelNewFormComponent,
    ChangeConfirmationComponent,
    IonContent
  ],
  template: `
    <bk-header title="{{ '@personalRel.operation.create.label' | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-personal-rel-new-form [(vm)]="vm" [currentUser]="currentUser()" 
      [types]="types()"
      [allTags]="allTags()"
      [readOnly]="readOnly()"
      (selectPerson)="selectPerson($event)"
      (validChange)="formIsValid.set($event)" />
    </ion-content>
  `
})
export class PersonalRelNewModalComponent {
  private readonly personalRelModalsService = inject(PersonalRelModalsService);
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  public subject = input.required<PersonModel>();
  public object = input.required<PersonModel>(); 
  public currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);

  public vm = linkedSignal(() => convertPersonsToNewForm(this.subject(), this.object(), this.currentUser()));
  protected allTags = computed(() => this.appStore.getTags('personalrel'));
  protected types = computed(() => this.appStore.getCategory('personalrel_type'));

  // as we prepared everything with defaultMember and defaultOrg, we already have a valid form, so we need to signal this here.
  protected formIsValid = signal(true);

  public async save(): Promise<boolean> {
    return this.modalController.dismiss(this.vm(), 'confirm');
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async selectPerson(isSubject: boolean): Promise<void> {
    const _person = await this.personalRelModalsService.selectPerson();
    if (!_person) return;
    if (isSubject) {
      this.vm.update((_vm) => ({
        ..._vm, 
        subjectKey: _person.bkey, 
        subjectFirstName: _person.firstName,
        subjectLastName: _person.lastName,
        subjectGender: _person.gender,
      }));
    } else {
      this.vm.update((_vm) => ({
        ..._vm, 
        objectKey: _person.bkey, 
        objectFirstName: _person.firstName,
        objectLastName: _person.lastName,
        objectGender: _person.gender,
      }));
    }
  }
}
