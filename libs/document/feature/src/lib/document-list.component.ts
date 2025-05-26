import { Component, computed, inject, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Browser } from '@capacitor/browser';
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { CategoryComponent, EmptyListComponent, SearchbarComponent, SingleTagComponent, SpinnerComponent } from '@bk2/shared/ui';
import { CategoryAbbreviationPipe, FileLogoPipe, SvgIconPipe } from '@bk2/shared/pipes';
import { TranslatePipe } from '@bk2/shared/i18n';
import { rxResource } from '@angular/core/rxjs-interop';
import { hasRole } from '@bk2/shared/util';
import { AppStore } from '@bk2/auth/feature';
import { DocumentTypes } from '@bk2/shared/categories';
import { AllCategories, DocumentType, ModelType } from '@bk2/shared/models';
import { RoleName } from '@bk2/shared/config';

@Component({
  selector: 'bk-document-all-list',
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    SearchbarComponent, SingleTagComponent, CategoryComponent, SpinnerComponent,
    FileLogoPipe, CategoryAbbreviationPipe, EmptyListComponent,
    IonToolbar, IonGrid, IonRow, IonCol, IonButton, IonIcon, IonLabel, IonHeader, IonButtons, 
    IonTitle, IonMenuButton, IonContent, IonItem
  ],
  template: `
  <ion-header>
  <ion-toolbar color="secondary" id="bkheader">
    <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
    <ion-title>{{ filteredDocuments().length }} {{ '@document.plural' | translate | async }}</ion-title>
    <ion-buttons slot="end">
      @if(hasRole('privileged') || hasRole('contentAdmin')) {
        <ion-button (click)="export()">
          <ion-icon slot="icon-only" src="{{'download' | svgIcon }}" />
        </ion-button>
      }
    </ion-buttons>
  </ion-toolbar>
  <ion-toolbar>
    <ion-grid>
      <ion-row>
        <ion-col size="12" size-md="6">
          <bk-searchbar placeholder="{{ '@general.operation.search.placeholder' | translate | async  }}"  (ionInput)="onSearchtermChange($event)" />
        </ion-col>
        <ion-col size="6" size-md="3">
          <bk-single-tag (selectedTag)="onTagSelected($event)" [tags]="documentTags()" />
        </ion-col>
        <ion-col size="6" size-md="3">
          <bk-cat name="documentType" [(value)]="selectedCategory" [categories]="DTS"/>
        </ion-col>
      </ion-row>
    </ion-grid>
  </ion-toolbar>
  <ion-toolbar color="primary">
    <ion-grid>
      <ion-row>
        <ion-col size="12" size-sm="8">
          <ion-label color="light"><strong>{{ '@document.list.header.name' | translate | async }}</strong></ion-label>
        </ion-col>
        <ion-col size="2" class="ion-hide-sm-down">
          <ion-label color="light"><strong>{{ '@document.list.header.type' | translate | async }}</strong></ion-label>
        </ion-col>
        <ion-col size="2" class="ion-hide-sm-down">
          <ion-label color="light"><strong>{{ '@document.list.header.extension' | translate | async }}</strong></ion-label>
        </ion-col>
      </ion-row>
    </ion-grid>
  </ion-toolbar>
</ion-header>
<ion-content #content>
  @if(!loading()) {
    @if (filteredDocuments.length === 0) {
      <bk-empty-list message="@content.page.field.empty" />
    } @else {
      <ion-grid>
        // don't use 'document' here as it leads to confusions with HTML document
        @for(doc of filteredDocuments(); track doc.bkey) {
          <ion-row (click)="showDocument(doc.url)">
            <ion-col size="12" size-sm="8">
              <ion-item lines="none">
                <ion-icon src="{{ doc.extension | fileLogo }}" />&nbsp;
                <ion-label>{{ doc.name }}</ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="2" class="ion-hide-sm-down">
              <ion-item lines="none">
                <ion-label>{{ doc.docType ?? DT.LocalFile | categoryAbbreviation:DTS }}</ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="2" class="ion-hide-sm-down">
              <ion-item lines="none">
                <ion-label>{{ doc.extension }}</ion-label>
              </ion-item>
            </ion-col>
          </ion-row>
        }
      </ion-grid>
    }
  } @else {
    <bk-spinner />
  }
</ion-content>
`
})
export class DocumentAllListComponent {
  public documentService = inject(DocumentService);
  protected appStore = inject(AppStore);

  protected searchTerm = signal('');
  protected selectedCategory = signal(AllCategories);
  protected selectedTag = signal('');

  
  // each time the search term changes, the filtered menu items are updated
  private readonly filteredDocumentsRef = rxResource({
    request: () => ({
      searchTerm: this.searchTerm(),
      category: this.selectedCategory(),
      tag: this.selectedTag()
    }),
    loader: ({request}) => this.documentService.filter(request.searchTerm, request.category, request.tag)
  });
  protected filteredDocuments = computed(() => this.filteredDocumentsRef.value() ?? []);
  protected loading = computed(() => this.filteredDocumentsRef.isLoading);
  protected readonly documentTags = computed(() => this.appStore.getTags(ModelType.Document));

  public DTS = DocumentTypes;
  protected DT = DocumentType;

  public onSearchtermChange($event: Event): void {
    this.searchTerm.set(($event.target as HTMLInputElement).value);
  }

  public onCategoryChange(selectedCategoryId: number): void {
    this.selectedCategory.set(selectedCategoryId);
  }

  public onTagSelected(selectedTag: string): void {
    this.selectedTag.set(selectedTag);
  }

  public async showDocument(url: string): Promise<void> {
    await Browser.open({ url: url, windowName: '_blank' });
  }

  public async export(): Promise<void> {
    //await this.baseService.export2excel(bkTranslate('@document.plural'), ALL_DOCUMENT_FIELDS);
    console.log('export ist not yet implemented');
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.appStore.currentUser());
  }
}



