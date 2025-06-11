import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared/i18n';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared/ui';
import { RoleName } from '@bk2/shared/config';
import { hasRole } from '@bk2/shared/util';
import { ModelType, PersonModel, UserModel} from '@bk2/shared/models';

import { AppStore } from '@bk2/auth/feature';
import { PersonalRelNewFormComponent } from '@bk2/personal-rel/ui';
import { convertPersonsToNewForm } from '@bk2/personal-rel/util';
import { PersonalRelModalsService } from './personal-rel-modals.service';

@Component({
  selector: 'bk-personal-rel-new-modal',
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
      [personalRelTags]="personalRelTags()" 
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

  public vm = linkedSignal(() => convertPersonsToNewForm(this.subject(), this.object(), this.currentUser()));
  protected personalRelTags = computed(() => this.appStore.getTags(ModelType.PersonalRel));

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
