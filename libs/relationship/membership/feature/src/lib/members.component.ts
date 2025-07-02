import { Component, computed, effect, inject, input } from '@angular/core';
import { IonContent, IonIcon, IonImg, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonThumbnail } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { CategoryLogPipe } from '@bk2/membership/util';

import { AvatarPipe, DurationPipe, FullNamePipe, SvgIconPipe } from '@bk2/shared/pipes';
import { MembershipModel, ModelType, RoleName } from '@bk2/shared/models';
import { hasRole, isOngoing } from '@bk2/shared/util-core';
import { EmptyListComponent } from '@bk2/shared/ui';

import { MembersAccordionStore } from './members-accordion.store';

@Component({
  selector: 'bk-members',
  imports: [
    DurationPipe, AsyncPipe, SvgIconPipe, CategoryLogPipe, AvatarPipe, FullNamePipe,
    EmptyListComponent,
    IonItem, IonLabel, IonIcon, IonList,
    IonImg, IonItemSliding, IonItemOptions, IonItemOption, IonThumbnail, IonContent
  ],
  providers: [MembersAccordionStore],
  styles: [`
    ion-thumbnail { width: 30px; height: 30px; }
  `],
  template: `
    <ion-content>
      @if(members().length === 0) {
        <bk-empty-list message="@general.noData.members" />
      } @else {
        <ion-list lines="inset">
          @for(member of members(); track $index) {
            <ion-item-sliding #slidingItem>
              <ion-item (click)="edit(slidingItem, member)">
                <ion-thumbnail slot="start">
                  <ion-img src="{{ modelType.Person + '.' + member.memberKey | avatar | async}}" alt="membership avatar" />
                </ion-thumbnail>
                <ion-label>{{member.memberName1 | fullName:member.memberName2}}</ion-label>      
                <ion-label>{{ member.relLog | categoryLog }} / {{ member.dateOfEntry | duration:member.dateOfExit }}</ion-label>
              </ion-item>
              @if(hasRole('memberAdmin')) {
                <ion-item-options side="end">
                  @if(hasRole('admin')) {
                    <ion-item-option color="danger" (click)="delete(slidingItem, member)">
                      <ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" />
                    </ion-item-option>
                  }
                  @if(isOngoing(member)) {
                  <ion-item-option color="warning" (click)="end(slidingItem, member)">
                    <ion-icon slot="icon-only" src="{{'stop-circle' | svgIcon }}" />
                  </ion-item-option>
                } 
                  <ion-item-option color="primary" (click)="edit(slidingItem, member)">
                    <ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" />
                  </ion-item-option>
                </ion-item-options>
              }
            </ion-item-sliding> 
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class MembersComponent {
  protected readonly membersStore = inject(MembersAccordionStore);
  
  public orgKey = input.required<string>();

  protected members = computed(() => this.membersStore.members());

  protected modelType = ModelType;

  constructor() {
    effect(() => this.membersStore.setOrgKey(this.orgKey()));
    effect(() => this.membersStore.setShowMode(hasRole('admin')));
  }

  /******************************* actions *************************************** */
  protected async add(): Promise<void> {
    await this.membersStore.addMember();
  }

  protected async edit(slidingItem?: IonItemSliding, membership?: MembershipModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (membership) await this.membersStore.edit(membership);
  }

  protected async delete(slidingItem?: IonItemSliding, membership?: MembershipModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (membership) await this.membersStore.delete(membership);
  }

  protected async end(slidingItem?: IonItemSliding, membership?: MembershipModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (membership) await this.membersStore.end(membership);
  }
    
/******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.membersStore.currentUser());
  }

  protected isOngoing(membership: MembershipModel): boolean {
    return isOngoing(membership.dateOfExit);
  }
}
