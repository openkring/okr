import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared/i18n';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared/ui';
import { OrgModel} from '@bk2/shared/models';
import { createNewPersonFormModel } from '@bk2/person/util';
import { PersonNewStore } from './person-new.store';
import { PersonNewFormComponent } from './person-new.form';

@Component({
  selector: 'bk-person-new-modal',
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, ChangeConfirmationComponent, PersonNewFormComponent,
    IonContent
  ],
  providers: [PersonNewStore],
  template: `
    <bk-header title="{{ '@subject.person.operation.create.label' | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-person-new-form [(vm)]="vm" [currentUser]="currentUser()" [membershipCategories]="mcat()" [personTags]="tags()" (validChange)="onValidChange($event)" />
    </ion-content>
  `
})
export class PersonNewModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly personNewStore = inject(PersonNewStore);

  public org = input<OrgModel>(); 
  public vm = linkedSignal(() => createNewPersonFormModel(this.org()));

  public currentUser = computed(() => this.personNewStore.currentUser());
  protected mcat = computed(() => this.personNewStore.membershipCategory());
  protected tags = computed(() => this.personNewStore.getTags());

  protected formIsValid = signal(false);

  public async save(): Promise<boolean> {
    return this.modalController.dismiss(this.vm(), 'confirm');
  }

  protected onValidChange(valid: boolean): void {
    this.formIsValid.set(valid);
  }
}
