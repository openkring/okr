import { AsyncPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { addAllCategory, SectionTypes } from '@bk2/shared-categories';
import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AllCategories, RoleName, SectionModel, SectionType } from '@bk2/shared-models';
import { CategoryNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { CategoryComponent, EmptyListComponent, SearchbarComponent, SpinnerComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { SectionListStore } from './section-list.store';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-section-all-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, CategoryNamePipe, SvgIconPipe,
    SearchbarComponent, CategoryComponent, SpinnerComponent, EmptyListComponent,
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
          <ion-button (click)="edit()">
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

   <!-- search and category -->
    <ion-toolbar>
      <ion-grid>
        <ion-row>
          <ion-col size="6">
            <bk-searchbar placeholder="{{ '@general.operation.search.placeholder' | translate | async }}" (ionInput)="onSearchtermChange($event)" />
          </ion-col>
          <ion-col size="6">
            <bk-cat name="sectionType" [(value)]="selectedCategory" [categories]="categories" (changed)="onCategoryChange($event)" />
         </ion-col>
        </ion-row>
      </ion-grid>
    </ion-toolbar>

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
              <ion-label>{{ section.type | categoryName:sectionTypes }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    }
  </ion-content>
  `
})
export class SectionAllListComponent {
  protected appStore = inject(AppStore);
  protected sectionListStore = inject(SectionListStore);
  private actionSheetController = inject(ActionSheetController);

  protected filteredSections = computed(() => this.sectionListStore.filteredSections() ?? []);
  protected sectionsCount = computed(() => this.sectionListStore.sections()?.length ?? 0);
  protected selectedSectionsCount = computed(() => this.filteredSections().length);
  protected isLoading = computed(() => this.sectionListStore.isLoading());

  protected selectedCategory = AllCategories;
  protected categories = addAllCategory(SectionTypes);
  protected sectionTypes = SectionTypes;
  protected ST = SectionType;
  private imgixBaseUrl = this.appStore.env.services.imgixBaseUrl;

  protected onSearchtermChange($event: Event): void {
    this.sectionListStore.setSearchTerm(($event.target as HTMLInputElement).value);
  }

  protected onCategoryChange($event: number): void {
    this.sectionListStore.setSelectedCategory($event);
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
    if (hasRole('contentAdmin', this.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
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
      switch (data.action) {
        case 'delete':
          await this.delete(section);
          break;
        case 'edit':
          await this.edit(section);
          break;
      }
    }
  }

  public async edit(section?: SectionModel) { 
    this.sectionListStore.edit(section?.bkey);
  } 
  
  public async delete(section: SectionModel): Promise<void> {
    await this.sectionListStore.delete(section);
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.appStore.currentUser());
  }
}
