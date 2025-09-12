import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, output } from '@angular/core';
import { IonAccordion, IonButton, IonIcon, IonImg, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonThumbnail } from '@ionic/angular/standalone';

import { CategoryLogPipe } from '@bk2/relationship-membership-util';

import { AvatarPipe } from '@bk2/avatar-ui';
import { TranslatePipe } from '@bk2/shared-i18n';
import { MembershipModel, ModelType, OrgModel, PersonModel, RoleName } from '@bk2/shared-models';
import { DurationPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent } from '@bk2/shared-ui';
import { hasRole, isOngoing } from '@bk2/shared-util-core';
import { MembershipAccordionStore } from './membership-accordion.store';

@Component({
  selector: 'bk-membership-accordion',
  standalone: true,
  imports: [
    TranslatePipe, DurationPipe, AsyncPipe, SvgIconPipe, CategoryLogPipe, AvatarPipe, EmptyListComponent,
    IonAccordion, IonItem, IonLabel, IonButton, IonIcon, IonList,
    IonImg, IonItemSliding, IonItemOptions, IonItemOption, IonThumbnail
  ],
  providers: [MembershipAccordionStore],
  styles: [`
    ion-thumbnail { width: 30px; height: 30px; }
  `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="memberships">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ title() | translate | async }}</ion-label>
      @if(hasRole('memberAdmin')) {
        <ion-button fill="clear" (click)="add()" size="default">
          <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
        </ion-button>
      }
    </ion-item>
    <div slot="content">
        @if(memberships().length === 0) {
        <bk-empty-list message="@general.noData.memberships" />
      } @else {
        <ion-list lines="inset">
          @for(membership of memberships(); track $index) {
            <ion-item-sliding #slidingItem>
              <ion-item (click)="edit(undefined, membership)">
                <ion-thumbnail slot="start">
                  <ion-img src="{{ modelTypeEnum.Org + '.' + membership.orgKey | avatar | async}}" alt="membership avatar" />
                </ion-thumbnail>
                <ion-label>{{ membership.orgName }}</ion-label>
                <ion-label>{{ membership.relLog | categoryLog }} / {{ membership.dateOfEntry | duration:membership.dateOfExit }}</ion-label>
              </ion-item>
              @if(hasRole('memberAdmin')) {
                <ion-item-options side="end">
                  @if(hasRole('admin')) {
                    <ion-item-option color="danger" (click)="delete(slidingItem, membership)">
                      <ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" />
                    </ion-item-option>
                  }
                  @if(isOngoing(membership)) {
                  <ion-item-option color="warning" (click)="end(slidingItem, membership)">
                    <ion-icon slot="icon-only" src="{{'stop-circle' | svgIcon }}" />
                  </ion-item-option>
                  <ion-item-option color="secondary" (click)="changeMembershipCategory(slidingItem, membership)">
                    <ion-icon slot="icon-only" src="{{'swap-horizontal' | svgIcon }}" />
                  </ion-item-option>
                } 
                  <ion-item-option color="primary" (click)="edit(slidingItem, membership)">
                    <ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" />
                  </ion-item-option>
                </ion-item-options>
              }
            </ion-item-sliding> 
          }
        </ion-list>
      }
    </div>
  </ion-accordion>
  `,
})
export class MembershipAccordionComponent {
  protected readonly membershipStore = inject(MembershipAccordionStore);

  public member = input.required<PersonModel | OrgModel>();
  public modelType = input<ModelType>(ModelType.Person);
  public color = input('light');
  public title = input('@membership.plural');
  public membershipsChanged = output();

  protected memberships = computed(() => this.membershipStore.memberships());

  protected modelTypeEnum = ModelType;

  constructor() {
    effect(() => this.membershipStore.setMember(this.member(), this.modelType()));
    effect(() => this.membershipStore.setShowMode(hasRole('admin')));
  }

  /******************************* actions *************************************** */
  protected async add(): Promise<void> {
    await this.membershipStore.add(this.member(), this.modelType());
  }

  protected async edit(slidingItem?: IonItemSliding, membership?: MembershipModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (membership) await this.membershipStore.edit(membership);
  }

  protected async delete(slidingItem?: IonItemSliding, membership?: MembershipModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (membership) await this.membershipStore.delete(membership);
  }

  protected async end(slidingItem?: IonItemSliding, membership?: MembershipModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (membership) await this.membershipStore.end(membership);
  }

  protected async changeMembershipCategory(slidingItem?: IonItemSliding, membership?: MembershipModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (membership) await this.membershipStore.changeMembershipCategory(membership);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.membershipStore.currentUser());
  }

  protected isOngoing(membership: MembershipModel): boolean {
    return isOngoing(membership.dateOfExit);
  }
}
