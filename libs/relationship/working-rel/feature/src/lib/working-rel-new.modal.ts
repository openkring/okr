import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared/i18n';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared/ui';
import { RoleName } from '@bk2/shared/config';
import { hasRole } from '@bk2/shared/util';
import { ModelType, OrgModel, PersonModel, UserModel} from '@bk2/shared/models';

import { AppStore } from '@bk2/auth/feature';
import { convertPersonAndOrgToNewForm } from '@bk2/working-rel/util';
import { WorkingRelNewFormComponent } from '@bk2/working-rel/ui';
import { WorkingRelModalsService } from './working-rel-modals.service';

@Component({
  selector: 'bk-working-rel-new-modal',
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, WorkingRelNewFormComponent,
    ChangeConfirmationComponent,
    IonContent
  ],
  template: `
    <bk-header title="{{ '@workingRel.operation.create.label' | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-working-rel-new-form [(vm)]="vm" [currentUser]="currentUser()" 
      [workingRelTags]="workingRelTags()" 
      (selectPerson)="selectPerson()"
      (selectOrg)="selectOrg()"
      (validChange)="formIsValid.set($event)" />
    </ion-content>
  `
})
export class WorkingRelNewModalComponent {
  private readonly workingRelModalsService = inject(WorkingRelModalsService);
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  public subject = input.required<PersonModel>();
  public object = input.required<OrgModel>(); 
  public currentUser = input<UserModel | undefined>();

  public vm = linkedSignal(() => convertPersonAndOrgToNewForm(this.subject(), this.object(), this.currentUser()));
  protected workingRelTags = computed(() => this.appStore.getTags(ModelType.WorkingRel));

  // as we prepared everything with defaultMember and defaultOrg, we already have a valid form, so we need to signal this here.
  protected formIsValid = signal(true);

  public async save(): Promise<boolean> {
    return this.modalController.dismiss(this.vm(), 'confirm');
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async selectPerson(): Promise<void> {
    const _person = await this.workingRelModalsService.selectPerson();
    if (!_person) return;
    this.vm.update((_vm) => ({
      ..._vm, 
      subjectKey: _person.bkey, 
      subjectName1: _person.firstName,
      subjectName2: _person.lastName,
      subjectType: _person.gender,
    }));
  }

  protected async selectOrg(): Promise<void> {
    const _org = await this.workingRelModalsService.selectOrg();
    if (!_org) return;
    this.vm.update((_vm) => ({
      ..._vm, 
      objectKey: _org.bkey, 
      objectName: _org.name,
      objectType: _org.type,
    }));
  }
}
