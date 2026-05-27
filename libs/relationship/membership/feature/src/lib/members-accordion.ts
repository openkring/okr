import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList, IonSelect, IonSelectOption, IonThumbnail } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { MembershipModel, RoleName } from '@bk2/shared-models';
import { FullNamePipe, RellogPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList } from '@bk2/shared-ui';
import { coerceBoolean, DateFormat, getTodayStr, hasRole, isOngoing } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

import { AvatarPipe } from '@bk2/avatar-ui';

import { MembershipStore } from './membership.store';

@Component({
  selector: 'bk-members-accordion',
  standalone: true,
  imports: [
    TranslatePipe, RellogPipe, AsyncPipe, SvgIconPipe, AvatarPipe, FullNamePipe,
    EmptyList,
    IonAccordion, IonItem, IonLabel, IonIcon, IonList, IonButton, IonImg, IonThumbnail,
    IonSelect, IonSelectOption
  ],
  providers: [MembershipStore],
  styles: [`
    ion-thumbnail { width: 30px; height: 30px; }
    ion-select { max-width: 120px; }
  `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="members">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ title() | translate | async }}</ion-label>
      @if(hasRole('privileged')) {
        <ion-select
          slot="end"
          interface="popover"
          [value]="selectedMemberType()"
          (ionChange)="selectedMemberType.set($event.detail.value)">
          @for(type of memberTypes; track type) {
            <ion-select-option [value]="type">{{ type }}</ion-select-option>
          }
        </ion-select>
      }
      @if(!isReadOnly()) {
        <ion-button fill="clear" slot="end" (click)="add()" size="default">
          <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
        </ion-button>
      }
    </ion-item>
    <div slot="content">
      @if(membersForType().length === 0) {
        <bk-empty-list message="@general.noData.members" />
      } @else {
        <ion-list lines="inset">
          @for(member of membersForType(); track $index) {
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
    </div>
  </ion-accordion>
  `,
})
export class MembersAccordion {
  protected readonly store = inject(MembershipStore);
  private actionSheetController = inject(ActionSheetController);

  public orgKey = input.required<string>();
  public orgType = input.required<'org' | 'group'>();
  public readonly color = input('light');
  public readonly title = input('@members.plural');
  public readonly readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected isoDate = signal(getTodayStr(DateFormat.IsoDate));
  protected readonly memberTypes: ('person' | 'org' | 'group')[] = ['person', 'org', 'group'];
  protected selectedMemberType = signal<'person' | 'org' | 'group'>('person');

  protected membersForType = computed(() =>
    this.store.members().filter(m => m.memberModelType === this.selectedMemberType())
  );
  private currentUser = computed(() => this.store.currentUser());
  private maySeeOldMemberships = computed(() => hasRole('privileged', this.currentUser()) || hasRole('memberAdmin', this.currentUser()));
  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => this.store.setOrgId(this.orgKey(), this.orgType()));
    effect(() => this.store.setShowMode(!this.maySeeOldMemberships()));
  }

  /******************************* actions *************************************** */
  protected async add(): Promise<void> {
    await this.store.add(this.isReadOnly());
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
    if (!this.isReadOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('membership.edit', this.store.i18n.update_label(), this.imgixBaseUrl, 'edit'));
      if (isOngoing(member.dateOfExit)) {
        actionSheetOptions.buttons.push(createActionSheetButton('membership.end', this.store.i18n.end_label(), this.imgixBaseUrl, 'stop-circle'));
        actionSheetOptions.buttons.push(createActionSheetButton('membership.changecat', this.store.i18n.category_change_label(), this.imgixBaseUrl, 'mcatchange'));
      }
    }
    if (hasRole('admin', this.store.appStore.currentUser()) && !this.isReadOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('membership.delete', this.store.i18n.delete_label(), this.imgixBaseUrl, 'trash'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('membership.view', this.store.i18n.view_label(), this.imgixBaseUrl, 'eye-on'));
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
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
          await this.store.delete(membership, this.isReadOnly());
          break;
        case 'membership.edit':
          await this.store.edit(membership, this.isReadOnly());
          break;
        case 'membership.view':
          await this.store.edit(membership, true);
          break;
        case 'membership.end':
          await this.store.end(membership, undefined, this.isReadOnly());
          break;
        case 'membership.changecat':
          await this.store.changeMembershipCategory(membership, this.isReadOnly());
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }

  protected isOngoing(membership: MembershipModel): boolean {
    return isOngoing(membership.dateOfExit);
  }
}
