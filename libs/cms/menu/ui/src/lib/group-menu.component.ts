import { Component, inject, input } from '@angular/core';
import { IonIcon, IonItem, IonLabel, IonList, PopoverController } from '@ionic/angular/standalone';

import { RoleName, UserModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { hasRole } from '@bk2/shared-util-core';

/**
 * A group menu is static. It can not be configured.
 * But the menu items shown are contextual on the selected segment.
 * The menu is flat (not hierarchical) and the menu items either navigate to a page or call a function.
 * The menu considers whether the user is a group admin or a registered user.
 * The component just shows the menu items and emits the selected menu item name.
 * The handling of the menu item is done in the parent component (typically in an ion-popover).
 */
@Component({
  selector: 'bk-group-menu',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonList, IonItem, IonIcon, IonLabel,
],
  template: `
      @if (hasRole('groupAdmin')) {
        <ion-list>
          @switch(segmentName()) {
<!--             @case('content') {

content uses normal context menu of content-page
              <ion-item button (click)="popoverController.dismiss('addSection')">
                <ion-icon slot="start" src="{{'add-circle' | svgIcon }}" color="primary" />
                <ion-label>Neu Sektion hinzufügen</ion-label>
              </ion-item>
              <ion-item button (click)="popoverController.dismiss('selectSection')">
                <ion-icon slot="start" src="{{'section' | svgIcon }}" color="primary" />
                <ion-label>Existierende Sektion hinzufügen</ion-label>
              </ion-item>
              <ion-item button (click)="popoverController.dismiss('sortSections')">
                <ion-icon slot="start" src="{{'swap-vertical' | svgIcon }}" color="primary" />
                <ion-label>Sektionen sortieren</ion-label>
              </ion-item>
              <ion-item button (click)="popoverController.dismiss('editSection')">
                <ion-icon slot="start" src="{{'create_edit' | svgIcon }}" color="primary" />
                <ion-label>Sektion ändern</ion-label>
              </ion-item>
            } -->
            <!-- chat has no menu items -->
            <!-- calendar uses context menu of calendar-list component -->

            @case('tasks') {
              <ion-item button (click)="popoverController.dismiss('addTask')">
                <ion-icon slot="start" src="{{'add-circle' | svgIcon }}" color="primary" />
                <ion-label>Todo hinzufügen</ion-label>
              </ion-item>
            }

            <!-- files has no menu items -->
            <!-- album has no menu items -->

            @case('members') {
              <ion-item button (click)="popoverController.dismiss('addMember')">
                <ion-icon slot="start" src="{{'person-add' | svgIcon }}" color="primary" />
                <ion-label>Person in die Gruppe aufnehmen</ion-label>
              </ion-item>
            }
          }
        </ion-list>
      }
  `
})
export class GroupMenuComponent {  
  protected popoverController = inject(PopoverController);

  public readonly segmentName = input.required<string>();
  public readonly currentUser = input<UserModel | undefined>();

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}

