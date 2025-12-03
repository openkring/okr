import { AsyncPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { RoleName, SectionModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { SectionListStore } from './section-list.store';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-section-all-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    SpinnerComponent, EmptyListComponent, ListFilterComponent,
    IonToolbar, IonButton, IonIcon, IonLabel, IonHeader, IonButtons, 
    IonTitle, IonMenuButton, IonContent, IonItem, IonGrid, IonRow, IonCol, IonList
  ],
    providers: [SectionListStore],
  template: `
  <ion-header>
    <!-- page header -->
    <ion-toolbar color="secondary" id="bkheader">
      <ion-buttons slot="start"><ion-menu-button></ion-menu-button></ion-buttons>
      <ion-title>{{ selectedSectionsCount() }}/{{ sectionsCount() }} {{ '@content.section.plural' | translate | async }}</ion-title>
      <ion-buttons slot="end">
        @if(hasRole('privileged') || hasRole('contentAdmin')) {
          <ion-button (click)="add()">
            <ion-icon slot="icon-only" src="{{'add-circle' | svgIcon }}" />
          </ion-button>
        }
      </ion-buttons>
    </ion-toolbar>

    <!-- description -->
    <ion-toolbar class="ion-hide-md-down">
      <ion-item lines="none">
        <ion-label>{{ '@content.section.field.description' | translate | async }}</ion-label>
      </ion-item>
    </ion-toolbar>

    <!-- search and filters -->
    <bk-list-filter 
      [type]="types()" (typeChanged)="onTypeChange($event)"
      (searchTermChanged)="onSearchtermChange($event)"
     />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item color="primary" lines="none">
        <ion-grid>
          <ion-row>
            <ion-col size="4" class="ion-hide-md-down">
              <ion-label><strong>{{ '@content.section.list.header.key' | translate | async }}</strong></ion-label>  
            </ion-col>
            <ion-col size="6" size-md="4">
              <ion-label><strong>{{ '@content.section.list.header.name' | translate | async }}</strong></ion-label>  
            </ion-col>
            <ion-col size="6" size-md="4">
                <ion-label><strong>{{ '@content.section.list.header.type' | translate | async }}</strong></ion-label>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <!-- Data -->
  <ion-content #content>
    @if(isLoading()) {
      <bk-spinner />
    } @else {
      @if (filteredSections().length === 0) {
        <bk-empty-list message="@content.section.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(section of filteredSections(); track section.bkey) {
            <ion-item (click)="showActions(section)">
              <ion-label class="ion-hide-md-down">{{ section.bkey }}</ion-label>
              <ion-label>{{ section.name }}</ion-label>
              <ion-label>{{ section.type }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    }
  </ion-content>
  `
})
export class SectionAllListComponent {
  protected sectionListStore = inject(SectionListStore);
  private actionSheetController = inject(ActionSheetController);

  protected filteredSections = computed(() => this.sectionListStore.filteredSections() ?? []);
  protected sectionsCount = computed(() => this.sectionListStore.sections()?.length ?? 0);
  protected selectedSectionsCount = computed(() => this.filteredSections().length);
  protected isLoading = computed(() => this.sectionListStore.isLoading());
  protected types = computed(() => this.sectionListStore.appStore.getCategory('section_type'));
  private currentUser = computed(() => this.sectionListStore.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('contentAdmin', this.currentUser()));

  private imgixBaseUrl = this.sectionListStore.appStore.env.services.imgixBaseUrl;

  protected onSearchtermChange(searchTerm: string): void {
    this.sectionListStore.setSearchTerm(searchTerm);
  }

  protected onTypeChange(type: string): void {
    this.sectionListStore.setSelectedCategory(type);
  }

  /**
   * Displays an ActionSheet with all possible actions on a Section. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param section 
   */
  protected async showActions(section: SectionModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, section);
    await this.executeActions(actionSheetOptions, section);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param section 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, section: SectionModel): void {
    if (hasRole('registered', this.currentUser())) {
            actionSheetOptions.buttons.push(createActionSheetButton('section.view', this.imgixBaseUrl, 'create_edit'));
            actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (!this.readOnly()) {
            actionSheetOptions.buttons.push(createActionSheetButton('section.edit', this.imgixBaseUrl, 'create_edit'));
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('section.delete', this.imgixBaseUrl, 'trash_delete'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param section 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, section: SectionModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'section.delete':
          await this.sectionListStore.delete(section, this.readOnly());
          break;
        case 'section.edit':
          await this.sectionListStore.edit(section, this.readOnly());
          break;
        case 'section.view':
          await this.sectionListStore.edit(section, true);
          break;
      }
    }
  }

  protected async add(): Promise<void> {
    await this.sectionListStore.add(this.readOnly());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
