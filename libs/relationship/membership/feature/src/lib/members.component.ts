import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonContent, IonDatetime, IonImg, IonItem, IonLabel, IonList, IonModal, IonThumbnail } from '@ionic/angular/standalone';

import { MembershipModel, RoleName } from '@bk2/shared-models';
import { DurationPipe, FullNamePipe } from '@bk2/shared-pipes';
import { EmptyListComponent, HeaderComponent } from '@bk2/shared-ui';
import { DateFormat, getTodayStr, hasRole, isOngoing } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { CategoryLogPipe } from '@bk2/relationship-membership-util';
import { MembersAccordionStore } from './members-accordion.store';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { TranslatePipe } from '@bk2/shared-i18n';

@Component({
  selector: 'bk-members',
  standalone: true,
  imports: [
    DurationPipe, AsyncPipe, CategoryLogPipe, AvatarPipe, FullNamePipe, TranslatePipe,
    EmptyListComponent, HeaderComponent,
    IonItem, IonLabel, IonList, IonImg, IonThumbnail, IonContent, IonModal, IonDatetime
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
            <ion-item (click)="showActions(member)">
              <ion-thumbnail slot="start">
                <ion-img src="{{ 'person.' + member.memberKey | avatar:'membership' | async}}" alt="membership avatar" />
              </ion-thumbnail>
              <ion-label>{{member.memberName1 | fullName:member.memberName2}}</ion-label>      
              <ion-label>{{ member.relLog | categoryLog }} / {{ member.dateOfEntry | duration:member.dateOfExit }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  <ion-modal  [isOpen]="isModalOpen()" [keepContentsMounted]="true">
    <ng-template>
      <bk-header title="{{ '@general.operation.select.date' | translate | async }}" [isModal]="true" />
      <ion-content class="ion-padding">
        <ion-datetime
          min="1900-01-01" max="2100-12-31"
          presentation="date"
          [value]="isoDate()"
          locale="de-ch"
          firstDayOfWeek="1"
          [showDefaultButtons]="true"
          [showAdjacentDays]="true"
          doneText="{{'@general.operation.change.ok' | translate | async}}"
          cancelText="{{'@general.operation.change.cancel' | translate | async}}"
          size="cover"
          [preferWheel]="false"
          style="height: 380px; --padding-start: 0;"
          (ionCancel)="cancel()"
          (ionChange)="onDateSelected($event)"
        />
      </ion-content>
    </ng-template>
  </ion-modal>
  `,
})
export class MembersComponent {
  protected readonly membersStore = inject(MembersAccordionStore);
  private actionSheetController = inject(ActionSheetController);

  public orgKey = input.required<string>();
  public readonly readOnly = input(true);

  protected members = computed(() => this.membersStore.members());
  protected isModalOpen = signal(false);
  protected isoDate = signal(getTodayStr(DateFormat.IsoDate));

  private imgixBaseUrl = this.membersStore.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => this.membersStore.setOrgKey(this.orgKey()));
    effect(() => this.membersStore.setShowMode(hasRole('admin')));
  }

  /******************************* actions *************************************** */
  protected async add(): Promise<void> {
    await this.membersStore.addMember();
  }

/**
   * Displays an ActionSheet with all possible actions on a Member. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param member 
   */
  protected async showActions(member: MembershipModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, member);
    await this.executeActions(actionSheetOptions, member);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param member 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, member: MembershipModel): void {
    if (hasRole('memberAdmin', this.membersStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      if (isOngoing(member.dateOfExit)) {
        actionSheetOptions.buttons.push(createActionSheetButton('endMembership', this.imgixBaseUrl, 'stop-circle'));
        actionSheetOptions.buttons.push(createActionSheetButton('changeMcat', this.imgixBaseUrl, 'member_change'));
      }
    }
    if (hasRole('admin', this.membersStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param member 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, member: MembershipModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      switch (data.action) {
        case 'delete':
          await this.membersStore.delete(member, this.readOnly());
          break;
        case 'edit':
          await this.membersStore.edit(member, this.readOnly());
          break;
        case 'endMembership':
          this.membersStore.setCurrentMembership(member);
          this.isModalOpen.set(true);
          break;
        case 'changeMcat':
          await this.membersStore.changeMembershipCategory(member, this.readOnly());
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.membersStore.currentUser());
  }

  protected isOngoing(membership: MembershipModel): boolean {
    return isOngoing(membership.dateOfExit);
  }


  protected cancel(): void { 
    this.isModalOpen.set(false);
  }

  protected async onDateSelected(event: CustomEvent): Promise<void> {
    this.isModalOpen.set(false);
    const iso = event.detail.value.substring(0, 10);
    await this.membersStore.end(iso);
  }
}
