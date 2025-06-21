import { Component, computed, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonMenuButton, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { AllCategories, SectionModel, SectionType } from '@bk2/shared/models';
import { CategoryComponent, EmptyListComponent, SearchbarComponent, SpinnerComponent } from '@bk2/shared/ui';
import { CategoryNamePipe, SvgIconPipe } from '@bk2/shared/pipes';
import { addAllCategory, SectionTypes } from '@bk2/shared/categories';
import { TranslatePipe } from '@bk2/shared/i18n';
import { AppStore } from '@bk2/shared/feature';
import { RoleName } from '@bk2/shared/config';
import { hasRole } from '@bk2/shared/util';

import { SectionListStore } from './section-list.store';

@Component({
  selector: 'bk-section-all-list',
  imports: [
    TranslatePipe, AsyncPipe, CategoryNamePipe, SvgIconPipe,
    SearchbarComponent, CategoryComponent, SpinnerComponent, EmptyListComponent,
    IonToolbar, IonButton, IonIcon, IonLabel, IonHeader, IonButtons, 
    IonTitle, IonMenuButton, IonContent, IonItem,
    IonItemSliding, IonItemOptions, IonItemOption,
    IonGrid, IonRow, IonCol, IonList
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
          <ion-button (click)="editSection()">
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
            <ion-item-sliding #slidingItem>
              <ion-item (click)="editSection(slidingItem, section.bkey)">
                <ion-label class="ion-hide-md-down">{{ section.bkey }}</ion-label>
                <ion-label>{{ section.name }}</ion-label>
                <ion-label>{{ section.type | categoryName:sectionTypes }}</ion-label>
              </ion-item>
              <ion-item-options side="end">
                <ion-item-option color="danger" (click)="deleteSection(slidingItem, section)">
                  <ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" />
                </ion-item-option>
                <ion-item-option color="primary" (click)="editSection(slidingItem, section.bkey)">
                  <ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" />
                </ion-item-option>
              </ion-item-options>
            </ion-item-sliding>
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

  protected filteredSections = computed(() => this.sectionListStore.filteredSections() ?? []);
  protected sectionsCount = computed(() => this.sectionListStore.sections()?.length ?? 0);
  protected selectedSectionsCount = computed(() => this.filteredSections().length);
  protected isLoading = computed(() => this.sectionListStore.isLoading());

  protected selectedCategory = AllCategories;
  protected categories = addAllCategory(SectionTypes);
  protected sectionTypes = SectionTypes;
  protected ST = SectionType;

  protected onSearchtermChange($event: Event): void {
    this.sectionListStore.setSearchTerm(($event.target as HTMLInputElement).value);
  }

  protected onCategoryChange($event: number): void {
    this.sectionListStore.setSelectedCategory($event);
  }

  public async editSection(slidingItem?: IonItemSliding, sectionKey?: string) { 
    if (slidingItem) slidingItem.close();
    this.sectionListStore.edit(sectionKey);
  } 
  
  public async deleteSection(slidingItem: IonItemSliding, section: SectionModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.sectionListStore.delete(section);
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.appStore.currentUser());
  }
}
