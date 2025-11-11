import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { OrgModel, PersonModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { WorkrelNewFormComponent } from '@bk2/relationship-workrel-ui';
import { convertPersonAndOrgToNewForm } from '@bk2/relationship-workrel-util';
import { WorkrelModalsService } from './workrel-modals.service';

@Component({
  selector: 'bk-workrel-new-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, WorkrelNewFormComponent,
    ChangeConfirmationComponent,
    IonContent
  ],
  template: `
    <bk-header title="{{ '@workrel.operation.create.label' | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-workrel-new-form [(vm)]="vm" [currentUser]="currentUser()" 
      [allTags]="tags()" 
      [types]="types()" 
      [states]="states()" 
      [periodicities]="periodicities()" 
      (selectPerson)="selectPerson()"
      (selectOrg)="selectOrg()"
      (validChange)="formIsValid.set($event)" />
    </ion-content>
  `
})
export class WorkrelNewModalComponent {
  private readonly workrelModalsService = inject(WorkrelModalsService);
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  public subject = input.required<PersonModel>();
  public object = input.required<OrgModel>(); 
  public currentUser = input<UserModel | undefined>();

  public vm = linkedSignal(() => convertPersonAndOrgToNewForm(this.subject(), this.object(), this.currentUser()));
  protected tags = computed(() => this.appStore.getTags('workrel'));
  protected types = computed(() => this.appStore.getCategory('workrel_type'));
  protected states = computed(() => this.appStore.getCategory('workrel_state'));
  protected periodicities = computed(() => this.appStore.getCategory('periodicity'));

  // as we prepared everything with defaultMember and defaultOrg, we already have a valid form, so we need to signal this here.
  protected formIsValid = signal(true);

  public async save(): Promise<boolean> {
    return this.modalController.dismiss(this.vm(), 'confirm');
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async selectPerson(): Promise<void> {
    const _person = await this.workrelModalsService.selectPerson();
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
    const _org = await this.workrelModalsService.selectOrg();
    if (!_org) return;
    this.vm.update((_vm) => ({
      ..._vm, 
      objectKey: _org.bkey, 
      objectName: _org.name,
      objectType: _org.type,
    }));
  }
}
