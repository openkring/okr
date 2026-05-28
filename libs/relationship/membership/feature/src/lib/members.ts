import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonContent, IonImg, IonItem, IonLabel, IonList, IonThumbnail } from '@ionic/angular/standalone';

import { MembershipModel, RoleName } from '@bk2/shared-models';
import { FullNamePipe, RellogPipe } from '@bk2/shared-pipes';
import { EmptyList } from '@bk2/shared-ui';
import { DateFormat, getTodayStr, hasRole, isOngoing } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

import { AvatarPipe } from '@bk2/avatar-ui';

import { MembershipStore } from './membership.store';

@Component({
  selector: 'bk-members',
  standalone: true,
  imports: [
    RellogPipe, AvatarPipe, FullNamePipe,
    EmptyList,
    IonItem, IonLabel, IonList, IonImg, IonThumbnail, IonContent
  ],
  providers: [MembershipStore],
  styles: [`
    ion-thumbnail { width: 30px; height: 30px; }
  `],
  template: `
    <ion-content>
      @if(members().length === 0) {
        <bk-empty-list [message]="store.i18n.no_data_members()" />
      } @else {
        <ion-list lines="inset">
          @for(member of members(); track $index) {
            <ion-item (click)="showActions(member)">
              <ion-thumbnail slot="start">
                <ion-img src="{{ 'person.' + member.memberKey | avatar:'membership' }}" alt="membership avatar" />
              </ion-thumbnail>
              <ion-label>{{member.memberName1 | fullName:member.memberName2}}</ion-label>      
              <ion-label>{{ member.relLog | rellog }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class Members {
  protected readonly store = inject(MembershipStore);
  private actionSheetController = inject(ActionSheetController);

  public orgKey = input.required<string>();
  public orgType = input<'org' | 'group'>('org');
  public readonly readOnly = input(true);

  protected members = computed(() => this.store.members());
  protected isModalOpen = signal(false);
  protected isoDate = signal(getTodayStr(DateFormat.IsoDate));
  private currentUser = computed(() => this.store.currentUser());
  private maySeeOldMemberships = computed(() => hasRole('privileged', this.currentUser()) || hasRole('memberAdmin', this.currentUser()));
  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => this.store.setOrgId(this.orgKey(), this.orgType()));
    effect(() => this.store.setShowMode(!this.maySeeOldMemberships()));
  }

  /******************************* actions *************************************** */
  protected async add(): Promise<void> {
    await this.store.add(this.readOnly());
  }

/**
   * Displays an ActionSheet with all possible actions on a Member. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param member 
   */
  protected async showActions(member: MembershipModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, member);
    await this.executeActions(actionSheetOptions, member);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param member 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, member: MembershipModel): void {
    if (hasRole('registered')) {
      actionSheetOptions.buttons.push(createActionSheetButton('membership.view', this.store.i18n.view_label(), this.imgixBaseUrl, 'eye-on'));
    }
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('membership.edit', this.store.i18n.update_label(), this.imgixBaseUrl, 'edit'));
      if (isOngoing(member.dateOfExit)) {
        actionSheetOptions.buttons.push(createActionSheetButton('membership.end', this.store.i18n.end_label(), this.imgixBaseUrl, 'stop-circle'));
        actionSheetOptions.buttons.push(createActionSheetButton('membership.changecat', this.store.i18n.category_change_label(), this.imgixBaseUrl, 'mcatchange'));
      }
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('membership.delete', this.store.i18n.delete_label(), this.imgixBaseUrl, 'trash'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    if (actionSheetOptions.buttons.length === 1) { // only cancel button
      actionSheetOptions.buttons = [];
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param membership 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, membership: MembershipModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'membership.delete':
          await this.store.delete(membership, this.readOnly());
          break;
        case 'membership.edit':
          await this.store.edit(membership, this.readOnly());
          break;
        case 'membership.view':
          await this.store.edit(membership, true);
          break;
        case 'membership.end':
          await this.store.end(membership, undefined, this.readOnly());
          break;
        case 'membership.changecat':
          await this.store.changeMembershipCategory(membership, this.readOnly());
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected isOngoing(membership: MembershipModel): boolean {
    return isOngoing(membership.dateOfExit);
  }

  protected cancel(): void { 
    this.isModalOpen.set(false);
  }
}
