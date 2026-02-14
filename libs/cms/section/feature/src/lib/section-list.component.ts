import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { RoleName, SectionModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

import { SectionStore } from './section.store';

@Component({
  selector: 'bk-section-all-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    SpinnerComponent, EmptyListComponent, ListFilterComponent,
    IonToolbar, IonButton, IonIcon, IonLabel, IonHeader, IonButtons, 
    IonTitle, IonMenuButton, IonContent, IonItem, IonGrid, IonRow, IonCol, IonList
  ],
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
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)" [tags]="tags()"
      (typeChanged)="onTypeSelected($event)" [types]="types()"
      (stateChanged)="onStateSelected($event)" [states]="states()"
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
  protected sectionStore = inject(SectionStore);
  private actionSheetController = inject(ActionSheetController);

  // filters
  protected searchTerm = linkedSignal(() => this.sectionStore.searchTerm());
  protected selectedTag = linkedSignal(() => this.sectionStore.selectedTag());
  protected selectedType = linkedSignal(() => this.sectionStore.selectedCategory());

  // fields
  protected filteredSections = computed(() => this.sectionStore.filteredSections() ?? []);
  protected sectionsCount = computed(() => this.sectionStore.sections()?.length ?? 0);
  protected selectedSectionsCount = computed(() => this.filteredSections().length);
  protected isLoading = computed(() => this.sectionStore.isLoading());
  protected tags = computed(() => this.sectionStore.getTags());
  protected types = computed(() => this.sectionStore.getTypes());
  private currentUser = computed(() => this.sectionStore.currentUser());
  protected readOnly = computed(() => !hasRole('contentAdmin', this.currentUser()));
  protected states = computed(() => this.sectionStore.appStore.getCategory('content_state'));

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.sectionStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.sectionStore.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.sectionStore.setSelectedCategory(type);
  }

  protected onStateSelected(state: string): void {
    this.sectionStore.setSelectedState(state);
  }

  /******************************** actions ******************************************* */
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
            actionSheetOptions.buttons.push(createActionSheetButton('section.view', this.sectionStore.imgixBaseUrl(), 'eye-on'));
            actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.sectionStore.imgixBaseUrl(), 'close_cancel'));
    }
    if (!this.readOnly()) {
            actionSheetOptions.buttons.push(createActionSheetButton('section.edit', this.sectionStore.imgixBaseUrl(), 'create_edit'));
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('section.delete', this.sectionStore.imgixBaseUrl(), 'trash_delete'));
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
          await this.sectionStore.delete(section, this.readOnly());
          break;
        case 'section.edit':
          await this.sectionStore.edit(section, this.readOnly());
          break;
        case 'section.view':
          await this.sectionStore.edit(section, true);
          break;
      }
    }
  }

  protected async add(): Promise<void> {
    await this.sectionStore.add(this.readOnly());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
