import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList, IonThumbnail } from '@ionic/angular/standalone';

import { CategoryLogPipe } from '@bk2/relationship-membership-util';

import { AvatarPipe } from '@bk2/avatar-ui';
import { bkTranslate, TranslatePipe } from '@bk2/shared-i18n';
import { MembershipModel, RoleName } from '@bk2/shared-models';
import { DurationPipe, FullNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { DatePickerModalComponent, EmptyListComponent } from '@bk2/shared-ui';
import { coerceBoolean, DateFormat, getItemLabel, getTodayStr, hasRole, isOngoing } from '@bk2/shared-util-core';

import { MembersAccordionStore } from './members-accordion.store';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-members-accordion',
  standalone: true,
  imports: [
    TranslatePipe, DurationPipe, AsyncPipe, SvgIconPipe, CategoryLogPipe, AvatarPipe, FullNamePipe,
    EmptyListComponent, DatePickerModalComponent,
    IonAccordion, IonItem, IonLabel, IonIcon, IonList, IonButton, IonImg, IonThumbnail
  ],
  providers: [MembersAccordionStore],
  styles: [`
    ion-thumbnail { width: 30px; height: 30px; }
  `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="members">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ title() | translate | async }}</ion-label>
      @if(!isReadOnly()) {
        <ion-button fill="clear" (click)="add()" size="default">
          <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
        </ion-button>
      }
    </ion-item>
    <div slot="content">
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
    </div>
  </ion-accordion>
  <bk-date-picker-modal #datePicker [isoDate]="isoDate()" (dateSelected)="onDateSelected($event)" />
  `,
})
export class MembersAccordionComponent {
  protected readonly membersStore = inject(MembersAccordionStore);
  private actionSheetController = inject(ActionSheetController);
  protected datePickerModal = viewChild.required<DatePickerModalComponent>(DatePickerModalComponent);

  public orgKey = input.required<string>();
  public readonly color = input('light');
  public readonly title = input('@members.plural');
  public readonly readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected isoDate = signal(getTodayStr(DateFormat.IsoDate));

  private imgixBaseUrl = this.membersStore.appStore.env.services.imgixBaseUrl;
  protected members = computed(() => this.membersStore.members());

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
    if (!this.isReadOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      if (isOngoing(member.dateOfExit)) {
        actionSheetOptions.buttons.push(createActionSheetButton('endMembership', this.imgixBaseUrl, 'stop-circle'));
        actionSheetOptions.buttons.push(createActionSheetButton('changeMcat', this.imgixBaseUrl, 'member_change'));
      }
    }
    if (hasRole('admin', this.membersStore.appStore.currentUser()) && !this.isReadOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('view', this.imgixBaseUrl, 'eye-on'));
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
      if (!data) return;
      switch (data.action) {
        case 'delete':
          await this.membersStore.delete(member, this.isReadOnly());
          break;
        case 'edit':
        case 'view':
          await this.membersStore.edit(member, this.isReadOnly());
          break;
        case 'endMembership':
          this.membersStore.setCurrentMembership(member);
          console.log('MembersAccordion.executeActions → opening date picker modal');
          this.datePickerModal().open();
          break;
        case 'changeMcat':
          await this.membersStore.changeMembershipCategory(member, this.isReadOnly());
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

  protected async onDateSelected(isoDate: string): Promise<void> {
    console.log(`MembersAccordion.onDateSelected → isoDate: ${isoDate}`);
        await this.membersStore.end(isoDate);
  }
}
