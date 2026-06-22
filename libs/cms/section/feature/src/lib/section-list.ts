import { Component, computed, inject, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { RoleName, SectionModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { BkListSkeleton, EmptyList, ErrorBanner, ListFilter } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

import { SectionStore } from './section.store';

@Component({
  selector: 'bk-section-all-list',
  standalone: true,
  imports: [
    SvgIconPipe,
    BkListSkeleton, EmptyList, ErrorBanner, ListFilter,
    IonToolbar, IonButton, IonIcon, IonLabel, IonHeader, IonButtons,
    IonTitle, IonMenuButton, IonContent, IonItem, IonGrid, IonRow, IonCol, IonList
  ],
  template: `
  <ion-header>
    <!-- page header -->
    <ion-toolbar color="secondary" id="bkheader">
      <ion-buttons slot="start"><ion-menu-button></ion-menu-button></ion-buttons>
      <ion-title>{{ selectedSectionsCount() }}/{{ sectionsCount() }} {{ store.i18n.sections() }}</ion-title>
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
        <ion-label>{{ store.i18n.description() }}</ion-label>
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
              <ion-label><strong>{{ store.i18n.key() }}</strong></ion-label>
            </ion-col>
            <ion-col size="6" size-md="4">
              <ion-label><strong>{{ store.i18n.name() }}</strong></ion-label>
            </ion-col>
            <ion-col size="6" size-md="4">
                <ion-label><strong>{{ store.i18n.type() }}</strong></ion-label>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <bk-error-banner [message]="store.errorMessage()" (dismiss)="store.clearError()" />

  <!-- Data -->
  <ion-content #content>
    @if(isLoading()) {
      <bk-list-skeleton [rows]="6" />
    } @else {
      @if (filteredSections().length === 0) {
        <bk-empty-list [message]="store.i18n.empty()" />
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
export class SectionAllList {
  protected store = inject(SectionStore);
  private actionSheetController = inject(ActionSheetController);

  // filters
  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected selectedTag = linkedSignal(() => this.store.selectedTag());
  protected selectedType = linkedSignal(() => this.store.selectedCategory());

  // fields
  protected filteredSections = computed(() => this.store.filteredSections() ?? []);
  protected sectionsCount = computed(() => this.store.sections()?.length ?? 0);
  protected selectedSectionsCount = computed(() => this.filteredSections().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags());
  protected types = computed(() => this.store.getTypes());
  private currentUser = computed(() => this.store.currentUser());
  protected readOnly = computed(() => !hasRole('contentAdmin', this.currentUser()));
  protected states = computed(() => this.store.appStore.getCategory('content_state'));

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.store.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.store.setSelectedCategory(type);
  }

  protected onStateSelected(state: string): void {
    this.store.setSelectedState(state);
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
            actionSheetOptions.buttons.push(createActionSheetButton('section.view', this.store.i18n.view(), 'eye-on'));
            actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), 'cancel'));
    }
    if (!this.readOnly()) {
            actionSheetOptions.buttons.push(createActionSheetButton('section.edit', this.store.i18n.edit(), 'edit'));
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('section.delete', this.store.i18n.delete(), 'trash'));
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
          await this.store.delete(section, this.readOnly());
          break;
        case 'section.edit':
          await this.store.edit(section, this.readOnly());
          break;
        case 'section.view':
          await this.store.edit(section, true);
          break;
      }
    }
  }

  protected async add(): Promise<void> {
    await this.store.add(this.readOnly());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
