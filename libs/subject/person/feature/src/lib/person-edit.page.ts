import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';
import { Photo } from '@capacitor/camera';

import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { RoleName } from '@bk2/shared/config';
import { ModelType, PersonCollection } from '@bk2/shared/models';
import { getFullPersonName, hasRole } from '@bk2/shared/util';

import { AvatarToolbarComponent } from '@bk2/avatar/ui';
import { AvatarService } from '@bk2/avatar/data';

import { AddressesAccordionComponent } from '@bk2/address/feature';
import { CommentsAccordionComponent } from '@bk2/comment/feature';
import { MembershipAccordionComponent } from '@bk2/membership/feature';
import { OwnershipAccordionComponent } from '@bk2/ownership/feature';
import { ReservationsAccordionComponent } from '@bk2/reservation/feature';
import { PersonalRelAccordionComponent } from '@bk2/personal-rel/feature';
import { WorkingRelAccordionComponent } from '@bk2/working-rel/feature';

import { convertPersonToForm } from '@bk2/person/util';
import { PersonFormComponent } from '@bk2/person/ui';
import { PersonEditStore } from './person-edit.store';

@Component({
  selector: 'bk-person-edit-page',
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    PersonFormComponent, AvatarToolbarComponent, AddressesAccordionComponent, CommentsAccordionComponent,
    MembershipAccordionComponent, OwnershipAccordionComponent, ReservationsAccordionComponent,
    PersonalRelAccordionComponent, WorkingRelAccordionComponent,
    TranslatePipe, AsyncPipe,
    IonContent, IonAccordionGroup
  ],
  providers: [PersonEditStore],
  template: `
    <bk-header title="{{ '@subject.person.operation.update.label' | translate | async }}" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content no-padding>
      <bk-avatar-toolbar key="{{avatarKey()}}" (imageSelected)="onImageSelected($event)" [isEditable]="hasRole('memberAdmin')" title="{{ title() }}"/>
      @if(person(); as person) {
        <bk-person-form [(vm)]="vm" [currentUser]="currentUser()" [personTags]="personTags()" (validChange)="formIsValid.set($event)" />

        <ion-accordion-group value="addresses" [multiple]="true">
          <bk-addresses-accordion [parentKey]="personKey()" [readOnly]="false" [parentModelType]="modelType.Person" [addresses]="addresses()" 
            [readOnly]="!hasRole('memberAdmin')" (addressesChanged)="onAddressesChanged()" />
          <bk-membership-accordion [member]="person" />
          <bk-ownerships-accordion [owner]="person" [defaultResource]="defaultResource()" />
          <bk-reservations-accordion [reserver]="person" [defaultResource]="defaultResource()" />
          @if(hasRole('privileged') || hasRole('memberAdmin')) {
            <bk-personal-rel-accordion [personKey]="personKey()" />
            <bk-working-rel-accordion [personKey]="personKey()" />
          }
          @if(hasRole('privileged') || hasRole('memberAdmin')) {
              <bk-comments-accordion [collectionName]="personCollection" [parentKey]="personKey()" />
          }
        </ion-accordion-group> 
      }
    </ion-content>
  `
})
export class PersonEditPageComponent {
  private readonly avatarService = inject(AvatarService);
  private readonly personEditStore = inject(PersonEditStore);

  public personKey = input.required<string>();

  protected currentUser = computed(() => this.personEditStore.currentUser());
  protected person = computed(() => this.personEditStore.person());
  protected defaultResource = computed(() => this.personEditStore.defaultResource());
  protected addresses = computed(() => this.personEditStore.addresses());
  public vm = linkedSignal(() => convertPersonToForm(this.person()));
  protected avatarKey = computed(() => `${ModelType.Person}.${this.personKey()}`);
  protected title = computed(() => getFullPersonName(this.person()?.firstName ?? '', this.person()?.lastName ?? ''));
  protected personTags = computed(() => this.personEditStore.getTags());

  protected formIsValid = signal(false);
  protected modelType = ModelType;
  protected personCollection = PersonCollection;

  constructor() {
    effect(() => {
      this.personEditStore.setPersonKey(this.personKey());
    });
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.personEditStore.save(this.vm());
  }

  public async onImageSelected(photo: Photo): Promise<void> {
    const _person = this.person();
    if (!_person) return;
    await this.avatarService.uploadPhoto(photo, ModelType.Person, _person.bkey);
  }

  protected onAddressesChanged(): void {
    this.personEditStore.reloadAddresses();
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
