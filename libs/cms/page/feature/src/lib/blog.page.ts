import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ArticleSection, ButtonSection, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { createActionSheetButton, createActionSheetOptions, error, getColSizes } from '@bk2/shared-util-angular';
import { hasRole, replaceSubstring } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';
import { SectionDispatcher, SectionStore } from '@bk2/cms-section-feature';

import { PageStore } from './page.store';

@Component({
  selector: 'bk-blog-page',
  standalone: true,
  imports: [
    SectionDispatcher, MenuComponent,
    TranslatePipe, AsyncPipe, SvgIconPipe,
    IonHeader, IonToolbar, IonButtons, IonButton, IonIcon, IonTitle, IonMenuButton, IonContent,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonPopover
  ],
  providers: [SectionStore],
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
    }

  bk-section { width: 100%; display: block; }

  .section-wrapper.editable {
    border: 3px solid;
    border-radius: 8px;
    border-color: yellow;
    margin: 8px 0;
    padding: 4px;
    width: calc(100% - 16px);
    cursor: pointer;
  }

  ion-item.edit-mode {
    --padding-start: 0;
    --inner-padding-end: 0;
  }

@media (width <= 600px) {
    .section-item {
    --padding-start: 2px;
    --inner-padding-end: 2px;
  }
}

@media print {
  @page {
    size: A4;
    margin: 15mm;
  }

  /* FORCE FULL HEIGHT */
  html, body, ion-app, ion-router-outlet {
    height: auto !important;
    overflow: visible !important;
  }

  ion-content {
    --offset-bottom: 0px !important;
    --overflow: visible !important;
    overflow: visible !important;
    contain: none !important;
  }

  /* PRINT CONTAINER */
  .print-content {
    display: block !important;
    width: 210mm;
    min-height: 297mm;
    padding: 15mm;
    box-sizing: border-box;
    page-break-after: always;
    overflow: visible !important;
    position: relative !important;
  }

  /* ENSURE CHILDREN DON'T CLIP */
  .print-content > * {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  /* FORCE PAGE BREAKS */
  .page-break {
    page-break-before: always;
    height: 0;
  }

  /* HIDE UI */
  ion-header, ion-footer, ion-toolbar, .print-btn, .no-print {
    display: none !important;
  }
}
`],
  template: `
    <ion-header>
      <ion-toolbar [color]="color()" id="bkheader">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>      
        <ion-title>{{ pageStore.page()?.name | translate | async }}</ion-title>
        @if(hasRole('contentAdmin')) {
          <ion-buttons slot="end">
            <ion-button id="{{ popupId() }}">
              <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
            </ion-button>
            @if(contextMenuName(); as contextMenuName) {
                <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
                <ng-template>
                    <ion-content>
                    <bk-menu [menuName]="contextMenuName"/>
                    </ion-content>
                </ng-template>
                </ion-popover>
            }
          </ion-buttons>          
        }
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-no-padding">
      @if(hasRole('contentAdmin')) {
        @if(isEmptyPage()) {
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">{{ '@content.section.error.emptyPage' | translate | async }}</ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-button (click)="this.addSection()">
              <ion-icon slot="start" src="{{'add-circle' | svgIcon }}" />
              {{ '@content.section.operation.add.label' | translate | async }}
            </ion-button>
          </ion-item>
        } @else {     <!-- page contains sections -->
          <ion-grid>
            <ion-row>
              @for(section of sections(); track section.bkey) {
                @if(getColSizes(section.colSize); as colSizes) {
                  <ion-col size="{{colSizes.size}}" 
                    class="section-item" (click)="showActions(section.bkey)"
                    [class.edit-mode]="editMode()"
                    [attr.size-md]="colSizes.sizeMd" [attr.size-lg]="colSizes.sizeLg"
                  >
                    @if(editMode()) {
                      <div class="section-wrapper" [class.editable]="editMode()">
                        <bk-section-dispatcher [section]="section" [currentUser]="pageStore.currentUser()" [editMode]="editMode()" />
                      </div>  
                    } @else {
                      <bk-section-dispatcher [section]="section" [currentUser]="pageStore.currentUser()" [editMode]="editMode()" />
                    }
                  </ion-col>
                }
              }
            </ion-row>
          </ion-grid>
        }
      } @else { <!-- not contentAdmin; also: not logged-in for public content -->
        @if(isEmptyPage()) {
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">{{ '@content.section.error.emptyPageReadOnly' | translate | async }}</ion-label>
          </ion-item>
        } @else {
          <div class="print-content" #printContent>
            @for(section of sections(); track section.bkey) {
              <bk-section-dispatcher [section]="section" [currentUser]="pageStore.currentUser()" [editMode]="editMode()" />
            } 
          </div>
        }
      }
    </ion-content>
  `
})
export class BlogPage {
  protected pageStore = inject(PageStore);
  private sectionStore = inject(SectionStore);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public contextMenuName = input<string>();
  public color = input('secondary');

  // derived signals
  protected tenantId = computed(() => this.pageStore.tenantId());
  protected popupId = computed(() => 'c_blogpage_' + this.pageStore.page()?.bkey);
  protected editMode = signal(false);
  protected page = computed(() => this.pageStore.page());
  // Accordion sections are not supported in Blog pages. Makes the implementation easier.
  protected sections = computed(() => this.pageStore.pageSections());
  protected isEmptyPage = computed(() => this.sections().length === 0);


  constructor() {
    effect(() => {
      const meta = this.pageStore.meta();
      if (meta) {
        this.meta.addTags(meta);
      }
    });
    effect(() => {
      const title = this.pageStore.page()?.title;
      if (title && title.length > 0) {
        this.title.setTitle(title);
      }
    });
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'toggleEditMode':  this.editMode.update(value => !value); break;
      case 'editPage': 
        const page = this.pageStore.page();
        if (page) {
          await this.pageStore.edit(page, false);
        }
        break;
      case 'sortSections':  await this.pageStore.sortSections(); break;
      case 'selectSection': await this.pageStore.selectSection(); break;
      case 'addSection':    await this.addSection(); break;
      case 'exportRaw': await this.pageStore.export("raw"); break;
      case 'print': await this.pageStore.print(); break;
      default: error(undefined, `BlogPage.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  protected async addSection(): Promise<void> {
    const sectionId = await this.sectionStore.add(false);
    if (sectionId) {
      this.pageStore.addSectionById(sectionId);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Page. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param sectionId 
   */
  protected async showActions(sectionId: string): Promise<void> {
    if (this.editMode()) {
      const id = replaceSubstring(sectionId, '@TID@', this.tenantId());
      this.sectionStore.setSectionId(id);

      // Section will be available via the store's rxResource
      // No need to poll - the UI will update when data loads
      const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
      this.addActionSheetButtons(actionSheetOptions);
      await this.executeActions(actionSheetOptions, sectionId);
    }
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions): void {
    if (hasRole('contentAdmin', this.pageStore.appStore.currentUser())) {

      actionSheetOptions.buttons.push(createActionSheetButton('section.edit', this.pageStore.imgixBaseUrl(), 'create_edit'));
      if (this.sectionStore.section()?.type === 'article') {
        actionSheetOptions.buttons.push(createActionSheetButton('section.image.upload', this.pageStore.imgixBaseUrl(), 'upload'));
      }
      if (this.sectionStore.section()?.type === 'button') {
        actionSheetOptions.buttons.push(createActionSheetButton('section.file.upload', this.pageStore.imgixBaseUrl(), 'upload'));
      }
      actionSheetOptions.buttons.push(createActionSheetButton('page.removesection', this.pageStore.imgixBaseUrl(), 'trash_delete'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.pageStore.imgixBaseUrl(), 'close_cancel'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param sectionId 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, sectionId: string): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      switch (data.action) {
        case 'page.removesection':
          if (sectionId) {
            await this.pageStore.removeSectionById(sectionId);
          }
          break;
        case 'section.edit':
          await this.sectionStore.edit(this.sectionStore.section(), false);
          break;
        case 'section.image.upload':
          await this.sectionStore.uploadImage(this.sectionStore.section() as ArticleSection);
          break;
        case 'section.file.upload':
          await this.sectionStore.uploadFile(this.sectionStore.section() as ButtonSection);
          break;

      }
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.pageStore.currentUser());
  }

  /**
   * Parses a col size config string (e.g. "6,4,3") and returns an object for attribute binding.
   * { size: 6, sizeMd: 4, sizeLg: 3 }
   */
  protected getColSizes(colSizeConfig: string): { size?: number, sizeMd?: number, sizeLg?: number } {
    return getColSizes(colSizeConfig);
  }
}