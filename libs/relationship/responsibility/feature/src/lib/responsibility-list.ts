import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { ActionSheetOptions, ActionSheetController, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonLabel, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar, IonNote } from '@ionic/angular/standalone';

import { ResponsibilityModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';

import { ResponsibilityStore } from './responsibility.store';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AsyncPipe } from '@angular/common';
import { AvatarDisplayComponent } from '@bk2/avatar-ui';

@Component({
  selector: 'bk-responsibility-list',
  standalone: true,
  imports: [
    SvgIconPipe, TranslatePipe, AsyncPipe,
    ListFilterComponent, EmptyListComponent, MenuComponent, SpinnerComponent, AvatarDisplayComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonContent, IonLabel, IonPopover, IonNote, IonGrid, IonRow, IonCol,
  ],
  providers: [ResponsibilityStore],
  styles: [`
    ion-card-content { padding: 0px;}
  `],
  template: `
    <ion-header>
      @if(contextMenuName() !== 'disable') {
        <ion-toolbar color="secondary">
          @if(showMainMenu() === true) {
            <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
          }
          <ion-title>{{ count() }} {{ '@responsibility.list.title' | translate | async}}</ion-title>
          <ion-buttons slot="end">
            <ion-button id="{{ popupId() }}">
              <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
              <ng-template>
                <ion-content><bk-menu [menuName]="contextMenuName()" /></ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        </ion-toolbar>
      }

      <bk-list-filter (searchTermChanged)="store.setSearchTerm($event)" />
      <ion-toolbar color="light">
        <ion-grid>
          <ion-row>
            <ion-col size="4">
              <ion-label>Verantwortlichkeit</ion-label>
            </ion-col>
            <ion-col size="4">
              <ion-label>Verantwortlich</ion-label>
            </ion-col>
            <ion-col size="4">
              <ion-label>Stellvertretung</ion-label>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if(isLoading()) {
        <bk-spinner />
      } @else {
        @if(store.filteredResponsibilities().length === 0) {
          <bk-empty-list message="@responsibility.field.empty" />
        } @else {
          <ion-grid>
            @for(r of store.filteredResponsibilities(); track r.bkey) {
              <ion-row (click)="showActions(r)">
                <ion-col size="4">
                    <ion-label>
                      <ion-note color="medium" style="font-size:0.75rem">{{ r.bkey }}</ion-note>
                      <div>{{ r.name }}</div>
                    </ion-label>
                </ion-col>
                <ion-col size="4">
                  @if(r.responsibleAvatar; as resp) {
                    <ion-label><bk-avatar-display [avatars]="[resp]" [showName]="true" /></ion-label>
                  }
                </ion-col>
                <ion-col size="4">
                  @if(r.delegateAvatar; as del) {
                    <ion-label><bk-avatar-display [avatars]="[del]" [showName]="true" /></ion-label>
                  }
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        }
      }
    </ion-content>
  `,
})
export class ResponsibilityList {
  protected readonly store = inject(ResponsibilityStore);
  private readonly actionSheetController = inject(ActionSheetController);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>(); // the name of the context menu to use or 'disable' to disable the header toolbar with the context menu
  public showMainMenu = input<boolean>(true);

  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  protected count = computed(() => this.store.filteredResponsibilities().length);
  protected popupId = computed(() => `responsibility-list-menu-${this.listId()}`);
  protected isLoading = computed(() => this.store.isLoading());

  constructor() {
    effect(() => {
      const listId = this.listId();
      untracked(() => this.store.setListId(listId));
    });
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.store.add(false); break;
      case 'exportRaw': await this.store.export("raw"); break;
      default: error(undefined, `ResponsibilityList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  protected async showActions(r: ResponsibilityModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, r);
    await this.executeActions(actionSheetOptions, r);
  }

  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, r: ResponsibilityModel): void {
    actionSheetOptions.buttons.push(createActionSheetButton('responsibility.edit', this.imgixBaseUrl, 'create_edit'));
    if (hasRole('admin', this.store.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('responsibility.delete', this.imgixBaseUrl, 'trash_delete'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
  }

  private async executeActions(actionSheetOptions: ActionSheetOptions, r: ResponsibilityModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'responsibility.edit':
          await this.store.edit(r, false);
          break;
        case 'responsibility.delete':
          await this.store.delete(r, false);
          break;
      }
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}
